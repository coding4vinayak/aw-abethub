import { NextResponse } from 'next/server';
import { safeFetch, htmlBits } from '../../../lib/fetchpage';

export const runtime = 'nodejs';

const MAX_PASTE = 6000;

const TIER_ALIASES = [
  [['free', 'trial', 'starter', 'basic', 'lite', 'solo', 'individual', 'hobby', 'personal'], 'entry'],
  [['pro', 'growth', 'team', 'standard', 'plus', 'startup', 'business', 'professional', 'premium'], 'mid'],
  [['enterprise', 'scale', 'ultimate', 'executive', 'corporate', 'custom', 'contact us', 'max'], 'top'],
];

function tierOf(name) {
  const low = String(name || '').toLowerCase();
  for (const [keys, t] of TIER_ALIASES) if (keys.some((k) => low.includes(k))) return t;
  return null;
}

// ---------- pasted text: one plan per line ----------
function parsePlans(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const m = raw.match(/(?:[$₹€£]|\bUSD|\bINR|\bEUR|\bGBP)\s*(-?[\d][\d,]*(?:\.\d+)?)|(-?[\d][\d,]*(?:\.\d+)?)\s*(?:USD|INR|EUR|GBP)|(?:[$₹€£])\s*([\d,]+(?:\.\d+)?)/i);
    const numTok = m && (m[1] || m[2] || m[3]);
    if (!numTok) continue;
    const price = Number(String(numTok).replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    let name = raw
      .replace(/(?:[$₹€£]\s*-?[\d][\d,]*(?:\.\d+)?|-?[\d][\d,]*(?:\.\d+)?\s*(?:USD|INR|EUR|GBP))/gi, ' ')
      .replace(/\/\s*(mo|month|yr|year|annum)\b/gi, '')
      .replace(/\b(per|user|seat|month|monthly|year|yearly|annum|billed|annually|usd|inr|eur|gbp)\b/gi, ' ')
      .replace(/[|:—–\-\/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) name = 'unlabelled plan';
    const period = /yr|year|annum|annual/i.test(raw) ? 'yr' : 'mo';
    rows.push({ name: name.slice(0, 40), price, period, monthly: period === 'yr' ? Number((price / 12).toFixed(2)) : price, tier: tierOf(name) });
  }
  return rows.sort((a, b) => a.monthly - b.monthly);
}

// ---------- live mode: plan blocks extracted heuristically from a pricing page ----------
const TIER_WORDS = ['free', 'trial', 'starter', 'basic', 'lite', 'solo', 'individual', 'hobby', 'personal', 'pro', 'growth', 'team', 'standard', 'plus', 'startup', 'business', 'professional', 'premium', 'enterprise', 'scale', 'ultimate', 'executive', 'corporate', 'custom', 'max', 'advanced', 'essential', 'founder', 'power'];

function looksLikeUrl(s) {
  const t = String(s || '').trim();
  if (/\s/.test(t) && !/^https?:\/\/\S+$/i.test(t)) return false;
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/[^\s]*)?$/i.test(t);
}

function normaliseUrl(raw) {
  const t = String(raw || '').trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function extractPlansFromHtml(html) {
  const bits = htmlBits(html);
  const body = bits.body || '';
  const priceRe = /(?:[$₹€£]\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:USD|INR|EUR|GBP)\b)/gi;
  const rows = [];
  let m;
  let guard = 0;
  while ((m = priceRe.exec(body)) && guard++ < 60) {
    const num = Number(String(m[1] || m[2]).replace(/,/g, ''));
    if (!Number.isFinite(num) || num > 100000) continue;                 // implausible for a per-plan price
    if (/\(\s*\d{1,3}\s*\)/.test(body.slice(Math.max(0, m.index - 4), m.index))) continue; // "(20)" counts, not price
    const before = body.slice(Math.max(0, m.index - 130), m.index);
    const after = body.slice(m.index, Math.min(body.length, m.index + 90));
    const period = /\/\s*(?:mo|month|user\/month|per month)/i.test(after) ? 'mo'
      : /\/\s*(?:yr|year|annum|yearly)/i.test(after + before) ? 'yr' : 'mo';
    // plan name: closest tier vocabulary word before the price; else last capitalised 1-3 words before it
    let name = null;
    let bestPos = -1;
    for (const w of TIER_WORDS) {
      const re = new RegExp(`\\b${w}\\b`, 'ig');
      let wm;
      while ((wm = re.exec(before))) if (wm.index > bestPos) { bestPos = wm.index; name = before.slice(wm.index, wm.index + wm[0].length); }
    }
    if (!name) {
      const cap = before.match(/([A-Z][A-Za-z0-9&.'+-]{2,14}(?:\s+[A-Z][A-Za-z0-9&.'+-]{2,14}){0,2})\s*[:\-–—]?\s*$/);
      if (cap) name = cap[1];
    }
    if (!name || !name.trim() || name.trim().length < 2) continue;
    name = name.trim().slice(0, 40);
    if (/^(usd|inr|eur|gbp|price|per|user|month|year|billed|annually|mo|yr|plan|contact sales)$/i.test(name)) continue;
    if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.price === num)) continue;
    rows.push({ name, price: num, period, monthly: period === 'yr' ? Number((num / 12).toFixed(2)) : num, tier: tierOf(name) });
  }
  return rows.sort((a, b) => a.monthly - b.monthly).slice(0, 10);
}

