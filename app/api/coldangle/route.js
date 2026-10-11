import { NextResponse } from 'next/server';
import { safeFetch, htmlBits } from '../../../lib/fetchpage';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const MAX_URLS = 10;
const FETCH_TIMEOUT = 9000;

function clean(s, max = 90) {
  let t = String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\"'“”]+|[\"'“”]+$/g, '')
    .replace(/[“”]/g, '"')
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    t = sp > max * 0.5 ? cut.slice(0, sp) : cut;
  }
  return t.trim();
}

// Same phrase-picker idea as the free ColdOpener: prefer concrete homepage
// copy (h2/h1/meta) over nav labels, fall back to the first real sentence.
function pickPhrase(bits, minLength = 12) {
  const candidates = [...bits.h2s, ...bits.h1s, bits.description, bits.title]
    .map((c) => clean(c))
    .filter((c) => c.length >= minLength && c.length <= 120);
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0];
  const sentence = clean(bits.body.split(/(?<=[.!?])\s+/).find((s) => s.length >= 25) || '', 120);
  return sentence.length >= 20 ? sentence : null;
}

// Second-most-specific h2 on a page — used as the "what they are talking
// about right now" signal for the news-hook archetype.
function secondSignal(bits) {
  const hs = bits.h2s.map((h) => clean(h)).filter((h) => h.length >= 10 && h.length <= 90);
  return hs.length >= 2 ? hs[hs.length - 1] : null;
}

