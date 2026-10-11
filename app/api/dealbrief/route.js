import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const WORD_CAP = 3000; // free preview ceiling — identical to the client-side cap
const MAX_CHARS = 60000;

const NEXT_VERBS = ['will', 'going to', 'send', 'schedule', 'follow up', 'follow-up', 'share', 'loop in', 'set up', 'prepare', 'circulate', 'book', 'demo', 'get you'];
const OBJECTIONS = ['too expensive', 'budget', 'competitor', 'not now', 'not interested', 'no budget', 'already have', 'too costly', 'need to think', 'maybe later', 'higher priority', 'cant commit', "can't commit", 'too soon', 'no urgency'];
const BUDGET_WORDS = ['budget', 'cost', 'price', 'spend', 'roi', 'invoice', 'quote', '$', 'dollar', 'per seat', 'annual', 'month', 'contract value'];
const TIMELINE_WORDS = ['timeline', 'by q', 'deadline', 'next month', 'this quarter', 'by june', 'target', 'go-live', 'go live', 'launch', 'sprint', 'weeks', 'when', 'asap', 'end of'];
const AUTHORITY_WORDS = ['decision', 'approver', 'sign off', 'sign-off', 'cfo', 'ceo', 'vp', 'head of', 'director', 'final say', 'signing', 'procurement', 'approve'];
const NEED_WORDS = ['need', 'looking for', 'problem', 'pain', 'struggle', 'challenge', 'goal', 'want', 'trying to', 'requirement', 'gap'];

// MEDDIC-style qualification coverage — presence detection with per-signal regexes
const MEDDIC = [
  {
    key: 'metrics',
    label: 'Metrics',
    desc: 'quantified success measure (ROI, KPI, time saved, $ figure)',
    res: [
      /\b(roi|kpi|metrics?|baseline|benchmark|time[- ]to[- ]value|conversion rate|churn rate|cost per)\b/i,
      /\d+(?:[.,]\d+)?\s*(?:%|percent|per\s+(?:week|month|year|day)|hours?|days?|weeks?|seats?|users?|accounts?|tickets?|deals?)\b/i,
      /(?:\$|usd|inr|₹)\s?\d[\d,.]*/i,
    ],
  },
  {
    key: 'economicBuyer',
    label: 'Economic buyer',
    desc: 'the person who controls the budget',
    res: [/\b(cfo|ceo|coo|cio|cmo|cto|owner|founder|president|vice president|vp\b|economic buyer|decision[- ]maker|budget holder|signing authority|final say|the board|exec(utive)? sponsor)\b/i],
  },
  {
    key: 'decisionCriteria',
    label: 'Decision criteria',
    desc: 'how they will judge between options',
    res: [/\b(criteria|criterias?|must[- ]?have|requirements?|evaluat\w*|compar\w+|what matters|looking for|scorecard|box[- ]?check|the main thing|important (?:to us|for us|is)\b)/i, /\bneed to (?:see|have)\b/i],
  },
  {
    key: 'decisionProcess',
    label: 'Decision process',
    desc: 'the steps from call to yes (POC, trial, committee)',
    res: [/\b(process|steps?|poc\b|proof of concept|trial|pilot|reference (?:call|check)|internal review|approval (?:process|round)|committee|security review|next round|stakeholder (?:call|meeting)|decision date|by when|roll ?out)\b/i],
  },
  {
    key: 'paperProcess',
    label: 'Paper process',
    desc: 'legal/procurement paperwork to close',
    res: [/\b(legal|contract|paperwork|procurement|vendor (?:onboarding|review|registration)|dpa\b|msa\b|nda\b|order form|infosec|security (?:questionnaire|review)|compliance (?:check|review)|signature|sign[- ]?off|invoic\w+|payment terms|billing)\b/i],
  },
];

// dates for action items: "next week", weekday names, "mar 12", "12 Mar", "31/12", "2 weeks"
const DATE_RE = /\b(?:next|this|following|coming)?\s*\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b|\b(?:next|this|following|end of the)\s+(?:week|month|quarter|year|fortnight)\b|\b(?:january|february|march|april|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|june|july|august|september|october|november|december)\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b|\bq[1-4]\b|\b\d{1,2}[/-]\d{1,2}\b|\b(?:in\s+)?\d+\s+(?:business\s+)?(?:days?|weeks?)\b|\bend of (?:the )?(?:month|quarter|week|year)\b/i;

