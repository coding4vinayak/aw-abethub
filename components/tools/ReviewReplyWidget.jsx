'use client';
import { useState } from 'react';

const NEG = new Set(['bad', 'terrible', 'awful', 'horrible', 'worst', 'disappointed', 'disappointing', 'disappointment', 'rude', 'slow', 'late', 'broken', 'defective', 'poor', 'dirty', 'expensive', 'overpriced', 'refund', 'scam', 'waste', 'never', 'failed', 'fail', 'ignoring', 'ignored', 'unresponsive', 'misleading', 'overcharged', 'damaged', 'buggy', 'crash', 'crashed', 'unprofessional', 'angry', 'frustrated', 'frustrating', 'annoying', 'useless', 'waiting', 'waited', 'delay', 'delayed', 'refused', 'charged', 'stale', 'spoiled', 'leaking', 'stuck', 'mouldy', 'wrong']);
const POS = new Set(['love', 'loved', 'great', 'excellent', 'amazing', 'fantastic', 'wonderful', 'helpful', 'fast', 'quick', 'prompt', 'friendly', 'professional', 'recommend', 'recommended', 'superb', 'perfect', 'outstanding', 'pleased', 'happy', 'smooth', 'patient', 'appreciate', 'appreciated', 'best', 'quality', 'value', 'easy', 'responsive', 'clean', 'delicious', 'reliable', 'impressive', 'exceeded', 'fair', 'kind', 'generous', 'brilliant', 'nice']);
const NEGATION = new Set(['not', 'no', 'never', "n't", 'neither', 'without', "don't", "didn't", "wasn't", "isn't"]);

const ISSUES = [
  { key: 'delivery timing', re: /\b(late|delay(?:ed|s)?|took (?:too long|ages|weeks)|wait(?:ed|ing)|overdue|behind schedule)\b/i,
    ack: 'About the timing: that wait is on us, not on you. I have flagged your case to the operations lead so we can find exactly where the time went and stop it repeating.' },
  { key: 'staff conduct', re: /\b(rude|dismissive|disrespect\w*|unprofessional|attitude|curt|shouted|snapped|condescending)\b/i,
    ack: 'About how you were treated: that behaviour does not match how BIZ trains or supervises its team, and I am taking it up directly with the person and the shift lead.' },
  { key: 'product failure', re: /\b(broken|defective|damaged|stopped working|doesn.?t work|won.?t work|fell apart|faulty|malfunction\w*|leaking|came apart|cracked)\b/i,
    ack: 'About the item itself: you should not be left holding something that failed. Send us the order number and we will arrange a replacement or a repair, your choice.' },
  { key: 'billing / refund', re: /\b(refund|charged (?:me )?(?:twice|again|extra|for)|overcharg\w*|billing|double[- ]charg\w*|hidden (?:fee|charge)|money back|invoice)\b/i,
    ack: 'About the billing: I understand why that alarmed you. Our accounts team will re-audit the charge and confirm the refund position to you in writing within two business days.' },
  { key: 'support responsiveness', re: /\b(no (?:response|reply|answer)|never (?:replied|responded|answered)|unanswered|ignora?n?ce|ignored|unresponsive|couldn.?t reach|no one (?:called|responded))\b/i,
    ack: 'About the silence from our side: an unanswered message is a support failure and we are logging it as one. I am making sure you get a reply today rather than a process.' },
  { key: 'shipping / handling', re: /\b(shipping|courier|parcel|package|dispatch|delivery (?:guy|person|service))\b/i,
    ack: 'About the shipment: we are pulling the courier record to see how it was handled, and we will change packer or carrier if the fault sits with us.' },
  { key: 'value for money', re: /\b(overpriced|too expensive|not worth|poor value|costly|rip[- ]?off|charged a lot)\b/i,
    ack: 'About the price-to-value gap: we would rather earn the value than argue about the price — here is what we are changing so the next visit is plainly worth it.' },
  { key: 'cleanliness / hygiene', re: /\b(dirty|hygiene|hair in|smell|stale|spoiled|undercook\w*|foreign object|unhygienic)\b/i,
    ack: 'About cleanliness: that is non-negotiable at BIZ. It has gone to the duty manager with an immediate deep-clean and a recheck before service.' },
  { key: 'app / site reliability', re: /\b(crash\w*|bugg\w*|glitch\w*|error|404|won.?t load|slow to load|login (?:issue|problem)|data (?:lost|loss))\b/i,
    ack: 'About the technical failure: engineering has the reproduction steps and is treating it as a live incident — you will hear from us the moment the fix ships.' },
  { key: 'cancellation flow', re: /\b(cancel\w*|subscription|auto[- ]?renew\w*|unsubscribe|couldn.?t cancel)\b/i,
    ack: 'About the cancellation flow: leaving should never be harder than joining. We are fixing that step and will confirm to you as soon as yours is processed.' },
  { key: 'listing accuracy', re: /\b(misleading|not as described|different from (?:the (?:photo|picture|description))|wrong item|bait[- ]and[- ]switch|advertised)\b/i,
    ack: 'About the listing being inaccurate: we have corrected the description and photos so nobody else is surprised the way you were.' },
];

