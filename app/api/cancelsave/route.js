import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Cohort context (Churnkey segments saves by product motion): margin, typical
// monthly churn and how each offer type lands for that audience.
const COHORTS = {
  b2b: { label: 'B2B SaaS', margin: 0.82, monthlyChurn: 0.035, bias: { discount: -2, pause: 0, downgrade: -4, annual: 8 } },
  mobile: { label: 'Mobile app subscription', margin: 0.70, monthlyChurn: 0.09, bias: { discount: 8, pause: 6, downgrade: 4, annual: -6 } },
  ecom: { label: 'E-commerce / D2C membership', margin: 0.55, monthlyChurn: 0.06, bias: { discount: 6, pause: -6, downgrade: 6, annual: -2 } },
};

// Offer catalog: effective price concession (cut% over months) so margin cost
// is computable from the monthly value alone.
const OFFERS = {
  discount: {
    label: '25% discount for 3 months', cut: 25, months: 3,
    detail: 'Bridge the rough patch, then reassess before churn becomes habit.',
    base: { expensive: 52, feature: 22, usage: 18, switching: 34 },
  },
  pause: {
    label: 'Pause billing for 1–2 months', cut: 100, months: 2,
    detail: 'A quiet season, not a goodbye: pause the clock and resume at full price.',
    base: { expensive: 24, feature: 20, usage: 55, switching: 16 },
  },
  downgrade: {
    label: 'Downgrade to a cheaper plan', cut: 45, months: 12,
    detail: 'Keep them in the product at a smaller number instead of losing them entirely.',
    base: { expensive: 44, feature: 30, usage: 32, switching: 28 },
  },
  annual: {
    label: 'Annual plan with 2 months free (~17%)', cut: 17, months: 12,
    detail: 'Lock 12 months at an effective ~17% discount and remove the monthly cancel decision.',
    base: { expensive: 48, feature: 26, usage: 22, switching: 24 },
  },
};

const SURVEY = {
  expensive: [
    'What price would have felt fair for what you actually use?',
    'Did a cheaper alternative win on price alone, or on something we could match?',
    'What would have made the value visible before you decided?',
  ],
  feature: [
    'Which missing feature blocked you most?',
    'Could a different plan or workflow have covered it?',
    'If we ship it, would you come back — on what terms?',
  ],
  usage: [
    'What were you hoping this would do for you that never happened?',
    'Where did it stall: setup, daily habit, or team adoption?',
    'What would have pulled you back to weekly use?',
  ],
  switching: [
    'What does the other product do better today?',
    'What triggered the switch — price, a missing feature, or a moment of failure?',
    'Would data export or migration support have changed the timing?',
  ],
};

const SCRIPTS = {
  feature: (o) => `Hi {{name}} — got it, the missing feature is a fair reason. ${o} — here's the play: we map the gap to an existing workflow today and pin a roadmap date. If I set that up now, would it change your decision? Either way, thanks for your time with us.`,
  usage: (o) => `Hi {{name}} — looks like the team hasn't needed us much lately. ${o} beats saying goodbye: no invoice while you're quiet, resume at full price when the work is back. Should I pause it and check in 30 days, or would a quick setup call get usage back up first?`,
  switching: (o) => `Hi {{name}} — no hard feelings if you've found a better fit. One ask before you go: ${o} — plus we'll export your data cleanly either way. If the answer is still no, I'll process the cancel today.`,
};

