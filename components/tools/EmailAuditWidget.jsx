'use client';
import { useState } from 'react';

export default function EmailAuditWidget() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/emailaudit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Something went wrong.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const riskCls = res ? (res.spamScore >= 55 ? 'fail' : res.spamScore >= 30 ? 'warn' : 'pass') : '';

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="ea-subj">Subject line</label>
        <input id="ea-subj" type="text" placeholder="URGENT!!! Free offer inside" value={subject} onChange={(e) => setSubject(e.target.value)} />

        <label htmlFor="ea-body">Plain-text body (full headers/HTML welcome — we detect and split them)</label>
        <textarea id="ea-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={'Hi,\n\nAct now — this free limited-time offer is a guarantee!\nClick here: https://example.com/promo\n\nThanks'} />

        <button className="btn" type="submit" disabled={busy || !body.trim()}>{busy ? 'Scanning…' : 'Score this email'}</button>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className={`score-big ${riskCls}`}>{res.spamScore}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 spam risk · est. {res.spamFolderProb}% chance of landing in spam{res.hadHeaders ? ' · headers detected & stripped first' : ''}</span>
          </p>
          <table>
            <thead><tr><th>Signal</th><th>Risk</th><th>Points</th><th>What we found</th></tr></thead>
            <tbody>
              {res.signals.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{s.label}</td>
                  <td className={s.points > s.max * 0.6 ? 'fail' : s.points > 0 ? 'warn' : 'pass'}>{s.points > s.max * 0.6 ? 'HIGH' : s.points > 0 ? 'MED' : 'OK'}</td>
                  <td className={s.points > 0 ? 'warn' : 'pass'} style={{ whiteSpace: 'nowrap' }}>{s.points > 0 ? `−${s.points}` : '0'} / {s.max}</td>
                  <td style={{ color: 'var(--ink-3)' }}>{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Suggested compliant subject</p>
          <div style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--free-soft)', color: 'var(--free)', fontWeight: 700 }}>
            {res.rewritten}
            <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 12 }}> · {res.source === 'ai' ? 'AI rewrite' : 'template rewrite'}</span>
          </div>

          <p className="cap-note">This is the content side. EmailAudit paid adds the domain side — real DNS + blacklist checks (see the free <a href="https://hub.abetworks.in/emailhealth">Email Health check</a>) — plus a sending warmup plan for cold domains.</p>
        </div>
      )}
    </>
  );
}
