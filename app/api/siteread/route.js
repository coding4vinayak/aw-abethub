import { NextResponse } from 'next/server';
import { safeFetch, htmlBits } from '../../../lib/fetchpage';
import { aiAvailable, aiText } from '../../../lib/ai';

export const runtime = 'nodejs';

// Per-engine crawler identities, mirroring what Profound/Peec-style audits surface.
const ENGINES = [
  { name: 'ChatGPT / OpenAI', agents: ['gptbot', 'chatgpt-user', 'oai-searchbot'] },
  { name: 'Claude / Anthropic', agents: ['claudebot', 'claude-web', 'claude-user', 'anthropic-ai'] },
  { name: 'Perplexity', agents: ['perplexitybot', 'perplexity-user'] },
  { name: 'Google Gemini', agents: ['google-extended'] },
  { name: 'Apple Intelligence', agents: ['applebot-extended'] },
  { name: 'Common Crawl', agents: ['ccbot'] },
];

async function tryFetch(url, timeoutMs = 6000) {
  try { return await safeFetch(url, { timeoutMs }); } catch { return null; }
}

// Parse robots.txt into { agents:[], disallow:[], allow:[] } groups.
function parseRobots(text) {
  const groups = [];
  for (const block of String(text).split(/\n\s*\n|\r\n\s*\r\n/)) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const agents = [], disallow = [], allow = [];
    for (const l of lines) {
      const idx = l.indexOf(':');
      if (idx === -1) continue;
      const key = l.slice(0, idx).trim().toLowerCase().replace(/\s+$/, '');
      const val = l.slice(idx + 1).trim().toLowerCase();
      if (key === 'user-agent') agents.push(val);
      else if (key === 'disallow' && val) disallow.push(val);
      else if (key === 'allow' && val) allow.push(val);
    }
    if (agents.length) groups.push({ agents, disallow, allow });
  }
  return groups;
}

// One engine's verdict against the parsed robots groups: blocked | wildcard-blocked | allowed(explicit|default)
function engineVerdict(groups, engineAgents) {
  if (!groups.length) return { state: 'allowed-default', matched: null };
  const own = groups.filter((g) => g.agents.some((a) => engineAgents.some((e) => a === e || a.includes(e) || e.includes(a) && a.length > 3)));
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  if (own.length) {
    const blocked = own.some((g) => g.disallow.includes('/'));
    return { state: blocked ? 'blocked' : 'allowed-explicit', matched: own[0].agents.join(', ') };
  }
  if (wildcard.length && wildcard.some((g) => g.disallow.includes('/'))) return { state: 'blocked-by-wildcard', matched: '*' };
  return { state: 'allowed-default', matched: null };
}

// Heading hierarchy: counts per level + skipped-level detection (h1 → h3).
function headingShape(html) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let lvl = 1; lvl <= 6; lvl++) {
    counts[lvl - 1] = (html.match(new RegExp(`<h${lvl}[\\s>]`, 'gi')) || []).length;
  }
  const present = counts.map((c, i) => (c > 0 ? i + 1 : null)).filter(Boolean);
  let skips = 0;
  const seen = [];
  const tags = [...html.matchAll(/<h([1-6])[^\d]/gi)].map((m) => Number(m[1]));
  let prev = 0;
  for (const t of tags) { if (prev && t > prev + 1) skips++; prev = t; }
  return { counts, maxDepth: present.length ? Math.max(...present) : 0, skips };
}

// Chunk readability: AI answer engines quote self-contained paragraphs.
// 20–80 words is the quotable band; 150+ word walls get skipped.
function paragraphStats(html) {
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 20);
  if (!paras.length) return { count: 0, avgWords: 0, longest: 0 };
  const wordCounts = paras.map((p) => p.split(/\s+/).length);
  return {
    count: paras.length,
    avgWords: Math.round(wordCounts.reduce((a, b) => a + b, 0) / paras.length),
    longest: Math.max(...wordCounts),
  };
}

