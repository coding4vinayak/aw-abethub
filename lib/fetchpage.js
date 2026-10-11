import { promises as dns } from 'dns';
import net from 'net';

// Guarded server-side fetch for user-supplied URLs (SSRF protection).
const PRIVATE = (ip) =>
  ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('169.254.') ||
  ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip === '::1' ||
  ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd') ||
  (net.isIPv4(ip) && ip.split('.').map(Number)[0] === 0);

export async function safeFetch(rawUrl, { timeoutMs = 8000 } = {}) {
  let url;
  try { url = new URL(String(rawUrl).trim()); } catch { throw new Error('bad url'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('http(s) only');
  if (!net.isIP(url.hostname)) {
    const recs = await dns.lookup(url.hostname, { all: true });
    if (recs.some((r) => PRIVATE(r.address))) throw new Error('private address blocked');
  } else if (PRIVATE(url.hostname)) throw new Error('private address blocked');
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'AbetworksHub/1.0 (+https://hub.abetworks.in)' },
  });
  const html = (await res.text()).slice(0, 2_000_000);
  return { status: res.status, html, finalUrl: res.url || url.href };
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
