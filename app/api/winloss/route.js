import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

// Server engine for WinLoss, modelled on Crismata / MetaSales interview-grade
// analysis: note-specificity confidence weighting, voice-of-customer best
// quotes, win-side themes, per-family fix playbooks and quarter detection —
// plus an optional AI insight pass with deterministic fallback.

const THEME_CAP = 3; // preview cap — matches the paid-note wording
const MAX_LINES = 500;
const MAX_CHARS = 40_000;

const FAMILIES = [
  { key: 'feature', label: 'Missing feature',
    fix: 'put the gap on the roadmap with a dated commitment, or ship a workaround/integration partner',
    playbook: ['Log the exact gap from the VOC quote into the roadmap with an owner and date', 'Ship a workaround or integration partner offer so the deal type never dies on this again', 'Arm reps with a "we do X by <date>" one-pager with proof'],
    kw: /\b(feature|missing|doesn'?t (have|support)|no (integration|api|export)|lack|wish it|needed|requirement|gap|can'?t do|support for)\b/i },
  { key: 'competitor', label: 'Competitor / brand',
    fix: 'build a head-to-head battle card on the named rival and a migration offer that flips the switching cost',
    playbook: ['Build a head-to-head battle card for the named rival (where we win, where we don’t, land-mines)', 'Create a migration offer: data import, parallel run, switching-cost credit', 'Track which competitor appears with which buyer segment; price/pitch to the pattern'],
    kw: /\b(competitor|went with|chose|picked|instead of us|incumbent|rival|already using|switched to|lost to)\b/i },
  { key: 'process', label: 'Process / policy',
    fix: 'pre-load procurement: security docs, standard MSA and multi-year pricing options before the legal review starts',
    playbook: ['Pre-load the procurement pack: security whitepaper, DPA, standard MSA — send at demo, not at close', 'Add multi-year and ramp pricing options so finance sign-off has a comfortable SKU', 'Ask for the procurement checklist in the discovery call and map owners per step'],
    kw: /\b(process|policy|procurement|legal|security review|compliance|paperwork|approval|red tape|bureaucracy|contract terms|sign.?off)\b/i },
  { key: 'service', label: 'Relationship / service',
    fix: 'assign a named CSM in the first week and set a response-time promise you actually measure',
    playbook: ['Assign a named CSM before contract signature, not after', 'Publish a response-time promise (e.g. 4h business) and measure it weekly', 'Run an escalation path: any red NPS or 2 silent weeks triggers an outreach call'],
    kw: /\b(service|support|slow (response|to respond)|onboarding|trust|relationship|communicat|unresponsive|rude|experience|hand.?hold|attention)\b/i },
  { key: 'timing', label: 'Timing',
    fix: 're-qualify earlier and build a nurture sequence timed to their budget cycle instead of losing them cold',
    playbook: ['Capture the real budget-cycle date in discovery and treat "no" as "not this quarter"', 'Build a nurture sequence timed 6 weeks before their next planning cycle', 'Create a pilot-now/pay-later structure so timing stops being a no'],
    kw: /\b(timing|too early|too late|later|next (quarter|year|fiscal)|not (now|the right time)|no urgency|timeline|revisit|waiting)\b/i },
  { key: 'price', label: 'Price / cost',
    fix: 'add a lower entry tier or term-based discounting so sticker shock never kills a deal',
    playbook: ['Add a lower entry tier or starter SKU sized to this deal band', 'Give reps pre-approved term-based discounting (annual = 10%) so price talks end signed, not stalled', 'Publish an ROI sheet: cost of doing nothing vs the annual fee'],
    kw: /\b(price|pricing|expensive|cost|budget|cheaper|afford|too much|quote|discount|roi|value for money)\b/i },
];