const PRAISE = [
  { key: 'the team', re: /\b(staff|team|service|support|host|manager|waiter|agent|crew)\b/i },
  { key: 'the speed', re: /\b(fast|quick|prompt|same[- ]day|instant|early)\b/i },
  { key: 'the quality', re: /\b(quality|product|food|room|finish|result|taste|craftsmanship|workmanship)\b/i },
  { key: 'the value', re: /\b(price|value|affordable|worth|deal|fair)\b/i },
];

const PLATFORM_POLICY = {
  google: {
    line: (b, compact) => (compact
      ? `Message BIZ directly and we will follow up with you — not with your review.`.replace(/BIZ/g, b)
      : `If you would like us to take this further, message BIZ directly and we will follow up with you — not with your review.`.replace(/BIZ/g, b)),
    note: 'Google Business policy applied: no incentive offered, no request to change or remove the rating, issue handled off-platform.',
  },
  g2: {
    line: (b, compact) => (compact
      ? 'As the vendor we keep replies factual and will not ask you to edit your review.'
      : 'As the vendor we keep this reply factual: happy to discuss specifics privately, and we will not ask you to edit your review.'),
    note: 'G2 guidance applied: professional vendor tone, no personal data about the reviewer, relationship disclosed as a vendor reply.',
  },
  appstore: {
    line: (b, compact) => (compact
      ? 'Reach us from the in-app Help tab and we will pick it up there.'
      : 'Our support team is one message away inside the app under Help — send your username and we will pick this up there.'),
    note: 'App-store guidance applied: short developer reply, no external links or contact solicitation, no rating-change ask (Apple caps developer replies at 600 characters).',
  },
};

const OPENERS = {
  5: 'Thank you so much for the detail in this review — notes like yours are the reason the team keeps pushing.',
  4: 'Thanks for taking the time to write this, and for being specific about what worked.',
  3: 'Thank you for the honest middle score — it tells us part of the job landed and part did not.',
  2: 'Thank you for telling us exactly what went wrong. This is not the experience we set out to deliver.',
  1: 'We are sorry your experience fell this short, and thank you for being concrete — it is the only way we can fix it.',
};

const OPENERS_SHORT = {
  5: 'Thank you — this made our day.',
  4: 'Thanks for the specifics.',
  3: 'Thanks for the honest middle score.',
  2: 'Sorry we missed this for you, and thanks for the detail.',
  1: 'We are sorry this failed you, and thank you for the specifics.',
};

// Legal-threat vocabulary that should move the conversation offline
// (Birdeye/Reply.io escalation-rule style): named professionals, courts,
// regulators or an explicit refund demand.
const ESCALATE_RE = /\b(lawyer|lawyers|attorney|legal\s+(?:action|notice|claim|advice|proceedings)|sue|suing|file\s+a\s+(?:case|complaint|suit)|court|consumer\s+(?:court|forum|commission)|district\s+forum|police|FIR|fraud|regulator\w*|ombudsman|demand(?:ing)?\s+(?:a\s+)?refund|refund\s+demand|expect(?:ing)?\s+(?:a\s+|my\s+)?(?:full\s+)?refund|money\s+back\s+now)\b/i;

function detectEscalation(text) {
  const m = text.match(ESCALATE_RE);
  return m ? { trigger: m[0] } : null;
}

// Auto-detect the star rating from review text: "★★★★☆", "4/5", "5 stars",
// "four stars". Returns 1..5 or null.
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5 };
function detectRating(text) {
  const solid = text.match(/★+/g);
  if (solid) {
    const maxRun = Math.max(...solid.map((s) => s.length));
    if (maxRun >= 1 && maxRun <= 5) return maxRun;
  }
  const starsWord = text.match(/\b([1-5])(?:[.,]\d)?\s*(?:star|stars|★)/i);
  if (starsWord) return Number(starsWord[1]);
  const outOf = text.match(/\b([1-5])(?:[.,]\d)?\s*\/\s*5\b/);
  if (outOf) return Number(outOf[1]);
  const word = text.match(/\b(one|two|three|four|five)\s*stars?\b/i);
  if (word) return WORD_NUM[word[1].toLowerCase()];
  return null;
}

