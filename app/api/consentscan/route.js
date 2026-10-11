import { NextResponse } from 'next/server';
import { safeFetch, htmlBits } from '../../../lib/fetchpage';

export const runtime = 'nodejs';

// Vendor families for the named tracker inventory (Cookiebot/CookieYes style
// per-vendor cookie & SDK listing). Pattern → vendor label.
const VENDORS = [
  ['Google (Analytics/Ads/tag)', /googletagmanager|google-analytics|googleadservices|doubleclick|googlesyndication|google-optimize|analytics\.google/i],
  ['Meta (Facebook pixel)', /connect\.facebook|facebook\.net|facebook\.com\/signals|fbcdn.*pixel|facebook\.com\/tr/i],
  ['TikTok', /tiktok\.com\/|analytics\.tiktok|txngl/i],
  ['LinkedIn', /linkedin\.com\/(ads|li\.litms|insight)|platform\.linkedin/i],
  ['X / Twitter', /ads-twitter|analytics\.twitter/i],
  ['Microsoft (Clarity/BAT)', /clarity\.ms|bat\.bing|wcpstatic/i],
  ['Hotjar', /hotjar/i],
  ['Segment', /segment\.(io|com)|cdn\.segment/i],
  ['Mixpanel', /mixpanel/i],
  ['Amplitude', /amplitude\.com|amplitude-finland|cdn\.amplitude/i],
  ['Pinterest', /pintrk|assets\.pinterest|ct\.pinterest/i],
  ['Snap', /sc-static|snapads|tr\.snapchat/i],
  ['Criteo', /criteo/i],
  ['Taboola', /taboola/i],
  ['Outbrain', /outbrain/i],
  ['Yandex Metrica', /mc\.yandex|yandex\.metrika|metrika/i],
  ['Quantcast', /quantserve|quantcast/i],
  ['Comscore', /scorecardresearch/i],
  ['Shopify (web pixels)', /web-pixels|shopify\.com\/(consent|shop_events)|monorail-edge/i],
  ['VWO / other testing', /visualwebsiteoptimizer|vwo\.com|hmt\.ai/i],
];

// Named CMPs (CookieYes/Cookiebot report which consent tool is installed).
const CMPS = [
  ['OneTrust / Cookiebot', /onetrust|cookielaw|cookiebot\.com|cdn\.cookiebot/i],
  ['Sourcepoint', /sourcepoint|cdn\.tt\.cmp|tcfeuv2/i],
  ['TrustArc', /trustarc|consent\.trustarc/i],
  ['Usercentrics', /usercentrics/i],
  ['Iubenda', /iubenda|_iubenda|cdn\.iubenda/i],
  ['Osano', /osano/i],
  ['Ketch', /ketch\.(com|co)|global\.ketch/i],
  ['Quantcast CMP', /cmp\.quantcast|quantcast\.com\/cmp/i],
  ['ConsentManager', /consentmanager/i],
  ['Didomi', /didomi/i],
  ['CookieYes', /cookieyes|cdn\.cookieyes/i],
  ['Cookie-Consent (JS lib)', /cookieconsent|cookie-consent/i],
  ['Shopify privacy banner', /shopify-privacy|shopify\.privacy-banner|privacy-consent-banner|shopify\/(features\/)?privacy/i],
];

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  return u;
}

function absUrl(raw, base) {
  try { return new URL(raw, base); } catch { return null; }
}

