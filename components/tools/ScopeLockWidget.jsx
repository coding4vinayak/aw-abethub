'use client';
import { useState } from 'react';

const PREVIEW_ROWS = 5;
const MAX_LINES = 25;

const STOP = new Set(('the a an and or of to in on for with your our we you is are be will can that this it its from at as by if then also just have has not but more some any all').split(' '));

const DRIVERS = [
  { name: 'design / rebuild', h: 8, re: /\b(redesign|rebuild|revamp|new (?:website|site|landing ?page|ui|design|logo))\b/i },
  { name: 'migration', h: 10, re: /\b(migrat\w*|port to|move (?:it|everything) to)\b/i },
  { name: 'integration', h: 6, re: /\b(integrat\w*|api|webhook|sync|connect (?:to|our|the))\b/i },
  { name: 'reporting build', h: 7, re: /\b(dashboard|report\w*|analytics|chart\w*|metrics?)\b/i },
  { name: 'enablement / docs', h: 4, re: /\b(train\w*|handover|handoff|workshop|document\w*|docs?|tutorial\w*)\b/i },
  { name: 'localisation', h: 5, re: /\b(translat\w*|locali[sz]\w*|multilingual|hindi|language)\b/i },
  { name: 'SEO work', h: 6, re: /\b(seo|keyword\w*|meta ?tags?|backlink\w*|google (?:listing|search))\b/i },
  { name: 'content production', h: 5, re: /\b(content|copywrit\w*|blog|article\w*|photo\w*|video|banner\w*)\b/i },
  { name: 'testing / audit', h: 4, re: /\b(test\w*|qa|audit|security|penetration|accessib\w*)\b/i },
  { name: 'infrastructure', h: 3, re: /\b(hosting|deploy\w*|server|domain|ssl|cdn)\b/i },
];

const SCOPE_CUES = /\b(new (?:feature|page|section|module)|additional|extra|one more|while you.?re at it|also (?:add|build|can you)|since you.?re there)\b/i;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toks(s) {
  return norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
}

function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

function matchOne(request, lines) {
  const rq = toks(request);
  if (!rq.length) return { index: -1, confidence: 0, matched: '', detail: 'no matchable words' };

  let best = { index: -1, confidence: -1 };
  lines.forEach((line, index) => {
    const lw = toks(line);
    if (!lw.length) return;
    const set = new Set(lw);
    const inter = rq.filter((w) => set.has(w)).length;
    const containment = inter / rq.length;
    const jaccard = inter / new Set([...rq, ...lw]).size;
    const fuzzy = rq.reduce((acc, w) => acc + Math.max(...lw.map((v) => sim(w, v))), 0) / rq.length;
    let conf = (0.55 * containment + 0.2 * jaccard + 0.25 * fuzzy) * 100;
    if (SCOPE_CUES.test(request)) conf -= 10;
    conf = Math.max(0, Math.min(100, Math.round(conf)));
    if (conf > best.confidence) best = { index, confidence: conf };
  });

  if (best.confidence <= 8) return { index: -1, confidence: Math.max(0, best.confidence), matched: '', rq };
  return { ...best, matched: lines[best.index], rq };
}

function classify(m) {
  if (m.index < 0) return 'EXTRA';
  if (m.confidence >= 60) return 'IN-SCOPE';
  if (m.confidence >= 35) return 'AMBIGUOUS';
  return 'EXTRA';
}

function estimate(request) {
  const hits = DRIVERS.filter((d) => d.re.test(request));
  let hours = 3 + hits.reduce((acc, d) => acc + d.h, 0);
  const drivers = hits.map((d) => `${d.name} +${d.h}h`);
  if (/\b(all|every|each|multiple|\d{2,})\b/i.test(request)) { hours *= 1.5; drivers.push('volume ×1.5'); }
  if (/\b(urgent|asap|rush|eod|by tomorrow|today)\b/i.test(request)) { hours *= 1.25; drivers.push('rush ×1.25'); }
  if (!hits.length) drivers.push('baseline scoping +3h');
  return { hours: Math.max(2, Math.min(60, Math.round(hours * 2) / 2)), drivers };
}

// Agency change-order practice: complexity → hours band → size label, so the
// client email can say “small / medium / large” alongside the price.
function severityOf(hours) {
  if (hours < 5) return 'small';
  if (hours < 14) return 'medium';
  return 'large';
}

