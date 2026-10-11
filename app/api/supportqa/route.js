import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

// Server engine for SupportQA — Zendesk-QA/SlA/Kitewest-style scorecards:
// overall grade + per-signal sub-scores with pass/fail thresholds, a
// customer-effort proxy, agent-missed-opportunity detection and SLA parsing.

const MAX_BLOCKS = 100;
const MAX_CHARS = 60_000;

const SOLUTION = /\b(fixed|resolved|solution|reset|updated|worked|restart|refund(?:ed| processed)?|applied|cleared|here is|here[’']s|try (?:this|again)|the fix|steps? (?:to|above)|i(?:['’]| a)?ve (?:changed|sent|issued|refunded|escalated)|will (?:send|issue|fix|reset)|done|closed)\b/i;
const CONFIRM = /\b(thanks?\b|thank you|works? now|that worked|perfect|great|awesome|got it|understood|resolved|fixed|solved|all good|confirm(?:ed)?|yes|yep|no more issue)\b/i;
const POLITE = /\b(please|thank you|thanks|apolog|sorry|appreciate|happy to|glad to|certainly|of course|no problem)\b/gi;
const EMPATHY = /\b(i understand|sorry to hear|i['’]?m sorry|that sounds (?:frustrating|difficult|annoying)|i can (?:see|imagine|relate)|frustrat|inconvenience|how you feel|i('’|a) hear you|that['’]?s must be|no worries)\b/gi;
const PROBLEM = /\b(broken|not working|doesn['’]?t work|failed|crash|error|bug|still|again|frustrat|angry|upset|refund|charge|billing|delay|slow|lost|missing)\b/i;
const PROMISE = /\b(refund|discount|credit|waive(?:d)?|free month|compensat|apply the (?:refund|credit)|refund(?:ed| you| you will be))\b/i;
const POLICY = /\b(policy|accordance|per our|terms|guideline|as a (?:one[- ]time )?(?:goodwill|exception)|eligib|if (?:you qualify|you['’]?re eligible)|after review|subject to)\b/i;

// “First response: 2 hours”, CSV-ish “first_response,2h” and pipe rows all parse.
const FRT = /(?:first[ -]?response|first_response|response[ -]?time)[\s:|,]+([0-9]+(?:\.[0-9]+)?)\s*(second|sec|minute|min|hour|hr|day|week|d|h|m|s|w)?/i;
// SLA column: “SLA: 4 hours”, “sla|8h”, “SLA target, 1 day”.
const SLA = /\bsla(?:[ -]?(?:target|breach|met|status|time))?\b[\s:|,-]*([0-9]+(?:\.[0-9]+)?)\s*(second|sec|minute|min|hour|hr|day|week|d|h|m|s|w)?|(?:sla|breach)\b[:\s]*\b(met|breached?|missed|ok)\b/i;

const ASK_FEATURE = /\b(can (?:you|it|we) (?:add|support|do)|does\b[^?]{0,40}\bsupport\b|is (?:there|any) (?:api|integration|export|sso)|feature (?:request|idea|roadmap)|will you (?:add|build|support)|support for (?:sso|api|export|integrat)|integrat\w*\b.*(available|support|when)|when.*(feature|ship|launch))\b/i;
const ASK_PRICING = /\b(how much (?:does|do|is)|what.*(price|cost)|pricing|price list|discount|quote|annual plan|enterprise plan|upgrad\w* (?:price|cost)|cost per)\b/i;
// an agent answer to an ask: any substantive reply token near those topics
const ANSWERED = /\b(pricing|price|costs? \$?\d|plan|tier|discount|quote|roadmap|support|supported|available|integrat|api|sso|export|add(?:ed|ing)?|build|ship|enterprise)\b/i;

function seconds(n, unit) {
  if (!unit) return n * 60; // bare number in an SLA/FRT context = minutes
  const u = String(unit).toLowerCase();
  return n * (/^s/.test(u) ? 1 : /^m/.test(u) ? 60 : /^h/.test(u) ? 3600 : /^d/.test(u) ? 86400 : /^w/.test(u) ? 604800 : 60);
}

function fmtDur(s) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1).replace(/\.0$/, '')}h`;
  return `${(s / 86400).toFixed(1).replace(/\.0$/, '')}d`;
}

const normWords = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'for', 'you', 'are', 'with', 'have', 'not', 'this', 'that', 'what', 'when', 'how', 'why', 'can', 'does', 'did'].includes(w));

// repeat-question detection: two customer turns sharing ≥40% of content words,
// or explicit “again / still / as i said” markers.
function repeatQuestions(custLines) {
  const marks = [];
  const sets = custLines.map(normWords);
  for (let i = 1; i < sets.length; i++) {
    if (!sets[i].length || !sets[i - 1].length) continue;
    const prev = new Set(sets[i - 1]);
    const inter = sets[i].filter((w) => prev.has(w)).length;
    if (inter / sets[i].length >= 0.4) marks.push(`repeats ${String(custLines[i]).slice(0, 40)}…`);
  }
  const explicit = custLines.filter((c) => /\b(again|still|as i (?:said|mentioned)|once more|i (?:told|asked) you)\b/i.test(c));
  explicit.forEach((c) => marks.push(`“${String(c).slice(0, 40)}…”`));
  return [...new Set(marks)].slice(0, 3);
}

function gradeTicket(raw) {
  const agentTurns = [];
  const custTurns = [];
  let frtSec = null;
  let slaSec = null;
  let slaStatus = null;
  for (const line of raw.split(/\r?\n/)) {
    const s = line.match(SLA);
    if (s && /sla|breach/i.test(line)) {
      if (s[1]) slaSec = seconds(parseFloat(s[1]), s[2] || 'h');
      else slaStatus = /met/i.test(s[3] || '') ? 'met' : /breach|miss/i.test(s[3] || '') ? 'breached' : null;
      if (s[1] || s[3]) continue;
    }
    const m = line.match(FRT);
    if (m) { frtSec = seconds(parseFloat(m[1]), m[2]); continue; }
    const t = line.trim();
    if (/^agent\b/i.test(t)) agentTurns.push(line.replace(/^agent\b[^\w]*:?/i, ''));
    else if (/^(customer|user|client|c)\b/i.test(t)) custTurns.push(line.replace(/^(?:customer|user|client|c)\b[^\w]*:?/i, ''));
  }
  const A = agentTurns.join(' \n ');
  const C = custTurns.join(' \n ');

  const agentSolves = (A.match(SOLUTION) || []).length;
  const custConfirms = (C.match(CONFIRM) || []).length;
  const politeness = (A.match(POLITE) || []).length;
  const empathy = (A.match(EMPATHY) || []).length;
  const problemRaised = PROBLEM.test(C);
  const apology = /apolog|sorry/i.test(A);
  const promise = PROMISE.test(A);
  const policyCited = POLICY.test(A);
  const complianceFlag = promise && !policyCited;

  const resolved = agentSolves > 0 && custConfirms > 0;
  const partially = (agentSolves > 0 || custConfirms > 0) && !resolved;

  // ── Customer-effort proxy: who carries the conversation + repeat loops ──
  const custChars = custTurns.reduce((a, c) => a + c.length, 0);
  const agentChars = Math.max(1, agentTurns.reduce((a, c) => a + c.length, 0));
  const ratio = custChars / agentChars; // >0.8 = customer explaining more than solving
  const turns = custTurns.length;
  const repeats = repeatQuestions(custTurns);
  let effort = 100;
  effort -= Math.min(30, Math.round(Math.max(0, ratio - 0.5) * 55)); // long customer monologues
  effort -= Math.min(25, Math.max(0, turns - 2) * 9);               // ping-pong loops
  effort -= repeats.length ? Math.min(30, repeats.length * 12) : 0; // re-asking = agent didn’t land it
  effort -= problemRaised && /still|again/i.test(C) ? 8 : 0;
  effort = Math.max(5, Math.min(100, effort));

  // ── Missed-opportunity detection: customer asked feature/pricing, agent moved on ──
  const missed = [];
  for (const c of custTurns) {
    const asksFeature = ASK_FEATURE.test(c);
    const asksPricing = ASK_PRICING.test(c);
    if (!asksFeature && !asksPricing) continue;
    const idx = custTurns.indexOf(c);
    const reply = agentTurns.slice(idx).join(' ') || agentTurns[agentTurns.length - 1] || '';
    if (!ANSWERED.test(reply)) {
      missed.push({ kind: asksFeature && asksPricing ? 'feature + pricing' : asksFeature ? 'feature' : 'pricing', quote: String(c).trim().slice(0, 70) });
    }
  }

  // ── SLA: parse target column, compare against measured first response ──
  const slaTarget = slaSec ?? 4 * 3600;
  let slaScore = null;
  let slaDetail;
  if (frtSec != null) {
    if (slaStatus === 'breached') { slaScore = 0; slaDetail = `SLA marked breached (${fmtDur(frtSec)} vs ${fmtDur(slaTarget)} target)`; }
    else if (frtSec <= slaTarget) { slaScore = 100; slaDetail = `First response ${fmtDur(frtSec)} — within ${fmtDur(slaTarget)} SLA`; }
    else if (frtSec <= slaTarget * 2) { slaScore = 50; slaDetail = `First response ${fmtDur(frtSec)} — ${fmtDur(frtSec - slaTarget)} over the ${fmtDur(slaTarget)} SLA`; }
    else { slaScore = 0; slaDetail = `First response ${fmtDur(frtSec)} — SLA missed by ${fmtDur(frtSec - slaTarget)}`; }
  } else if (slaStatus) {
    slaScore = slaStatus === 'met' ? 100 : 0;
    slaDetail = `SLA flagged ${slaStatus} (no measured response time in text)`;
  }

  // ── Sub-scores with explicit pass/fail thresholds (scorecard style) ──
  const resScore = resolved ? 100 : partially ? (agentSolves ? 55 : 45) : 0;
  const toneScore = Math.max(0, Math.min(100,
    (empathy > 0 ? 40 : 0) + (politeness >= 2 ? 35 : politeness === 1 ? 18 : 0) + (problemRaised ? (apology ? 25 : 0) : 25)));
  const compScore = complianceFlag ? 25 : promise ? 90 : 100;
  const subs = [
    { key: 'Resolution', score: resScore, threshold: 70, detail: resolved ? 'Solution + customer confirmation' : partially ? (agentSolves ? 'Solution offered, no confirmation' : 'Confirmation without a clear fix') : 'Nothing resolved' },
    { key: 'Tone & empathy', score: toneScore, threshold: 60, detail: `empathy ×${empathy}, polite ×${politeness}${problemRaised ? (apology ? ', apology offered' : ', no apology for the problem') : ''}` },
    { key: 'Policy compliance', score: compScore, threshold: 80, detail: !promise ? 'No risky promises' : complianceFlag ? 'Refund/discount promised without citing policy — audit risk' : 'Promise backed by policy' },
    { key: 'Customer effort', score: effort, threshold: 60, detail: `customer/agent text ratio ${ratio.toFixed(2)}, ${turns} customer turn(s)${repeats.length ? ` · repeat signals: ${repeats.join('; ')}` : ''}` },
    ...(slaScore != null ? [{ key: 'SLA', score: slaScore, threshold: 70, detail: slaDetail }] : []),
    ...(missed.length ? [{ key: 'Opportunities', score: Math.max(0, 100 - missed.length * 50), threshold: 70, detail: `${missed.length} ask(s) about ${missed.map((m) => m.kind).join(', ')} went unanswered` }] : []),
  ];

  // overall = weighted mean; resolution dominates like real QA forms
  const W = { Resolution: 30, 'Tone & empathy': 18, 'Policy compliance': 18, 'Customer effort': 14, SLA: 12, Opportunities: 8 };
  const weightSum = subs.reduce((a, x) => a + W[x.key], 0);
  const overall = Math.round(subs.reduce((a, x) => a + x.score * W[x.key], 0) / weightSum);
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';

  const signals = [];
  const add = (ok, label, mid = false) => signals.push({ ok, mid, label });
  add(resolved, resolved ? 'Resolution confirmed' : partially ? 'Resolution unclear' : 'No resolution', partially);
  add(problemRaised ? apology : true, apology ? 'Apology offered' : problemRaised ? 'No acknowledgement of issue' : 'No apology needed', problemRaised && !apology);
  add(empathy > 0, empathy > 0 ? `Empathy ×${empathy}` : 'No empathy markers');
  add(politeness >= 2, politeness >= 2 ? `Polite (${politeness})` : politeness === 1 ? 'Minimal politeness' : 'No politeness markers', politeness === 1);
  add(!complianceFlag, !promise ? 'No risky promises' : complianceFlag ? 'Promise without policy' : 'Promise with policy', false);
  if (frtSec != null) {
    const good = frtSec <= slaTarget;
    add(good, `First response ${fmtDur(frtSec)}${good ? '' : ' — slow'}`, !good && frtSec <= 86400);
  }
  if (repeats.length) add(false, 'Customer repeated themselves');
  if (missed.length) add(false, `Missed ${missed.map((m) => m.kind).join('/')} ask`);
  if (effort < 60) add(false, `High customer effort (${effort}/100)`, effort >= 40);

  return {
    grade, overall, subs, signals, missed,
    effort: { score: effort, ratio: Number(ratio.toFixed(2)), turns, repeats },
    sla: frtSec != null || slaStatus || slaSec != null ? { frtSec, targetSec: slaTarget, score: slaScore, detail: slaDetail || null } : null,
    preview: ((agentTurns[0] || custTurns[0] || raw).trim().replace(/\s+/g, ' ')).slice(0, 60),
  };
}

const clean = (s, max = 400) => String(s ?? '').replace(/[<>&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { text: "Agent: …\\nCustomer: …" }.' }, { status: 400 });
  }
  const text = String(body?.text ?? '').slice(0, MAX_CHARS);
  if (!text.trim()) return NextResponse.json({ error: 'Paste at least one ticket conversation.' }, { status: 400 });

  const blocks = text.split(/\n\s*\n|^-{3,}$/m).map((b) => b.trim()).filter(Boolean)
    .filter((b) => /(^|\n)\s*(agent|customer|user|client)\b/i.test(b))
    .slice(0, MAX_BLOCKS);
  if (blocks.length === 0) {
    return NextResponse.json({ error: 'No tickets found. Write each ticket as Agent: / Customer: lines, and separate tickets with a blank line.' }, { status: 400 });
  }
  const graded = blocks.map(gradeTicket);
  const shown = graded.slice(0, 3); // PAID cap: free preview grades 3 tickets

  const base = {
    graded: shown,
    total: blocks.length,
    avg: Math.round(graded.reduce((a, g) => a + g.overall, 0) / graded.length),
    missedOps: graded.reduce((a, g) => a + g.missed.length, 0),
    slaBreaches: graded.filter((g) => g.sla && g.sla.score === 0).length,
    highEffort: graded.filter((g) => g.effort.score < 60).length,
    aiAvailable: aiAvailable(),
    source: 'engine',
    coach: null,
  };

  // AI coaching pass (Zendesk-QA-style “what to say next”), engine fallback.
  if (!aiAvailable()) return NextResponse.json(base);
  try {
    const out = await aiJson(
      'You are a support QA coach. JSON keys: "coach" — an array with one entry per ticket, in order: {"ticket": ticket number starting at 1, "coach": ≤28-word imperative coaching note naming the single highest-leverage fix, "opportunity": one short line on the upsell/retention ask the agent dropped (or "none")}.' +
      ' Only reference behaviours actually present in the evidence given.',
      shown.map((g, i) => `Ticket ${i + 1} — grade ${g.grade} (${g.overall}/100)\nweakest signals: ${g.subs.filter((s) => s.score < s.threshold).map((s) => `${s.key} ${s.score}`).join(', ') || 'none'}\nevidence: ${g.signals.map((s) => s.label).join(' | ').slice(0, 500)}`).join('\n\n'),
      { maxTokens: 600 },
    );
    const coach = (Array.isArray(out?.coach) ? out.coach : [])
      .map((c) => ({ ticket: Math.max(1, Math.min(3, parseInt(c.ticket, 10) || 1)), coach: clean(c.coach, 220), opportunity: clean(c.opportunity, 160) }))
      .filter((c) => c.coach.length > 4)
      .slice(0, 3);
    if (!coach.length) return NextResponse.json(base);
    return NextResponse.json({ ...base, source: 'ai', coach });
  } catch {
    return NextResponse.json(base);
  }
}
