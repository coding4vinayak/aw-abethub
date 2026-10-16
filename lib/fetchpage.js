import { promises as dns } from 'dns';
import net from 'net';

// Guarded server-side fetch for user-supplied URLs (SSRF protection).
//
// Two rules, because there are two ways in: the address rule refuses a URL
// whose host resolves anywhere private, and it is re-applied to every
// redirect hop — a public host can answer 302 with a Location only the hop
// check catches, and `redirect: 'follow'` would hand that decision to fetch
// with no check at all. The address set is the family rule (egress.ts in the
// product suite): 10/8, 127/8, 169.254/16, 192.168/16, 172.16/12, 100.64/10,
// 0/8, ::1, fc00::/7, fe80::/10 — plus the v4-mapped v6 spellings, dotted
// and hex, because Node's URL normalizes the one into the other.
const MAX_REDIRECTS = 3;
const UA = 'AbetworksHub/1.0 (+https://hub.abetworks.in)';

function privateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Exported for unit tests: pure known-answer table, no DNS, no sockets.
 * Hostnames answer false here and are never judged here — that case goes
 * through `dns.lookup` in `assertPublic`.
 */
export function isPrivateAddress(ip) {
  const s = String(ip).trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(s)) return privateV4(s);
  if (net.isIPv6(s)) {
    const dotted = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return privateV4(dotted[1]);
    const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || /^fe[89ab]/.test(s);
  }
  return false;
}

async function assertPublic(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!net.isIP(host)) {
    const recs = await dns.lookup(host, { all: true });
    if (recs.some((r) => isPrivateAddress(r.address))) throw new Error('private address blocked');
  } else if (isPrivateAddress(host)) {
    throw new Error('private address blocked');
  }
}

/**
 * Fetch a caller-supplied URL with the guards applied to every hop. Returns
 * the final response unread — `safeFetch` reads it as HTML, `apihealth`
 * drains it to meter status and latency.
 */
export async function publicFetch(rawUrl, { timeoutMs = 8000, headers = {} } = {}) {
  let url;
  try { url = new URL(String(rawUrl).trim()); } catch { throw new Error('bad url'); }
  for (let hop = 0; ; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error('http(s) only');
    await assertPublic(url);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': UA, ...headers },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      try { await response.body?.cancel(); } catch { /* draining is best-effort */ }
      if (!location) return { status: response.status, finalUrl: url.href, response };
      if (hop >= MAX_REDIRECTS) throw new Error('too many redirects');
      url = new URL(location, url);
      continue;
    }
    return { status: response.status, finalUrl: url.href, response };
  }
}

export async function safeFetch(rawUrl, { timeoutMs = 8000 } = {}) {
  const { status, finalUrl, response } = await publicFetch(rawUrl, { timeoutMs });
  const html = (await response.text()).slice(0, 2_000_000);
  return { status, html, finalUrl };
}

export function htmlBits(html) {
  const grab = (re) => (html.match(re) || [])[1] || '';
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  return {
    title: decode(grab(/<title[^>]*>([^<]*)<\/title>/i)),
    description: decode(grab(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)) || decode(grab(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)),
    h1s: [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gis)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean),
    h2s: [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gis)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean),
    hasJsonLd: /application\/ld\+json/i.test(html),
    hasFaqSchema: /"FAQPage"/i.test(html),
    hasOg: /property=["']og:/i.test(html),
    scriptCount: (html.match(/<script/gi) || []).length,
    textLen: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length,
    body: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  };
}
