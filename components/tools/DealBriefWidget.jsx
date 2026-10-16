'use client';
import { useState } from 'react';

const WORD_CAP = 3000;

export default function DealBriefWidget() {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setBusy(true);
    try {
      const r = await fetch('/api/dealbrief', {
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

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const gaps = res ? res.meddic.filter((m) => !m.present) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="db-text">Sales call transcript (use “Name: line” for each speaker — up to 50,000 chars)</label>
        <textarea id="db-text" value={text} rows={8} maxLength={50000}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Sarah (Prospect): We have a problem with manual reporting.\nAlex (Rep): I will send over a proposal this week.\nSarah: It might be too expensive for our budget right now.'} />
        <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '6px 0' }}>{words} words · {(text || '').length} chars</p>
        <button className="btn" type="submit" disabled={busy || !text.trim()}>{busy ? 'Reading the call…' : 'Build deal brief'}</button>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>Deal brief <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {res.utterances} utterances, {res.stakeholders.length} speakers{res.capped ? `, first ${WORD_CAP} words only` : ''}</span></h3>

          <p style={{ fontWeight: 700, margin: '8px 0 4px' }}>
            Summary{' '}
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>· {res.source === 'ai' ? 'AI brief' : 'computed brief'}</span>{' '}
            <span className={res.stage === 'Negotiation' || res.stage === 'Proposal' ? 'pass' : 'warn'} style={{ marginLeft: 6 }}>→ {res.stage}</span>
          </p>
          <p style={{ margin: '0 0 10px' }}>{res.summary}</p>

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>MEDDIC coverage <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {res.meddic.length - gaps.length}/{res.meddic.length}{gaps.length ? ` — gaps: ${gaps.map((g) => g.label).join(', ')}` : ''}</span></p>
          <table>
            <thead><tr><th>Element</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>
              {res.meddic.map((m) => (
                <tr key={m.key}>
                  <td style={{ fontWeight: 700 }}>{m.label}<br /><span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>{m.desc}</span></td>
                  <td className={m.present ? 'pass' : 'fail'}>{m.present ? 'Covered' : 'Gap'}</td>
                  <td style={{ color: 'var(--ink-3)', wordBreak: 'break-word' }}>{m.evidence || 'not mentioned in the transcript'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Action items ({res.actionItems.length})</p>
          {res.actionItems.length ? (
            <table>
              <thead><tr><th>Owner</th><th>Action</th><th>When</th></tr></thead>
              <tbody>
                {res.actionItems.slice(0, 8).map((n, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{n.owner}</td>
                    <td>{n.text}</td>
                    <td className={n.when ? 'pass' : 'warn'}>{n.when || 'no date — pin one'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ color: 'var(--ink-3)' }}>No explicit action-item language detected.</p>}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Competitor mentions</p>
          {res.competitors.length ? (
            <table>
              <thead><tr><th>Named vendor</th><th>Mentions</th><th>First heard</th></tr></thead>
              <tbody>
                {res.competitors.map((c) => (
                  <tr key={c.name}><td className="warn" style={{ fontWeight: 700 }}>{c.name}</td><td>{c.count}</td><td style={{ color: 'var(--ink-3)' }}>{c.first || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ color: 'var(--ink-3)' }}>No competitor or incumbent tool named in the call.</p>}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>BANT signals</p>
          <table>
            <thead><tr><th>Signal</th><th>Status</th><th>Mentions</th></tr></thead>
            <tbody>
              {[['Budget', res.bant.budget], ['Authority', res.bant.authority], ['Need', res.bant.need], ['Timeline', res.bant.timeline]].map(([label, s]) => (
                <tr key={label}><td style={{ fontWeight: 700 }}>{label}</td><td className={s.present ? 'pass' : 'fail'}>{s.present ? 'Detected' : 'Not found'}</td><td>{s.mentions}</td></tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Stakeholders</p>
          <table>
            <thead><tr><th>Speaker</th><th>Utterances</th></tr></thead>
            <tbody>
              {res.stakeholders.map((s) => (<tr key={s.name}><td style={{ fontWeight: 700 }}>{s.name}</td><td>{s.count}</td></tr>))}
            </tbody>
          </table>

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Top objections</p>
          {res.objections.length ? (
            <table>
              <thead><tr><th>Objection</th><th>Hits</th><th>First raised by</th></tr></thead>
              <tbody>{res.objections.slice(0, 6).map((o) => (<tr key={o.word}><td className="warn" style={{ fontWeight: 700 }}>{o.word}</td><td>{o.count}</td><td>{o.who}</td></tr>))}</tbody>
            </table>
          ) : <p style={{ color: 'var(--ink-3)' }}>No objection keywords found — listen for budget/competitor pushback.</p>}

          <p className="cap-note">Free preview reads up to 3,000 words and shows the top actions. The planned DealBrief removes the word cap and exports CRM-ready fields (stage, close date, owner) straight into your pipeline.</p>
        </div>
      )}
    </>
  );
}
