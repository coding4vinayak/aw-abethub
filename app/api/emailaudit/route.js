import { NextResponse } from 'next/server';
import { aiAvailable, aiText } from '../../../lib/ai';

export const runtime = 'nodejs';

// mail-tester-style weighted spammy-word lexicon (~40 terms)
const SPAM_WORDS = [
  { w: '100% free', p: 7 }, { w: 'act now', p: 6 }, { w: 'act today', p: 6 }, { w: 'additional income', p: 6 },
  { w: 'all you need', p: 4 }, { w: 'apply now', p: 4 }, { w: 'approved', p: 3 }, { w: 'as seen on', p: 4 },
  { w: 'avoid', p: 2 }, { w: 'big savings', p: 4 }, { w: 'bulk email', p: 6 }, { w: 'buy now', p: 6 },
  { w: 'cash bonus', p: 7 }, { w: 'certified', p: 3 }, { w: 'cheap', p: 3 }, { w: 'click here', p: 4 },
  { w: 'click bank', p: 6 }, { w: 'congratulations', p: 5 }, { w: 'direct email', p: 5 }, { w: 'discount', p: 4 },
  { w: 'do it today', p: 4 }, { w: 'don\'t delete', p: 4 }, { w: 'don\'t wait', p: 4 }, { w: 'double your', p: 6 },
  { w: 'earn extra cash', p: 7 }, { w: 'expert', p: 2 }, { w: 'extra income', p: 6 }, { w: 'finally', p: 2 },
  { w: 'final offer', p: 5 }, { w: 'free', p: 4 }, { w: 'free consultation', p: 5 }, { w: 'gift', p: 3 },
  { w: 'guarantee', p: 5 }, { w: 'invoic', p: 2 }, { w: 'limited time', p: 5 }, { w: 'lowest price', p: 6 },
  { w: 'money back', p: 5 }, { w: 'million dollars', p: 7 }, { w: 'newsletter', p: 2 }, { w: 'no cost', p: 4 },
  { w: 'order now', p: 6 }, { w: 'offer', p: 2 }, { w: 'opt in', p: 4 }, { w: 'password', p: 3 },
  { w: 'pre-approved', p: 7 }, { w: 'promotion', p: 3 }, { w: 'purchase', p: 3 }, { w: 'quote', p: 2 },
  { w: 'risk-free', p: 4 }, { w: 'special promotion', p: 5 }, { w: 'subscribe', p: 2 }, { w: 'terms apply', p: 4 },
  { w: 'unsubscribe', p: 3 }, { w: 'urgent', p: 5 }, { w: 'viagra', p: 9 }, { w: 'wallet', p: 4 },
  { w: 'winner', p: 6 }, { w: 'while supplies last', p: 6 }, { w: 'work from home', p: 7 }, { w: 'you qualify', p: 7 },
  { w: 'your host', p: 3 },
];
const SPAM_PHRASES = [
  'act now', 'click here', 'limited time', 'risk free', 'act today', 'order now', 'winner',
  'bulk email', 'spam', 'unsubscribe', 'money back guarantee', '100% free',
];

// known URL shorteners — mail-tester-style shortened-URL deduction
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'buff.ly', 'rb.gy', 'shorturl.at', 'cutt.ly', 'rebr.la', 'rebrand.ly', 'lnkd.in', 'trib.al', 'v.gd', 'idrl.me', 'crnl.in', 'spr.ly', 'mzl.la', 'amzn.to'];

// spam-folder tells: phrase list whose presence pushes mail toward the promotions/spam folder
const SPAM_FOLDER_PHRASES = ['unsubscribe', 'act now', '$', 'click here', 'offer expires', 'order now', 'free trial', 'buy now'];
const MAX_BODY = 50000;
const MAX_SUBJECT = 500;

