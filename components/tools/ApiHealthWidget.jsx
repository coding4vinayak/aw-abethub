'use client';
import { useState } from 'react';

export default function ApiHealthWidget() {
  const [text, setText] = useState('');
  const [auth, setAuth] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    const urls = text.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/apihealth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls, authHeader: auth.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Check failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const shown = res ? res.results.slice(0, 3) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="endpoints">Endpoint URLs (one per line, up to 12)</label>
        <textarea id="endpoints" placeholder={'https://api.vendor.com/health\nhttps://hooks.yourapp.com/status'}
          value={text} onChange={(e) => setText(e.target.value)} />
        <label htmlFor="auth" style={{ marginTop: 12 }}>Authorization header (optional — sent as-is to every endpoint)</label>
        <input id="auth" type="text" placeholder="Bearer sk_live_… (leave empty for public endpoints)"
          value={auth} onChange={(e) => setAuth(e.target.value)} />
        <div style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy || !text.trim()}>{busy ? 'Pinging…' : 'Run health check'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.health}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 fleet health — {res.checked} checked, {res.failed} failed, {res.slow} slow, {res.jittery} unstable</span>
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Status classes: {Object.entries(res.classSummary).map(([k, v]) => `${v}×${k}`).filter((t) => !t.startsWith('0×')).join(' · ') || 'none'}
            {res.authApplied ? ' · Authorization header applied' : ''}
          </p>
          <h3 style={{ marginTop: 14 }}>Worst endpoints first (avg of 3 samples, jitter = max−min)</h3>
          <table>
            <thead><tr><th>Endpoint</th><th>Status</th><th>Avg ms</th><th>Jitter ms</th><th>Verdict</th></tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <td style={{ wordBreak: 'break-all', fontWeight: 700 }}>{r.url}</td>
                  <td>{r.status} <span style={{ color: 'var(--ink-3)' }}>({r.statusClass})</span></td>
                  <td>{r.avg != null ? `${r.avg}` : '—'}</td>
                  <td className={r.jitter == null ? '' : r.jitter > 500 ? 'warn' : ''}>{r.jitter != null ? `${r.jitter}` : '—'}</td>
                  <td className={r.ok && r.avg <= 3000 && (r.jitter == null || r.jitter <= 500) ? 'pass' : r.ok ? 'warn' : 'fail'}>
                    {r.ok ? (r.avg > 3000 ? 'SLOW' : (r.jitter || 0) > 500 ? 'UNSTABLE' : 'OK') : 'FAIL'} <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{r.detail}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-note">
            Preview shows the 3 worst of {res.checked} endpoints. The planned API Health monitors every vendor endpoint on a
            schedule with uptime %, error-rate trends and latency alerts before breakage hits your product — planned from $12/mo.
          </p>
        </div>
      )}
    </>
  );
}
