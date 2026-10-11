import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

// ── Engine ported from SloganForgeWidget: 15 families × word-variant matrix ──
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'their', 'there', 'they', 'them', 'then', 'than', 'what', 'when', 'where', 'which', 'while', 'into', 'onto', 'about', 'after', 'before', 'because', 'since', 'until', 'against', 'between', 'through', 'during', 'above', 'below', 'your', 'yours', 'our', 'ours', 'his', 'her', 'its', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'having', 'would', 'could', 'should', 'will', 'shall', 'may', 'might', 'must', 'need', 'dare', 'a', 'an', 'or', 'but', 'nor', 'so', 'if', 'of', 'in', 'on', 'at', 'by', 'as', 'it', 'we', 'you', 'me', 'us', 'him', 'he', 'she', 'my', 'is', 'am', 'do', 'does', 'did', 'not', 'no', 'yes', 'just', 'also', 'very', 'much', 'many', 'most', 'more', 'less', 'all', 'any', 'each', 'every', 'some', 'such', 'own', 'same', 'other', 'new', 'now', 'get', 'gets', 'got', 'put', 'puts', 'set', 'sets', 'use', 'uses', 'used', 'using', 'help', 'helps', 'making', 'made', 'make', 'makes', 'like', 'likes', 'way', 'ways', 'thing', 'things', 'people', 'person', 'team', 'teams', 'business', 'businesses', 'company', 'companies', 'customer', 'customers', 'client', 'clients', 'user', 'users', 'instead', 'rather', 'without', 'within', 'across', 'around', 'over', 'under', 'up', 'down', 'out', 'off', 'too', 'both', 'few', 'those', 'these']);

const ADJ_WORDS = new Set(['fast', 'simple', 'smart', 'secure', 'clear', 'lean', 'fresh', 'bold', 'fair', 'open', 'deep', 'sharp', 'real', 'safe', 'quick', 'easy', 'free', 'modern', 'reliable', 'predictable', 'seamless', 'instant', 'affordable', 'powerful']);
const ADJ_SUFFIX = /(ive|ful|ous|able|ible|less|ish|ory)$/;
const VERB_HINTS = ['build', 'ship', 'sell', 'grow', 'launch', 'manage', 'track', 'automate', 'create', 'design', 'write', 'find', 'save', 'send', 'scale', 'connect', 'organize', 'organise', 'analyze', 'analyse', 'plan', 'hire', 'learn', 'run', 'close', 'deliver', 'simplify', 'streamline', 'measure', 'book', 'match', 'sort', 'review'];
const AUDIENCE_HINT = /\b(teams?|founders?|agencies|freelancers?|startups?|brands?|developers?|marketers?|sellers?|recruiters?|publishers?|stores?|shops?|studios?|operators?|sales ?teams|support ?teams)\b/i;