function titleOf(request) {
  const t = request.replace(/\s+/g, ' ').trim().replace(/^(can you|please|we.?d like to|could you|also)\s+/i, '');
  const cut = t.length > 58 ? `${t.slice(0, 58).replace(/[^A-Za-z0-9]+$/, '')}…` : t;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

const CLS_CLASS = { 'IN-SCOPE': 'pass', AMBIGUOUS: 'warn', EXTRA: 'fail' };
const SEV_CHIP = { small: 'var(--free)', medium: '#b45309', large: 'var(--error)' };

export default function ScopeLockWidget() {
  const [sow, setSow] = useState('Homepage design and build\nFour core page templates\nProduct catalogue import\nOn-page SEO pass\nTwo weeks of post-launch bug support');
  const [req, setReq] = useState('Can you also add a blog section with five articles\nFix the checkout bug on the product page\nMigrate the whole catalogue to Shopify and translate it to Hindi\nMonthly reporting dashboard for ad spend\nUpdate the footer copyright year');
  const [rate, setRate] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(-1);
  const [emailOpen, setEmailOpen] = useState(false);

  function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setCopied(-1); setEmailOpen(false);
    const lines = sow.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60);
    const requests = req.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_LINES);
    if (lines.length < 2) { setErr('List the signed SOW with at least two deliverable lines, one per line.'); return; }
    if (!requests.length) { setErr('Add the client’s new requests, one per line.'); return; }

    const rows = requests.map((r) => {
      const m = matchOne(r, lines);
      const cls = classify(m);
      const est = cls !== 'IN-SCOPE' ? estimate(r) : null;
      return { request: r, ...m, cls, est, severity: est ? severityOf(est.hours) : null };
    });

    setRes({
      rows,
      sowLines: lines.length,
      counts: {
        'IN-SCOPE': rows.filter((r) => r.cls === 'IN-SCOPE').length,
        AMBIGUOUS: rows.filter((r) => r.cls === 'AMBIGUOUS').length,
        EXTRA: rows.filter((r) => r.cls === 'EXTRA').length,
      },
      truncated: req.split('\n').map((l) => l.trim()).filter(Boolean).length > MAX_LINES,
    });
  }

  const rateNum = Number(rate);
  const hasRate = rate.trim() !== '' && Number.isFinite(rateNum) && rateNum > 0;
  const feeOf = (hours) => hours * rateNum;
  const fmtFee = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  function changeOrder(r, i) {
    const days = Math.max(1, Math.ceil(r.est.hours / 6));
    const fee = hasRate
      ? `Fee: ${r.est.hours} h × ${rateNum}/h = ${fmtFee(feeOf(r.est.hours))}`
      : `Fee: ${r.est.hours} h × [your hourly rate] — set the rate before sending`;
    return [
      `Change order CO-${i + 1} — ${titleOf(r.request)}`,
      `Size: ${r.severity} (${r.est.hours} h)`,
      `Client request (verbatim): “${r.request}”`,
      `Assessment: not covered by the signed SOW. Closest signed line was “${r.matched || 'none found'}” at ${r.confidence}% match.`,
      `Estimated effort: ${r.est.hours} h  (drivers: ${r.est.drivers.join(', ')})`,
      fee,
      `Timeline impact: +${days} working day${days === 1 ? '' : 's'} on the current plan.`,
      `Starts only on written approval. Signed deliverables and existing dates are unaffected by this change order.`,
    ].join('\n');
  }

  // One-click client email: the whole polite ask with every extra itemised
  // and priced — the classic agency change-order cover letter.
  function emailDraft(extras) {
    const totalHours = extras.reduce((a, r) => a + r.est.hours, 0);
    const totalDays = extras.reduce((a, r) => a + Math.max(1, Math.ceil(r.est.hours / 6)), 0);
    const money = hasRate ? `, costing ${fmtFee(feeOf(totalHours))} in total (${rateNum}/h)` : '';
    const items = extras.map((r, i) =>
      `${i + 1}. ${titleOf(r.request)} — ${r.severity}, about ${r.est.hours} h${hasRate ? ` (${fmtFee(feeOf(r.est.hours))})` : ''}${r.cls === 'AMBIGUOUS' ? ' [closest signed line is a partial match — confirm before billing]' : ''}`).join('\n');
    return [
      `Subject: Change order for approval — ${extras.length} request${extras.length === 1 ? '' : 's'} outside the signed SOW`,
      '',
      'Hi [Client name],',
      '',
      `Thank you for the notes on the project — I checked every request line by line against the signed SOW. Most of them are already covered by what we committed to; ${extras.length} ${extras.length === 1 ? 'item sits' : 'items sit'} a little further out, and I would rather flag that honestly than absorb it quietly at the expense of the signed work.`,
      '',
      'What we found outside the signed scope:',
      items,
      '',
      `Combined, that is roughly ${totalHours} hours${money} and about ${totalDays} additional working day${totalDays === 1 ? '' : 's'} on the plan.`,
      '',
      'Two options, your call:',
      '1. Approve these as a change order and we slot them in after the signed deliverables, keeping every existing date intact.',
      '2. Defer them — the current scope stays exactly as written, and we can quote them properly whenever they move up your list.',
      '',
      'A one-line reply of “approved” or “defer” is all I need, and nothing starts until that lands in writing. Happy to walk through the estimate on a ten-minute call if any number looks off.',
      '',
      'Thanks,',
      '[Your name]',
      '[Your agency] · change orders reference ' + new Date().toISOString().slice(0, 10),
    ].join('\n');
  }

  async function copy(text, i) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(-1), 2000);
    } catch { setErr('Your browser blocked clipboard access — select the text and copy manually.'); }
  }

  const shown = res ? res.rows.slice(0, PREVIEW_ROWS) : [];
  const extras = shown.filter((r) => r.cls !== 'IN-SCOPE');

  return (
    <>
      <form onSubmit={run}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label htmlFor="sow" style={{ marginTop: 0 }}>Signed SOW — one deliverable per line</label>
            <textarea id="sow" rows={7} maxLength={4000} value={sow} onChange={(e) => setSow(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <label htmlFor="req" style={{ marginTop: 0 }}>Client’s new requests — one per line</label>
            <textarea id="req" rows={7} maxLength={4000} value={req} onChange={(e) => setReq(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 6 }}>
          <div style={{ flex: '0 1 180px' }}>
            <label htmlFor="rate" style={{ marginTop: 0 }}>Your hourly rate (optional)</label>
            <input id="rate" type="number" min="1" placeholder="e.g. 4500" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <button className="btn">Check for scope creep</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>
            {res.counts.EXTRA} extra, {res.counts.AMBIGUOUS} ambiguous, {res.counts['IN-SCOPE']} in scope
            <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> · {res.rows.length} requests vs {res.sowLines} signed deliverables</span>
          </h3>

          <table>
            <thead><tr><th>Client request</th><th>Verdict</th><th>Closest signed deliverable</th><th>Match</th></tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <td>{r.request}</td>
                  <td className={CLS_CLASS[r.cls]}>{r.cls}</td>
                  <td style={{ color: 'var(--ink-3)' }}>{r.matched ? `“${r.matched}”` : '— nothing similar in the SOW'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.confidence}%
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--line)', marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${r.confidence}%`, height: '100%', background: r.cls === 'IN-SCOPE' ? 'var(--free)' : r.cls === 'AMBIGUOUS' ? '#b45309' : 'var(--error)' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
            {res.rows.length > shown.length
              ? `${res.rows.length - shown.length} further request(s) classified and hidden in this preview.`
              : `All ${res.rows.length} request(s) shown.`}
            {res.truncated ? ` Input capped at ${MAX_LINES} requests.` : ''}
          </p>

          {extras.length > 0 && (
            <>
              <h4 style={{ margin: '18px 0 6px', fontSize: 14 }}>Change-order drafts</h4>
              {extras.map((r, i) => {
                const text = changeOrder(r, i);
                const idx = shown.indexOf(r);
                return (
                  <div key={idx} style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>
                        {r.cls === 'AMBIGUOUS' ? 'Clarify first, then bill if confirmed' : 'Billable extra'}
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
                          padding: '2px 8px', borderRadius: 999, background: 'var(--card)', border: `1px solid ${SEV_CHIP[r.severity]}`, color: SEV_CHIP[r.severity],
                        }}>{r.severity} · {r.est.hours} h{hasRate ? ` · ${fmtFee(feeOf(r.est.hours))}` : ''}</span>
                      </strong>
                      <button className="btn secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => copy(text, idx)}>
                        {copied === idx ? 'Copied ✓' : 'Copy draft'}
                      </button>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0' }}>{text}</p>
                  </div>
                );
              })}
              {!hasRate && <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>Enter your hourly rate above to price the drafts; until then the fee stays “[your hourly rate]”.</p>}

              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn secondary" onClick={() => setEmailOpen((v) => !v)}>
                  {emailOpen ? 'Hide client email' : 'Email to client (full draft)'}
                </button>
                {emailOpen && (
                  <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>Ready to paste into your mail client</strong>
                      <button className="btn secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => copy(emailDraft(extras), 999)}>
                        {copied === 999 ? 'Copied ✓' : 'Copy email'}
                      </button>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0' }}>{emailDraft(extras)}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {extras.length === 0 && res.counts.EXTRA === 0 && (
            <p className="pass" style={{ marginTop: 12 }}>Nothing in this batch falls outside the signed scope. Keep the same list next time it lands.</p>
          )}

          <p className="cap-note">
            Preview matches {shown.length} of {res.rows.length} requests against your SOW and drafts change orders you have to
            paste yourself. ScopeLock paid matches the full thread, auto-drafts the change order in your template and sends the
            client an approve-or-decline link with an audit trail — from $9/mo.
          </p>
        </div>
      )}
    </>
  );
}
