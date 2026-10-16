'use client';
import { useState } from 'react';

const GRADE_COLORS = { A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', F: '#dc2626' };

export default function EmailHealthWidget() {
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch(`/api/emailhealth?domain=${encodeURIComponent(domain.trim())}`);
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Something went wrong.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const statusClass = (s) => (s === 'pass' ? 'pass' : s === 'warn' ? 'warn' : 'fail');
  const statusLabel = (s) => (s === 'pass' ? 'PASS' : s === 'warn' ? 'CHECK' : 'FAIL');

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="domain">Your domain</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input id="domain" type="text" placeholder="example.com" value={domain}
            onChange={(e) => setDomain(e.target.value)} style={{ flex: '1 1 240px' }} />
          <button className="btn" disabled={busy || !domain.trim()}>{busy ? 'Checking…' : 'Check now'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 40, fontWeight: 800, lineHeight: 1, padding: '8px 16px', borderRadius: 10,
              color: '#fff', background: GRADE_COLORS[res.grade] || '#475569',
            }}>{res.grade}</span>
            <div>
              <p style={{ margin: 0 }}>
                <span className="score-big">{res.score}</span>
                <span style={{ color: 'var(--ink-3)' }}> / 100 mail health — {res.domain}</span>
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
                SPF lookups: {res.meta?.spfLookupCount ?? 'n/a'}/10 · DKIM selectors live: {res.meta?.dkimSelectorsFound?.length ?? 0}
                {res.meta?.nullMx ? ' · null-MX (send-only) declared' : ''}
              </p>
            </div>
          </div>

          <table>
            <thead><tr><th>Check</th><th>Status</th><th>What we found</th><th>What a pro would do</th></tr></thead>
            <tbody>
              {res.checks.map((c) => (
                <tr key={c.key}>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</td>
                  <td className={statusClass(c.status)}>{statusLabel(c.status)}</td>
                  <td style={{ wordBreak: 'break-word' }}>{c.detail}</td>
                  <td style={{ color: 'var(--ink-3)' }}>{c.guidance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-note">This is the full free check — 12 weighted deliverability probes, unlimited, forever. The planned EmailAudit adds blacklist status, bounce analysis and a warmup plan.</p>
        </div>
      )}
    </>
  );
}