function analyse(text) {
  const words = text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  let pos = 0, neg = 0;
  words.forEach((w, i) => {
    const flip = i > 0 && NEGATION.has(words[i - 1]);
    if (POS.has(w)) { if (flip) { neg++; } else pos++; }
    else if (NEG.has(w)) { if (flip) pos++; else neg++; }
  });
  const total = pos + neg;
  const score = total ? (pos - neg) / total : 0;
  return { pos, neg, score, words: words.length };
}

function buildReply({ review, rating, biz, platform, owner, fallbackRating }) {
  const senti = analyse(review);
  const issues = ISSUES.filter((f) => f.re.test(review));
  const praises = PRAISE.filter((f) => f.re.test(review));
  const policy = PLATFORM_POLICY[platform];
  const compact = platform === 'appstore';
  const firstSentence = (s) => s.split(/(?<=\.)\s+/)[0];
  const fill = (s) => s.replace(/BIZ/g, biz);

  const detected = detectRating(review);
  const usedRating = detected || fallbackRating;

  const lines = [fill(compact ? OPENERS_SHORT[usedRating] : OPENERS[usedRating])];

  if (usedRating >= 4) {
    if (compact) {
      if (praises.length) lines.push(`Glad ${praises.map((p) => p.key).join(', ')} landed well for you.`);
      if (senti.score < 0.2 && issues.length) lines.push(`At the same time, ${issues.map((i) => i.key).join(' and ')} did not. ${firstSentence(fill(issues[0].ack))}`);
      lines.push('We would love to welcome you back.');
    } else {
      if (praises.length) lines.push(`Glad ${praises.map((p) => p.key).join(', ')} landed well for you — that is the part of ${biz} we protect hardest.`);
      if (senti.score < 0.2 && issues.length) lines.push(`At the same time, ${issues.map((i) => i.key).join(' and ')} clearly did not. ${fill(issues[0].ack)}`);
      lines.push('We would love to welcome you back — next time, mention this review and ask for the duty manager so we can make sure it holds up.');
    }
  } else {
    if (issues.length === 0) {
      lines.push(compact
        ? 'Nothing here matched a known failure on our side, so we need the specifics — reply through the in-app Help tab and we will investigate from your account record.'
        : 'Nothing in this review matched a known failure category on our side, which makes it more important, not less: tell us the specifics at [contact] and we will investigate from your account record.');
    } else if (compact) {
      issues.slice(0, 2).forEach((i) => lines.push(firstSentence(fill(i.ack))));
    } else {
      lines.push(`Reading your review, ${issues.length} thing${issues.length === 1 ? '' : 's'} stand${issues.length === 1 ? 's' : ''} out to us: ${issues.map((i) => i.key).join(', ')}.`);
      issues.slice(0, 3).forEach((i) => lines.push(fill(i.ack)));
    }
    lines.push(compact
      ? 'Send your account reference via the in-app Help tab and I will carry this to resolution.'
      : 'Please reply at [contact] with your order or account reference and I will personally carry this to resolution — you should not have to chase us twice.');
  }

  // Escalation trigger: legal-threat words move everything off-platform with
  // a named-owner phone/email capture line.
  const esc = detectEscalation(review);
  if (esc) {
    lines.push(`Because your review mentions “${esc.trigger}”, I am treating this as an escalation: please reach me directly on [your phone] or [your email] and quote this review — I will own it personally from the first call, in writing, and we will settle it offline rather than through comments.`);
  }

  lines.push(fill(policy.line(biz, compact)));
  lines.push(`— ${owner || '[Your name]'}, ${biz}`);

  let tone;
  if (usedRating >= 5) tone = 'Enthusiastic · reinforcing';
  else if (usedRating === 4) tone = 'Warm · appreciative';
  else if (usedRating === 3) tone = 'Balanced · improvement-led';
  else if (issues.some((i) => i.key === 'staff conduct' || i.key === 'billing / refund')) tone = 'Apologetic · accountability-led';
  else tone = 'Service-recovery · action-led';

  const sentiment = senti.score >= 0.34 ? 'positive' : senti.score <= -0.34 ? 'negative' : 'mixed';

  return {
    reply: lines.join('\n\n'),
    tone,
    sentiment,
    senti,
    ratingUsed: usedRating,
    ratingDetected: detected,
    issues: issues.map((i) => i.key),
    praises: praises.map((p) => p.key),
    escalation: esc,
    policyNote: policy.note,
    platform,
    excerpt: review.length > 90 ? `${review.slice(0, 90).trim()}…` : review,
  };
}