// ---------- alignment (name family first, then price-ladder position) ----------
function align(mine, theirs) {
  const pairs = [];
  for (const t of ['entry', 'mid', 'top']) {
    const m = mine.find((x) => x.tier === t);
    const th = theirs.find((x) => x.tier === t);
    if (m && th) pairs.push({ mine: m, theirs: th, by: `tier: ${t}` });
  }
  const restMine = mine.filter((x) => !pairs.some((p) => p.mine === x));
  const restTheir = theirs.filter((x) => !pairs.some((p) => p.theirs === x));
  const n = Math.min(restMine.length, restTheir.length);
  for (let i = 0; i < n; i++) pairs.push({ mine: restMine[i], theirs: restTheir[i], by: 'position' });

  const gaps = {
    theirsOnly: theirs.filter((x) => !pairs.some((p) => p.theirs === x)),
    mineOnly: mine.filter((x) => !pairs.some((p) => p.mine === x)),
  };
  return { pairs: pairs.map((p) => {
    const diffPct = p.theirs.monthly ? ((p.mine.monthly - p.theirs.monthly) / p.theirs.monthly) * 100 : 0;
    return { ...p, diffPct: Number(diffPct.toFixed(1)), verdict: Math.abs(diffPct) < 3 ? 'match' : diffPct < 0 ? 'cheaper' : 'pricier' };
  }), gaps };
}

function positioning(pairs, mine, theirs, compLabel) {
  const tips = [];
  const entry = pairs.find((p) => p.by.includes('entry')) || pairs[0];
  if (entry) {
    if (entry.verdict === 'cheaper') tips.push(`Undercut on entry — your ${entry.mine.name} is ${Math.abs(entry.diffPct)}% below ${compLabel}'s ${entry.theirs.name}. Lead the pricing page with that gap and their name in the comparison table.`);
    else if (entry.verdict === 'pricier') tips.push(`Your entry tier is ${entry.diffPct}% above ${compLabel}. Either add a cheaper plan to catch price-shoppers, or show why ${entry.mine.name} replaces two of their tools at the same spend.`);
    else tips.push(`Entry prices match ${compLabel} within 3% — win on the free-trial length or included seats, not the number.`);
  }
  const top = pairs[pairs.length - 1];
  if (top && pairs.length > 1) {
    const where = top.by === 'tier: top' ? 'enterprise tier' : 'higher priced pair';
    if (top.verdict === 'pricier') tips.push(`On the ${where} (${top.mine.name} vs ${top.theirs.name}) you are ${top.diffPct}% dearer. That is defensible only if you publish the features that justify it — otherwise you lose the RFP.`);
    else if (top.verdict === 'cheaper') tips.push(`On the ${where} (${top.mine.name} vs ${top.theirs.name}) you are ${Math.abs(top.diffPct)}% cheaper — pitch that directly to ${compLabel}’s enterprise accounts, they are overpaying.`);
    else tips.push(`${where} prices match ${compLabel} — differentiate on SLA, SSO and support response time, not the number.`);
  }
  if (tips.length < 3 && pairs.length >= 2) {
    tips.push(`Only ${pairs.length} plan${pairs.length === 1 ? '' : 's'} could be aligned — publish a comparable middle tier so buyers can map you against ${compLabel} at all.`);
  }
  return tips.slice(0, 3);
}

