import { NextResponse } from 'next/server';
import tls from 'tls';
import net from 'net';
import { promises as dns } from 'dns';
import { safeFetch } from '../../../lib/fetchpage';

export const runtime = 'nodejs';

const MAX_URLS = 10;
const PINGS = 3;

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) || /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'only http(s) URLs are allowed' };
  return u;
}

// Real TLS peer-certificate expiry: connect to :443 with SNI, read valid_to.
// rejectUnauthorized:false is deliberate — a monitor must still READ the certificate of
// sites whose chain is broken or expired. We only surface cert metadata (dates, issuer);
// no page content or trust decision is taken from this unverified connection.
function tlsExpiry(host, port = 443) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; try { sock.destroy(); } catch {} resolve(v); } };

    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 7000 }, () => {
      try {
        const cert = sock.getPeerCertificate();
        if (!cert || !cert.valid_to) return finish({ error: 'no certificate presented' });
        const until = new Date(cert.valid_to).getTime();
        if (!Number.isFinite(until)) return finish({ error: 'unparsable cert date' });
        finish({
          daysLeft: Math.round((until - Date.now()) / 86_400_000),
          validTo: cert.valid_to,
          validFrom: cert.valid_from || null,
          issuer: (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || null,
          subject: cert.subject && (cert.subject.CN || cert.subject.ALTNAME) || null,
        });
      } catch (e) {
        finish({ error: String(e.message || e).slice(0, 70) });
      } finally {
        finish({ error: 'handshake completed without a readable certificate' });
      }
    });

    sock.on('error', (e) => finish({ error: String(e.message || e).slice(0, 70) }));
    sock.on('timeout', () => finish({ error: 'TLS handshake timed out' }));
    sock.setTimeout(7000);
  });
}

// ---- domain expiry via public RDAP (rdap.org bootstraps to the registry) ----
async function domainExpiry(host) {
  if (net.isIP(host) || !host.includes('.') || host.split('.').pop().length < 2) {
    return { skipped: true, detail: 'not a registered domain' };
  }
  try {
    const res = await safeFetch(`https://rdap.org/domain/${host}`, { timeoutMs: 8000 });
    if (res.status === 404) return { error: 'no RDAP record (registry not found or TLD unsupported)' };
    if (res.status >= 400) return { error: `RDAP HTTP ${res.status}` };
    let j;
    try { j = JSON.parse(res.html); } catch { return { error: 'RDAP response was not JSON' }; }
    const events = Array.isArray(j?.events) ? j.events : [];
    const exp = events.find((e) => /^expiration$/i.test(String(e.eventAction || '')))
      || events.find((e) => /expiry|expiration/i.test(String(e.eventAction || '')));
    if (!exp?.eventDate) return { error: 'registry RDAP has no expiration event' };
    const until = new Date(exp.eventDate).getTime();
    if (!Number.isFinite(until)) return { error: 'unparsable expiry date' };
    const daysLeft = Math.round((until - Date.now()) / 86_400_000);
    let registrar = null;
    try {
      const ent = (j.entities || []).find((x) => Array.isArray(x.roles) && x.roles.includes('registrar'));
      const handle = ent?.vcardArray && Array.isArray(ent.vcardArray[1]) ? ent.vcardArray[1].find((v) => v[0] === 'fn') : null;
      registrar = (handle && handle[3]) || ent?.handle || null;
    } catch { registrar = null; }
    return { daysLeft, expiryDate: exp.eventDate.slice(0, 10), registrar, eventAction: exp.eventAction };
  } catch (e) {
    const msg = String(e.message || e);
    return { error: msg.slice(0, 70) || 'RDAP unreachable' };
  }
}

// ---- IPv6 readiness: does the host answer AAAA? ----
async function hasIpv6(host) {
  if (net.isIP(host)) return { aaaa: net.isIPv6(host) };
  try {
    const recs = await dns.resolve6(host);
    return { aaaa: Array.isArray(recs) && recs.length > 0, count: Array.isArray(recs) ? recs.length : 0 };
  } catch {
    return { aaaa: false };
  }
}

