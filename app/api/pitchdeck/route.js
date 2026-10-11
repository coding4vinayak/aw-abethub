import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_DESC = 600;
const MAX_METRICS = 4000;

const STOP = new Set(('a an the and or but if then than that this these those from with without for on to in of is are was were be been being will would can could should may might must do does did have has had you your ours we our they their it its as at by per about into over under more most very just also like into we us our i me my our company product service solution platform business customers customer users user market make makes making help helps helping built build using use used based new all any not no yes its'.split(' ')));

function keywordsFrom(desc) {
  const toks = String(desc || '').toLowerCase().match(/[a-z][a-z0-9+.-]{3,}/g) || [];
  const freq = new Map();
  for (const t of toks) {
    if (STOP.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([w]) => w);
}

function readNum(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const m = s.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|bn|crore|cr|l|lakhs?)?/);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  const suf = m[2] || '';
  if (/^k$/.test(suf)) n *= 1e3;
  else if (/^(m|mn)$/.test(suf)) n *= 1e6;
  else if (/^bn$/.test(suf)) n *= 1e9;
  else if (/^(crore|cr)$/.test(suf)) n *= 1e7;
  else if (/^l$|^lakhs?$/.test(suf)) n *= 1e5;
  return Number.isFinite(n) ? n : null;
}

// Each detector: label, regex over the metrics blob, unit, whether % or money
// Percent-shaped detectors must stay on one line, otherwise "Churn 3%\nGross margin 82%"
// lets the trailing keyword of the next line steal the previous number.
const H = '[ \\t]{0,4}';
const DETECTORS = [
  { key: 'arr', label: 'ARR', pct: false, res: [/\barr\b[^\d\-]*([\d.,]+\s*(?:k|m|mn|bn|crore|cr|lakhs?|l)?)/i, /annual\s+recurring[^\d\-]*([\d.,]+\s*(?:k|m|mn|bn|crore|cr)?)/i] },
  { key: 'mrr', label: 'MRR', pct: false, res: [/\bmrr\b[^\d\-]*([\d.,]+\s*(?:k|m|mn|bn|crore|cr|lakhs?|l)?)/i, /monthly\s+recurring[^\d\-]*([\d.,]+\s*(?:k|m|mn|bn|crore|cr)?)/i] },
  { key: 'growth', label: 'Growth', pct: true, res: [new RegExp(`(\\d{1,3}(?:\\.\\d+)?)${H}%${H}(?:mo[mt]?hly[ \\t]*)?growth`, 'i'), /growth[^\d%\n]{0,12}(\d{1,3}(?:\.\d+)?)\s*%/i, /\bgrowth\b[^\d\n%]{0,10}(\d{1,3})/i] },
  { key: 'churn', label: 'Churn', pct: true, res: [new RegExp(`(\\d{1,2}(?:\\.\\d+)?)${H}%${H}(?:net[ \\t]*|gross[ \\t]*)?churn`, 'i'), /churn[^\d%\n]{0,12}(\d{1,2}(?:\.\d+)?)\s*%/i, /\bchurn\b[^\d\n%]{0,10}(\d{1,2})/i] },
  { key: 'retention', label: 'Retention', pct: true, res: [new RegExp(`(\\d{1,3}(?:\\.\\d+)?)${H}%${H}(?:net[ \\t]*)?retention`, 'i'), /retention[^\d%\n]{0,12}(\d{1,3}(?:\.\d+)?)\s*%/i] },
  { key: 'margin', label: 'Gross margin', pct: true, res: [new RegExp(`(\\d{1,3}(?:\\.\\d+)?)${H}%${H}(?:gross[ \\t]*)?margin`, 'i'), /margin[^\d%\n]{0,12}(\d{1,3}(?:\.\d+)?)\s*%/i] },
  { key: 'cac', label: 'CAC', pct: false, res: [/\bcac\b[^\d\-]*([\d.,]+\s*(?:k|m|crore|cr)?)/i, /customer\s+acquisition\s+cost[^\d\-]*([\d.,]+)/i] },
  { key: 'ltv', label: 'LTV', pct: false, res: [/\bltv\b[^\d\-]*([\d.,]+\s*(?:k|m|crore|cr)?)/i, /lifetime\s+value[^\d\-]*([\d.,]+)/i] },
  { key: 'ltvcac', label: 'LTV:CAC', pct: false, res: [/ltv\s*[/:]\s*cac\s*[=:]?\s*(\d+(?:\.\d+)?)/i] },
  { key: 'customers', label: 'Customers', pct: false, res: [/(\d[\d,]*)\s*(?:paying\s*)?(?:customers|accounts|clients|logos|subscribers)/i, /\bcustomers\b[^\d\n]{0,10}(\d[\d,]*)/i] },
  { key: 'acv', label: 'ACV / ARPA', pct: false, res: [/\b(?:acv|arpa|arpu)\b[^\d\-]*([\d.,]+\s*(?:k)?)/i, /average\s+contract[^\d\-]*([\d.,]+)/i] },
  { key: 'runway', label: 'Runway', pct: false, res: [/(\d{1,2})\s*months?\s*(?:of\s*)?runway/i, /\brunway\b[^\d\n]{0,10}(\d{1,2})/i] },
  { key: 'nps', label: 'NPS', pct: false, res: [/\bnps\b[^\d\-]{0,8}(\d{1,3})/i, /net\s+promoter[^\d\-]{0,8}(\d{1,3})/i] },
  { key: 'burn', label: 'Monthly burn', pct: false, res: [/(\d[\d.,]*\s*(?:k|m|crore|cr)?)\s*(?:monthly\s*)?burn/i, /burn\s*(?:rate)?[^\d\-]*([\d.,]+)/i] },
];

