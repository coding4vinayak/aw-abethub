import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const THEME_CAP = 4; // preview cap — matches the paid-note wording
const MAX_ITEMS = 500;
const MAX_CHARS = 24000;

const POSITIVE = ['love', 'great', 'awesome', 'easy', 'fast', 'helpful', 'excellent', 'happy', 'perfect', 'works', 'good', 'nice', 'thanks', 'thank', 'amazing', 'smooth', 'intuitive', 'recommend', 'finally', 'best', 'simple', 'clear', 'responsive', 'fixed', 'improved', 'like', 'appreciate'];
const NEGATIVE = ['slow', 'bug', 'broken', 'crash', 'hate', 'confusing', 'hard', 'difficult', 'expensive', 'pricey', 'bad', 'awful', 'terrible', 'never', 'annoying', 'frustrating', 'error', 'fails', 'lacking', 'missing', 'clunky', 'unintuitive', 'cant', "can't", 'wont', "won't", 'poor', 'worst', 'disappointing', 'delayed', 'no'];

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'as', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'he', 'she', 'my', 'your', 'our', 'their', 'not', 'no', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'too', 'very', 'just', 'from', 'by', 'about', 'into', 'over', 'after', 'before', 'when', 'while', 'what', 'which', 'who', 'how', 'why', 'all', 'any', 'some', 'more', 'most', 'much', 'many', 'even', 'also', 'there', 'here', 'them']);

// Zendesk-style intent triage — priority order matters (churn risk wins over praise in the same line)
const INTENTS = [
  { key: 'churn-risk', re: /\b(canc\w+|churn\w*|switch(?:ing|ed)?\s+to|moving\s+(?:to|away)|leav\w*|unsubscrib\w*|refund\w*|not\s+renew\w*|downgrad\w*|going\+to+leave)\b/i },
  { key: 'bug request', re: /\b(bug\w*|crash\w*|broken|error\w*|fails?|failing|freez\w+|won'?t\s+(load|work|open)|doesn'?t\s+work|intermittent|glitch\w*|keeps?\s+failing)\b/i },
  { key: 'feature', re: /\b(wish|would\s+love|please\s+add|add\s+(a|support|option|export|integration)|nice\s+to\s+have|feature\s+request|should\s+(have|be\s+able)|if\s+only|hope\s+you|integrat\w+|api|export|dark\s+mode)\b/i },
  { key: 'praise', re: /\b(love|loved|amazing|great|awesome|fantastic|best|excellent|perfect|thank\s+you|thanks|happy\s+with|works?\s+well|finally|brilliant)\b/i },
];

function stem(w) {
  return w.replace(/(ing|ed|es|s)$/, (m) => (m === 'ss' ? 's' : ''));
}

