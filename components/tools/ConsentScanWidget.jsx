'use client';
import { useState } from 'react';

export default function ConsentScanWidget() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch(`/api/consentscan?url=${encodeURIComponent(url.trim())}`);
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Scan failed — try another URL.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const shown = res ? res.findings.slice(0, 3) : [];
  const shownTrackers = res ? res.trackers.slice(0, 3) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="site">Page URL to scan</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input id="site" type="text" placeholder="https://yoursite.com" value={url}
            onChange={(e) => setUrl(e.target.value)} style={{ flex: '1 1 260px' }} />
          <button className="btn" disabled={busy || !url.trim()}>{busy ? 'Scanning…' : 'Scan consent'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.risk}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 consent risk — grade </span>
            <span className={/^[AB]/.test(res.grade) ? 'pass' : /^[CD]/.test(res.grade) ? 'warn' : 'fail'} style={{ fontWeight: 800 }}>{res.grade}</span>
            <span style={{ color: 'var(--ink-3)' }}> — {res.url}</span>
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Consent Mode: {res.consentMode.version || 'none'} · CMP: {res.cmps.length ? res.cmps.join(', ') : 'none detected'} ·
            {' '}{res.totalTrackerUrls} tracker URLs across {res.trackers.length} vendors ({res.thirdPartyCount} third-party resources total)
          </p>
          <h3 style={{ marginTop: 14 }}>Top {shown.length} findings</h3>
          <table>
            <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.label}>
                  <td style={{ fontWeight: 700 }}>{f.label}</td>
                  <td className={f.status}>{f.status.toUpperCase()}</td>
                  <td>{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Named tracker inventory (script srcs + og: resources)</h3>
          {shownTrackers.length === 0 ? (
            <p className="pass">No known tracker vendor URLs in the page source.</p>
          ) : (
            <>
              <table>
                <thead><tr><th>Vendor</th><th>Tracker URLs</th><th>Hosts</th></tr></thead>
                <tbody>
                  {shownTrackers.map((t) => (
                    <tr key={t.vendor}>
                      <td style={{ fontWeight: 700 }}>{t.vendor}</td>
                      <td className={t.urls > 3 ? 'fail' : 'warn'}>{t.urls}</td>
                      <td style={{ wordBreak: 'break-all', color: 'var(--ink-3)' }}>{t.hosts.slice(0, 4).join(', ')}{t.hosts.length > 4 ? ` +${t.hosts.length - 4} more` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {res.trackers.length > shownTrackers.length && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
                  {res.trackers.length - shownTrackers.length} more tracker vendor(s) mapped ({res.trackers.slice(3).map((t) => t.vendor).join(', ')}) — full inventory in the paid crawl.
                </p>
              )}
            </>
          )}
          <p className="cap-note">
            Preview shows the 3 worst of {res.totalChecks} checks run (plus {res.trackerHosts.length} tracker domains mapped).
            ConsentScan paid crawls every page against the full 20-point DPDP/GDPR checklist with article-by-article
            citations and re-scans on change — from $19/mo.
          </p>
        </div>
      )}
    </>
  );
}
