import { NextResponse } from 'next/server';
import { safeFetch, htmlBits } from '../../../lib/fetchpage';
import { aiAvailable, aiText } from '../../../lib/ai';

export const runtime = 'nodejs';

const STOPWORDS = new Set(['what', 'how', 'why', 'who', 'does', 'the', 'and', 'for', 'with', 'you', 'your', 'can', 'is', 'are', 'of', 'to', 'in', 'on', 'a', 'an', 'it', 'this', 'that', 'when', 'much', 'do']);

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  return u;
}

// Real-sourced question phrasing: does the heading ask something a buyer asks?
const QUESTION_HEAD = /^(what|how|why|who|when|is|are|can|do|does|will|should)\b/i;

function questionish(text) {
  return /\?$/.test(text.trim()) || QUESTION_HEAD.test(text.trim());
}

function definitionSentences(body) {
  const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length > 3);
  const defs = sentences.filter((s) => {
    const words = s.split(/\s+/).length;
    return words < 60 && /\b(is|are|means|refers to|describes|called|defined)\b/i.test(s);
  });
  return { total: sentences.length, defs: defs.slice(0, 3) };
}

function keyWords(q) {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// Deterministic answerability check with per-engine simulation (Profound/Peec
// style): each AI engine lifts answers differently, so we grade the same
// evidence per engine:
//  - ChatGPT search: needs structured/liftable content (FAQ schema, definitions)
//    plus topical coverage.
//  - Google AI Overviews: needs a concise citable sentence covering the terms.
//  - Perplexity: needs crawlable page (robots) + a short direct factual sentence.
function answerCheck(q, body, sentences, ctx) {
  const kw = keyWords(q);
  if (!kw.length) {
    return {
      canAnswer: false,
      evidence: 'Missing: the question has no searchable terms to match.',
      engines: { chatgpt: false, google: false, perplexity: false },
    };
  }
  const lower = body.toLowerCase();
  const matched = kw.filter((w) => lower.includes(w));
  const missing = kw.filter((w) => !lower.includes(w));
  const coverage = matched.length / kw.length;

  // Best citable sentence: covers ≥2 key terms (all, if fewer), shortest such.
  const need = Math.min(2, matched.length);
  const citable = sentences
    .filter((s) => {
      const words = s.split(/\s+/).length;
      return words < 50 && matched.filter((w) => s.toLowerCase().includes(w)).length >= need;
    })
    .sort((a, b) => a.split(/\s+/).length - b.split(/\s+/).length);
  const found = citable[0] || null;

  const engines = {
    chatgpt: coverage >= 0.5 && Boolean(found || ctx.defs.length || ctx.hasFaqSchema),
    google: coverage >= 0.6 && Boolean(found),
    perplexity: ctx.robotsOk && coverage >= 0.6 && Boolean(found && found.split(/\s+/).length < 45),
  };

  const canAnswer = coverage >= 0.6 && Boolean(found);
  const evidence = found
    ? `Found: “${found.trim().slice(0, 160)}”`
    : missing.length
      ? `Missing: no sentence answers this — terms absent from page: ${missing.slice(0, 4).join(', ')} (only ${matched.length}/${kw.length} key terms found).`
      : `Missing: ${matched.length}/${kw.length} key terms on page, but no concise citable sentence an engine could lift.`;

  return { canAnswer, evidence, found: found ? found.trim().slice(0, 160) : null, missing: missing.slice(0, 6), engines };
}

function heuristicQuestions(bits) {
  const seedHeadings = [...bits.h1s, ...bits.h2s].slice(0, 3);
  const topic = (seedHeadings.find(questionish) || seedHeadings[0] || bits.title || 'your product')
    .replace(/<[^>]+>/g, '').replace(/\?+$/, '').trim().slice(0, 60) || 'your product';
  const real = seedHeadings.filter(questionish).slice(0, 5);
  const generated = [
    `What is ${topic}?`,
    `How does ${topic} work?`,
    `How much does ${topic} cost?`,
    `Who is ${topic} for?`,
    `What makes ${topic} different from alternatives?`,
  ];
  const merged = [];
  for (const q of [...real, ...generated]) if (!merged.includes(q)) merged.push(q);
  return merged.slice(0, 5);
}

export async function GET(req) {
  const u = normalizeUrl(new URL(req.url).searchParams.get('url'));
  if (!u) return NextResponse.json({ error: 'Enter a valid http(s) page URL.' }, { status: 400 });

  let page;
  try {
    page = await safeFetch(u.href, { timeoutMs: 9000 });
  } catch (e) {
    return NextResponse.json({ error: `Could not fetch the page: ${e.message || e}`, url: u.href }, { status: 502 });
  }
  const bits = htmlBits(page.html);

  // robots.txt readability (AI crawlers check it before fetching you)
  let robots = { ok: false, detail: 'not found or unreachable' };
  try {
    const r = await safeFetch(`${u.origin}/robots.txt`, { timeoutMs: 6000 });
    if (r.status === 200 && !/disallow:\s*\/\s*$/im.test(r.html)) robots = { ok: true, detail: 'reachable, root not disallowed' };
    else if (r.status === 200) robots = { ok: false, detail: 'reachable but disallows crawling' };
    else robots = { ok: false, detail: `returned HTTP ${r.status}` };
  } catch { /* keep default */ }

  const headings = [...bits.h1s, ...bits.h2s];
  const qHeadings = headings.filter(questionish);
  const { total: sentenceCount, defs } = definitionSentences(bits.body);
  const sentences = bits.body.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);

  // 0–100 answerability score
  const headingScore = headings.length === 0 ? 0 : Math.min(20, Math.round((qHeadings.length / Math.max(headings.length, 1)) * 40) + (qHeadings.length > 0 ? 6 : 0));
  const defScore = defs.length >= 2 ? 20 : defs.length === 1 ? 14 : 0;
  const faqScore = bits.hasFaqSchema ? 25 : bits.hasJsonLd ? 10 : 0;
  const ldScore = bits.hasJsonLd ? 10 : 0;
  const lenScore = bits.textLen >= 1500 ? 10 : bits.textLen >= 500 ? Math.round((bits.textLen / 1500) * 10) : bits.textLen > 0 ? 2 : 0;
  const robotsScore = robots.ok ? 5 : 0;
  const score = Math.min(100, headingScore + defScore + faqScore + ldScore + lenScore + robotsScore);

  const signals = [
    { key: 'Question headings', points: headingScore, max: 20, detail: headings.length ? `${qHeadings.length}/${headings.length} H1/H2 headings phrased as questions` : 'No H1/H2 headings found on the page' },
    { key: 'Concise definitions', points: defScore, max: 20, detail: defs.length ? `Found ${defs.length} short definition sentence(s) under 60 words` : `No concise definition sentence in ${sentenceCount} sentences` },
    { key: 'FAQPage schema', points: faqScore, max: 25, detail: bits.hasFaqSchema ? 'FAQPage JSON-LD present — AI engines can lift Q&A directly' : bits.hasJsonLd ? 'JSON-LD present but no FAQPage type' : 'No structured FAQ markup' },
    { key: 'JSON-LD', points: ldScore, max: 10, detail: bits.hasJsonLd ? 'JSON-LD block detected' : 'No JSON-LD on the page' },
    { key: 'Indexable text', points: lenScore, max: 10, detail: `${bits.textLen} words of readable text (AI engines need citable prose, not just JS)` },
    { key: 'robots.txt', points: robotsScore, max: 5, detail: robots.detail },
  ];

  // Buyer questions: AI-generated when configured, deterministic otherwise.
  // Answerability evidence is always computed from real page text (safeFetch),
  // so the per-engine simulation never depends on the model.
  let questions = heuristicQuestions(bits);
  let source = 'engine';
  if (aiAvailable()) {
    try {
      const raw = await aiText(
        'You generate buyer questions. Given a webpage, return ONLY a JSON array of exactly 5 strings: real questions a paying buyer would ask this product/company before purchasing. No markdown, no commentary.',
        `TITLE: ${bits.title}\nH1: ${bits.h1s.join(' | ')}\nH2: ${bits.h2s.slice(0, 12).join(' | ')}\nBODY (first 3000 chars): ${bits.body.slice(0, 3000)}`,
        { maxTokens: 400 },
      );
      const parsed = JSON.parse(raw.replace(/^[^{[]*?(\[|\{)/, '$1').replace(/(\]|\})[^}\]]*$/, '$1'));
      const arr = Array.isArray(parsed) ? parsed : parsed.questions;
      if (Array.isArray(arr) && arr.length >= 3) { questions = arr.map(String).slice(0, 5); source = 'ai'; }
    } catch { /* keep heuristic set */ }
  }

  const ctx = { defs, hasFaqSchema: bits.hasFaqSchema, robotsOk: robots.ok };
  const results = questions.map((q) => ({ question: q, ...answerCheck(q, bits.body, sentences, ctx) }));
  const answerable = results.filter((r) => r.canAnswer).length;
  // Per-engine tallies: which engine could answer at least one buyer question.
  const engineCounts = {
    chatgpt: results.filter((r) => r.engines.chatgpt).length,
    google: results.filter((r) => r.engines.google).length,
    perplexity: results.filter((r) => r.engines.perplexity).length,
  };

  return NextResponse.json({
    url: u.href,
    title: bits.title || u.hostname,
    score,
    source,
    answerable,
    totalQuestions: results.length,
    engineCounts,
    signals,
    questions: results,
  });
}