// Win-side families: what actually closed the deal (Crismata “what’s working”).
const WIN_FAMILIES = [
  { key: 'speed', label: 'Time-to-value / ease',
    fix: 'package the fast-pilot motion as the standard first meeting artefact',
    playbook: ['Turn the win pattern into the default demo: same pilot scope, same promise', 'Publish the “live in N days” proof sheet from these notes', 'Reuse the exact pilot plan that won here as the template for the deal band'],
    kw: /\b(fast|quick|easy|instant|intuitive|smooth|cut (their|our|the) .*(time|days|hours)|saved \w+ (time|hours|days)|same[- ]day|pilot (worked|won|closed))\b/i },
  { key: 'fit', label: 'Product / feature fit',
    fix: 'double down on the feature set these buyers cite and lead pitches with it',
    playbook: ['Lead every pitch in this segment with the cited capability + proof', 'Add the winning feature mention to the homepage and comparison pages', 'Brief marketing on the exact words these customers used (they become the ad copy)'],
    kw: /\b(loved?|perfect (fit|match)|exactly (what|we|they)|the api|our api|sso|integration|export|automat|feature (set|we needed)|does everything)\b/i },
  { key: 'value', label: 'Price / ROI acceptance',
    fix: 'anchor the pricing story on the ROI these buyers actually acknowledged',
    playbook: ['Add a one-line ROI calc (their numbers) to proposals in this band', 'Raise the price-objection guardrails only where ROI proof is missing', 'Case-study the best acknowledged-ROI win and link it in the follow-up sequence'],
    kw: /\b(roi|value for money|worth (it|the)|cheaper than|budget (fit|approved|cleared)|afford|paid for itself)\b/i },
  { key: 'relationship', label: 'Champion / trust',
    fix: 'systematise champion enablement: give internal sellers the assets to sell you internally',
    playbook: ['Send a “sell it internally” pack (one-pager, security FAQ, ROI sheet) after every demo', 'Ask winning champions for referral/review while the win is fresh', 'Track champion presence as a qualification field; no champion = stalled'],
    kw: /\b(champion|advocate|trust|referral|recommended?|our (vp|cto|ceo|head)|internal pitch|believed|vibes|support team)\b/i },
  { key: 'urgency', label: 'Timing / need met',
    fix: 'map the trigger events behind these wins and monitor for them in pipeline hygiene',
    playbook: ['Name the trigger (audit, deadline, hire) in CRM for every advancing deal', 'Build alerting/nurture around the common trigger events', 'Time outreach to the fiscal dates these wins cluster around'],
    kw: /\b(urgent|needed (it )?now|deadline|compliance (requirement|deadline|date)|ready|finally|before (audit|launch|year[- ]end)|had to move)\b/i },
];

const parseAmount = (s) => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

