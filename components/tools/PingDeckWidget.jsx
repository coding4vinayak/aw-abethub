'use client';
import { useState } from 'react';

export default function PingDeckWidget() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    const urls = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    if (urls.length > 10) { setErr('Max 10 URLs per check — trim the list.'); return; }
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/pingdeck', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Probe failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const shown = res ? res.results.slice(0, 2) : [];
  const hidden = res ? Math.max(0, res.results.length - shown.length) : 0;

  const sslCell = (r) => {
    if (!r.ssl) return '—';
    if (r.ssl.error) return <span className="fail" title={r.ssl.error}>SSL: {r.ssl.error}</span>;
    const d = r.ssl.daysLeft;
    const cls = r.ssl.state === 'pass' ? 'pass' : r.ssl.state === 'warn' ? 'warn' : 'fail';
    return <span className={cls}>{d < 0 ? `EXPIRED ${Math.abs(d)}d ago` : `${d}d left`}<span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> · {r.ssl.issuer || 'cert ok'}</span></span>;
  };

  const domainCell = (r) => {
    const d = r.domain;
    if (!d) return '—';
    if (d.skipped) return <span style={{ color: 'var(--ink-3)' }}>not a domain</span>;
    if (d.error) return <span className="warn" title={d.error}>RDAP: {d.error}</span>;
    const days = d.daysLeft;
    const cls = days < 0 ? 'fail' : days <= 30 ? 'warn' : 'pass';
    return <span className={cls}>{days < 0 ? `EXPIRED ${Math.abs(days)}d ago` : `${days}d to expiry`}<span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> · {d.expiryDate}{d.registrar ? ` · ${d.registrar}` : ''}</span></span>;
  };

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="pd-urls">URLs to monitor (one per line, up to 10)</label>
        <textarea id="pd-urls" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'https://yourapp.com\nhttps://staging.client.io\napi.vendor.com/health'} />
        <div style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy || !text.trim()}>{busy ? 'Probing…' : 'Ping + check SSL'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.health}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 fleet health — {res.up}/{res.checked} up, {res.expiring} SSL expiring ≤30d, {res.expired} expired, {res.domainExpiring} domains expiring ≤30d{res.noIpv6 ? `, ${res.noIpv6} without IPv6` : ''}</span>
          </p>
          <h3 style={{ marginTop: 14 }}>Worst first</h3>
          <table>
            <thead><tr><th>Target</th><th>Status</th><th>Latency (avg of {res.pings || 3})</th><th>SSL expiry</th><th>Domain expiry (RDAP)</th><th>IPv6</th></tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <td style={{ wordBreak: 'break-all', fontWeight: 700 }}>{r.url}</td>
                  <td className={r.up && r.status < 400 ? 'pass' : r.up ? 'warn' : 'fail'}>
                    {r.up ? `${r.status}` : 'DOWN'} <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{r.detail}</span>
                  </td>
                  <td>
                    {r.avg != null
                      ? <>{r.avg} ms <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>({r.samples ? r.samples.join('/') : '—'}{r.jitter != null ? ` · jitter ${r.jitter}ms` : ''})</span></>
                      : '—'}
                  </td>
                  <td>{sslCell(r)}</td>
                  <td>{domainCell(r)}</td>
                  <td className={r.ipv6 && r.ipv6.aaaa ? 'pass' : 'warn'}>{r.ipv6 && r.ipv6.aaaa ? 'AAAA ✓' : 'no AAAA'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{hidden} more target{hidden > 1 ? 's' : ''} probed but hidden in the preview.</p>}
          <p className="cap-note">
            Preview surfaces the 2 worst of {res.checked} targets, once, right now. The planned PingDeck probes continuously, keeps uptime history,
            and adds SSL + domain-renewal expiry alerts by email/WhatsApp before anything goes red.
          </p>
        </div>
      )}
    </>
  );
}
