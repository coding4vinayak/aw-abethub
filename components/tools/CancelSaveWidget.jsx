'use client';
import { useState } from 'react';

const REASONS = [
  { value: 'expensive', label: 'Too expensive' },
  { value: 'feature', label: 'Missing feature' },
  { value: 'usage', label: 'Low usage' },
  { value: 'switching', label: 'Switching to competitor' },
];

const COHORTS = [
  { value: 'b2b', label: 'B2B SaaS' },
  { value: 'mobile', label: 'Mobile app subscription' },
  { value: 'ecom', label: 'E-commerce / D2C membership' },
];

export default function CancelSaveWidget() {
  const [reason, setReason] = useState('expensive');
  const [cohort, setCohort] = useState('b2b');
  const [value, setValue] = useState('');
  const [tenure, setTenure] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setErr(''); setRes(null);
    const v = parseFloat(value), t = parseFloat(tenure);
    if (!Number.isFinite(v) || v <= 0) { setErr('Enter the customer’s monthly value in dollars (e.g. 49).'); return; }
    if (!Number.isFinite(t) || t < 0 || t > 120) { setErr('Enter tenure in months (0–120).'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/cancelsave', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, cohort, value: v, tenure: t }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Save-play failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  // Preview cap: all four offer options are computed, top 2 shown.
  const shownOffers = res ? res.options.slice(0, 2) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="reason">Why are they cancelling?</label>
        <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }}>
          {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <label htmlFor="cohort" style={{ marginTop: 12 }}>Product cohort</label>
        <select id="cohort" value={cohort} onChange={(e) => setCohort(e.target.value)} style={{ width: '100%' }}>
          {COHORTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="value">Monthly value ($)</label>
            <input id="value" type="number" min="1" step="1" placeholder="49" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="tenure">Tenure (months)</label>
            <input id="tenure" type="number" min="0" max="120" step="1" placeholder="8" value={tenure} onChange={(e) => setTenure(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy}>{busy ? 'Deciding…' : 'Get save-play'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.recommended.prob}</span>
            <span style={{ color: 'var(--ink-3)' }}> % save probability — recommended offer ({res.cohortLabel}, engine:</span>
            <span style={{ fontWeight: 700 }}> {res.source === 'ai' ? 'AI + economics' : 'decision matrix'}</span>
            <span style={{ color: 'var(--ink-3)' }}>):</span>
          </p>
          <h3 style={{ marginTop: 10 }} className={res.recommended.prob >= 50 ? 'pass' : res.recommended.prob >= 30 ? 'warn' : 'fail'}>{res.recommended.offer}</h3>
          <p style={{ margin: '0 0 12px' }}>{res.recommended.detail}</p>
          {res.aiRationale && <p style={{ margin: '0 0 12px', fontSize: 13 }}><strong>Why this wins:</strong> {res.aiRationale}</p>}

          <div className="card" style={{ background: 'var(--bg)' }}>
            <h3>Offer economics ({res.marginPct}% gross margin · ~{res.retentionMonths}-mo expected lifetime if saved)</h3>
            <table>
              <thead><tr><th>Offer option</th><th>Save prob.</th><th>Concession cost (12 mo)</th><th>Expected saved margin</th><th>Net upside</th></tr></thead>
              <tbody>
                {shownOffers.map((o) => (
                  <tr key={o.key}>
                    <td style={{ fontWeight: 700 }}>{o.offer}</td>
                    <td className={o.prob >= 50 ? 'pass' : o.prob >= 30 ? 'warn' : 'fail'}>{o.prob}%</td>
                    <td>${o.concessionCost}</td>
                    <td>${o.savedMargin}</td>
                    <td className={o.netUpside > 0 ? 'pass' : 'fail'}>${o.netUpside}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
              {res.totalOffers - shownOffers.length} more offer options computed and ranked by net margin upside — hidden in preview.
            </p>
          </div>

          <div className="card" style={{ background: 'var(--bg)', marginTop: 12 }}>
            <h3>Retention script</h3>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{res.script}</p>
          </div>

          <div className="card" style={{ background: 'var(--bg)', marginTop: 12 }}>
            <h3>Exit-survey questions we recommend asking</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {res.surveyQuestions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>

          <p className="cap-note">
            This decision matrix runs one cancellation at a time. CancelSave paid embeds the full flow in your product,
            picks the offer per customer automatically, and A/B tracks which save-play actually moves your save rate — from $19/mo.
          </p>
        </div>
      )}
    </>
  );
}
