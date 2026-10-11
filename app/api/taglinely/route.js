import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const FORMULAS = [
  'What-It-Does + Benefit',
  'Position / category claim',
  'Differentiation vs the old way',
  'Metaphor',
  'Imperative / call to action',
  'Superlative claim',
  'Brand + promise',
  'Rhythm / antithesis',
];

const clean = (s, max = 90) => String(s || '').replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim().slice(0, max).trim();

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const brand = clean(q.get('brand'), 40);
  const positioning = clean(q.get('positioning'), 300);

  if (!brand) return NextResponse.json({ error: 'Enter your brand name.' }, { status: 400 });
  if (positioning.length < 10) return NextResponse.json({ error: 'Give at least a real sentence of positioning (10+ characters).' }, { status: 400 });

  if (!aiAvailable()) {
    // Keyless: the client engine output stands on its own; nothing to add.
    return NextResponse.json({ source: 'engine', candidates: [] });
  }

  try {
    const out = await aiJson(
      `You are a tagline copywriter trained on classic advertising formulas. JSON keys: "candidates" — an array of 4 objects, each {"text": tagline (3–9 words), "formula": one of [${FORMULAS.map((f) => `"${f}"`).join(', ')}], "lesson": one ≤18-word sentence teaching WHY that formula works and naming one famous example}. No clichés (“think outside the box”), no exclamation marks. Each candidate must use a different formula.`,
      `Brand: ${brand}\nPositioning sentence: ${positioning}\nWrite the taglines now.`,
      { maxTokens: 700 },
    );
    const candidates = (Array.isArray(out.candidates) ? out.candidates : [])
      .map((c) => ({
        text: clean(c.text, 120),
        formula: FORMULAS.includes(clean(c.formula, 60)) ? clean(c.formula, 60) : 'Wild card',
        lesson: clean(c.lesson, 220),
        score: 8,
      }))
      .filter((c) => c.text.length >= 6)
      .slice(0, 5);
    if (!candidates.length) return NextResponse.json({ source: 'engine', candidates: [] });
    return NextResponse.json({ source: 'ai', candidates });
  } catch {
    return NextResponse.json({ source: 'engine', candidates: [] });
  }
}
