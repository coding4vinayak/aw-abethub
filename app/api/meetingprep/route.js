import { NextResponse } from 'next/server';
import { safeFetch, htmlBits } from '../../../lib/fetchpage';
import { aiAvailable, aiText } from '../../../lib/ai';

export const runtime = 'nodejs';

const MAX_NOTES = 12000;
const OPEN_WORDS = ['need', 'pending', 'follow up', 'follow-up', 'followup', 'to do', 'todo', 'action', 'ask', 'blocker', 'waiting', 'due', 'next step', 'will ', 'should '];

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&#x2C;': ',', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&rsquo;': "'", '&apos;': "'" };

function clean(s, max = 200) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] || ' ')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .trim()
    .slice(0, max)
    .trim();
}

function sentences(text) {
  return text
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9(])/g)
    .map((s) => clean(s, 260))
    .filter((s) => s.split(/\s+/).length >= 3);
}

function extractOpenItems(sents) {
  const hits = [];
  for (const s of sents) {
    const low = s.toLowerCase();
    const marker = OPEN_WORDS.find((w) => low.includes(w));
    const isQuestion = /\?/.test(s);
    if (marker || isQuestion) hits.push({ text: s, kind: isQuestion ? 'question' : 'open item', signal: marker || '?' });
  }
  return hits;
}

// Proper-noun-ish tokens in notes that look like people
const NOT_NAMES = new Set([
  'I', 'We', 'You', 'They', 'He', 'She', 'It', 'The', 'A', 'An', 'And', 'But', 'So', 'Then', 'Next', 'This', 'That', 'These', 'Those',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'Sept', 'October', 'November', 'December', 'Q1', 'Q2', 'Q3', 'Q4', 'Team', 'Customer', 'Client', 'Prospect',
  'Hi', 'Hello', 'Thanks', 'Hi team', 'OK', 'Ok', 'PFA', 'CC', 'ETA', 'ASAP', 'TBD', 'NDA', 'SLA', 'API', 'CRM', 'ROI', 'MRR', 'ARR',
  'Please', 'Also', 'However', 'Before', 'After', 'During', 'Today', 'Tomorrow', 'Yesterday', 'Week', 'Month', 'Year', 'Invoice', 'Product',
  // common non-name words that get sentence-capitalised
  'Follow', 'Following', 'Update', 'Updated', 'Notes', 'Note', 'Summary', 'Agenda', 'Context', 'Action', 'Decision', 'Question',
  'Budget', 'Pricing', 'Renewal', 'Onboarding', 'Legal', 'Product', 'Engineering', 'Design', 'Sales', 'Marketing', 'Finance',
  'SSO', 'Quote', 'Contract', 'Demo', 'Trial', 'Plan', 'Tier', 'Seats', 'Data', 'Integration', 'Platform', 'Team', 'Everyone',
]);

function namesInNotes(sents) {
  const found = new Map();
  for (const s of sents) {
    const toks = s.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) || [];
    for (const t of toks) {
      if (NOT_NAMES.has(t)) continue;
      if (!found.has(t)) found.set(t, s);
    }
  }
  return found;
}

function parseAttendees(raw) {
  return String(raw || '')
    .split(/[\n,;]+/g)
    .map((s) => clean(s, 60))
    .filter((s) => s.length >= 2 && /[a-z]/i.test(s));
}