const SYNONYMS = {
  fast: ['rapid', 'lightning'], simple: ['clean', 'minimal'], smart: ['intelligent', 'sharp'],
  secure: ['airtight', 'guarded'], clear: ['crisp', 'plain'], reliable: ['steady', 'proven'],
  affordable: ['fair', 'lean'], powerful: ['serious', 'heavy-duty'], instant: ['immediate'],
  seamless: ['smooth', 'frictionless'], quick: ['snappy', 'rapid'], bold: ['fearless', 'direct'],
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const TONES = {
  playful: {
    flavors: ['zippy', 'cheerful', 'witty', 'breezy'], verbs: ['spark', 'zoom', 'bounce', 'play'], gers: ['sparking', 'zooming', 'bouncing', 'playing'],
    fit: /fun|play|delight|smile|spark|breeze|witty|zippy|joy|magic|grin|yawn|eye-roll|cheer|dangerous/i,
    families: [
      'Hey {b}: {a} {n}, zero yawns.',
      '{cap(a)} {n} — {b} keeps the fun in it.',
      '{b}: {v} your {n}, skip the rest.',
      'Because boring {n} is a choice. {cap(b)} is not.',
      '{cap(a)} {n} for {aud} who hate spreadsheets.',
      '{b} — like {g} for your {n}.',
      'Your {n}, minus the frown. Powered by {b}.',
      'Shipped {a} enough to land before lunch — {b}.',
      'We made {n} {a}. {cap(b)} did the {g}.',
      '{cap(n)} without the eye-roll — that is {b}.',
      '{b}: turn {n} into a {v}.',
      'Even {aud} smile at {b}-smooth {n}.',
      '{cap(ger)} {n} like it is a game.',
      'Warning: {b} makes {n} dangerously {a}.',
      'Finally, a {n} tool with a wink. {cap(b)}.',
    ],
  },
  premium: {
    flavors: ['refined', 'effortless', 'timeless', 'bespoke'], verbs: ['curate', 'compose', 'perfect', 'polish'], gers: ['curating', 'composing', 'perfecting', 'polishing'],
    fit: /craft|refine|elegant|premium|bespoke|timeless|effortless|taste|standard|quietly|deserves|fine print|consider/i,
    families: [
      '{cap(a)} {n}. Nothing else.',
      '{b}: where {n} becomes craft.',
      'The {a} standard {aud} quietly adopt.',
      '{cap(n)}, considered. {cap(b)}, effortless.',
      'For those who read the fine print. {cap(b)}.',
      '{b} — {a} by design, not by accident.',
      'Simplicity, engineered: {b} for {n}.',
      '{cap(ger)} {n} the way it was meant to be done.',
      '{b}: the last {n} decision you will need to make.',
      'Less noise. More {n}. Only {b}.',
      '{cap(a)} {n} for {aud} who measure taste.',
      '{b}. Because {n} deserves better.',
      'Time is the premium. {b} returns it, in {n}.',
      'They will ask who did your {n}. Say {b}.',
      '{cap(n)}, refined. {cap(a)}, sustained. {cap(b)}.',
    ],
  },
  technical: {
    flavors: ['precise', 'deterministic', 'observable', 'instrumented'], verbs: ['measure', 'verify', 'deploy', 'audit'], gers: ['measuring', 'verifying', 'deploying', 'auditing'],
    fit: /precise|deterministic|observ|instrument|latency|pipeline|stack|edge case|slo|api|spec|log|test|documented|data|measur|automat|config/i,
    families: [
      '{b}: {a} {n}, measurable outcomes.',
      '{cap(ger)} {n} with {a} pipelines.',
      'Instrumented {n} for {aud} who read logs.',
      '{cap(a)} {n}: no dashboards held against the wall.',
      '{b} — {a} to the API boundary.',
      'Your stack, minus {n} edge cases. {cap(b)}.',
      '{cap(n)} at {a} latency. That is the spec.',
      'Built on real data: {b} for {n}.',
      '{b}: {v} first, guess never.',
      'Zero-config {n}. Full-control {b}.',
      '{cap(a)} {n}, documented. Ask us anything.',
      'If it is not {a}, it is not shipped. {cap(b)}.',
      '{cap(ger)} {n} like the SLO depends on it. It does.',
      '{b}: the {a} layer between you and {n}.',
      'Reviewed, tested, {a}: {n} via {b}.',
    ],
  },
  urgent: {
    flavors: ['instant', 'same-day', 'zero-wait', 'right-now'], verbs: ['ship', 'launch', 'close', 'act'], gers: ['shipping', 'launching', 'closing', 'acting'],
    fit: /now|today|instant|before|stop|zero|fast|gone|wait|deadline|immediate|lunch|standup|minute|costs you|loses|ends it/i,
    families: [
      '{b}: {a} {n}. Like, today.',
      'Stop losing ground to slow {n}. {cap(b)}, now.',
      '{cap(a)} {n} — before your competitor blinks.',
      'Every minute without {b} costs you {n}.',
      '{b}: {v} {n} before your coffee cools.',
      '{cap(n)}, solved today. {cap(b)}, live today.',
      'Your {aud} are not waiting. Neither is {b}.',
      'Tomorrow’s {n} problem starts today. {cap(b)} ends it.',
      '{b}: zero wait, all {n}.',
      'Fix {n} before it fixes you. {cap(b)}, instantly.',
      '{cap(a)} {n}: you read this sentence while {g}.',
      '{b}. Deploy it before standup.',
      'Act on {n} the moment it moves. {cap(b)}.',
      'Waiting is expensive. {b} makes {n} {a}.',
      '{cap(ger)} now. {cap(n)}, reconciled tonight. {cap(b)}.',
    ],
  },
};

function analyze(positioning) {
  const words = positioning.toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3);
  const content = [...new Set(words.filter((w) => !STOP.has(w)))];
  const adjectives = content.filter((w) => ADJ_WORDS.has(w) || ADJ_SUFFIX.test(w));
  const verbsFound = content.filter((w) => /^.{4,}ing$/.test(w) || VERB_HINTS.some((v) => w === v || w === `${v}s` || w === `${v}ing` || w === `${v}ed`));
  const isVerbish = (w) => verbsFound.includes(w) || VERB_HINTS.some((v) => w.startsWith(v));
  const isAdverb = (w) => /^.{4,}ly$/.test(w);
  const nouns = content.filter((w) => !adjectives.includes(w) && !isVerbish(w) && !isAdverb(w));

  let gerund = content.find((w) => /^.{4,}ing$/.test(w)) || null;
  if (!gerund) {
    const v = verbsFound.find((w) => VERB_HINTS.includes(w)) || verbsFound[0];
    gerund = v ? `${v.replace(/e$/, '')}ing` : null;
  }
  return {
    adj: adjectives[0] || null,
    adjAll: adjectives,
    nouns: nouns.length ? nouns : [content[content.length - 1] || 'work'],
    audience: (positioning.match(AUDIENCE_HINT) || [null])[0] || 'modern teams',
    gerund,
    content,
  };
}

