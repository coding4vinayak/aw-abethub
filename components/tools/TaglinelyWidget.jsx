'use client';
import { useState } from 'react';

const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'their', 'there', 'they', 'them', 'then', 'than', 'what', 'when', 'where', 'which', 'while', 'into', 'onto', 'about', 'after', 'before', 'because', 'since', 'until', 'against', 'between', 'through', 'during', 'above', 'below', 'your', 'yours', 'our', 'ours', 'his', 'her', 'its', 'our', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'having', 'would', 'could', 'should', 'will', 'shall', 'may', 'might', 'must', 'need', 'dare', 'a', 'an', 'or', 'but', 'nor', 'so', 'if', 'of', 'in', 'on', 'at', 'by', 'to', 'as', 'it', 'we', 'you', 'me', 'us', 'him', 'he', 'she', 'my', 'is', 'am', 'do', 'does', 'did', 'not', 'no', 'yes', 'just', 'also', 'very', 'much', 'many', 'most', 'more', 'less', 'all', 'any', 'each', 'every', 'some', 'such', 'own', 'same', 'other', 'new', 'now', 'get', 'gets', 'got', 'put', 'puts', 'set', 'sets', 'use', 'uses', 'used', 'using', 'help', 'helps', 'making', 'made', 'make', 'makes', 'like', 'likes', 'way', 'ways', 'thing', 'things', 'people', 'person', 'team', 'teams', 'business', 'businesses', 'company', 'companies', 'customer', 'customers', 'client', 'clients', 'user', 'users', 'instead', 'rather', 'without', 'within', 'across', 'around', 'over', 'under', 'up', 'down', 'out', 'off', 'too', 'both', 'few', 'those', 'these', 'them']);

const ADJ_WORDS = new Set(['fast', 'simple', 'smart', 'secure', 'clear', 'lean', 'fresh', 'bold', 'fair', 'open', 'deep', 'sharp', 'real', 'safe', 'quick', 'easy', 'free', 'modern', 'reliable', 'predictable', 'seamless', 'instant', 'affordable', 'powerful']);
const ADJ_SUFFIX = /(ive|ful|ous|able|ible|less|ish|ory)$/;
const VERB_HINTS = ['build', 'ship', 'sell', 'grow', 'launch', 'manage', 'track', 'automate', 'create', 'design', 'write', 'find', 'save', 'send', 'scale', 'connect', 'organize', 'organise', 'analyze', 'analyse', 'plan', 'hire', 'learn', 'run', 'close', 'deliver', 'simplify', 'streamline', 'measure', 'book', 'match', 'sort', 'review'];
const AUDIENCE_HINT = /\b((?:finance|sales|support|marketing|product|growth|ops|ecommerce|retail|legal|design|hr|it|freelance|in-?house )?(?:teams?|founders?|agencies|freelancers?|consultants?|startups?|brands?|developers?|marketers?|sellers?|recruiters?|publishers?|stores?|shops?|studios?|operators?))\b/i;
const AUD_MODS = new Set(['finance', 'sales', 'support', 'marketing', 'product', 'growth', 'ops', 'ecommerce', 'retail', 'legal', 'design', 'hr', 'it', 'freelance', 'inhouse', 'in-house', 'modern', 'ai']);
const GENERIC_NOUNS = new Set(['hour', 'hours', 'day', 'days', 'time', 'times', 'world', 'end', 'way', 'life', 'lives', 'job', 'jobs', 'work', 'stuff', 'things', 'rate', 'rates', 'quarter', 'quarters', 'month', 'months']);
const VERB_BASES = ['build', 'ship', 'sell', 'grow', 'launch', 'manage', 'track', 'automate', 'create', 'design', 'write', 'find', 'save', 'send', 'scale', 'connect', 'organize', 'organise', 'analyze', 'analyse', 'plan', 'hire', 'learn', 'run', 'close', 'deliver', 'simplify', 'streamline', 'measure', 'book', 'match', 'sort', 'review', 'meet', 'choose', 'reduce', 'capture', 'note'];
const METAPHORS = ['on autopilot', 'the back office that runs itself', 'your second set of eyes', 'the engine room', 'quietly handled'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function analyze(positioning) {
  const words = positioning.toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3);
  const content = [...new Set(words.filter((w) => !STOP.has(w)))];

  const adjectives = content.filter((w) => ADJ_WORDS.has(w) || ADJ_SUFFIX.test(w));
  const verbsFound = content.filter((w) => /^.{4,}ing$/.test(w) || VERB_HINTS.some((v) => w === v || w === `${v}s` || w === `${v}ing` || w === `${v}ed`));
  const isVerbish = (w) => verbsFound.includes(w) || VERB_HINTS.some((v) => w.startsWith(v));
  const isAdverb = (w) => /^.{4,}ly$/.test(w);
  const nouns = content.filter((w) => !adjectives.includes(w) && !isVerbish(w) && !isAdverb(w));

  const adj = adjectives[0] || 'clear';
  const n1 = nouns[0] || content[content.length - 1] || 'work';
  const n2 = nouns.length > 1 ? nouns[nouns.length - 1] : null;
  const audience = (positioning.match(AUDIENCE_HINT) || [null])[0] || 'modern teams';
  // Don't let audience descriptors ("finance") or generic filler ("the hour") become tagline nouns.
  const audWords = new Set(audience.toLowerCase().split(/\s+/));
  const cleanNouns = nouns.filter((w) => !audWords.has(w) && !AUD_MODS.has(w) && !GENERIC_NOUNS.has(w));
  const n1b = cleanNouns[0] || n1;
  const n2b = cleanNouns.length > 1 ? cleanNouns[cleanNouns.length - 1] : null;
  let gerund = content.find((w) => /^.{4,}ing$/.test(w)) || null;
  if (!gerund) {
    const v = verbsFound.find((w) => VERB_HINTS.includes(w)) || verbsFound[0];
    gerund = v ? `${v.replace(/e$/, '')}ing` : null;
  }
  const stem = gerund ? gerund.replace(/ing$/, '') : null;
  const verbBase = gerund
    ? (VERB_BASES.find((v) => gerund === `${v}ing` || gerund === `${v.replace(/e$/, '')}ing`) || stem)
    : n1b;
  return { adj, adj2: adjectives[1] || 'simple', n1: n1b, n2: n2b, audience, gerund, verbBase, content };
}