export default function ReviewReplyWidget() {
  const [review, setReview] = useState('');
  const [rating, setRating] = useState('2');
  const [biz, setBiz] = useState('');
  const [owner, setOwner] = useState('');
  const [platform, setPlatform] = useState('google');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(-1);

  function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setCopied(-1);
    const b = biz.trim().slice(0, 50);
    if (!b) { setErr('Enter your business name — it goes into the reply.'); return; }
    // Multi-review mode: separate reviews with a blank line, get one reply each.
    const chunks = review.split(/\n\s*\n/).map((t) => t.trim()).filter((t) => t.length >= 20);
    if (!chunks.length) { setErr('Paste at least one review of 20+ characters. Separate several reviews with a blank line to get one reply each.'); return; }
    const items = chunks.slice(0, 10).map((chunk) =>
      buildReply({ review: chunk, biz: b, platform, owner: owner.trim().slice(0, 40), fallbackRating: Number(rating) }));
    setRes({ items, skipped: chunks.length - items.length, selRating: Number(rating) });
  }

  async function copy(text, i) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(-1), 2000);
    } catch { setErr('Your browser blocked clipboard access — select the text and copy manually.'); }
  }

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="review">The review as written — or several, separated by a blank line</label>
        <textarea id="review" rows={7} maxLength={8000} value={review}
          placeholder={'e.g. Waited 40 minutes for a cold dish, the waiter was rude about it, and I was still charged for the extras.\n\nSecond review pasted after a blank line gets its own reply…'}
          onChange={(e) => setReview(e.target.value)} />

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="rating" style={{ marginTop: 0 }}>Default star rating</label>
            <select id="rating" value={rating} onChange={(e) => setRating(e.target.value)}>
              {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} star{s === 1 ? '' : 's'}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="platform" style={{ marginTop: 0 }}>Platform</label>
            <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="google">Google Business</option>
              <option value="g2">G2</option>
              <option value="appstore">App store</option>
            </select>
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <label htmlFor="biz" style={{ marginTop: 0 }}>Your business name</label>
            <input id="biz" type="text" placeholder="e.g. Kettle &amp; Co." value={biz} onChange={(e) => setBiz(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <label htmlFor="owner" style={{ marginTop: 0 }}>Owner name (signature)</label>
            <input id="owner" type="text" placeholder="e.g. Priya, owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn">Draft the reply</button>
          <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            Ratings found in the text (★★★★ or “5 stars”) override the default per review.
          </span>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          {res.items.length > 1 && (
            <h3>
              {res.items.length} replies drafted
              <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> · one reply per review{res.skipped ? `, ${res.skipped} skipped/over the 10-review preview limit` : ''}</span>
            </h3>
          )}

          {res.items.map((r, idx) => {
            const tooLong = r.platform === 'appstore' && r.reply.length > 600;
            return (
              <div key={idx} style={{ marginTop: idx === 0 && res.items.length === 1 ? 0 : 18, borderTop: idx === 0 ? 'none' : '1px solid var(--line)', paddingTop: idx === 0 ? 0 : 16 }}>
                {res.items.length > 1 && (
                  <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 8px', fontStyle: 'italic' }}>Review {idx + 1}: “{r.excerpt}”</p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999 }}>
                    {r.tone}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    Rating used: <strong>{r.ratingDetected ? `${'★'.repeat(r.ratingUsed)} (auto-detected from text)` : `${r.ratingUsed} (your default)`}</strong>
                  </span>
                  {r.escalation && (
                    <span className="warn" style={{ fontSize: 12, fontWeight: 700 }}>
                      ⚠ Escalated offline — legal wording detected (“{r.escalation.trigger}”)
                    </span>
                  )}
                </div>

                <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 6px' }}>
                  Sentiment: <strong className={r.sentiment === 'positive' ? 'pass' : r.sentiment === 'negative' ? 'fail' : 'warn'}>{r.sentiment}</strong>
                  {' '}({r.senti.pos} positive / {r.senti.neg} negative signals in {r.senti.words} words) · issues: {r.issues.length ? r.issues.join(' · ') : 'none matched'} · praise: {r.praises.length ? r.praises.join(' · ') : '—'}
                </p>

                <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, margin: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                  {r.reply}
                </p>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <button className="btn secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => copy(r.reply, idx)}>
                    {copied === idx ? 'Copied ✓' : 'Copy reply'}
                  </button>
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{r.reply.length} characters</span>
                </div>

                {tooLong && (
                  <p className="error-note">Over the 600-character Apple reply limit — trim the middle acknowledgement before posting.</p>
                )}

                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>{r.policyNote}</p>
              </div>
            );
          })}

          <p className="cap-note">
            One reply per review in the preview, drafted by hand from your inputs. ReviewReply paid reads your whole inbox —
            Google, G2 and store reviews together — drafts every reply, and posts them back on your accounts with a per-location
            approval queue — from $9/mo.
          </p>
        </div>
      )}
    </>
  );
}