function fill(tpl, ctx) {
  return tpl
    .replace(/\{cap\((\w+)\)\}/g, (_, k) => cap(ctx[k] ?? ''))
    .replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '');
}

function generate(brand, a, tone) {
  const cfg = TONES[tone];
  const adjVariants = [...new Set([
    a.adj || cfg.flavors[0],
    ...(a.adj ? SYNONYMS[a.adj] || [] : []),
    ...cfg.flavors,
    ...(a.adjAll.slice(1, 3)),
  ])].filter((w) => w && w.length >= 3).slice(0, 8);
  const nounVariants = [...new Set(a.nouns)].slice(0, 4);
  const out = [];
  for (const fam of cfg.families) {
    const verbSlots = fam.includes('{v}') || fam.includes('{g}') ? cfg.verbs.map((_, i) => i) : [0];
    for (const adj of adjVariants) {
      for (const n of nounVariants) {
        for (const vi of verbSlots) {
          const ctx = { b: brand, a: adj, n, aud: a.audience, ger: a.gerund, v: cfg.verbs[vi], g: cfg.gers[vi] };
          if (fam.includes('{ger}') && !a.gerund) continue;
          const s = fill(fam, ctx).replace(/\s+/g, ' ').trim();
          if (s && !out.includes(s)) out.push(s);
        }
      }
    }
  }
  for (const adj of adjVariants) {
    for (const n of nounVariants) {
      for (let fi = 0; fi < cfg.flavors.length; fi++) {
        const fl = cfg.flavors[fi];
        if (fl === adj) continue;
        for (const s of [
          `${cap(n)}, ${adj} and ${fl}. ${cap(brand)}.`,
          `${cap(adj)} ${n}. ${cap(fl)} ${brand}.`,
          `${adj} today, ${fl} tomorrow — ${brand}.`,
        ]) if (!out.includes(s)) out.push(s);
      }
    }
  }
  cfg.families.forEach((_, i) => {
    if (i % 5 === 3) out.push(`${cap(cfg.flavors[i % 4])} ${a.nouns[0]} for ${a.audience}. ${cap(brand)}.`);
  });
  return [...new Set(out)];
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
}