const KNOWN_VENDORS = ['salesforce', 'hubspot', 'pipedrive', 'zoho', 'close', 'attio', 'monday', 'asana', 'notion', 'clickup', 'jira', 'confluence', 'slack', 'gong', 'calendly', 'zapier', 'airtable', 'excel', 'dynamics', 'sugarcrm', 'freshworks', 'freshdesk', 'zendesk', 'intercom', 'quickbooks', 'xero', 'wrike', 'smartsheet', 'tableau', 'power bi', 'looker', 'amplitude', 'mixpanel', 'segment', 'braze', 'mailchimp', 'klaviyo', 'outreach', 'salesloft', 'apollo', 'clay'];
const NOT_A_NAME = new Set(['We', 'They', 'Our', 'The', 'Their', 'Another', 'Other', 'Competitor', 'Vendor', 'Tool', 'System', 'Platform', 'Solution', 'Something', 'Somebody', 'Anyone', 'Everyone', 'Maybe', 'Also', 'Just', 'Before', 'After', 'Because', 'Currently', 'Existing', 'Old', 'Previous', 'New', 'It', 'That', 'This', 'What', 'When', 'Which', 'Trying', 'Thinking', 'Instead', 'Both', 'Neither', 'Only', 'Probably', 'Sure', 'Still', 'Well', 'Yes', 'Yeah', 'However', 'Actually', 'Honestly', 'Basically', 'Obviously']);

function splitUtterances(text) {
  // A speaker line looks like "Name: utterance" or "Name (Role): utterance" — capture name + body until next speaker
  const lines = text.split(/\r?\n/);
  const utts = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z][A-Za-z .'-]{1,28}?|Rep|Sales|Prospect|Customer|Speaker\s*\d+)(?:\s*\([^)]{1,24}\))?\s*:\s+(.*)$/);
    if (m) {
      if (current) utts.push(current);
      current = { speaker: m[1].trim(), text: m[2] };
    } else if (current) {
      current.text += ' ' + line;
    } else if (line.trim()) {
      current = { speaker: 'Unknown', text: line };
    }
  }
  if (current) utts.push(current);
  return utts.filter((u) => u.text.trim());
}

function findSentence(text, low) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.find((s) => low.includes(s.toLowerCase().trim())) || text.trim().slice(0, 160);
}

function ownerNear(sentence, speaker) {
  const names = sentence.match(/\b([A-Z][a-z]{2,})\b/g) || [];
  const stop = new Set(['I', 'We', 'You', 'They', 'He', 'She', 'It', 'The', 'A', 'And', 'But', 'So', 'Then', 'Next', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const cand = names.filter((n) => !stop.has(n));
  return cand[0] || speaker;
}

function trim(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = item.text.toLowerCase().slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k); out.push(item);
  }
  return out;
}

function tally(list) {
  const byWord = new Map();
  list.forEach((o) => {
    if (!byWord.has(o.word)) byWord.set(o.word, { word: o.word, count: 0, who: o.who, example: o.text });
    byWord.get(o.word).count++;
  });
  return [...byWord.values()].sort((a, b) => b.count - a.count);
}