const domainState = (d) => (d && d.daysLeft != null ? (d.daysLeft < 0 ? 'fail' : d.daysLeft <= 30 ? 'warn' : 'pass') : d?.error ? 'unknown' : null);

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { urls: ["https://…"] }.' }, { status: 400 });
  }
  const lines = Array.isArray(body?.urls) ? body.urls.map((x) => String(x)).filter((x) => x.trim()) : null;
  if (!lines || !lines.length) return NextResponse.json({ error: 'Provide at least one URL (one per line).' }, { status: 400 });
  if (lines.length > MAX_URLS) return NextResponse.json({ error: `Keep it to ${MAX_URLS} URLs per check.` }, { status: 400 });

  const probed = await Promise.all(lines.map(async (raw) => {
    const u = normalizeUrl(raw);
    if (!u || u.error) {
      return {
        url: String(raw).trim().slice(0, 120), host: '—', up: false, status: '—', latency: null,
        samples: [], avg: null, jitter: null, detail: u && u.error ? u.error : 'Not a valid URL',
        ssl: { error: 'skipped — invalid URL' }, domain: { error: 'skipped — invalid URL' }, ipv6: { aaaa: false }, severity: 4,
      };
    }
    const host = u.hostname;
    const port = u.protocol === 'https:' ? (u.port ? Number(u.port) : 443) : 443;

    // network, TLS, RDAP and IPv6 run in parallel per target
    const [ssl, domain, ipv6] = await Promise.all([tlsExpiry(host, port), domainExpiry(host), hasIpv6(host)]);

    const samples = [];
    let up = false, status = 'ERR', detail = '', lastErr = '';
    for (let i = 0; i < PINGS; i++) {
      const t0 = Date.now();
      try {
        const res = await safeFetch(u.href, { timeoutMs: 7000 });
        const ms = Date.now() - t0;
        samples.push(ms);
        up = res.status >= 200 && res.status < 500;
        status = res.status;
        detail = res.finalUrl && new URL(res.finalUrl).hostname !== host ? `redirected → ${new URL(res.finalUrl).hostname}` : 'reachable';
      } catch (e) {
        lastErr = String(e.message || e);
      }
    }
    const avg = samples.length ? Math.round(samples.reduce((a, v) => a + v, 0) / samples.length) : null;
    const jitter = samples.length >= 2 ? Math.max(...samples) - Math.min(...samples) : null;
    const latency = samples.length ? samples[0] : null;
    if (!samples.length) {
      detail = (lastErr === 'bad url' || lastErr.includes('private address') || lastErr.includes('http(s) only')) ? lastErr : (lastErr.slice(0, 70) || 'unreachable');
    }

    const sslState = ssl.error ? 'fail' : ssl.daysLeft < 0 ? 'fail' : ssl.daysLeft <= 30 ? 'warn' : 'pass';
    const netSeverity = !up ? 4 : status >= 400 ? 3 : avg != null && avg > 4000 ? 1 : 0;
    const sslSeverity = ssl.error ? 3 : ssl.daysLeft < 0 ? 5 : ssl.daysLeft <= 7 ? 4 : ssl.daysLeft <= 30 ? 2 : 0;
    const domSeverity = domain.error ? 1 : domain.skipped ? 0 : domain.daysLeft < 0 ? 5 : domain.daysLeft <= 14 ? 4 : domain.daysLeft <= 30 ? 2 : 0;

    return {
      url: u.href, host, up, status, latency, samples, avg, jitter, detail,
      ssl: { ...ssl, state: sslState },
      domain,
      domainState: domainState(domain),
      ipv6,
      severity: Math.max(netSeverity, sslSeverity, domSeverity),
    };
  }));

  // Worst first: anything failing, then domain/SSL pressure, then slow.
  probed.sort((a, b) => b.severity - a.severity
    || (a.domain?.daysLeft ?? 9999) - (b.domain?.daysLeft ?? 9999)
    || (a.ssl?.daysLeft ?? 9999) - (b.ssl?.daysLeft ?? 9999)
    || (b.avg || 0) - (a.avg || 0));

  const up = probed.filter((p) => p.up).length;
  const expiring = probed.filter((p) => p.ssl && !p.ssl.error && p.ssl.daysLeft <= 30).length;
  const expired = probed.filter((p) => p.ssl && !p.ssl.error && p.ssl.daysLeft < 0).length;
  const domainExpiring = probed.filter((p) => p.domain && p.domain.daysLeft != null && p.domain.daysLeft <= 30).length;
  const domainExpired = probed.filter((p) => p.domain && p.domain.daysLeft != null && p.domain.daysLeft < 0).length;
  const noIpv6 = probed.filter((p) => p.ipv6 && !p.ipv6.aaaa).length;
  const health = Math.max(0, Math.round(100
    - ((probed.length - up) / probed.length) * 40
    - (expiring / probed.length) * 15
    - (expired / probed.length) * 30
    - (domainExpiring / probed.length) * 8
    - (domainExpired / probed.length) * 15));

  return NextResponse.json({
    checked: probed.length, up, down: probed.length - up,
    expiring, expired, domainExpiring, domainExpired, noIpv6,
    pings: PINGS, health, results: probed,
  });
}