function dedupe(list) {
  const kept = [];
  const seen = new Set();
  for (const t of list) {
    const ws = norm(t);
    const key = ws.join(' ');
    if (seen.has(key)) continue;
    let near = false;
    for (const keptItem of kept) {
      const k = keptItem.ws;
      const inter = new Set(ws.filter((w) => k.includes(w))).size;
      const union = new Set([...k, ...ws]).size;
      if (union && inter / union >= 0.85) { near = true; break; }
    }
    if (near) continue;
    seen.add(key);
    kept.push({ text: t, ws });
  }
  return kept;
}

// ── New copy-desk signals (all deterministic, no external APIs) ──────────

// Ad-industry clichés: the words every slogan brief says “no”. Taglines.ai
// and SloganAI never screen for these — real copy chiefs do.
const CLICHE = new Set(['empower', 'empowers', 'empowering', 'seamless', 'seamlessly', 'unleash', 'unleashes', 'unleashing', 'elevate', 'elevates', 'elevating', 'revolutionize', 'revolutionary', 'cutting-edge', 'next-gen', 'next-generation', 'best-in-class', 'world-class', 'game-changer', 'game-changing', 'synergy', 'synergies', 'harness', 'harnessing', 'unlock', 'unlocking', 'redefine', 'redefining', 'transformative', 'future-proof', 'delve', 'unleashed', 'empowered']);