function detectMetrics(blob) {
  const out = {};
  for (const d of DETECTORS) {
    let val = null;
    for (const re of d.res) {
      const m = blob.match(re);
      if (m) {
        const n = d.pct ? (Number(String(m[1]).replace(/,/g, ''))) : readNum(m[1]);
        if (n != null && Number.isFinite(n)) { val = n; break; }
      }
    }
    out[d.key] = { label: d.label, value: val, provided: val != null };
  }
  return out;
}

const fmt = (m) => {
  if (!m.provided) return null;
  const v = m.value;
  if (m.label === 'LTV:CAC') return `${v}x`;
  if (m.pct) return `${v}%`;
  if (['growth', 'customers', 'runway', 'nps'].includes(m.key)) return m.key === 'runway' ? `${v} mo` : m.key === 'customers' ? v.toLocaleString() : `${v}`;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v}`;
};

// ---- stage detection: seed vs growth, from the metrics actually present ----
function detectStage(metrics) {
  const hasRevenue = metrics.arr.provided || metrics.mrr.provided;
  const arr = metrics.arr.provided ? metrics.arr.value : metrics.mrr.provided ? metrics.mrr.value * 12 : 0;
  const scale = arr >= 1e6 || (metrics.customers.provided && metrics.customers.value >= 200) || (metrics.growth.provided && metrics.growth.value >= 15 && hasRevenue);
  if (hasRevenue && scale) return { stage: 'growth', reason: `revenue reported (${hasRevenue ? fmt(metrics.arr.provided ? metrics.arr : metrics.mrr) : '—'}${metrics.customers.provided ? `, ${metrics.customers.value} customers` : ''}) clears the Series A+ bar investors apply` };
  if (hasRevenue || metrics.customers.provided || metrics.growth.provided) return { stage: 'seed', reason: 'early traction signals present but below the $1M ARR / 200-customer growth-stage bar' };
  return { stage: 'seed', reason: 'no revenue, customer or growth metrics detected — the deck must be pitched as a seed story: team, insight and wedge' };
}

function buildDeck(desc, metrics, kw, stage) {
  const has = (k) => metrics[k].provided;
  const show = (k) => (metrics[k].provided ? `${metrics[k].label} ${fmt(metrics[k])}` : `collect ${metrics[k].label.toLowerCase()}`);
  const primary = kw[0] || 'your product';
  const secondary = kw[1] || 'your customers';
  const tertiary = kw[2] || 'the workflow';

  const slide = (title, metric, bullets, expect) => ({ title, metric, bullets, expect });

  // a16z / CB Insights per-slide expectation lines (index-aligned to each framework)
  const GROWTH_EXPECTS = [
    'a16z / CB at growth stage: the number is the hook — partners decide whether to keep reading from the traction strip alone.',
    'a16z expects a 24-month revenue curve with the period labelled; an unlabelled curve gets read as inflated.',
    'CB Insights growth-deck teardowns treat NRR as the retention headline — showing logo retention only reads as a dodge.',
    'Growth investors expect per-channel CAC and payback; a blended average invites a diligence discount.',
    'Bottom-up sizing anchored to your own ACV is expected; analyst-shop TAM numbers are not credited.',
    'At growth stage the moat must be compounding with data — features that are “hard today” do not count.',
    'Expect the new-vs-expansion revenue mix; expansion share rising is what makes the round math work.',
    'Pipeline math matters here: leads → SQLs → bookings, so the raise maps to revenue.',
    'Win/loss stats from the last quarter; “no competition” slides are dismissed at Series B and beyond.',
    'Growth stage funds the org plan — who the raise hires and the span of control they buy.',
    'An 18–24 month operating plan with burn multiple; growth funds model it anyway — do the model for them.',
    'The ask should tie to a milestone that makes the next round obvious; “$5M for 18 months of runway” does not clear an IC.',
  ];
  const SEED_EXPECTS = [
    'a16z at seed: one sentence a partner can repeat in Monday’s deal meeting — clarity over cleverness.',
    'CB Insights: seed decks die when the problem is the founder’s, not the market’s — show external evidence.',
    'a16z: demo > diagrams at seed; if you can’t show it, you can’t fund it.',
    'Why-this-why-now is the seed question every partner asks out loud — pre-empt it.',
    'CB Insights trust a bottom-up number built from your own price × count far more than a $40B funnel graphic.',
    'At seed this is the moat-of-the-moment slide: insight and speed, not patents.',
    'Investors fund the model, not the mission — one paragraph of how money actually arrives.',
    'a16z seed filter: “how will the first 100 customers actually arrive?” — answer it literally.',
    'CB Insights: no revenue is survivable at seed; no evidence is not.',
    'Say “no competition” and every investor assumes you haven’t looked.',
    'At seed the team IS the diligence — map founder-market fit explicitly.',
    'a16z: end on the clock — what gets done in 18 months and what it unlocks next.',
  ];

  if (stage.stage === 'growth') {
    const deck = [
      slide('Title & one-liner', `ARR ${show('arr')}`, [
        `Company one-liner naming ${primary} in ≤12 words — no adjective soup.`,
        `Traction strip up front: ${has('arr') ? `${fmt(metrics.arr)} ARR` : 'collect ARR'} · ${has('growth') ? `${metrics.growth.value}% growth` : 'add growth %'}.`,
        `Raise headline: round, amount, lead target.`,
        `a16z/CB expectation on this slide at growth stage: the number is the hook — investors decide to keep reading from the traction strip alone.`]),
      slide('Traction & growth curve', `growth ${show('growth')} · customers ${show('customers')}`, [
        `Monthly revenue curve for 24+ months, ${primary} cohort marked.`,
        `${has('growth') ? `${metrics.growth.value}% growth — state the period (MoM vs YoY) or it reads as a dodge` : 'collect growth % and the period'}.`,
        `Two marquee logos or expansion events that prove the curve.`]),
      slide('Retention & net revenue expansion', `retention ${show('retention')} · churn ${show('churn')}`, [
        `NRR/nrr curve by cohort — the slide that decides growth-stage checks.`,
        `${has('churn') ? `${metrics.churn.value}% churn — clarify gross vs net and monthly vs annual` : 'collect churn % (gross + net)'}.`,
        `Where the ${has('retention') ? `${metrics.retention.value}% retention` : 'retention number (collect it)'} comes from: seat growth, upsell, or pricing power.`]),
      slide('Unit economics', `LTV:CAC ${has('ltvcac') ? `${metrics.ltvcac.value}x` : 'collect LTV:CAC'} · CAC ${show('cac')}`, [
        `CAC, LTV and payback period per channel, not blended averages.`,
        `${has('margin') ? `${metrics.margin.value}% gross margin after hosting/delivery — say what moves it` : 'collect gross margin %'}.`,
        `Contribution-margin math that shows the $1 of CAC returns fast.`]),
      slide('Market expansion (TAM → SAM → win)', has('customers') ? `${metrics.customers.value} customers today as proof of pull` : 'collect target segment + TAM/SAM/SOM', [
        `Bottom-up sizing from ACV × accounts: ${has('acv') ? `ACV ${fmt(metrics.acv)}` : 'collect ACV'}.`,
        `The adjacent market you unlock with this raise.`,
        `Share you actually took to get here — growth funds are allergic to unearned TAM claims.`]),
      slide('Product & moat', 'none', [
        `The 2 capabilities competitors cannot copy fast — data, workflow lock-in around ${tertiary}, or network effects.`,
        `Roadmap proof that you compound with every customer.`,
        `One screenshot or demo GIF, no feature zoo.`]),
      slide('Business model & pricing', `${show('acv')} · margin ${has('margin') ? `${metrics.margin.value}%` : 'collect gross margin %'}`, [
        `How you charge for ${primary} (seats/usage/tier) and the latest price move.`,
        `Expansion lever per account and land-and-expand math.`,
        `Mix of new vs expansion revenue — growth investors want to see the second one rise.`]),
      slide('Go-to-market engine', has('cac') ? `CAC ${fmt(metrics.cac)}` : 'collect CAC + channel mix', [
        `The one channel that acquires ${primary} buyers profitably, with its CAC.`,
        `Sales motion: PLG, outbound, partner-led — and why this one wins here.`,
        `Pipeline math: leads → SQLs → logos, so the raise maps to bookings.`]),
      slide('Competition & positioning', 'none', [
        `Honest 2×2 around ${secondary} — put incumbents on it, don’t hide.`,
        `Why spreadsheets and “good enough” suites lose on ${tertiary}.`,
        `Win/loss stats from the last 10 deals if you have them.`]),
      slide('Team & organisation', 'none', [
        `Founders and why this team owns ${primary}.`,
        `Org chart now vs after the raise — first hires named.`,
        `Board/advisors or operator angels that de-risk the bet.`]),
      slide('Financials & operating plan', `runway ${show('runway')} · burn ${show('burn')}`, [
        `18–24 month P&L sketch: burn, headcount, ARR line.`,
        `${has('runway') ? `${metrics.runway.value} mo runway today — say what the raise extends it to` : 'collect current runway months'}.`,
        `The 3 metrics the board will steer on.`]),
      slide('The ask', `runway ${show('runway')}`, [
        `Amount, instrument, valuation anchor if any.`,
        `Use of funds in 3 buckets tied to the milestones on slide 11.`,
        `The 18-month milestone that sets up the next round on ${primary} metrics.`]),
    ];
    deck.forEach((s, i) => {
      if (!s.expect && s.bullets.length === 4) s.expect = s.bullets.pop();
      s.expect = s.expect || GROWTH_EXPECTS[i];
    });
    return deck;
  }

  // seed framework — a16z-style narrative order, 12 slides so the preview cap stays "5 of 12"
  const deck = [
    slide('Title & one-liner', 'none', [
      `Company one-liner naming ${primary} in ≤12 words.`,
      `Sub-line: who you serve and the outcome on ${secondary}.`,
      `Traction teaser strip: ${has('arr') ? `${fmt(metrics.arr)} ARR` : has('customers') ? `${metrics.customers.value} customers` : 'pre-revenue is fine — lead with the insight'}.`,
      `a16z expectation on a seed title slide: one sentence a partner can repeat in Monday’s deal meeting — clarity over cleverness.`]),
    slide('Problem', 'none', [
      `The concrete pain around ${primary} that buyers feel weekly.`,
      `Cost of the status quo on ${secondary} (hours, ₹/$, churn).`,
      `Two named-kind customers quoted or paraphrased — proof the pain is real, not imagined.`,
      `CB Insights: seed decks die when the problem is the founder’s, not the market’s — show external evidence.`]),
    slide('Solution', 'none', [
      `What you ship for ${primary}, in plain words.`,
      `The 3-step before/after workflow.`,
      `One screenshot or demo GIF — a seed deck earns trust by showing the thing exists.`,
      `a16z: demo > diagrams at seed; if you can’t show it, you can’t fund it.`]),
    slide('Why now', 'none', [
      `The shift (AI, regulation, cost pressure) making ${primary} urgent now.`,
      `Buyer behaviour change you can already observe.`,
      `What waiting a year costs your customer.`,
      `Why-this-why-now is the seed question every partner asks out loud — pre-empt it.`]),
    slide('Market size', has('customers') ? `${metrics.customers.value} customers today as proof of pull` : 'collect target segment + TAM/SAM/SOM', [
      `TAM for ${primary} and how you slice it.`,
      `Serviceable segment you can actually win — bottom-up, not analyst regurgitation.`,
      `${has('acv') ? `Sizing anchored to your ACV ${fmt(metrics.acv)}` : 'collect ACV to anchor sizing bottom-up'}.`,
      `CB Insights: they trust a bottom-up number built from your own price × count far more than a $40B funnel graphic.`]),
    slide('Product & secret sauce', 'none', [
      `The 2 features competitors cannot easily copy.`,
      `Data or workflow lock-in around ${tertiary} that compounds.`,
      `Roadmap proof that each month makes month twelve easier.`,
      `At seed this is the moat-of-the-moment slide: insight and speed, not patents.`]),
    slide('Business model', `${show('acv')} · margin ${has('margin') ? `${metrics.margin.value}%` : 'collect gross margin %'}`, [
      `How you charge for ${primary} (seats/usage/tier).`,
      `Gross margin and what drives it.`,
      `First paying customer logic: who pays today and why.`,
      `Investors fund the model, not the mission — one paragraph of how money actually arrives.`]),
    slide('Go-to-market', has('cac') ? `CAC ${fmt(metrics.cac)}` : 'collect CAC + channel bet', [
      `The one channel that will acquire ${primary} buyers first — and why it’s beatable.`,
      `Sales motion: PLG, outbound, or partner-led in the first 12 months.`,
      `Cost and payback per channel, even if estimated — show the arithmetic.`,
      `a16z seed filter: “how will the first 100 customers actually arrive?” — answer it literally.`]),
    slide('Traction & validation', `growth ${show('growth')} · customers ${show('customers')}`, [
      `Whatever curve you have: signups, pilots, waitlist conversions — labelled and honest.`,
      `${has('nps') ? `NPS ${metrics.nps.value} — quote the two loudest promoters` : 'collect NPS or a verbatim-love metric'}.`,
      `The one behaviour that repeats without you pushing it.`,
      `CB Insights: no revenue is survivable at seed; no evidence is not.`]),
    slide('Competition', 'none', [
      `Honest 2×2 positioning around ${secondary}.`,
      `Why incumbents and spreadsheets lose on ${tertiary}.`,
      `Your unfair advantage in one line — “we care more” doesn’t count.`,
      `Say “no competition” and every investor assumes you haven’t looked.`]),
    slide('Team', 'none', [
      `Founders and why this team wins on ${primary}.`,
      `Domain scars: prior time in the trenches on this exact problem.`,
      `The advisor or first hire that closes the biggest capability gap.`,
      `At seed the team IS the diligence — map founder-market fit explicitly.`]),
    slide('The ask & plan', `runway ${show('runway')}`, [
      `Amount, instrument, and the milestone the raise buys.`,
      `Use of funds in 3 buckets mapped to the slides above.`,
      `${has('runway') ? `${metrics.runway.value} mo runway today — say what the raise extends it to` : 'collect current runway months'}.`,
      `a16z: end on the clock — what gets done in 18 months and what it unlocks next.`]),
  ];
  deck.forEach((s, i) => {
    if (!s.expect && s.bullets.length === 4) s.expect = s.bullets.pop();
    s.expect = s.expect || SEED_EXPECTS[i];
  });
  return deck;
}

function investorQuestions(metrics, kw, stage) {
  const q = [];
  const has = (k) => metrics[k].provided;
  if (stage.stage === 'growth') {
    if (!has('retention')) q.push('Growth-stage decks live or die on NRR — what is your net revenue retention, and does it rise with account age?');
    else q.push(`NRR of ${metrics.retention.value}% — which segment drags it below 100, and what would you change first?`);
    if (!has('ltvcac') && !has('cac')) q.push('You are raising on a growth curve but with no unit economics — what does CAC cost today and what is the payback period?');
    else if (has('ltvcac') && metrics.ltvcac.value < 3) q.push(`LTV:CAC of ${metrics.ltvcac.value}x is under the 3x line — is that a pricing problem or a channel problem, and which one does the raise fix?`);
    if (!has('margin')) q.push('What gross margin after hosting and delivery, and does it improve or dilute at the next 10x of usage?');
    if (!has('churn')) q.push('No churn number — growth funds will assume logo churn is worse than you think; give the measured figure and its cohort split.');
    if (has('growth') && !has('runway')) q.push(`Growth is ${metrics.growth.value}% but there is no runway or burn — what does the raise have to buy before growth stalls?`);
    q.push('Where does expansion revenue come from — more seats, higher tier, or new modules — and what % of next quarter’s bookings is expansion?');
  } else {
    if (!has('churn')) q.push('You gave no churn number — what is your gross monthly churn today, and is it logo churn or revenue churn?');
    else if (metrics.churn.value > 4) q.push(`Churn of ${metrics.churn.value}% caps how fast revenue can compound — what is the single biggest driver, and what has changed it in the last quarter?`);
    else q.push(`Churn of ${metrics.churn.value}% is strong — which cohorts is it concentrated in, and does it rise with account size?`);
    if (!has('growth')) q.push('No growth % — what is your month-over-month revenue growth and over how many months has it held?');
    else if (!has('runway')) q.push(`Growth is ${metrics.growth.value}% but there is no runway figure — how many months of cash do you have?`);
    if (!has('ltvcac') && !has('cac')) q.push('Unit economics missing — what does it cost to acquire a customer and how long to pay it back?');
    if (!has('customers')) q.push(`How many paying customers do you have, and what would the ${kw[0] || 'core'} buyer renew for a year today?`);
    if (!has('margin')) q.push(`What gross margin does the ${kw[0] || 'core'} product run at after hosting and delivery costs?`);
    if (!has('retention')) q.push('What is your net revenue retention — do existing accounts expand or shrink?');
    q.push(`Seed investors bet on distribution, not just product: how do the first 100 buyers of ${kw[0] || 'your product'} actually find you?`);
  }
  q.push(`Why will an incumbent or a faster-moving startup not copy the ${kw[0] || 'main'} feature within a year?`);
  q.push(`What is the one metric you would put on the board dashboard for this round — and what would have to be true for it to be honest?`);
  return q.slice(0, 8);
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { desc, metrics }.' }, { status: 400 });
  }
  const descRaw = String(body?.desc || '');
  const metricsRaw = String(body?.metrics || '');
  if (!descRaw.trim()) return NextResponse.json({ error: 'Describe the business in one or two lines.' }, { status: 400 });
  if (descRaw.trim().split(/\s+/).length < 4) return NextResponse.json({ error: 'Describe the business in at least 4 words.' }, { status: 400 });

  const desc = descRaw.slice(0, MAX_DESC);
  const metricsBlob = metricsRaw.slice(0, MAX_METRICS);

  const kw = keywordsFrom(desc);
  const metrics = detectMetrics(metricsBlob);
  const stage = detectStage(metrics);
  const deck = buildDeck(desc, metrics, kw, stage);
  const questions = investorQuestions(metrics, kw, stage);
  const providedCount = Object.values(metrics).filter((m) => m.provided).length;

  return NextResponse.json({
    source: 'engine',
    capped: descRaw.length > MAX_DESC || metricsRaw.length > MAX_METRICS,
    stage: stage.stage,
    stageReason: stage.reason,
    slideFramework: stage.stage === 'growth' ? '12-slide growth framework (traction-led, CB Insights/Series A+ style)' : '12-slide seed framework (narrative-led, a16z style)',
    providedCount,
    metricCount: Object.keys(metrics).length,
    keywords: kw.slice(0, 8),
    slides: deck,
    questions,
  });
}