// One extra page per prospect (Instantly/Apollo-style enrichment looks at the
// site, not just the homepage): prefer a real /about link found on the
// homepage, then common company/about paths.
const ABOUT_LINK_RE = /<a[^>]+href=["']([^"']*(?:about|company|our-story|who-we-are|team|our-team)[^"']*)["']/i;
const ABOUT_FALLBACKS = ['/about', '/company', '/about-us', '/our-story'];

async function fetchQuiet(url) {
  try {
    const page = await safeFetch(url, { timeoutMs: FETCH_TIMEOUT });
    if (page.status >= 400) return null;
    return { html: page.html, finalUrl: page.finalUrl || url };
  } catch {
    return null;
  }
}

function absoluteFrom(baseHref, candidate) {
  try {
    const u = new URL(candidate, baseHref);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

async function researchSecondPage(home) {
  const seen = new Set([home.finalUrl]);
  const tried = [];
  const link = home.html.match(ABOUT_LINK_RE);
  const candidates = [];
  if (link) candidates.push(absoluteFrom(home.finalUrl, link[1]));
  const origin = (() => { try { return new URL(home.finalUrl).origin; } catch { return null; } })();
  if (origin) for (const p of ABOUT_FALLBACKS) candidates.push(origin + p);
  for (const c of candidates) {
    if (!c || seen.has(c) || tried.length >= 3) continue;
    tried.push(c);
    seen.add(c);
    const page = await fetchQuiet(c);
    if (!page) continue;
    const bits = htmlBits(page.html);
    const detail = pickPhrase(bits, 14);
    if (detail && detail.length >= 14) {
      return { url: page.finalUrl, detail, signal: secondSignal(bits), bits };
    }
  }
  return null;
}

// Six opener archetypes, rotated one per prospect row so a batch reads like
// research, not a template mail-merge (the Instantly/Apollo "personalization
// at scale" trick: the shape varies even when the inputs are similar).
const ANGLES = [
  {
    type: 'observation → bridge',
    hint: 'observation-led: name the exact thing on their site, then bridge to the measurable gap',
    build: ({ phrase, detail, domain, prod }) =>
      `Your “${phrase}” line on ${domain} stood out${detail ? ` — and the About page doubles down with “${detail}”` : ''}. Most teams in your space talk around that, not about it. ${prod} is built to make that exact promise measurable this quarter. Open to a 15-minute look at how it would land on ${domain}?`,
  },
  {
    type: 'question',
    hint: "question-led: lead with the buyer's own words as an open question",
    build: ({ phrase, detail, domain, prod }) =>
      `On ${domain} you commit to “${phrase}”${detail ? ` — “${detail}” suggests that is a real workstream, not a tagline` : ''} — how are you measuring that today? Most teams have the ambition and not the instrumentation, which is why ${prod} exists. Happy to show the gap in 15 minutes if it is useful.`,
  },
  {
    type: 'benchmark',
    hint: 'benchmark-led: compare their public claim against the category benchmark',
    build: ({ phrase, detail, domain, prod }) =>
      `“${phrase}” is a benchmark-level claim${detail ? `, and “${detail}” shows you are backing it with process` : ''}. In our data most teams in your category can name the metric but not move it. ${prod} closes exactly that gap. Worth 15 minutes to see the benchmark vs your numbers?`,
  },
  {
    type: 'analogy-lite',
    hint: 'analogy-led: one lightweight analogy that maps their promise to a familiar mechanism',
    build: ({ phrase, detail, domain, prod }) =>
      `Reading ${domain} — “${phrase}”${detail ? `, then “${detail}” two screens later` : ''} — it reminded me of a speedometer bolted to a dashboard nobody checks. The instrument is there; the feedback loop is not. ${prod} is the step that closes the loop for teams making that promise. Two-minute demo worth it?`,
  },
  {
    type: 'news-hook',
    hint: 'news-hook: open from their most recent public focus (h2), then tie to the sender',
    build: ({ phrase, detail, signal, domain, prod }) =>
      `${signal ? `“${signal}” is the newest thing we saw surface on ${domain}` : `“${phrase}” keeps surfacing across ${domain}`} — it reads like an active priority${detail ? `, confirmed by “${detail}” on the About page` : ''}. Active priorities are exactly where ${prod} pays back fastest. Mind a 15-minute pass on whether ours would slot into that push?`,
  },
  {
    type: 'contrarian',
    hint: 'contrarian-led: gently challenge what the site optimises for, defend the better alternative',
    build: ({ phrase, detail, domain, prod }) =>
      `Hot take from reading ${domain} properly: “${phrase}”${detail ? ` — even though the About page quietly admits “${detail}”` : ''} — is usually the line teams polish hardest and measure least. We built ${prod} for the measuring half. If that trade is one you are already arguing about internally, 15 minutes would be useful.`,
  },
];

function normaliseList(raw) {
  const seen = new Set();
  const out = [];
  for (const part of String(raw || '').split(/[\n,]+/)) {
    let u = part.trim();
    if (!u) continue;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(parsed.protocol)) continue;
    const key = `${parsed.hostname.replace(/^www\./, '').toLowerCase()}${parsed.pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed.href);
  }
  return out;
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return String(u).slice(0, 60); }
}

// Validate the AI's per-project JSON against a hard shape contract. Returns
// the parsed object or null — callers then fall through to the deterministic
// composer. Subject line and follow-up are validated but NOT returned to the
// preview (paid tier only, per the cap note).
function validateAiAngle(obj, phrase) {
  if (!obj || typeof obj !== 'object') return null;
  const fields = ['hook', 'angle', 'subjectLine', 'followUp'];
  for (const f of fields) {
    if (typeof obj[f] !== 'string' || !obj[f].trim()) return null;
  }
  const hook = clean(obj.hook, 160);
  const angle = String(obj.angle).replace(/\s+/g, ' ').trim();
  const subjectLine = clean(obj.subjectLine, 120);
  const followUp = String(obj.followUp).replace(/\s+/g, ' ').trim().slice(0, 600);
  if (hook.length < 10 || angle.length < 40 || angle.length > 600 || !subjectLine || followUp.length < 20) return null;
  // The angle must actually be grounded: at least one distinctive word from
  // the observed phrase has to survive into the copy.
  const distinctive = String(phrase || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 6);
  const angleLc = angle.toLowerCase();
  if (distinctive.length && !distinctive.some((w) => angleLc.includes(w))) return null;
  if (/hope this finds you well|loving your mission|just circling back/i.test(angle)) return null;
  return { hook, angle, subjectLine, followUp };
}

async function researchOne(rawUrl, index, product) {
  const prod = clean(product, 300).replace(/\.$/, '');
  let page;
  try {
    page = await safeFetch(rawUrl, { timeoutMs: FETCH_TIMEOUT });
  } catch (e) {
    const msg = String(e.message || e);
    const reason = msg === 'bad url' || msg.includes('private address') || msg.includes('http(s) only')
      ? 'Not a publicly fetchable URL'
      : 'Site timed out or refused the connection';
    return { url: rawUrl, domain: hostOf(rawUrl), error: reason };
  }
  if (page.status >= 400) {
    return { url: rawUrl, domain: hostOf(page.finalUrl || rawUrl), error: `Homepage returned HTTP ${page.status}` };
  }
  const homeBits = htmlBits(page.html);
  const finalUrl = page.finalUrl || rawUrl;
  const phrase = pickPhrase(homeBits);
  const domain = hostOf(finalUrl);
  if (!phrase) {
    return { url: rawUrl, domain, error: 'Reached the site but found no readable headline or description to research from' };
  }

  // Second fetch for richer grounding (about/company page when reachable).
  const second = await researchSecondPage({ finalUrl, html: page.html });
  const detail = second ? second.detail : null;
  const signal = second ? second.signal : secondSignal(homeBits);

  const shape = ANGLES[index % ANGLES.length];
  const parts = { phrase, detail, signal, domain, prod };
  let angleText = shape.build(parts);
  let source = 'engine';

  if (aiAvailable()) {
    try {
      const obj = await aiJson(
        'You research ONE cold-email project and return a JSON angle package. No clichés ("I hope this finds you well", "loving your mission"), no invented facts. The observed phrases must be reflected near-verbatim. "angle" is the full opener: two sentences plus one short question CTA. "subjectLine" is 3-9 words, lowercase-friendly, no clickbait. "followUp" is ONE short sentence sent 3 days later referencing the same observed phrase.',
        `Prospect site: ${domain}\nObserved homepage phrase: “${phrase}”\n${detail ? `Observed about/company phrase: “${detail}”\n` : ''}${signal ? `Most recent homepage focus line: “${signal}”\n` : ''}Sender's product (one line): ${prod}\nRequired angle shape: ${shape.hint}\nReturn JSON: {"hook":"<the observation you built on, <=15 words>","angle":"<full opener>","subjectLine":"<subject>","followUp":"<one-sentence follow-up>"}`,
        { maxTokens: 420 },
      );
      const validated = validateAiAngle(obj, phrase);
      if (validated) { angleText = validated.angle; source = 'ai'; }
    } catch { /* deterministic composer already filled the slot */ }
  }

  return {
    url: rawUrl,
    domain,
    phrase,
    detail,
    angleType: shape.type,
    source,
    opener: angleText,
    ai: source === 'ai',
  };
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send JSON with "urls" and "product".' }, { status: 400 });
  }

  const raw = Array.isArray(body.urls) ? body.urls.join('\n') : String(body.urls || '');
  const urls = normaliseList(raw);
  const product = String(body.product || '').trim();

  if (urls.length === 0) {
    return NextResponse.json({ error: 'Paste at least one prospect website URL, one per line.' }, { status: 400 });
  }
  if (urls.length > MAX_URLS) {
    return NextResponse.json({ error: `Preview runs one batch of up to ${MAX_URLS} prospects — you sent ${urls.length}.` }, { status: 400 });
  }
  if (product.length < 5) {
    return NextResponse.json({ error: 'Describe your product in one line (at least 5 characters).' }, { status: 400 });
  }

  // Chunked so 10 prospects (two pages each) don't fire 20 simultaneous crawls.
  const rows = new Array(urls.length);
  for (let i = 0; i < urls.length; i += 3) {
    const chunk = urls.slice(i, i + 3);
    const out = await Promise.all(chunk.map((u, j) => researchOne(u, i + j, product)));
    out.forEach((r, j) => { rows[i + j] = r; });
  }

  const researched = rows.filter((r) => !r.error);
  if (researched.length === 0) {
    return NextResponse.json(
      { error: `None of the ${urls.length} prospect site${urls.length === 1 ? '' : 's'} could be researched. ${rows[0].error}.` },
      { status: 422 }
    );
  }

  return NextResponse.json({
    attempted: urls.length,
    researched: researched.length,
    failed: urls.length - researched.length,
    enriched: researched.filter((r) => r.detail).length,
    product: clean(product, 300),
    rows,
  });
}