const clicheHits = (text) => [...new Set((String(text).toLowerCase().match(/[a-z][a-z'-]+/g) || []).filter((w) => CLICHE.has(w)))];

// Syllable meter via vowel-group counting (classic English heuristic).
const VOWELS = 'aeiouy';
function syllablesOfWord(w) {
  const word = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  const groups = (word.match(/[aeiouy]+/g) || []).length;
  // silent trailing 'e' rarely adds a beat ("shipped", "made")
  const silentE = /[^aeiouy]e$/.test(word) && groups > 1 ? 1 : 0;
  return Math.max(1, groups - silentE);
}
function syllables(text) {
  return (String(text).match(/[a-zA-Z][a-zA-Z'-]*/g) || []).reduce((a, w) => a + syllablesOfWord(w), 0);
}

// “Say it out loud” test: tongue-twister density vs chantability. Deterministic
// proxy for the radio-ad read: consonant clusters, very long words, repeated
// hard starts; bonuses for alliteration and an open vowel ending.
function sayAloud(text) {
  const words = (String(text).match(/[a-zA-Z][a-zA-Z'-]*/g) || []);
  if (!words.length) return { score: 0, label: 'nothing to say' };
  let s = 10;
  const notes = [];
  for (const w of words) {
    const low = w.toLowerCase();
    if (/[bcdfghjklmnpqrstvwxz]{4}/.test(low)) { s -= 2; notes.push(`dense cluster in "${low}"`); }
    if (/(.)\1\1/.test(low)) { s -= 1; notes.push(`triple letter in "${low}"`); }
    if (low.length > 11) { s -= 1; notes.push(`long word "${low}"`); }
    if (syllablesOfWord(low) > 4) { s -= 1; notes.push(`${low} is ${syllablesOfWord(low)} syllables`); }
    if (/^(.)\1$/.test(low)) { s -= 1; notes.push(`stutter start "${low}"`); }
  }
  const firsts = words.map((w) => w[0].toLowerCase());
  if (firsts.some((c, i) => i > 0 && c === firsts[i - 1] && words[i].length > 3)) { s += 1; notes.push('alliteration helps the read'); }
  const last = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  if (/[aeiouy]$/.test(last)) { s += 1; notes.push('opens on a vowel — lands clean'); }
  const mid = Math.floor(words.length / 2);
  const head = words.slice(0, mid).reduce((a, w) => a + syllablesOfWord(w), 0);
  const tail = words.slice(mid).reduce((a, w) => a + syllablesOfWord(w), 0);
  if (words.length >= 3 && Math.abs(head - tail) <= 2) { s += 1; notes.push('balanced rhythm halves'); }
  s = Math.max(0, Math.min(10, s));
  const label = s >= 8 ? 'rolls off the tongue' : s >= 5 ? 'sayable with practice' : 'tongue-twister — simplify';
  return { score: s, label, notes: notes.slice(0, 3).join(' · ') };
}

// Name/domain availability HINTS without touching any registry API:
// dictionary-word brands are almost certainly taken; coined shapes usually aren't.
const GENERIC_WORDS = new Set(['ledger', 'finance', 'cloud', 'pay', 'book', 'books', 'grid', 'hub', 'lab', 'labs', 'data', 'stack', 'forge', 'flow', 'pulse', 'deck', 'loop', 'board', 'desk', 'work', 'works', 'shop', 'store', 'team', 'teams', 'app', 'apps', 'smart', 'quick', 'swift', 'prime', 'apex', 'nova', 'zen', 'peak', 'dash', 'track', 'spot', 'case', 'port', 'craft', 'mind', 'core', 'link', 'sync', 'base', 'cast', 'form', 'line', 'wave', 'fire', 'spark', 'tool', 'tools', 'tax', 'invoice', 'sales', 'marketing', 'support', 'social', 'slogan', 'proof']);
function domainHint(brand) {
  const b = String(brand).toLowerCase().replace(/[^a-z]/g, '');
  if (!b) return 'Enter a plain brand name to get a domain hint.';
  const generic = GENERIC_WORDS.has(b);
  const twoWords = GENERIC_WORDS.has(b.slice(0, Math.ceil(b.length / 2))) && GENERIC_WORDS.has(b.slice(Math.ceil(b.length / 2)));
  const suffix = /(ly|io|ify|ery|ora|ex|ly)$/.test(b);
  if (generic) {
    return { tone: 'warn', text: `${b}.com is almost certainly taken (single dictionary word — 20+ years of registrations). Pros move to get${b}.com, ${b}.app or ${b}.io.` };
  }
  if (twoWords) {
    return { tone: 'warn', text: `Looks like two common words fused ("${b}") — .com is usually parked or squatted on word-pair names. Try a hyphen-free variant plus .co.` };
  }
  if (b.length <= 6 && !suffix) {
    return { tone: 'warn', text: `Short 4–6 letter names like "${b}" are scarred over on .com; verify before printing business cards.` };
  }
  return { tone: 'ok', text: `"${b}" has coined-name shape (not a common word, no greedy prefix) — .com is plausibly free. Hint only: run a live WHOIS before committing.` };
}

function scoreSlogan(text, brand, tone, cfg) {
  const wc = text.split(/\s+/).length;
  const parts = [];
  let score = 4;
  if (wc >= 4 && wc <= 7) { score += 3; parts.push(`${wc} words — prime length`); }
  else if (wc <= 9) { score += 1; parts.push(`${wc} words`); }
  else { score -= 2; parts.push(`${wc} words — runs long`); }

  const ws = norm(text);
  const allit = ws.find((w, i) => i > 0 && w[0] && w[0] === ws[i - 1][0] && w.length > 2);
  if (allit) { score += 2; parts.push(`alliteration on "${allit[0]}..."`); }

  if (text.toLowerCase().includes(brand.toLowerCase())) { score += 1; parts.push('names the brand'); }

  if (cfg.fit.test(text.toLowerCase())) { score += 2; parts.push(`reads ${tone}`); }

  // new weighted signals: meter, say-aloud, clichés
  const cliches = clicheHits(text);
  const syl = syllables(text);
  const say = sayAloud(text);
  if (!cliches.length) {
    if (syl > 14) { score -= 2; parts.push(`${syl} syllables — hard to chant`); }
    else if (syl >= 6 && syl <= 12) { score += 1; parts.push(`${syl} syllables — chantable meter`); }
    score += say.score >= 8 ? 1 : say.score <= 3 ? -1 : 0;
  } else {
    score -= 4 + Math.min(3, cliches.length - 1);
    parts.push(`${syl > 14 ? `${syl} syllables — hard to chant · ` : ''}cliché: ${cliches.join(', ')}`);
  }

  return {
    text,
    score: Math.max(1, Math.min(10, score)),
    rationale: parts.join(' · ') || `steady ${tone} claim`,
    syllables: syl,
    chant: syl > 14 ? 'hard to chant (>14 syllables)' : syl >= 6 && syl <= 12 ? 'chantable' : 'short — fine',
    sayScore: say.score,
    sayLabel: say.label,
    sayNotes: say.notes,
    cliche: cliches,
    clicheNote: cliches.length ? 'overused, avoid — real pros cut these' : null,
  };
}

const clean = (s, max = 120) => String(s ?? '').replace(/[<>&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { brand, positioning, tone }.' }, { status: 400 });
  }
  const brand = clean(body?.brand, 40);
  const positioning = clean(body?.positioning, 500);
  const tone = TONES[body?.tone] ? body.tone : 'playful';
  const wantRefine = body?.refine === true;

  if (!brand) return NextResponse.json({ error: 'Enter your brand name.' }, { status: 400 });
  if (positioning.length < 10) return NextResponse.json({ error: 'Give at least a real sentence of positioning (10+ characters).' }, { status: 400 });

  const a = analyze(positioning);
  if (a.content.length < 2) return NextResponse.json({ error: 'That sentence has too few descriptive words to work from — try a fuller one-liner.' }, { status: 400 });

  const raw = generate(brand, a, tone);
  const unique = dedupe(raw);
  const scored = unique.map((u) => scoreSlogan(u.text, brand, tone, TONES[tone])).sort((x, y) => y.score - x.score || y.sayScore - x.sayScore);
  const top = scored.slice(0, 8); // PAID cap: free preview always stops at 8

  const base = {
    total: raw.length,
    unique: scored.length,
    top,
    domainHint: domainHint(brand),
    aiAvailable: aiAvailable(),
    source: 'engine',
    refined: null,
  };

  if (!wantRefine) return NextResponse.json(base);
  if (!aiAvailable()) return NextResponse.json(base);

  // AI refinement round: copy-chief pass over the engine’s top 3 (NamingBrainstorm
  // style “make these sharper in my tone”). Engine fallback on any failure.
  try {
    const out = await aiJson(
      `You are a veteran slogan copy chief. Refine the 3 taglines below for the "${tone}" tone. Hard rules: kill every cliché (empower, seamless, unleash, elevate, cutting-edge, revolutionary); stay ≤ 12 syllables so the line is chantable; keep the brand name at most in one line. JSON keys: "refined" — array of 3 objects {"original": one of the input lines verbatim, "text": your refined line, "why": one ≤15-word reason citing meter, cliché removal or sound}`,
      `Brand: ${brand}\nPositioning: ${positioning}\nLines to refine:\n${top.slice(0, 3).map((t, i) => `${i + 1}. ${t.text}`).join('\n')}\nRefine now.`,
      { maxTokens: 700 },
    );
    const map = new Map(top.slice(0, 3).map((t) => [t.text, t]));
    const refined = (Array.isArray(out?.refined) ? out.refined : [])
      .map((r) => {
        const text = clean(r.text);
        const original = map.has(clean(r.original)) ? clean(r.original) : null;
        return {
          original,
          text,
          why: clean(r.why, 160),
          score: map.get(original) ? map.get(original).score : null,
          cliche: clicheHits(text),
          syllables: syllables(text),
          say: sayAloud(text).label,
        };
      })
      .filter((r) => r.text.length >= 4)
      .slice(0, 3);
    if (!refined.length) return NextResponse.json(base);
    return NextResponse.json({ ...base, source: 'ai', refined });
  } catch {
    return NextResponse.json(base);
  }
}