function topicKeywords(notes, bits) {
  const stop = new Set('the a an and or but if then than that this from with without for on to in of is are was were be been being will would can could should may might do does did done have has had you your our we they it its as at by per about into over under more most less very just also like likely our'.split(' '));
  const src = `${notes} ${[...bits.h1s, ...bits.h2s, bits.description].join(' ')}`.toLowerCase();
  const freq = new Map();
  for (const w of src.match(/[a-z][a-z0-9+.-]{3,}/g) || []) {
    if (stop.has(w) || /^\d/.test(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => ({ word: w, n }));
}

function deterministicQuestions(keywords, bits, openItems, attendees) {
  const domain = bits.domain;
  const h2 = bits.h2s[0] ? clean(bits.h2s[0], 70) : null;
  const kw = keywords.slice(0, 6).map((k) => k.word);
  const topKw = kw[0] || 'onboarding';
  const secondKw = kw[1] || 'reporting';
  const q = [];
  if (h2) q.push(`Your homepage leads with “${h2}” — what has changed on that since we last spoke, and is ${topKw} still the priority for ${domain}?`);
  const open = openItems[0];
  q.push(open
    ? `On the open item “${clean(open.text, 90)}” — what would actually close it this week, and who owns it on your side?`
    : `What is the one ${topKw} problem that, if solved in the next 30 days, moves ${secondKw} for your team?`);
  q.push(attendees.length > 1
    ? `With ${attendees.length} people on this call, who has final sign-off on ${topKw} — and what would make them say no?`
    : `Who besides you needs to approve a decision on ${topKw}, and what evidence do they ask for?`);
  return q.slice(0, 3);
}

// ---- Clay-style live enrichment: about page / sitemap hint for a company blurb ----
async function fetchAboutBlurb(origin) {
  const results = await Promise.allSettled(
    ['/about', '/about-us', '/company'].map((p) => safeFetch(origin + p, { timeoutMs: 6000 }))
  );
  for (const r of results) {
    if (r.status !== 'fulfilled' || r.value.status >= 400) continue;
    const b = htmlBits(r.value.html);
    const blurb = clean(b.description || b.h1s[0] || b.h2s[0] || '', 300);
    if (blurb && blurb.split(/\s+/).length >= 4) return { blurb, url: r.value.finalUrl, h2s: b.h2s.slice(0, 4).map((h) => clean(h, 110)) };
  }
  // sitemap hint: find an about-ish URL advertised in the sitemap
  try {
    const sm = await safeFetch(origin + '/sitemap.xml', { timeoutMs: 5000 });
    if (sm.status < 400) {
      const locs = [...sm.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      const hint = locs.find((l) => /about|company|who-we-are|our-team|team/i.test(l));
      if (hint) {
        const p = await safeFetch(hint, { timeoutMs: 6000 });
        if (p.status < 400) {
          const b = htmlBits(p.html);
          const blurb = clean(b.description || b.h1s[0] || b.h2s[0] || '', 300);
          if (blurb && blurb.split(/\s+/).length >= 4) return { blurb, url: p.finalUrl, h2s: b.h2s.slice(0, 4).map((h) => clean(h, 110)) };
        }
      }
    }
  } catch { /* blurb stays optional */ }
  return null;
}

// ---- decision-makers: named people tied to a role signal in the notes ----
const ROLE_RE = /\b(CEO|C[\s]?EO|CTO|CFO|COO|CMO|CIO|founder|co-?founder|head of (?:[a-z]+ )?[a-z]+|VP(?: of [a-z]+)?|vice president(?: of [a-z]+)?|director(?: of [a-z]+)?|manager|team lead|tech lead|project lead|owner|decision[- ]?maker|admin|procurement|purchasing|finance (?:head|lead|manager|controller)|IT (?:head|lead|manager|admin)|president|partner|chief [a-z]+ officer)\b/i;

function decisionMakers(sents, attendees) {
  const out = new Map();
  const attLower = attendees.map((a) => a.toLowerCase());
  for (const s of sents) {
    if (!ROLE_RE.test(s)) continue;
    // person name adjacent to a role word (within ~50 chars)
    const roleMatch = s.match(ROLE_RE);
    const roleAt = roleMatch.index;
    const window = s.slice(Math.max(0, roleAt - 50), Math.min(s.length, roleAt + roleMatch[0].length + 50));
    const names = window.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) || [];
    for (const n of names) {
      if (NOT_NAMES.has(n)) continue;
      if (/^(the|head|vp|director|manager|lead|owner|chief|officer|procurement|purchasing|finance|president|partner|decision|maker|founder)$/i.test(n)) continue;
      if (!out.has(n.toLowerCase())) {
        out.set(n.toLowerCase(), {
          name: n,
          role: clean(roleMatch[0], 40),
          evidence: clean(s, 180),
          onInvite: attLower.some((a) => a.includes(n.toLowerCase()) || n.toLowerCase().startsWith(a.split(/\s+/)[0])),
        });
      }
    }
  }
  // attendees whose own line carries a role word count too
  for (const a of attendees) {
    const rm = a.match(ROLE_RE);
    if (rm && !out.has(a.toLowerCase())) {
      out.set(a.toLowerCase(), { name: clean(a, 60), role: clean(rm[0], 40), evidence: 'role stated on the attendee line', onInvite: true });
    }
  }
  return [...out.values()].slice(0, 6);
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { url, notes, attendees }.' }, { status: 400 });
  }

  let rawUrl = String(body?.url || '').trim();
  const notes = String(body?.notes || '');
  const attendeesRaw = String(body?.attendees || '');

  if (!rawUrl) return NextResponse.json({ error: 'Enter the company website URL.' }, { status: 400 });
  if (!/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;
  try { const u = new URL(rawUrl); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch {
    return NextResponse.json({ error: 'That is not a valid URL.' }, { status: 400 });
  }
  if (notes.trim().split(/\s+/).length < 5) {
    return NextResponse.json({ error: 'Paste the meeting notes or context (at least 5 words).' }, { status: 400 });
  }
  const attendees = parseAttendees(attendeesRaw);

  const notesCapped = notes.length > MAX_NOTES ? notes.slice(0, MAX_NOTES) : notes;
  const sents = sentences(notesCapped);

  // ---- company snapshot (homepage + about/sitemap enrich in parallel) ----
  let origin = null;
  try { const u = new URL(rawUrl); origin = `${u.protocol}//${u.host}`; } catch { origin = null; }
  let company = null, fetchError = null, about = null;
  const [homeRes, aboutRes] = await Promise.all([
    safeFetch(rawUrl, { timeoutMs: 9000 }).catch((e) => ({ __err: e })),
    origin ? fetchAboutBlurb(origin).catch(() => null) : Promise.resolve(null),
  ]);
  about = aboutRes || null;
  if (homeRes.__err) {
    const msg = String(homeRes.__err.message || homeRes.__err);
    fetchError = msg === 'bad url' || msg.includes('private address') || msg.includes('http(s) only')
      ? 'That company URL is not publicly fetchable.'
      : 'Could not reach the company site — it timed out or refused the connection.';
  } else if (homeRes.status >= 400) fetchError = `Company page returned HTTP ${homeRes.status}.`;
  else {
    const bits = htmlBits(homeRes.html);
    bits.domain = (() => { try { return new URL(homeRes.finalUrl).hostname.replace(/^www\./, ''); } catch { return new URL(rawUrl).hostname.replace(/^www\./, ''); } })();
    bits.status = homeRes.status;
    company = bits;
  }

  const openItems = extractOpenItems(sents);
  const noteNames = namesInNotes(sents);
  const keywords = topicKeywords(notesCapped, company || { h1s: [], h2s: [], description: '' });
  const dms = decisionMakers(sents, attendees);

  // ---- attendee <-> notes gap flags ----
  const gaps = [];
  for (const a of attendees) {
    const first = a.split(/\s+/)[0];
    const mentioned = sents.some((s) => s.includes(a) || new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s));
    if (!mentioned) gaps.push({ who: a, flag: 'on the invite but never mentioned in your notes — no stated role or ask for them' });
  }
  for (const [n] of noteNames) {
    const inList = attendees.some((a) => a.toLowerCase().includes(n.toLowerCase()));
    if (!inList && n.length > 3) gaps.push({ who: n, flag: 'named in the notes but not on the attendee line — undocumented stakeholder' });
  }
  if (!attendees.length) gaps.push({ who: '—', flag: 'no attendee list given — a briefing without names cannot flag decision-makers' });
  for (const dm of dms) {
    if (!dm.onInvite) gaps.push({ who: dm.name, flag: `reads as a decision-maker in your notes (${dm.role}) but is not on the attendee line` });
  }

  // ---- risks ----
  const risks = [];
  if (fetchError) risks.push('Company site could not be verified — treat any “recent news” claim as unconfirmed.');
  else if (company && !company.description && !company.h2s.length) risks.push('Their site exposes almost no readable copy — messaging is likely changing; ask what they actually ship today.');
  if (openItems.length === 0) risks.push('No open item, question or action verb found in the notes — this call has no stated agenda.');
  else {
    const stale = openItems.filter((o) => /\bpending\b|\bwaiting\b|\bdue\b|\bblocked\b/i.test(o.text)).length;
    if (stale >= 2) risks.push(`${stale} items read as pending/waiting/blocked — the relationship may be carrying unresolved debt from earlier calls.`);
  }
  const hasDate = /\b(next week|tomorrow|monday|tuesday|wednesday|thursday|friday|\d{1,2}[/-]\d{1,2}|q[1-4]|by \d|deadline)\b/i.test(notesCapped);
  if (!hasDate) risks.push('No date or deadline anywhere in the notes — expect this meeting to end without a committed next step.');
  const money = /(\$|₹|usd|inr|price|pricing|budget|cost|quote|contract|renewal|invoice)/i.test(notesCapped);
  if (!money) risks.push('Money is never mentioned — the commercial owner may not be in the room.');
  if (gaps.filter((g) => g.who !== '—').length >= 2) risks.push(`${gaps.length} name gaps between invite and notes — risk of briefing the wrong stakeholder.`);
  if (!dms.length) risks.push('No role signal (CEO / head / VP / owner / lead…) sits next to any name in your notes — the decision-maker for this deal is unidentified.');

  // ---- signals from their site (Clay-style: recent H2s read as live initiatives) ----
  const signals = [];
  if (company) {
    for (const h of company.h2s.slice(0, 4)) {
      const t = clean(h, 110);
      if (t) signals.push({ text: t, from: `${company.domain} homepage` });
    }
  }
  if (about) {
    for (const h of (about.h2s || []).slice(0, 2)) {
      if (h && !signals.some((s) => s.text === h)) {
        let from = 'about page';
        try { const u = new URL(about.url); from = `${u.hostname}${u.pathname}`; } catch {}
        signals.push({ text: h, from });
      }
    }
  }
  const blurb = (about && about.blurb) || (company ? clean(company.description, 300) : null) || null;

  // ---- 3 suggested questions (AI when configured, deterministic otherwise) ----
  let questions = deterministicQuestions(keywords, company || { domain: new URL(rawUrl).hostname.replace(/^www\./, ''), h2s: [], description: '' }, openItems, attendees);
  let qSource = 'engine';
  if (aiAvailable()) {
    try {
      const rawOut = await aiText(
        'You write meeting briefs for a salesperson. Return EXACTLY 3 suggested questions, one per line, no numbering, no preamble, each under 220 characters, each grounded only in the supplied facts. Never invent news, funding or metrics.',
        `Company site summary: ${company ? `${company.title} | ${company.description} | headings: ${company.h2s.slice(0, 4).join('; ')}` : fetchError}\nAbout-page blurb: ${blurb || 'none fetched'}\nMeeting notes:\n${notesCapped.slice(0, 3000)}\nAttendees: ${attendees.join(', ') || 'none provided'}\nTopic keywords: ${keywords.slice(0, 6).map((k) => k.word).join(', ')}`,
        { maxTokens: 300 }
      );
      const lines = String(rawOut).split(/\r?\n/).map((l) => clean(l.replace(/^\s*[\d-•.]+\s*/, ''), 220)).filter((l) => l.length >= 20);
      if (lines.length >= 2) { questions = lines.slice(0, 3); qSource = 'ai'; }
    } catch { /* deterministic fallback stays */ }
  }

  const domain = company ? company.domain : rawUrl.replace(/^https?:\/\//i, '').split('/')[0];

  return NextResponse.json({
    capped: notes.length > MAX_NOTES,
    company: company ? {
      domain,
      title: clean(company.title, 120) || null,
      description: clean(company.description, 300) || null,
      h1s: company.h1s.slice(0, 2).map((h) => clean(h, 120)),
      h2s: company.h2s.slice(0, 6).map((h) => clean(h, 110)),
      textLen: company.textLen,
      hasOg: company.hasOg,
      blurb,
      aboutUrl: about ? about.url : null,
    } : { domain, fetchError, blurb },
    signals: signals.slice(0, 6),
    decisionMakers: dms,
    context: {
      sentences: sents.length,
      openItems: openItems.slice(0, 8),
      keywords: keywords.slice(0, 8).map((k) => k.word),
    },
    attendees,
    gaps,
    risks: risks.slice(0, 5),
    questions,
    questionSource: qSource,
    source: qSource,
  });
}