// ── Confidence: Crismata-style “how much can we trust this note?” ──
function confidenceOf(notes) {
  let c = 0.3;
  if (notes.length >= 60) c += 0.15;
  if (notes.length >= 140) c += 0.15;
  if (/\d/.test(notes)) c += 0.1;                                   // numbers = observed facts
  if (/\bbecause\b|\bsince\b|\bdue to\b|\bstem(?:med)? from\b|so that\b/i.test(notes)) c += 0.15; // causal explanation
  if (/[.!?\u201d"]\s+\S/.test(notes) || /;\s/.test(notes)) c += 0.1; // multi-sentence = narrated
  if (/["“'].+["”']/.test(notes)) c += 0.05;                          // verbatim quote inside
  return Math.min(1, Number(c.toFixed(2)));
}

// ── Quarter detection from date strings inside notes ──
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function detectQuarter(notes) {
  let m = notes.match(/\bq([1-4])\s*(?:\s'?(\d{2})|\s*(20\d{2}))?\b/i);
  if (m) {
    const yr = m[2] ? 2000 + parseInt(m[2], 10) : m[3] ? parseInt(m[3], 10) : null;
    return yr ? `Q${m[1]} ${yr}` : `Q${m[1]}`;
  }
  m = notes.match(/\b(20\d{2})-(\d{1,2})\b/);
  if (m) {
    const mo = parseInt(m[2], 10) - 1;
    if (mo >= 0 && mo < 12) return `Q${Math.floor(mo / 3) + 1} ${m[1]}`;
  }
  m = notes.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*'?(\d{2}|\s(20\d{2}))?\b/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const yr = m[2] ? (/^\d{4}$/.test(m[2]) ? parseInt(m[2], 10) : 2000 + parseInt(m[2], 10)) : null;
    return `Q${Math.floor(mo / 3) + 1}${yr ? ` ${yr}` : ''}`;
  }
  return null;
}

function splitSentences(notes) {
  return notes.split(/(?<=[.!?])\s+|;\s+/).map((s) => s.trim()).filter((s) => s.length >= 20);
}

// Voice of customer: the longest sentence that carries specifics — numbers,
// causes, competitor names or first-person pain — not generic filler.
function bestQuote(notes, fam) {
  const sents = splitSentences(notes);
  if (!sents.length) return null;
  const scored = sents.map((s) => {
    let v = Math.min(40, s.length / 4);
    if (/\d/.test(s)) v += 8;
    if (/\bi\b|\bwe\b|\bour\b|\bthey\b/i.test(s)) v += 6;
    if (/\bbecause\b|due to|couldn'?t|refused|blocked|killed|walked/i.test(s)) v += 8;
    if (fam && fam.kw.test(s)) v += 10;
    if (/^(the|our|this)\s/i.test(s) && s.length < 45) v -= 6;
    return { s, v };
  }).sort((a, b) => b.v - a.v);
  return scored[0].s.slice(0, 220);
}

function parseLines(text) {
  const deals = [], skipped = [];
  for (const line of text.split(/\r?\n/).slice(0, MAX_LINES)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(won|lost|w|l)\s*[|,;:]\s*(.+)$/i);
    if (!m) { skipped.push(t.slice(0, 60)); continue; }
    const won = /^w/i.test(m[1]);
    const rest = m[2].split('|');
    const amount = parseAmount(rest[0]);
    const notes = (rest[1] ?? rest.join(' ')).replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!notes) { skipped.push(t.slice(0, 60)); continue; }
    deals.push({ won, amount, notes, conf: confidenceOf(notes), quarter: detectQuarter(notes) });
  }
  return { deals, skipped: skipped.slice(0, 10) };
}

function themeFamily(notes, famList) {
  return famList.find((f) => f.kw.test(notes)) || null;
}

function buildThemes(deals, famList = FAMILIES) {
  const byFamily = new Map();
  let unclassified = { count: 0, amount: 0 };
  for (const d of deals) {
    const fam = themeFamily(d.notes, famList);
    if (!fam) { unclassified.count += 1; unclassified.amount += d.amount; continue; }
    const cur = byFamily.get(fam.key) || { key: fam.key, label: fam.label, fix: fam.fix, playbook: fam.playbook, count: 0, amount: 0, weighted: 0, confSum: 0, quotes: [], best: null, bestV: -1 };
    cur.count += 1; cur.amount += d.amount; cur.weighted += d.amount * d.conf; cur.confSum += d.conf;
    cur.quotes.push(d.notes);
    const q = bestQuote(d.notes, fam);
    if (q) {
      const v = q.length + (fam.kw.test(q) ? 100 : 0) + (/\d/.test(q) ? 30 : 0);
      if (v > cur.bestV) { cur.bestV = v; cur.best = q; }
    }
    byFamily.set(fam.key, cur);
  }
  const ranked = [...byFamily.values()]
    .map((t) => ({ ...t, confidence: Number((t.confSum / t.count).toFixed(2)), bestQuote: t.best, quotes: t.quotes.slice(0, 3) }))
    .sort((a, b) => b.weighted - a.weighted || b.count - a.count);
  return { ranked, unclassified };
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { text: "lost | 12000 | notes" }.' }, { status: 400 });
  }
  const text = String(body?.text ?? '').slice(0, MAX_CHARS);
  if (!text.trim()) return NextResponse.json({ error: 'Paste at least two deals — one per line: won|lost | amount | notes.' }, { status: 400 });

  const { deals, skipped } = parseLines(text);
  if (deals.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 parseable lines in the format “lost | 12000 | notes text”. Skipped: ' + (skipped.join(' / ') || 'none') });
  }
  const lost = deals.filter((d) => !d.won);
  const won = deals.filter((d) => d.won);
  if (lost.length === 0) return NextResponse.json({ error: 'No lost deals found — every line parsed as won. Add at least one “lost | …” line.' });

  const { ranked, unclassified } = buildThemes(lost);
  if (!ranked.length) return NextResponse.json({ error: 'Lost deals parsed, but no recognisable reason keywords were found in the notes.' });

  const winSet = buildThemes(won, WIN_FAMILIES);
  const totalLost = lost.reduce((a, d) => a + d.amount, 0);
  const totalWon = won.reduce((a, d) => a + d.amount, 0);

  // quarter aggregation from date strings found inside notes
  const qMap = new Map();
  for (const d of lost) {
    if (!d.quarter) continue;
    const q = qMap.get(d.quarter) || { quarter: d.quarter, count: 0, amount: 0, confSum: 0 };
    q.count += 1; q.amount += d.amount; q.confSum += d.conf;
    qMap.set(d.quarter, q);
  }
  const quarters = [...qMap.values()].map((q) => ({ ...q, confidence: Number((q.confSum / q.count).toFixed(2)) }))
    .sort((a, b) => b.amount - a.amount).slice(0, 6);

  const shown = ranked.slice(0, THEME_CAP); // PAID cap: top 3 themes
  for (const t of shown) t.share = Math.round((t.amount / (totalLost || 1)) * 100);
  const fixList = shown.map((t) => ({ label: t.label, actions: t.playbook }));
  const top = shown[0];
  const insight = `Your biggest leak is ${top.label.toLowerCase()}: ${top.count} of ${lost.length} lost deal${lost.length === 1 ? '' : 's'} (confidence ${Math.round(top.confidence * 100)}%;${unclassified.count ? ` plus ${unclassified.count} uncategorised,` : ''} total lost ${totalLost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}). ${top.label} alone costs ${top.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} — that's ${top.share}% of every rupee you lost. The fix: ${top.fix}.`;

  const base = {
    lostCount: lost.length,
    wonCount: won.length,
    totalLost,
    totalWon,
    winRate: Number(((won.length / deals.length) * 100).toFixed(1)),
    ranked: shown,
    hidden: ranked.length - THEME_CAP,
    winThemes: winSet.ranked.slice(0, 3).map((t) => ({ label: t.label, count: t.count, amount: t.amount, confidence: t.confidence, bestQuote: t.bestQuote })),
    unclassified,
    quarters,
    fixList,
    insight,
    aiAvailable: aiAvailable(),
    source: 'engine',
    aiInsight: null,
  };

  // AI insight pass (MetaSales-style narrative over the computed numbers).
  if (!aiAvailable()) return NextResponse.json(base);
  try {
    const out = await aiJson(
      'You are a revenue-ops analyst. Using ONLY the numbers given, write an executive read. JSON keys: "insight" (≤70 words: rank the leaks by confidence-weighted money, name one pattern across quotes, state the single first move), "morale" (≤25 words: what the win-side themes say is working and should be defended).',
      JSON.stringify({ totalLost, totalWon, winRate: base.winRate, themes: shown.map((t) => ({ label: t.label, count: t.count, amount: t.amount, confidence: t.confidence, quotes: t.quotes.slice(0, 2) })), winThemes: base.winThemes, quarters }),
      { maxTokens: 500 },
    );
    const clean = (s, max) => String(s ?? '').replace(/[<>&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const aiInsight = clean(out.insight, 600);
    if (aiInsight.length < 20) return NextResponse.json(base);
    return NextResponse.json({ ...base, source: 'ai', aiInsight, aiMorale: clean(out.morale, 220) || null });
  } catch {
    return NextResponse.json(base);
  }
}