function tokens(text) {
  return (String(text).toLowerCase().match(/[a-z']+/g) || [])
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !STOPWORDS.has(stem(w)));
}

function sentimentOf(text) {
  const low = ` ${String(text).toLowerCase()} `;
  let pos = 0; let neg = 0;
  for (const w of POSITIVE) if (low.includes(w)) pos++;
  for (const w of NEGATIVE) if (low.includes(w)) neg++;
  const net = pos - neg;
  if (net > 0) return { label: 'positive', pos, neg, score: net };
  if (net < 0) return { label: 'negative', pos, neg, score: net };
  return { label: pos + neg > 0 ? 'mixed' : 'neutral', pos, neg, score: net };
}

function intentOf(text) {
  for (const intent of INTENTS) if (intent.re.test(text)) return intent.key;
  return null;
}

function analyze(items) {
  const stats = items.map((line) => ({
    line,
    toks: tokens(line).map(stem),
    s: sentimentOf(line),
    intent: intentOf(line),
  }));

  const unigrams = new Map();
  const bigrams = new Map();
  for (const it of stats) {
    it.toks.forEach((t, idx) => {
      unigrams.set(t, (unigrams.get(t) || 0) + 1);
      if (idx < it.toks.length - 1) {
        const bg = `${t} ${it.toks[idx + 1]}`;
        bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
      }
    });
  }

  // candidate theme labels: repeated bigrams first, then frequent unigrams not already covered
  const candidates = [];
  const covered = new Set();
  for (const [bg, count] of [...bigrams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    if (count < 2) break;
    candidates.push({ theme: bg, words: bg.split(' ') });
    bg.split(' ').forEach((w) => covered.add(w));
  }
  for (const [word, count] of [...unigrams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
    if (count < 2 || covered.has(word)) continue;
    candidates.push({ theme: word, words: [word] });
  }

  // cluster-then-average: an item belongs to a theme if all theme words appear in it
  const themes = candidates.map((c) => {
    const members = stats.filter((it) => c.words.every((w) => it.toks.includes(w)));
    const n = members.length || 1;
    const avg = members.reduce((s, m) => s + m.s.score, 0) / n;
    const negCount = members.filter((m) => m.s.label === 'negative' || (m.s.label === 'mixed' && m.s.neg > m.s.pos)).length;
    const pctNeg = Math.round((negCount / n) * 100);
    const intentVotes = new Map();
    members.forEach((m) => { if (m.intent) intentVotes.set(m.intent, (intentVotes.get(m.intent) || 0) + 1); });
    const intent = [...intentVotes.entries()].sort((a, b) => b[1] - a[1] ||
      INTENTS.findIndex((x) => x.key === b[0]) - INTENTS.findIndex((x) => x.key === a[0]))[0]?.[0] || null;
    const worst = members.filter((m) => m.s.score < 0).sort((a, b) => a.s.score - b.s.score)[0];
    const sample = (worst || members[0] || {}).line || '';
    const sentiment = avg > 0.3 ? 'positive' : avg < -0.3 ? 'negative' : 'mixed';
    return {
      theme: c.theme,
      mentions: members.length,
      pctNeg,
      avgSentiment: Math.round(avg * 10) / 10,
      sentiment,
      intent,
      sample: sample.trim().slice(0, 110),
      urgency: pctNeg * members.length,
    };
  }).filter((t) => t.mentions > 0);

  // urgency ranking = negative share × mention volume
  themes.sort((a, b) => b.urgency - a.urgency || b.mentions - a.mentions);

  const overall = {
    positive: stats.filter((i) => i.s.label === 'positive').length,
    negative: stats.filter((i) => i.s.label === 'negative').length,
    mixed: stats.filter((i) => i.s.label === 'mixed').length,
    neutral: stats.filter((i) => i.s.label === 'neutral').length,
    churnRisk: stats.filter((i) => i.intent === 'churn-risk').length,
  };
  const intentMix = INTENTS.reduce((acc, x) => { acc[x.key] = stats.filter((i) => i.intent === x.key).length; return acc; }, {});

  return { themes, overall, intentMix, total: stats.length };
}

function engineVerdict(themes, overall, total) {
  if (!themes.length) return 'No theme repeats twice across these items — vocabulary is too scattered to prioritise yet; collect more feedback or tag it first.';
  const top = themes[0];
  const parts = [];
  if (top.urgency > 0) {
    parts.push(`Do this first: “${top.theme}” (${top.mentions} mention${top.mentions === 1 ? '' : 's'}, ${top.pctNeg}% negative${top.intent ? `, mostly ${top.intent}` : ''}).`);
  } else {
    parts.push(`Lead with the win: “${top.theme}” carries ${top.mentions} mention${top.mentions === 1 ? '' : 's'} with no negativity — amplify it, don't fix it.`);
  }
  if (overall.churnRisk > 0) parts.push(`${overall.churnRisk} item${overall.churnRisk === 1 ? '' : 's'} read as churn risk — personal outreach beats a roadmap answer there.`);
  const praise = themes.filter((t) => t.sentiment === 'positive').sort((a, b) => b.mentions - a.mentions)[0];
  if (praise && praise.theme !== top.theme) parts.push(`Keep doing whatever drives “${praise.theme}” (${praise.mentions} positive-leaning mentions).`);
  parts.push(`${overall.negative}/${total} items are negative overall; the ranked list above is sorted by negative-share × volume.`);
  return parts.join(' ');
}

export async function POST(req) {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const raw = String(payload.text || '').slice(0, MAX_CHARS);
  const items = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, MAX_ITEMS);
  if (items.length < 3) {
    return NextResponse.json({ error: 'Paste at least 3 feedback items (one per line).' }, { status: 400 });
  }

  const { themes, overall, intentMix, total } = analyze(items);
  const shown = themes.slice(0, THEME_CAP);
  let verdict = engineVerdict(shown, overall, total);
  let source = 'engine';

  // Productboard/Zendesk-style AI triage summary when a model is configured
  if (aiAvailable() && shown.length) {
    try {
      const j = await aiJson(
        'You prioritise product feedback for a PM. From ONLY the given themes, return JSON {"verdict": "one paragraph, max 400 chars, naming the first thing to do and why, no invention"}.',
        `THEMES: ${JSON.stringify(shown.map((t) => ({ theme: t.theme, mentions: t.mentions, pctNegative: t.pctNeg, intent: t.intent })))}\nOVERALL: ${JSON.stringify(overall)} of ${total} items`,
        { maxTokens: 300 },
      );
      const cand = typeof j?.verdict === 'string' ? j.verdict.trim() : '';
      if (cand.length > 40) {
        verdict = cand.slice(0, 600);
        source = 'ai';
      }
    } catch { /* engine verdict stands */ }
  }

  return NextResponse.json({ total, overall, intentMix, themes: shown, verdict, source, capped: themes.length > THEME_CAP });
}