function titleCase(s) {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

// deterministic compliant subject built from the original, cleaned of spam tells
function stripTriggers(s) {
  for (const { w } of SPAM_WORDS) s = s.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\%]/g, '\\$&')}\\b`, 'ig'), ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function cleanPhrase(s) {
  return String(s || '')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/^(hi|hello|hey|dear)\b[,!\s]*/i, '')
    .split(/[.!?\n]/)[0]
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/\b\d[\d.,%]*\b/g, ' ')
    .replace(/\b[a-z]\b/gi, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compliantSubject(subject, body) {
  let s = cleanPhrase(stripTriggers(String(subject || '').replace(/!+/g, ' ')));
  if (!s) {
    const firstLine = String(body || '').replace(/!+/g, ' ').split(/\r?\n/).find((l) => l.trim().length > 4) || '';
    s = cleanPhrase(stripTriggers(firstLine));
  }
  if (!s) s = 'Following up';
  s = titleCase(s.charAt(0).toLowerCase() + s.slice(1));
  if (s.length > 60) s = s.slice(0, 57).replace(/\s+\S*$/, '').trimEnd() + '…';
  return s;
}

// if full headers were pasted, strip them so content signals score the actual message
function splitHeaders(body) {
  const m = body.match(/^(?:[\x20-\x7E]*\r?\n)*?(?=\r?\n)/);
  const headCheck = /^(?:from|to|subject|date|message-id|mime-version|content-type|content-transfer-encoding|received|reply-to|return-path|dkim-signature|authentication-results)\s*:/im;
  if (!headCheck.test(body.slice(0, 4000))) return { headers: false, content: body };
  const idx = body.search(/\r?\n\r?\n/);
  if (idx === -1 || idx > 4000) return { headers: false, content: body };
  return { headers: true, content: body.slice(idx).replace(/^\s+/, '') };
}

function audit(subject, rawBody) {
  const { headers: hadHeaders, content: body } = splitHeaders(rawBody);

  const signals = [];
  let score = 0;
  const add = (label, points, max, detail, cls) => {
    const pts = Math.max(0, Math.min(max, Math.round(points)));
    signals.push({ label, points: pts, max, detail, cls });
    score += pts;
  };

  // ALL-CAPS words ratio (3+ letter words in caps)
  const bodyWords = (body.match(/\b[\w'’$-]+\b/g) || []);
  const allCaps = bodyWords.filter((w) => /^[A-Z]{3,}$/.test(w));
  const subjectWords = (subject.match(/\b[\w'’$-]+\b/g) || []);
  const capsSub = subjectWords.filter((w) => /^[A-Z]{3,}$/.test(w));
  const capsWordRatio = bodyWords.length ? (allCaps.length + capsSub.length * 2) / (bodyWords.length + subjectWords.length * 2) : 0;
  add('ALL-CAPS words', Math.min(15, capsWordRatio * 60 + (capsSub.length ? 4 : 0)), 15,
    `${allCaps.length} shouty word(s) in body${capsSub.length ? `, ${capsSub.length} in subject (${capsSub.slice(0, 3).join(', ')})` : ''} — ${Math.round(capsWordRatio * 100)}% ratio`,
    capsWordRatio > 0.12 ? 'fail' : capsWordRatio > 0.04 ? 'warn' : 'pass');

  // weighted spammy-word lexicon
  const textLow = `${subject} ${body}`.toLowerCase();
  const hits = SPAM_WORDS.filter(({ w }) => textLow.includes(w.toLowerCase()));
  const rawPts = hits.reduce((s, { p }) => s + p, 0);
  const subjectHits = SPAM_WORDS.filter(({ w }) => subject.toLowerCase().includes(w.toLowerCase()));
  add('Spammy words', Math.min(30, rawPts), 30,
    hits.length ? `${hits.length} matched (${hits.slice(0, 5).map((h) => h.w).join(', ')}${hits.length > 5 ? '…' : ''}) worth ${rawPts} raw pts` : 'none found',
    rawPts > 18 ? 'fail' : rawPts > 6 ? 'warn' : 'pass');
  add('Spammy words in subject', Math.min(12, subjectHits.reduce((s, { p }) => s + p, 0) * 1.5), 12,
    subjectHits.length ? subjectHits.map((h) => h.w).join(', ') : 'subject lexically clean',
    subjectHits.length ? 'fail' : 'pass');

  // exclamation marks
  const exclamSub = (subject.match(/!/g) || []).length;
  const exclamBody = (body.match(/!/g) || []).length;
  add('Exclamation marks', Math.min(12, exclamSub * 5 + exclamBody * 1.5), 12, `${exclamSub} in subject, ${exclamBody} in body`, exclamSub + exclamBody > 3 ? 'fail' : exclamSub + exclamBody > 0 ? 'warn' : 'pass');

  // shortened URLs
  const shortHits = SHORTENERS.filter((d) => textLow.includes(d)).map((d) => ({ d, n: (textLow.split(d).length - 1) }));
  const shortCount = shortHits.reduce((s, h) => s + h.n, 0);
  add('Shortened URLs', Math.min(15, shortCount * 6), 15,
    shortCount ? `${shortCount}× via ${shortHits.map((h) => h.d).join(', ')}` : 'no URL shorteners detected',
    shortCount >= 2 ? 'fail' : shortCount ? 'warn' : 'pass');

  // image-to-text proxy: markup-to-text ratio (meaningful when HTML/headers are pasted)
  const hasHtml = /<[a-z!][\s\S]*>/i.test(rawBody);
  if (hasHtml || hadHeaders) {
    const tagChars = (rawBody.match(/<[^>]*>/g) || []).join('').length;
    const textChars = rawBody.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/g, ' ').replace(/\s+/g, ' ').trim().length || 1;
    const imgTags = (rawBody.match(/<img\b/gi) || []).length;
    const markupRatio = tagChars / textChars;
    add('Markup-to-text ratio', Math.min(12, (markupRatio > 2 ? 8 : markupRatio > 0.8 ? 5 : 2) + imgTags * 2), 12,
      `${Math.round((tagChars / (tagChars + textChars)) * 100)}% of the payload is markup, ${imgTags} <img> tag(s) — thin text against image-heavy mail`,
      markupRatio > 2 ? 'fail' : markupRatio > 0.8 ? 'warn' : 'pass');
  } else {
    add('Markup-to-text ratio', 0, 12, 'plain text only — nothing to measure against HTML payload', 'pass');
  }

  // spam-folder phrases
  const folderHits = [...new Set(SPAM_FOLDER_PHRASES.filter((p) => {
    if (p === '$') return /\$\s?\d|\$\d|\d\s?\$/.test(textLow);
    return textLow.includes(p);
  }))];
  add('Spam-folder phrases', Math.min(10, folderHits.length * 2.5), 10,
    folderHits.length ? `contains: ${folderHits.join(', ')}` : 'none of the folder-tell phrases',
    folderHits.length >= 4 ? 'fail' : folderHits.length >= 2 ? 'warn' : folderHits.length ? 'warn' : 'pass');

  // link density
  const linkCount = (body.match(/https?:\/\/|www\./gi) || []).length + (body.match(/<a\s/gi) || []).length;
  const words = bodyWords.length || 1;
  add('Link density', Math.min(10, Math.round((linkCount / words) * 240)), 10, `${linkCount} links over ${words} words`, linkCount > 6 ? 'fail' : linkCount > 2 ? 'warn' : 'pass');

  // subject length
  const subjectChars = [...subject].length;
  add('Subject length', subjectChars > 78 || subjectChars < 4 ? 6 : 0, 6, `${subjectChars} chars (aim 6–70)`, subjectChars > 78 ? 'warn' : 'pass');

  // unsubscribe presence
  const hasUnsub = /unsubscribe|opt[- ]?out|manage preferences/i.test(rawBody);
  add('Missing unsubscribe', hasUnsub ? 0 : 18, 18, hasUnsub ? 'present' : 'no opt-out language found', hasUnsub ? 'pass' : 'fail');

  const spamScore = Math.max(0, Math.min(100, Math.round(score)));
  // mail-tester-style folder probability: monotone in score, saturating below 100%
  const spamFolderProb = Math.max(1, Math.min(95, Math.round(Math.pow(spamScore / 100, 1.35) * 100)));
  const rewritten = compliantSubject(subject, body);

  return { spamScore, spamFolderProb, signals, rewritten, hasUnsub, linkCount, subjectChars, hadHeaders, words };
}

export async function POST(req) {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const subject = String(payload.subject || '').slice(0, MAX_SUBJECT);
  const body = String(payload.body || '').slice(0, MAX_BODY);
  if (!subject.trim() && !body.trim()) {
    return NextResponse.json({ error: 'provide a subject or body' }, { status: 400 });
  }
  if (!body.trim()) {
    return NextResponse.json({ error: 'paste the plain-text email body' }, { status: 400 });
  }

  const base = audit(subject, body);
  let source = 'engine';

  // AI-dependent: only polish the rewrite when a key is configured; never break keyless
  if (aiAvailable()) {
    try {
      const ai = await aiText(
        'You rewrite marketing email subjects to be spam-compliant: under 60 chars, no ALL CAPS, no exclamation marks, no spam trigger words. Reply with ONLY the subject line.',
        `Original subject: ${subject || '(none)'}\nBody start: ${body.slice(0, 300)}`,
        { maxTokens: 60 },
      );
      if (ai && ai.trim()) {
        base.rewritten = ai.trim().replace(/^["']|["']$/g, '').slice(0, 80);
        source = 'ai';
      }
    } catch {
      /* template rewrite stands */
    }
  }

  return NextResponse.json({ ...base, rewriteSource: source, source });
}
