'use client';
import { useState } from 'react';

// Grading engine moved to /api/supportqa (server). The widget now renders
// Zendesk-QA-style grade cards: overall score, sub-scores with pass/fail
// thresholds, a customer-effort proxy, missed-opportunity alerts and SLA status.

const chipStyle = (s) => ({
  display: 'inline-block', margin: '2px 4px 2px 0', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600,
  background: s.ok ? 'var(--free-soft)' : s.mid ? 'var(--accent-soft)' : '#fef2f2',
  color: s.ok ? 'var(--free)' : s.mid ? 'var(--accent)' : 'var(--error)',
});

const fmtDur = (s) => (s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${(s / 3600).toFixed(1).replace(/\.0$/, '')}h` : `${(s / 86400).toFixed(1).replace(/\.0$/, '')}d`);

const gradeColor = (g) => (g === 'A' || g === 'B' ? 'var(--free)' : g === 'C' ? '#b45309' : 'var(--error)');

export default function SupportQAWidget() {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setBusy(true);
    try {
      const r = await fetch('/api/supportqa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Something went wrong.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="sq-text">Ticket conversations (Agent:/Customer: lines; blank line between tickets; optional “First response: 2 hours” and “SLA: 4h” lines)</label>
        <textarea id="sq-text" placeholder={'Customer: My invoice shows the wrong tax. This is the second time!\nAgent: I’m sorry about the inconvenience. I’ve issued a refund per our policy, it will arrive in 3–5 days.\nCustomer: Perfect, that worked. Thanks!\nFirst response: 2 hours\nSLA: 4h'} value={text}
          onChange={(e) => setText(e.target.value)} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !text.trim()}>{busy ? 'Scoring scorecards…' : 'Grade tickets'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result" style={{ marginTop: 16 }}>
          <h3>Scorecards{res.total > 3 ? ` — grading 3 of ${res.total} tickets` : ''} <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 13 }}>· batch avg {res.avg}/100 · {res.missedOps} missed opp{res.missedOps === 1 ? 'y' : 'ies'} · {res.slaBreaches} SLA breach{res.slaBreaches === 1 ? '' : 'es'} · {res.highEffort} high-effort</span></h3>

          {res.graded.map((g, i) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', marginTop: 12, background: 'var(--card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Ticket {i + 1}: {g.preview}…</span>
                <span style={{ fontWeight: 800, fontSize: 20, color: gradeColor(g.grade) }}>
                  {g.grade} · {g.overall}/100
                </span>
              </div>

              {g.subs.map((s) => (
                <div key={s.key} style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>{s.key} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>≥{s.threshold} to pass</span></span>
                    <span className={s.score >= s.threshold ? 'pass' : 'fail'}>{s.score}/100 {s.score >= s.threshold ? 'PASS' : 'FAIL'}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', margin: '3px 0', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${s.score}%`, height: '100%', background: s.score >= s.threshold ? 'var(--free)' : 'var(--error)' }} />
                    <div style={{ position: 'absolute', left: `${s.threshold}%`, top: -2, width: 2, height: 10, background: 'var(--ink)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.detail}</div>
                </div>
              ))}

              {g.missed.length > 0 && (
                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fef2f2', fontSize: 12 }}>
                  <span className="fail">Missed opportunity:</span> customer asked about {g.missed.map((m) => m.kind).join(' / ')} and the reply never addressed it —
                  {g.missed.map((m, j) => <div key={j} style={{ marginTop: 3 }}>“{m.quote}”</div>)}
                </div>
              )}

              {g.effort.repeats.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-2)' }}>
                  <span className="warn">Repeat-question signals:</span> {g.effort.repeats.join(' · ')} — effort proxy {g.effort.score}/100 (ratio {g.effort.ratio}, {g.effort.turns} turns).
                </div>
              )}

              {g.sla && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-2)' }}>
                  SLA: target {fmtDur(g.sla.targetSec)}
                  {g.sla.frtSec != null ? ` · answered in ${fmtDur(g.sla.frtSec)}` : ''}
                  {' — '}{g.sla.detail || (g.sla.score >= 70 ? 'met' : 'at risk')}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                {g.signals.map((s, j) => <span key={j} style={chipStyle(s)}>{s.label}</span>)}
              </div>
            </div>
          ))}

          {res.coach && res.coach.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontWeight: 700, margin: '0 0 6px', fontSize: 13 }}>
                Coach notes{' '}
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>· {res.source === 'ai' ? 'AI QA coach' : 'computed scorecard'}</span>
              </p>
              {res.coach.map((c) => (
                <div key={c.ticket} style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--free-soft)', marginBottom: 6, fontSize: 13 }}>
                  <b>Ticket {c.ticket}:</b> {c.coach}
                  {c.opportunity && c.opportunity.toLowerCase() !== 'none' ? <span style={{ color: 'var(--ink-3)' }}> · Upsell ask: {c.opportunity}</span> : null}
                </div>
              ))}
            </div>
          )}

          <p className="cap-note">Free preview grades 3 tickets. SupportQA paid scores 100% of volume, trends per agent and week, and exports to your helpdesk.</p>
        </div>
      )}
    </>
  );
}