// ---- price-anchor tip: cheapest/most-expensive positioning in one sentence ----
function anchorTip(mine, theirs, compLabel, theirsLive) {
  if (!mine.length || !theirs.length) return null;
  const myCheap = mine[0], myTop = mine[mine.length - 1];
  const theirCheap = theirs[0], theirTop = theirs[theirs.length - 1];
  const parts = [];
  if (theirTop.monthly > myTop.monthly) {
    parts.push(`${compLabel} anchors high — their ${theirTop.name} at $${theirTop.monthly}/mo sits above your ceiling ($${myTop.monthly}/mo), which makes their mid-tier look “reasonable” by comparison`);
  } else if (myTop.monthly > theirTop.monthly) {
    parts.push(`You anchor high — your ${myTop.name} at $${myTop.monthly}/mo is the priciest plan on the board, so place it left-most or greyed as the decoy and let the plan below it take the sale`);
  } else {
    parts.push(`Both ladders top out at $${myTop.monthly}/mo — anchoring is neutral, so win the eye test on the cheapest rung`);
  }
  if (myCheap.monthly <= theirCheap.monthly) {
    parts.push(`your cheapest visible plan ($${myCheap.monthly}/mo vs their $${theirCheap.monthly}/mo) gives you the low-anchor: show it next to your flagship so the flagship reads as affordable${theirsLive ? ' against their live page' : ''}`);
  } else {
    parts.push(`their cheapest visible plan ($${theirCheap.monthly}/mo) under-anchors you at $${myCheap.monthly}/mo — add a visible entry rung or bundle justification, or every buyer’s first number will be theirs`);
  }
  return parts.join('; ') + '.';
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { comp, mine, theirs } — theirs may be pasted plan text or a pricing page URL.' }, { status: 400 });
  }
  const comp = String(body?.comp || '').trim().slice(0, 60) || 'Competitor';
  const mineRaw = String(body?.mine || '').slice(0, MAX_PASTE);
  const theirsRaw = String(body?.theirs || '').slice(0, MAX_PASTE);
  if (!mineRaw.trim()) return NextResponse.json({ error: 'Paste your plans (one per line, e.g. “Pro $49/mo”).' }, { status: 400 });

  // ---- resolve each side: live URL fetch or pasted text ----
  let mine = parsePlans(mineRaw);
  let mineSource = 'text';
  let theirs = parsePlans(theirsRaw);
  let theirsSource = 'text';
  let fetched = null;

  const sides = [
    { key: 'mine', raw: mineRaw },
    { key: 'theirs', raw: theirsRaw },
  ];
  for (const side of sides) {
    if (!looksLikeUrl(side.raw)) continue;
    const url = normaliseUrl(side.raw);
    let page;
    try {
      page = await safeFetch(url, { timeoutMs: 9000 });
    } catch (e) {
      const msg = String(e.message || e);
      const friendly = msg === 'bad url' || msg.includes('private address') || msg.includes('http(s) only')
        ? 'That URL is not a publicly fetchable pricing page.'
        : 'Could not reach that pricing page — it timed out or refused the connection.';
      return NextResponse.json({ error: friendly }, { status: 400 });
    }
    if (page.status >= 400) {
      return NextResponse.json({ error: `Pricing page returned HTTP ${page.status} — paste the plan rows instead.` }, { status: 400 });
    }
    const plans = extractPlansFromHtml(page.html);
    let host = '';
    try { host = new URL(page.finalUrl || url).hostname.replace(/^www\./, ''); } catch { host = 'fetched page'; }
    const info = { url: page.finalUrl || url, host, status: page.status, plans: plans.length };
    if (side.key === 'mine') {
      if (plans.length) { mine = plans; mineSource = 'live'; }
      else return NextResponse.json({ error: 'Fetched your page but found no recognisable plan prices — the site may render pricing client-side. Paste the plan rows instead.', fetched: info }, { status: 400 });
    } else {
      theirs = plans;
      theirsSource = plans.length ? 'live' : 'text';
      fetched = info;
    }
    if (side.key === 'mine') fetched = info;
  }

  if (!mine.length) return NextResponse.json({ error: 'No priced plans found on your side — each line needs a price like “Pro $49/mo”.' }, { status: 400 });
  if (!theirs.length) {
    return NextResponse.json({ error: theirsSource === 'live' || fetched
      ? 'Fetched the page but found no recognisable plan prices — the site renders pricing client-side. Paste the plan rows instead.'
      : 'No priced plans found for the competitor — paste their plan rows or give a pricing page URL.' }, { status: 400 });
  }

  const { pairs, gaps } = align(mine, theirs);
  const tips = positioning(pairs, mine, theirs, comp);
  const anchor = anchorTip(mine, theirs, comp, theirsSource === 'live');

  return NextResponse.json({
    source: 'engine',
    comp,
    mine: { plans: mine, source: mineSource },
    theirs: { plans: theirs, source: theirsSource },
    fetched,
    pairs,
    gaps,
    tips,
    anchorTip: anchor,
    capped: mineRaw.length >= MAX_PASTE || theirsRaw.length >= MAX_PASTE,
  });
}