// The classic tagline formula families (what pro naming shops teach).
function formulaCandidates(brand, a) {
  const out = [];
  const push = (formula, lesson, t) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    if (s && !out.some((o) => o.text.toLowerCase() === s.toLowerCase())) out.push({ text: s, formula, lesson });
  };

  push('What-It-Does + Benefit', 'Say the job, then the payoff — the clearest formula there is (FedEx-style precision).',
    a.gerund ? `${cap(a.gerund)} ${a.n1} — ${a.adj} and ${a.adj2}.` : `${cap(brand)}: ${a.n1}, ${a.adj} and ${a.adj2}.`);
  push('Position / category claim', 'Claim the category slot before competitors do — “the X layer for Y” sticks a label on you.',
    `The ${a.adj} ${a.n1} layer for ${a.audience}.`);
  push('Differentiation vs the old way', 'Name the enemy (spreadsheets, guessing, manual work) and you own the alternative.',
    a.gerund ? `Stop guessing. Start ${a.gerund}.` : `Not another ${a.n1} tool — ${brand}.`);
  if (a.n2) push('Differentiation vs the old way', 'Contrast the pain you remove against the outcome you keep.',
    `${cap(a.n1)} without the ${a.n2}.`);
  push('Metaphor', 'Borrow an image the buyer already trusts — autopilot, engine room, second pair of eyes.',
    `${cap(a.n1)}, ${METAPHORS[a.n1.length % METAPHORS.length]}.`);
  push('Imperative / call to action', 'A command verb makes the reader rehearse the behavior — Nike’s “Just Do It” mechanic.',
    a.gerund ? `${cap(a.gerund)} more. ${cap(a.n2 ? `less ${a.n2}` : `do less`)}.` : `Do ${a.n1}. Nothing else.`);
  push('Superlative claim', 'Superlatives earn attention when anchored to one concrete noun — “the fastest way to X”.',
    `The ${a.adj} way to ${a.verbBase}${a.n2 ? ` without the ${a.n2}` : ''}.`);
  push('Brand + promise', 'Pair the name with a verb of outcome so recall and message travel together.',
    `${cap(brand)} makes ${a.n1} look easy.`);
  if (a.n2) push('Rhythm / antithesis', 'Balanced contrasts (“no X, all Y”) are the most remembered line structure in advertising.',
    `No ${a.n2}, all ${a.n1} — only ${brand}.`);
  push('Built-for specificity', 'Naming the exact audience beats sounding universal — niching is memorizing.',
    `Built for ${a.audience}. Powered by ${brand}.`);
  return out;
}

