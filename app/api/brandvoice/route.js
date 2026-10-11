import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const FORMAL = /\b(therefore|however|moreover|consequently|thus|furthermore|shall|utilize|prior to|regarding|whom|one)\b/gi;
const CASUAL = /\b(gonna|kinda|sorta|wanna|yeah|yep|stuff|cool|awesome|lit|vibe|lol|tbh|omg|hey)\b/gi;
const FIRST_PERSON = /\b(i|me|my|mine|myself|we|us|our|ours)\b/gi;
const EMOJI = /\p{Extended_Pictographic}/gu;
const HASHTAG = /(?:^|\s)#[a-z0-9_]+/gi;
// Passive proxy: be-verb + past participle-ish token (regular -ed, common -en
// participles). Marker ratio, not a parser — Arty/Jasper-style tone heuristics.
const PASSIVE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:[a-z]+ed|made|taken|given|sent|shown|built|found|held|paid|led|kept|written|chosen)\b/gi;
const PRONOUN_START = /^(i|we|you|they|it|he|she|this|that|these|those)\b/i;

// Cheap computable syllable proxy: count vowel groups per word.
function syllables(word) {
  const groups = word.toLowerCase().match(/[aeiouy]+/g);
  return groups ? groups.length : 1;
}

function fingerprint(text) {
  const clean = String(text || '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^A-Za-z0-9]/g, '').length > 0);
  const wc = words.length || 1;
  const sc = sentences.length || 1;
  const formalCount = (clean.match(FORMAL) || []).length;
  const casualCount = (clean.match(CASUAL) || []).length;

  // Sentence-start patterns: pronoun openings + repeated-opening rate (the
  // modal first word's share) — rhythm markers a voice profile keys on.
  const starts = sentences.map((s) => (s.toLowerCase().match(/^[a-z']+/) || [''])[0]).filter(Boolean);
  const startFreq = {};
  for (const w of starts) startFreq[w] = (startFreq[w] || 0) + 1;
  const modalStartShare = starts.length ? Math.max(...Object.values(startFreq)) / sc * 100 : 0;
  const pronounStartPct = sentences.filter((s) => PRONOUN_START.test(s)).length / sc * 100;

  const passiveCount = (clean.match(PASSIVE) || []).length;
  const syllTotal = words.reduce((acc, w) => acc + syllables(w.replace(/[^A-Za-z0-9]/g, '')), 0);

  return {
    avgSentenceLen: words.length / sc,
    avgWordLen: words.reduce((acc, w) => acc + w.replace(/[^A-Za-z0-9]/g, '').length, 0) / wc,
    // 0 = fully casual, 1 = fully formal
    formality: (formalCount + casualCount) === 0 ? 0.5 : formalCount / (formalCount + casualCount),
    exclamationPct: (clean.match(/!/g) || []).length / sc * 100,
    firstPersonPct: (clean.match(FIRST_PERSON) || []).length / wc * 100,
    avgSyllables: syllTotal / wc,
    pronounStartPct,
    modalStartPct: modalStartShare,
    passivePct: passiveCount / sc * 100,
    socialPct: ((clean.match(EMOJI) || []).length + (clean.match(HASHTAG) || []).length) / wc * 100,
    emojiCount: (clean.match(EMOJI) || []).length,
    words: words.length,
  };
}

const fmt = (n, d = 1) => n.toFixed(d);

// Each metric: deviation 0–100 (0 = identical voice) plus a directional
// verdict — the Arty/Jasper "your draft is too X" feedback loop. All
// comparisons run on raw numbers; display strings are derived after.
function buildRows(sample, check) {
  const mk = (key, unit, sN, cN, scale, dp, suffix, tooHigh, tooLow) => {
    const dev = Math.min(100, Math.round(Math.abs(sN - cN) / scale * 100));
    return {
      key, unit,
      s: fmt(sN, dp) + (suffix || ''),
      c: fmt(cN, dp) + (suffix || ''),
      dev,
      verdict: dev <= 20 ? 'on pitch' : cN > sN ? tooHigh : tooLow,
    };
  };
  return [
    mk('Sentence length', 'words/sentence', sample.avgSentenceLen, check.avgSentenceLen, 12, 1, '', 'too long', 'too short'),
    mk('Word length', 'chars/word', sample.avgWordLen, check.avgWordLen, 2, 2, '', 'too complex', 'too simple'),
    mk('Formality', 'formal vs casual mix', sample.formality * 100, check.formality * 100, 80, 0, '%', 'too formal', 'too casual'),
    mk('Exclamation', '% of sentences', sample.exclamationPct, check.exclamationPct, 40, 1, '', 'too excitable', 'too flat'),
    mk('First person', '% of words', sample.firstPersonPct, check.firstPersonPct, 25, 1, '', 'too personal', 'too distant'),
    mk('Syllables per word', 'vowel-group proxy', sample.avgSyllables, check.avgSyllables, 1.2, 2, '', 'too dense', 'too plain'),
    mk('Pronoun openings', '% sentences starting I/we/it…', sample.pronounStartPct, check.pronounStartPct, 45, 1, '', 'too many “I/We/It” openings', 'too few personal openings'),
    mk('Repeated openings', '% starting with same word', sample.modalStartPct, check.modalStartPct, 40, 1, '', 'too repetitive a rhythm', 'too scattered a rhythm'),
    mk('Passive markers', 'per 100 sentences', sample.passivePct, check.passivePct, 45, 1, '', 'too passive', 'too blunt'),
    mk('Emoji + hashtags', 'per 100 words', sample.socialPct, check.socialPct, 9, 1, '', 'too social', 'too stiff'),
  ];
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const sampleText = String(body?.sample || '').trim();
  const checkText = String(body?.check || '').trim();
  if (sampleText.split(/\s+/).filter(Boolean).length < 25) {
    return NextResponse.json({ error: 'Give us at least 25 words of your best copy to build a fingerprint.' }, { status: 400 });
  }
  if (checkText.split(/\s+/).filter(Boolean).length < 10) {
    return NextResponse.json({ error: 'The text to check needs at least 10 words.' }, { status: 400 });
  }

  const fp = fingerprint(sampleText);
  const fc = fingerprint(checkText);
  const rows = buildRows(fp, fc);
  const overall = Math.round(rows.reduce((acc, r) => acc + r.dev, 0) / rows.length);
  const verdict = overall <= 20 ? 'ON-BRAND' : overall <= 45 ? 'NEEDS WORK' : 'OFF-BRAND';

  // Deterministic fingerprint is always computed. When a model is configured,
  // add the leader-style qualitative layer (voice read + rewrite guidance).
  let source = 'engine';
  let ai = null;
  if (aiAvailable()) {
    try {
      const worst = rows.slice().sort((a, b) => b.dev - a.dev).slice(0, 4)
        .map((r) => `${r.key}: sample ${r.s} vs draft ${r.c} (${r.verdict}, dev ${r.dev})`).join('; ');
      const j = await aiJson(
        'You are a brand-voice analyst. Given a computed voice-fingerprint deviation report, return JSON: {"voiceProfile": one sentence describing the reference voice, "diagnosis": one sentence on why the draft drifts, "tips": array of exactly 2 short concrete rewrite instructions in the reference voice}.',
        `REFERENCE COPY:\n${sampleText.slice(0, 1500)}\n\nDRAFT TO CHECK:\n${checkText.slice(0, 1200)}\n\nMETRIC DEVIATIONS (biggest first): ${worst}\nOVERALL DEVIATION: ${overall}/100 → ${verdict}`,
        { maxTokens: 400 },
      );
      if (j && (j.voiceProfile || j.tips)) {
        ai = {
          voiceProfile: String(j.voiceProfile || '').slice(0, 240),
          diagnosis: String(j.diagnosis || '').slice(0, 240),
          tips: Array.isArray(j.tips) ? j.tips.map((t) => String(t).slice(0, 200)).filter(Boolean).slice(0, 2) : [],
        };
        source = 'ai';
      }
    } catch { /* deterministic fallback stays */ }
  }

  return NextResponse.json({
    source,
    overall,
    verdict,
    totalMetrics: rows.length,
    emoji: { s: fp.emojiCount, c: fc.emojiCount },
    rows,
    ai,
  });
}