export async function GET(req) {
  let raw = String(new URL(req.url).searchParams.get('url') || '').trim();
  if (!raw) return NextResponse.json({ error: 'Enter a website URL.' }, { status: 400 });
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u;
  try { u = new URL(raw); } catch { return NextResponse.json({ error: 'That is not a valid URL.' }, { status: 400 }); }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) {
    return NextResponse.json({ error: 'Only public http(s) URLs are allowed.' }, { status: 400 });
  }

  let page;
  try {
    page = await safeFetch(u.href, { timeoutMs: 9000 });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg === 'bad url' || msg.includes('http(s) only')) return NextResponse.json({ error: 'That is not a fetchable public URL.' }, { status: 400 });
    if (msg.includes('private address')) return NextResponse.json({ error: 'Private or internal addresses are not allowed.' }, { status: 400 });
    return NextResponse.json({ error: 'Could not reach that page — it timed out or refused the connection.' }, { status: 502 });
  }
  if (page.status >= 400) {
    return NextResponse.json({ error: `The page returned HTTP ${page.status} — check the URL is live.` }, { status: 422 });
  }

  const bits = htmlBits(page.html);
  const origin = `${new URL(page.finalUrl).protocol}//${new URL(page.finalUrl).host}`;
  const [robotsRes, llmsRes, llmsFullRes] = await Promise.all([
    tryFetch(`${origin}/robots.txt`),
    tryFetch(`${origin}/llms.txt`),
    tryFetch(`${origin}/llms-full.txt`),
  ]);

  const robotsGroups = robotsRes && robotsRes.status < 400 ? parseRobots(robotsRes.html) : [];
  const perEngine = ENGINES.map((eng) => {
    const v = engineVerdict(robotsGroups, eng.agents);
    let status = 'pass', note;
    if (v.state === 'blocked') { status = 'fail'; note = `robots.txt names ${v.matched} and disallows “/” — explicitly locked out.`; }
    else if (v.state === 'blocked-by-wildcard') { status = 'fail'; note = 'Blocked by the “User-agent: * Disallow: /” rule.'; }
    else if (v.state === 'allowed-explicit') { status = 'pass'; note = `Explicitly allowed (${v.matched} has no root disallow).`; }
    else {
      const hasAnyRule = robotsGroups.some((g) => g.agents.some((a) => eng.agents.some((e) => a.includes(e) || e.includes(a))));
      status = robotsRes && robotsRes.status < 400 && !hasAnyRule ? 'warn' : 'pass';
      note = !robotsRes || robotsRes.status >= 400 ? 'No robots.txt — allowed by default.'
        : hasAnyRule ? 'Allowed.' : 'Allowed by the default rules, but no explicit crawler policy names it.';
    }
    return { engine: eng.name, agents: eng.agents.join(', '), status, note };
  });

  const signals = [];
  const add = (key, label, weight, got, status, detail, fix) =>
    signals.push({ key, label, weight, got, status, detail, fix });

  const ogTitle = (page.html.match(/property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || page.html.match(/content=["']([^"']*)["'][^>]+property=["']og:title["']/i) || [])[1] || '';
  const canonical = (page.html.match(/rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || page.html.match(/href=["']([^"']*)["'][^>]+rel=["']canonical["']/i) || [])[1] || '';
  add('meta', 'Title, og:title & canonical', 12,
    (bits.title ? 5 : 0) + (ogTitle ? 3 : 0) + (canonical ? 4 : 0),
    bits.title && canonical ? 'pass' : bits.title || canonical ? 'partial' : 'fail',
    [bits.title ? `title: “${bits.title.slice(0, 70)}”` : 'no <title>',
     ogTitle ? `og:title present` : 'no og:title',
     canonical ? `canonical → ${canonical.slice(0, 70)}` : 'no canonical tag']
    .filter(Boolean).join(' · '),
    canonical ? (bits.title && ogTitle ? null : 'Add the missing meta fields so engines copy your own wording instead of inventing one.')
      : 'Add a self-referencing <link rel="canonical"> — without it engines may credit a duplicate copy of this page.');

  add('h1', 'H1 + heading hierarchy', 12,
    (() => {
      const h = headingShape(page.html);
      let pts = bits.h1s.length ? 5 : 0;
      if (h.maxDepth >= 3) pts += 4; else if (h.maxDepth === 2) pts += 2;
      pts += h.skips === 0 ? 3 : h.skips <= 2 ? 1 : 0;
      return Math.min(12, pts);
    })(),
    (() => {
      const h = headingShape(page.html);
      if (!bits.h1s.length) return 'fail';
      return h.maxDepth >= 3 && h.skips === 0 ? 'pass' : 'partial';
    })(),
    (() => {
      const h = headingShape(page.html);
      return `H1: ${bits.h1s.length ? `“${bits.h1s[0].slice(0, 60)}”` : 'missing'} · depth h1–h${h.maxDepth || 0} (${h.counts.map((c, i) => c ? `h${i + 1}:${c}` : null).filter(Boolean).join(' ') || 'no headings'}) · ${h.skips} skipped level(s).`;
    })(),
    'Keep exactly one H1 and nest h2→h3 without skipping levels — engines chunk content by heading boundaries.');

  const ssrStatus = bits.textLen >= 400 ? 'pass' : bits.textLen >= 150 ? 'partial' : 'fail';
  add('ssr', 'Server-rendered content', 16,
    ssrStatus === 'pass' ? 16 : ssrStatus === 'partial' ? 8 : 0, ssrStatus,
    `${bits.textLen} characters of readable text in raw HTML, ${bits.scriptCount} script tags. ` +
    (ssrStatus === 'pass' ? 'Crawlers can read this without JavaScript.'
      : ssrStatus === 'partial' ? 'Thin content — bots may not execute your JS.'
      : 'Almost no HTML text — content is rendered client-side only.'),
    ssrStatus === 'pass' ? null : 'Emit real content in the initial HTML (SSR/SSG) instead of relying on client-side rendering.');

  // JS-only hydration: near-empty mount point + heavy script payload.
  const mountOnly = /<(div|main)[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*(<!--[^>]*-->\s*)?<\/\1>/i.test(page.html);
  const jsHeavy = bits.scriptCount >= 5 && bits.textLen < 250;
  add('hydration', 'No JS-only hydration', 10,
    mountOnly || jsHeavy ? 0 : 8, mountOnly ? 'fail' : jsHeavy ? 'partial' : bits.textLen >= 400 ? 'pass' : 'partial',
    mountOnly
      ? 'Detected an empty client-side mount point (<div id="root|app"> with nothing inside) — the crawler sees a shell.'
      : jsHeavy
        ? `Only ${bits.textLen} chars of text behind ${bits.scriptCount} scripts — hydration-dependent rendering suspected.`
        : 'Content arrives in the HTML itself, not after JS hydration.',
    mountOnly || jsHeavy ? 'Pre-render the first viewport on the server (SSG/SSR or a prerenderer for bots).' : null);

  const pStats = paragraphStats(page.html);
  add('chunks', 'Quotable paragraph chunks', 8,
    pStats.count === 0 ? 0 : pStats.avgWords <= 80 && pStats.longest <= 150 ? 8 : pStats.avgWords <= 120 ? 4 : 2,
    pStats.count === 0 ? 'fail' : pStats.avgWords <= 80 && pStats.longest <= 150 ? 'pass' : 'partial',
    pStats.count
      ? `${pStats.count} paragraphs · avg ${pStats.avgWords} words · longest ${pStats.longest}. ` +
        (pStats.avgWords <= 80 && pStats.longest <= 150 ? 'Self-contained chunks answer engines can quote verbatim.' : 'Long walls get truncated out of AI citations — split into 20–80-word idea blocks.')
      : 'No real paragraphs found — everything is fragments or JS.',
    pStats.avgWords > 80 || pStats.longest > 150 ? 'Break the money points into short standalone paragraphs or list items with their own sub-headings.' : null);

  add('jsonld', 'JSON-LD structured data', 10,
    bits.hasJsonLd ? 10 : 0, bits.hasJsonLd ? 'pass' : 'fail',
    bits.hasJsonLd ? 'application/ld+json block detected.' : 'No JSON-LD — machines must guess entities from prose.',
    bits.hasJsonLd ? null : 'Add JSON-LD (Organization + WebPage/Service) so AI engines can extract facts unambiguously.');

  add('faq', 'FAQPage schema', 6,
    bits.hasFaqSchema ? 6 : 0, bits.hasFaqSchema ? 'pass' : 'fail',
    bits.hasFaqSchema ? 'FAQPage schema present — directly quotable by answer engines.' : 'No FAQPage schema detected.',
    bits.hasFaqSchema ? null : 'Mark your real FAQs with FAQPage schema — it is the format answer engines cite most.');

  const llmsExists = llmsRes && llmsRes.status < 400;
  const llmsOk = llmsExists && /llms|about|this file|markdown/i.test(llmsRes.html.slice(0, 400));
  add('llms', 'llms.txt', 8,
    llmsExists ? (llmsOk ? 8 : 4) : 0,
    llmsExists ? (llmsOk ? 'pass' : 'partial') : 'fail',
    llmsExists ? `/llms.txt returned HTTP ${llmsRes.status} (${llmsRes.html.length.toLocaleString()} bytes).` : 'No llms.txt at the site root — AI crawlers get no curated map of your site.',
    llmsOk ? null : 'Publish an llms.txt listing your key pages and what you do in plain Markdown.');

  add('llmsfull', 'llms-full.txt', 4,
    llmsFullRes && llmsFullRes.status < 400 ? 4 : 0,
    llmsFullRes && llmsFullRes.status < 400 ? 'pass' : 'fail',
    llmsFullRes && llmsFullRes.status < 400 ? `/llms-full.txt present — engines can pull full page bodies in one fetch.` : 'No llms-full.txt — fine, but the deep-content file is the power-user option.',
    'Optional: publish llms-full.txt with concatenated page content next to llms.txt.');

  let robotsStatus = 'pass', robotsGot = 14, robotsDetail = 'No robots.txt found — all crawlers allowed by default.', robotsFix = null;
  if (robotsRes && robotsRes.status < 400) {
    const blocked = perEngine.filter((e) => e.status === 'fail');
    const noRules = robotsGroups.length === 0;
    if (blocked.length) {
      robotsStatus = 'fail'; robotsGot = 3;
      robotsDetail = `robots.txt explicitly locks out: ${blocked.map((b) => b.engine).join(', ')}.`;
      robotsFix = `Un-block ${blocked[0].engine} (and its crawler agents) if you want citations from it.`;
    } else if (noRules) {
      robotsStatus = 'partial'; robotsGot = 8;
      robotsDetail = 'robots.txt exists but contains no parseable groups.';
      robotsFix = 'Add explicit AI-crawler user-agent sections — silence is allowed but unmanaged.';
    } else {
      robotsStatus = 'pass';
      robotsGot = 14;
      robotsDetail = `robots.txt parsed (${robotsGroups.length} rule group(s)) — no AI engine is disallowed from the root.`;
    }
  }
  add('robots', 'robots.txt posture', 14, robotsGot, robotsStatus, robotsDetail, robotsFix);

  const score = Math.min(100, Math.round(signals.reduce((a, s) => a + s.got, 0) / signals.reduce((a, s) => a + s.weight, 0) * 100));
  const blockers = signals
    .filter((s) => s.got < s.weight)
    .sort((a, b) => (b.weight - b.got) - (a.weight - a.got))
    .slice(0, 3)
    .map((s) => ({ label: s.label, lost: s.weight - s.got, fix: s.fix || 'Strengthen this signal.' }));

  // AI layer (Profound/Peec lead with a written narrative); deterministic priorities remain the fallback.
  let summary = null, source = 'engine';
  if (aiAvailable()) {
    try {
      const failLines = signals.filter((s) => s.status !== 'pass')
        .map((s) => `${s.label} [${s.status}] ${s.detail}${s.fix ? ` → ${s.fix}` : ''}`).join('\n');
      summary = (await aiText(
        'You are an AI-search (GEO/AEO) auditor. From the observed findings only, write 2–3 tight sentences: the single highest-impact fix, why it matters for ChatGPT/Claude/Perplexity citations, and one sentence of encouragement if most checks pass. No lists, no markdown, ≤55 words.',
        `Score ${score}/100. Findings below threshold:\n${failLines || 'All signals pass.'}`,
        { maxTokens: 160 },
      )).replace(/\s+/g, ' ').trim();
      source = 'ai';
    } catch { summary = null; }
  }
  if (!summary) {
    summary = blockers.length
      ? `Highest-impact fix: ${blockers[0].label.toLowerCase()} (costing ${blockers[0].lost} pts) — ${blockers[0].fix}`
      : 'Every audited signal passes — this page is fully legible to answer engines.';
  }

  return NextResponse.json({ url: page.finalUrl, score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F', signals, blockers, engines: perEngine, summary, source });
}