function scoreTagline(t, brand) {
  const wc = t.split(/\s+/).length;
  const parts = [];
  let score = 5;
  if (wc >= 4 && wc <= 7) { score += 3; parts.push(`${wc} words — prime length`); }
  else if (wc <= 9) { score += 1; parts.push(`${wc} words`); }
  else { score -= 2; parts.push(`${wc} words — runs long`); }

  const ws = t.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  const allit = ws.find((w, i) => i > 0 && w[0] && w[0] === ws[i - 1][0] && w.length > 2);
  if (allit) { score += 2; parts.push(`alliteration on “${allit[0]}…”`); }

  if (t.toLowerCase().includes(brand.toLowerCase())) { score += 1; parts.push('names the brand'); }

  const lower = t.toLowerCase();
  if (/ without |no .*, all |stop .*start |less .*more |built for .*powered by/.test(lower)) { score += 1; parts.push('contrast structure'); }

  return { score: Math.max(2, Math.min(10, score)), rationale: parts.join(' · ') || 'steady, plain-English claim' };
}

export default function TaglinelyWidget() {
  const [brand, setBrand] = useState('');
  const [positioning, setPositioning] = useState('');
  const [results, setResults] = useState(null);
  const [ai, setAi] = useState(null);
  const [err, setErr] = useState('');

  function run(e) {
    e.preventDefault();
    setErr(''); setResults(null); setAi(null);
    const b = brand.trim().slice(0, 40);
    const p = positioning.trim();
    if (!b) { setErr('Enter your brand name.'); return; }
    if (p.length < 10) { setErr('Give at least a real sentence of positioning (10+ characters).'); return; }
    const a = analyze(p);
    if (a.content.length < 3) { setErr('That sentence has too few descriptive words to work from — try a fuller one-liner.'); return; }
    const scored = formulaCandidates(b, a).map((c) => ({ ...c, ...scoreTagline(c.text, b) }))
      .sort((x, y) => y.score - x.score);
    setResults(scored);

    // AI pass on top of the engine (silently skipped when no model key is configured).
    fetch(`/api/taglinely?brand=${encodeURIComponent(b)}&positioning=${encodeURIComponent(p)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.source === 'ai' && Array.isArray(j.candidates) && j.candidates.length) setAi(j.candidates.slice(0, 5)); })
      .catch(() => {});
  }

  const Row = (t, i, isAi) => (
    <div key={`${t.text}-${i}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{t.text}</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 13, whiteSpace: 'nowrap' }}>{t.score}/10</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', margin: '6px 0 4px', overflow: 'hidden' }}>
        <div style={{ width: `${(t.score || 5) * 10}%`, height: '100%', background: t.score >= 8 ? 'var(--free)' : t.score >= 6 ? '#b45309' : 'var(--ink-3)' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 7px' }}>
          {t.formula}{isAi ? ' · AI' : ''}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.lesson || t.rationale}</span>
      </div>
    </div>
  );

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="brand">Brand name</label>
        <input id="brand" type="text" placeholder="e.g. Ledgerly" value={brand}
          onChange={(e) => setBrand(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        <label htmlFor="pos" style={{ marginTop: 12, display: 'block' }}>One-sentence positioning</label>
        <input id="pos" type="text" placeholder="e.g. We automate reconciliation for finance teams so closing the books is fast and painless" value={positioning}
          onChange={(e) => setPositioning(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={!brand.trim() || !positioning.trim()}>Generate taglines</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {results && (
        <div className="result" style={{ marginTop: 16 }}>
          <h3>Your taglines, by formula — best first</h3>
          {results.map((t, i) => Row(t, i, false))}
          {ai && (
            <>
              <h3 style={{ marginTop: 18 }}>AI pass — same formulas, written by the model</h3>
              {ai.map((t, i) => Row({ score: t.score || 7, ...t }, i, true))}
            </>
          )}
          <p className="cap-note">Every formula, every line, unlimited runs — yours to keep. The planned SloganForge adds 100+ candidates, domain checks and brand-voice refinement.</p>
        </div>
      )}
    </>
  );
}