function probFor(offerKey, reason, value, tenure, cohort) {
  const o = OFFERS[offerKey];
  const c = COHORTS[cohort];
  let p = o.base[reason] + clamp(Math.round(tenure * 1.5) - 6, -8, 12) + c.bias[offerKey];
  if (value > 300) p -= 6; // bigger decisions take longer to reverse
  if (tenure < 2) p -= 8;
  if (offerKey === 'annual' && tenure >= 6 && value >= 100) p += 8;
  if (offerKey === 'discount' && value >= 100) p += 4;
  if (offerKey === 'downgrade' && value < 100) p += 4;
  if (offerKey === 'pause' && reason === 'usage' && tenure >= 6) p += 6;
  return clamp(Math.round(p), 5, 85);
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || '');
  const cohort = COHORTS[body?.cohort] ? body.cohort : 'b2b';
  const value = parseFloat(body?.value);
  const tenure = parseFloat(body?.tenure);
  if (!['expensive', 'feature', 'usage', 'switching'].includes(reason)) {
    return NextResponse.json({ error: 'Pick a cancellation reason.' }, { status: 400 });
  }
  if (!Number.isFinite(value) || value <= 0 || value > 1000000) {
    return NextResponse.json({ error: 'Enter the customer’s monthly value in dollars (e.g. 49).' }, { status: 400 });
  }
  if (!Number.isFinite(tenure) || tenure < 0 || tenure > 120) {
    return NextResponse.json({ error: 'Enter tenure in months (0–120).' }, { status: 400 });
  }

  const c = COHORTS[cohort];
  // Expected remaining lifetime margin if saved: value × margin × 1/churn, capped.
  const retentionMonths = Math.min(24, Math.round(1 / c.monthlyChurn));

  const options = Object.entries(OFFERS).map(([key, o]) => {
    const prob = probFor(key, reason, value, tenure, cohort);
    const concessionCost = Math.round(value * (o.cut / 100) * c.margin * Math.min(o.months, 12));
    const savedMargin = Math.round((prob / 100) * value * c.margin * retentionMonths);
    return {
      key,
      offer: o.label,
      detail: o.detail,
      prob,
      cutPct: o.cut,
      months: o.months,
      monthlyMarginGivenUp: Math.round(value * (o.cut / 100) * c.margin * (key === 'pause' ? o.months / 12 : 1)),
      concessionCost,
      savedMargin,
      netUpside: savedMargin - concessionCost,
    };
  }).sort((a, b) => b.netUpside - a.netUpside || b.prob - a.prob);

  const top = options[0];
  let surveyQuestions = SURVEY[reason];
  let script = reason === 'expensive'
    ? `Hi {{name}} — before we process this: you've been with us ${Math.round(tenure)} months at $${Math.round(value)}/mo. Our best play: ${top.offer.toLowerCase()} — it costs you $${top.concessionCost} of margin but keeps ~$${top.savedMargin} of expected margin. Want me to apply it now?`
    : SCRIPTS[reason](top.offer.toLowerCase());

  // Leader (Churnkey) pairs the flow with AI-tuned messaging. Deterministic
  // economics always run; the model only personalizes survey + rationale.
  let source = 'engine';
  let aiRationale = null;
  if (aiAvailable()) {
    try {
      const j = await aiJson(
        'You are a subscription-retention strategist. Given the cancellation context and computed offer economics, return JSON: {"rationale": one sentence explaining why the top offer wins for this cohort, "survey": array of exactly 3 short exit-survey questions a customer would answer before cancelling}.',
        `Reason: ${reason}. Cohort: ${c.label}. Monthly value: $${value}. Tenure: ${tenure} months. Top offer: ${top.offer} (save probability ${top.prob}%, 12-mo concession cost $${top.concessionCost}, expected saved margin $${top.savedMargin}). Default survey angle: ${surveyQuestions[0]}`,
        { maxTokens: 400 },
      );
      if (j && (j.rationale || Array.isArray(j.survey))) {
        aiRationale = String(j.rationale || '').slice(0, 240) || null;
        const qs = Array.isArray(j.survey) ? j.survey.map((q) => String(q).slice(0, 160)).filter(Boolean).slice(0, 3) : [];
        if (qs.length === 3) surveyQuestions = qs;
        source = 'ai';
      }
    } catch { /* deterministic fallback stays */ }
  }

  return NextResponse.json({
    source,
    cohort,
    cohortLabel: c.label,
    marginPct: Math.round(c.monthlyChurn === 0 ? 0 : c.margin * 100),
    retentionMonths,
    value,
    tenure,
    reason,
    totalOffers: options.length,
    recommended: top,
    options,
    script,
    aiRationale,
    surveyQuestions,
  });
}