function analyze(text) {
  const utts = splitUtterances(text);
  const speakers = new Map();
  utts.forEach((u) => speakers.set(u.speaker, (speakers.get(u.speaker) || 0) + 1));

  const actionItems = [];
  const objections = [];
  const signals = { budget: [], timeline: [], authority: [], need: [] };

  utts.forEach((u) => {
    const low = u.text.toLowerCase();
    if (NEXT_VERBS.some((v) => low.includes(v))) {
      const sentence = findSentence(u.text, low);
      const dm = sentence.match(DATE_RE);
      actionItems.push({ owner: ownerNear(sentence, u.speaker), text: trim(sentence, 160), when: dm ? trim(dm[0], 40) : null });
    }
    const hitObj = OBJECTIONS.find((w) => low.includes(w));
    if (hitObj) objections.push({ who: u.speaker, word: hitObj, text: trim(findSentence(u.text, low), 160) });
    if (BUDGET_WORDS.some((w) => low.includes(w))) signals.budget.push(u.speaker);
    if (TIMELINE_WORDS.some((w) => low.includes(w))) signals.timeline.push(u.speaker);
    if (AUTHORITY_WORDS.some((w) => low.includes(w))) signals.authority.push(u.speaker);
    if (NEED_WORDS.some((w) => low.includes(w))) signals.need.push(u.speaker);
  });

  // MEDDIC coverage: first matching transcript line is the evidence; no match is a flagged gap
  const meddic = MEDDIC.map((el) => {
    const hit = utts.find((u) => el.res.some((re) => re.test(u.text)));
    return {
      key: el.key,
      label: el.label,
      desc: el.desc,
      present: Boolean(hit),
      evidence: hit ? `${hit.speaker}: ${trim(hit.text, 150)}` : null,
    };
  });

  // competitor mentions: known-vendor scan + "compared to X" capture pattern
  const compMap = new Map();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const addComp = (name, u, count) => {
    const k = name.toLowerCase();
    const prev = compMap.get(k);
    if (prev) { prev.count += count; return; }
    compMap.set(k, { name, count, first: u && u.text ? `${u.speaker}: ${trim(u.text, 140)}` : null });
  };
  for (const v of KNOWN_VENDORS) {
    const matches = text.match(new RegExp(`\\b${esc(v)}\\b`, 'gi'));
    if (!matches) continue;
    const loc = new RegExp(`\\b${esc(v)}\\b`, 'i');
    const u = utts.find((x) => loc.test(x.text));
    addComp(v.charAt(0).toUpperCase() + v.slice(1), u, matches.length);
  }
  const phraseRe = /\b(?:using|switch(?:ing|ed)?\s+from|migrat\w*\s+from|mov\w*\s+from|compared?\s+(?:to|with|against)|versus|vs\.|alternative\w*\s+to|instead of|evaluating|looking at|looked at|tried|trying)\s+([A-Z][A-Za-z0-9.+-]{2,24})/g;
  for (const u of utts) {
    for (const m of u.text.matchAll(phraseRe)) {
      const cap = m[1].replace(/[.\-+]+$/, '');
      if (!cap || NOT_A_NAME.has(cap)) continue;
      if (KNOWN_VENDORS.includes(cap.toLowerCase())) continue; // already tallied
      addComp(cap, u, 1);
    }
  }
  const competitors = [...compMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  const flag = (arr) => ({ present: arr.length > 0, mentions: arr.length });
  const items = dedupe(actionItems);
  return {
    utterances: utts.length,
    stakeholders: [...speakers.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    actionItems: items,
    objections: tally(objections),
    meddic,
    competitors,
    bant: { budget: flag(signals.budget), authority: flag(signals.authority), need: flag(signals.need), timeline: flag(signals.timeline) },
  };
}

// deterministic deal-brief leader: summary + stage recommendation from engine facts
function engineBrief(a) {
  const gaps = a.meddic.filter((m) => !m.present);
  const covered = a.meddic.length - gaps.length;
  const dated = a.actionItems.filter((x) => x.when).length;
  const stage = gaps.length >= 3
    ? 'Discovery'
    : gaps.length === 2
      ? 'Qualification'
      : a.bant.budget.present && a.bant.timeline.present
        ? (a.competitors.length ? 'Negotiation' : 'Proposal')
        : 'Qualification';
  const bits = [
    `${a.stakeholders.length} speaker${a.stakeholders.length === 1 ? '' : 's'} over ${a.utterances} utterances.`,
    `MEDDIC coverage ${covered}/5${gaps.length ? ` — missing ${gaps.map((g) => g.label.toLowerCase()).join(', ')}` : ' — all five present'}.`,
  ];
  if (a.competitors.length) bits.push(`Competitive set named: ${a.competitors.map((c) => c.name).join(', ')}.`);
  if (dated) bits.push(`${dated} action item${dated === 1 ? '' : 's'} carry a date.`);
  else if (a.actionItems.length) bits.push('No action item has a date attached — pin one before the next call.');
  if (a.objections.length) bits.push(`Loudest objection: “${a.objections[0].word}” (raised by ${a.objections[0].who}).`);
  return { summary: bits.join(' '), stage };
}

export async function POST(req) {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const raw = String(payload.text || '').slice(0, MAX_CHARS);
  const wordCount = raw.trim() ? raw.trim().split(/\s+/).length : 0;
  if (wordCount < 20) {
    return NextResponse.json({ error: 'Paste at least 20 words of transcript.' }, { status: 400 });
  }
  // free tier processes only the first 3,000 words
  const capped = wordCount > WORD_CAP;
  const transcript = capped ? raw.trim().split(/\s+/).slice(0, WORD_CAP).join(' ') : raw;

  const a = analyze(transcript);
  const base = engineBrief(a);
  let source = 'engine';

  // AI leader (Fireflies/Attio-style brief) when configured; engine facts stay as the ground truth
  if (aiAvailable()) {
    try {
      const j = await aiJson(
        'You write CRM-ready deal briefs for B2B reps. From the transcript and computed facts, return JSON {"summary": "2-3 sentence deal summary grounded only in the transcript, max 400 chars", "stage": "Discovery|Qualification|Proposal|Negotiation|Closed"} . Never invent names, numbers or dates.',
        `COMPUTED FACTS: ${JSON.stringify({ stakeholders: a.stakeholders.slice(0, 6), meddic: a.meddic.map((m) => `${m.label}:${m.present ? 'covered' : 'gap'}`), competitors: a.competitors.map((c) => c.name), actionItems: a.actionItems.slice(0, 5), objections: a.objections.map((o) => o.word) })}\nTRANSCRIPT (capped): ${transcript.slice(0, 4000)}`,
        { maxTokens: 400 },
      );
      const s = typeof j?.summary === 'string' ? j.summary.trim() : '';
      const st = typeof j?.stage === 'string' ? j.stage.trim() : '';
      if (s.length > 30 && /^(Discovery|Qualification|Proposal|Negotiation|Closed)/i.test(st)) {
        base.summary = s.slice(0, 500);
        base.stage = st.slice(0, 40);
        source = 'ai';
      }
    } catch { /* engine brief stands */ }
  }

  return NextResponse.json({
    wordCount: capped ? WORD_CAP : wordCount,
    fullWordCount: wordCount,
    capped,
    ...a,
    summary: base.summary,
    stage: base.stage,
    source,
  });
}
