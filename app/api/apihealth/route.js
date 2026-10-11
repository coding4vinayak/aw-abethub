import { NextResponse } from 'next/server';
import { safeFetch } from '../../../lib/fetchpage';
import { promises as dns } from 'node:dns';
import net from 'node:net';

export const runtime = 'nodejs';

const MAX_ENDPOINTS = 12;
const SAMPLES = 3;
const SAMPLE_TIMEOUT_MS = 5000;

// Same SSRF guards as safeFetch (private-IP blocked), plus a caller-supplied
// Authorization header — needed for authenticated health endpoints, the
// Checkly/Postman "check with headers" pattern. safeFetch itself is shared and
// header-less, so authenticated probes use this local twin.
const PRIVATE = (ip) =>
  ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('169.254.') ||
  ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip === '::1' ||
  ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd') ||
  (net.isIPv4(ip) && ip.split('.').map(Number)[0] === 0);

async function guardedFetchWithAuth(rawUrl, auth) {
  const url = new URL(String(rawUrl).trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error('http(s) only');
  if (!net.isIP(url.hostname)) {
    const recs = await dns.lookup(url.hostname, { all: true });
    if (recs.some((r) => PRIVATE(r.address))) throw new Error('private address blocked');
  } else if (PRIVATE(url.hostname)) throw new Error('private address blocked');
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS),
    headers: { 'user-agent': 'AbetworksHub/1.0 (+https://hub.abetworks.in)', authorization: auth },
  });
  await res.text().catch(() => ''); // drain body, we only meter status + latency
  return { status: res.status, finalUrl: res.url || url.href };
}

function cleanAuth(raw) {
  const s = String(raw || '').replace(/[\r\n\u0000-\u001f]/g, '').trim();
  return s ? s.slice(0, 256) : '';
}

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'non-http scheme' };
  return u;
}

const statusClass = (n) => (typeof n === 'number' ? `${Math.floor(n / 100)}xx` : 'err');

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const lines = Array.isArray(body?.urls)
    ? body.urls.map((x) => String(x)).filter((x) => x.trim() !== '')
    : null;
  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: 'Provide at least one endpoint URL (one per line).' }, { status: 400 });
  }
  if (lines.length > MAX_ENDPOINTS) {
    return NextResponse.json({ error: `Keep it to ${MAX_ENDPOINTS} endpoints per preview check.` }, { status: 400 });
  }
  const auth = cleanAuth(body?.authHeader);

  const results = await Promise.all(lines.map(async (raw) => {
    const u = normalizeUrl(raw);
    if (!u || u.error) {
      return { url: raw.trim(), status: '—', statusClass: 'err', detail: u && u.error ? 'Only http(s) URLs are allowed' : 'Not a valid URL', samples: [], avg: null, jitter: null, latency: null, ok: false, severity: 3 };
    }
    // 3 quick sequential samples per endpoint → avg + jitter (max−min) in ms.
    const samples = [];
    const errs = [];
    let lastStatus = null;
    let redirectedTo = null;
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = Date.now();
      try {
        const res = auth
          ? await guardedFetchWithAuth(u.href, auth)
          : await safeFetch(u.href, { timeoutMs: SAMPLE_TIMEOUT_MS });
        samples.push(Date.now() - t0);
        lastStatus = res.status;
        if (res.finalUrl && res.finalUrl !== u.href) { try { redirectedTo = new URL(res.finalUrl).hostname; } catch { /* ignore */ } }
      } catch (e) {
        errs.push(String(e.message || e).slice(0, 80));
      }
    }
    const sc = statusClass(lastStatus);
    const ok = lastStatus != null && lastStatus >= 200 && lastStatus < 400 && errs.length < SAMPLES;
    const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null;
    const jitter = samples.length >= 2 ? Math.max(...samples) - Math.min(...samples) : null;
    const unstable = ok && jitter != null && jitter > 500;
    const severity = !ok ? (lastStatus == null ? 3 : 2) : unstable ? 1 : sc === '3xx' ? 1 : 0;
    const detail = ok
      ? (redirectedTo ? `redirected → ${redirectedTo}` : errs.length ? `${SAMPLES - errs.length}/${SAMPLES} samples ok` : 'all 3 samples ok')
      : lastStatus != null ? `error response${errs.length ? ` (${errs.length}/${SAMPLES} probes also failed)` : ''}` : (errs[0] || 'failed');
    return {
      url: u.href, status: lastStatus ?? 'ERR', statusClass: sc, detail,
      samples, avg, jitter, latency: avg, ok, severity,
      authApplied: Boolean(auth),
    };
  }));

  // Worst first: failures, then unstable/redirecting, then healthy.
  results.sort((a, b) => b.severity - a.severity || (b.jitter || 0) - (a.jitter || 0) || (b.avg || 0) - (a.avg || 0));

  const checked = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const slow = results.filter((r) => r.ok && (r.avg || 0) > 3000).length;
  const jittery = results.filter((r) => r.ok && (r.jitter || 0) > 500).length;
  const health = Math.max(0, Math.round(100 - (failed / checked) * 70 - (slow / checked) * 20 - (jittery / checked) * 10));

  // Status-code class summary across the fleet (Checkly-style overview).
  const classSummary = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, err: 0 };
  for (const r of results) classSummary[r.statusClass] = (classSummary[r.statusClass] || 0) + 1;

  return NextResponse.json({ checked, failed, slow, jittery, health, classSummary, authApplied: Boolean(auth), results });
}