// Google Consent Mode: v2 requires ad_user_data + ad_personalization signals;
// v1 only has ad_storage/analytics_storage. Computable from inline gtag code.
function consentMode(html) {
  const v2 = /ad_user_data/i.test(html) && /ad_personalization/i.test(html);
  const v1 = /ad_storage|analytics_storage/i.test(html) || /gtag\(\s*['"]consent['"]/i.test(html) || /set_default_consent_state/i.test(html);
  if (v2) return { version: 'v2', detail: 'Google Consent Mode v2 signals detected (ad_user_data + ad_personalization).' };
  if (v1) return { version: 'v1', detail: 'Consent Mode v1 markers only (ad_storage/analytics_storage) — Google requires v2 for EEA traffic.' };
  return { version: null, detail: 'No Google Consent Mode markers found in the page source.' };
}

function grade(risk) {
  return risk <= 15 ? 'A' : risk <= 30 ? 'B' : risk <= 45 ? 'C' : risk <= 60 ? 'D' : risk <= 80 ? 'E' : 'F';
}

export async function GET(req) {
  const u = normalizeUrl(new URL(req.url).searchParams.get('url'));
  if (!u) return NextResponse.json({ error: 'Enter a valid http(s) URL.' }, { status: 400 });

  let page;
  try {
    page = await safeFetch(u.href, { timeoutMs: 9000 });
  } catch (e) {
    return NextResponse.json({ error: `Could not fetch the page: ${e.message || e}`, url: u.href }, { status: 502 });
  }
  const html = page.html;
  const bits = htmlBits(html);
  const selfHost = (() => { try { return new URL(page.finalUrl).hostname.toLowerCase(); } catch { return u.hostname.toLowerCase(); } })();

  // Hidden third-party surface: every script src AND every og: resource URL.
  const srcUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).filter(Boolean);
  const ogUrls = [...html.matchAll(/<meta[^>]+property=["']og:(?:image|video|audio)["'][^>]+content=["']([^"']+)["']/gi)]
    .map((m) => m[1]).filter(Boolean);
  const resourceUrls = [...srcUrls, ...ogUrls]
    .map((s) => { const a = absUrl(s, page.finalUrl); return a ? { url: a.href, host: a.hostname.toLowerCase() } : null; })
    .filter(Boolean);
  const third = resourceUrls.filter((r) => r.host !== selfHost);

  // Named tracker table: URLs per vendor family.
  const trackers = VENDORS
    .map(([vendor, re]) => {
      const hits = third.filter((r) => re.test(r.host));
      return { vendor, urls: [...new Set(hits.map((h) => h.url))].length, hosts: [...new Set(hits.map((h) => h.host))] };
    })
    .filter((t) => t.urls > 0)
    .sort((a, b) => b.urls - a.urls);
  const totalTrackerUrls = trackers.reduce((acc, t) => acc + t.urls, 0);
  const trackerHosts = [...new Set(trackers.flatMap((t) => t.hosts))];

  // Named CMP detection.
  const cmpsFound = CMPS.filter(([, re]) => re.test(html)).map(([name]) => name);
  const cm = consentMode(html);

  const hasConsentWord = /\bcookie(s)?\b/i.test(html) || /\bconsent\b/i.test(html);
  const hasBannerText = /(we use cookies|cookie (banner|policy|notice)|accept (all )?(cookies|tracking)|your cookie preferences|cookie settings)/i.test(html);
  const hasRejectOption = /(reject( all)?( cookies| tracking)?|decline( all)?|accept selection)/i.test(html);
  const privacyLink = /href=["'][^"']*(privac|datapolic|gdpr)[^"']*/i.test(html);
  const isHttps = /^https:/i.test(u.protocol);

  const findings = [];
  const add = (label, status, detail) => findings.push({ label, status, detail });

  add('Cookie notice present', hasBannerText ? 'pass' : hasConsentWord ? 'warn' : 'fail',
    hasBannerText ? 'Banner-style cookie language detected on the page.'
      : hasConsentWord ? 'Cookie/consent words exist in markup but no clear banner text found.'
        : 'No cookie notice wording found anywhere in the HTML.');
  add('Consent banner tool detected', cmpsFound.length ? 'pass' : 'warn',
    cmpsFound.length ? `Recognised CMP installed: ${cmpsFound.join(', ')} — consent can be logged and proven.`
      : 'No known CMP (OneTrust, Cookiebot, Sourcepoint, TrustArc, Usercentrics, Iubenda, Osano, CookieYes, Shopify banner…) detected — consent must be provable, not just asked for.');
  add('Reject option available', hasRejectOption ? 'pass' : 'fail',
    hasRejectOption ? 'A reject/decline affordance was found — required for valid GDPR consent.'
      : hasConsentWord ? 'Only accept-style wording found. GDPR/DPDP consent without a real “no” is not valid consent.'
        : 'No consent affordance at all — nothing lets the visitor decline tracking.');
  add('Google Consent Mode v2', cm.version === 'v2' ? 'pass' : cm.version === 'v1' ? 'warn' : trackerHosts.length ? 'fail' : 'warn', cm.detail);
  add(`Tracker URL load (${totalTrackerUrls} URLs / ${trackerHosts.length} vendors)`, totalTrackerUrls === 0 ? 'pass' : totalTrackerUrls <= 4 ? 'warn' : 'fail',
    trackers.length ? `Third-party code found before/without provable consent: ${trackers.slice(0, 6).map((t) => `${t.vendor} ×${t.urls}`).join(', ')}.`
      : `No known analytics/ads vendor URLs among ${third.length} third-party script/og resources.`);
  add('Privacy policy linked', privacyLink ? 'pass' : 'fail',
    privacyLink ? 'A privacy-policy link was found on the page.' : 'No privacy-policy link detected — DPDP/GDPR transparency duty starts here.');
  add('Transport security (HTTPS)', isHttps ? 'pass' : 'fail',
    isHttps ? 'Page served over HTTPS.' : 'HTTP only — personal data in transit is unprotected.');
  add('Consent mapped to purpose', /purpose|purposes|categor(y|ies)|essential.*(analytic|market)/i.test(html) ? 'pass' : 'warn',
    /purpose|categor/i.test(html) ? 'Purpose/category language found — good sign for granular consent.' : 'No purpose categories found; blanket "accept cookies" is not granular consent.');
  add('Data processed from page content', trackers.length > 3 ? 'fail' : trackers.length ? 'warn' : 'pass',
    trackers.length > 3 ? `Heavy tracking surface (${trackers.length} vendor families, ${totalTrackerUrls} URLs) — likely undisclosed processing.`
      : trackers.length ? `${trackers.length} tracker vendor(s) — verify each is listed in your policy.` : 'Minimal third-party processing detected on this page.');

  const risk = Math.min(100, findings.reduce((acc, f) => acc + (f.status === 'fail' ? 16 : f.status === 'warn' ? 7 : 0), 0));
  // Sort worst-first so the preview surfaces the biggest gaps.
  findings.sort((a, b) => (b.status === 'fail' ? 2 : b.status === 'warn' ? 1 : 0) - (a.status === 'fail' ? 2 : a.status === 'warn' ? 1 : 0));

  return NextResponse.json({
    url: u.href,
    risk,
    grade: grade(risk),
    consentMode: cm,
    cmps: cmpsFound,
    trackerHosts,
    trackers,
    totalTrackerUrls,
    thirdPartyCount: third.length,
    totalChecks: findings.length,
    findings,
  });
}
