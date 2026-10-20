'use client';
import { useEffect, useState } from 'react';
import { useReport } from '../ReportContext';

export default function SiteReadWidget() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch(`/api/siteread?url=${encodeURIComponent(url.trim())}`);
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Something went wrong.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  // The report the capture card emails. Published from the result, so the
  // email carries what the visitor is looking at rather than a promise to
  // send it later.
  const publish = useReport();
  useEffect(() => {
    if (!res) { publish(null); return; }
    const blockers = Array.isArray(res.blockers) ? res.blockers : [];
    publish({
      title: `AI Visibility Check \u2014 ${res.url || ''}`.trim(),
      headline: `${res.score}/100 \u00b7 grade ${res.grade}`,
      rows: blockers.slice(0, 5).map((b) => ({ label: `${b.label} (\u2212${b.lost} pts)`, value: b.fix })),
      tip: blockers.length ? `Fix the biggest one first: ${blockers[0].label}. ${blockers[0].fix}` : 'Nothing blocking \u2014 AI engines can read this page well.',
    });
  }, [res, publish]);

  const badge = (s) => (
    <span className={s === 'pass' ? 'pass' : s === 'warn' ? 'warn' : 'fail'}>
      {s === 'pass' ? 'PASS' : s === 'warn' ? 'CHECK' : 'BLOCKED'}
    </span>
  );

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="url">Your website URL</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input id="url" type="text" placeholder="https://example.com" value={url}
            onChange={(e) => setUrl(e.target.value)} style={{ flex: '1 1 240px' }} />
          <button className="btn" disabled={busy || !url.trim()}>{busy ? 'Crawling…' : 'Check now'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.score}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 AI-readability — {res.url} · grade {res.grade}</span>
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 14 }}>
            {res.summary}{' '}
            <span style={{ fontSize: 11, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase' }}>
              {res.source === 'ai' ? 'AI-written verdict' : 'engine verdict'}
            </span>
          </p>

          <h3 style={{ marginTop: 18 }}>Per-engine crawl readiness (from your robots.txt)</h3>
          <table>
            <thead><tr><th>AI engine</th><th>Status</th><th>Why</th></tr></thead>
            <tbody>
              {res.engines.map((eng) => (
                <tr key={eng.engine}>
                  <td style={{ fontWeight: 700 }}>{eng.engine}<br />
                    <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 12 }}>{eng.agents}</span>
                  </td>
                  <td>{badge(eng.status)}</td>
                  <td>{eng.note}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 18 }}>Signal-by-signal audit</h3>
          <table>
            <thead><tr><th>Signal</th><th>Status</th><th>What we found</th></tr></thead>
            <tbody>
              {res.signals.map((s) => (
                <tr key={s.key}>
                  <td style={{ fontWeight: 700 }}>{s.label}<br />
                    <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 12 }}>{s.got}/{s.weight} pts</span>
                  </td>
                  <td className={s.status === 'pass' ? 'pass' : s.status === 'partial' ? 'warn' : 'fail'}>
                    {s.status === 'pass' ? 'PASS' : s.status === 'partial' ? 'PARTIAL' : 'FAIL'}
                  </td>
                  <td>{s.detail}{s.fix && s.status !== 'pass' ? <><br /><em style={{ color: 'var(--ink-3)', fontSize: 13 }}>Fix: {s.fix}</em></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {res.blockers.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Top {res.blockers.length} blockers — fix these first</h3>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {res.blockers.map((b) => (
                  <li key={b.label} style={{ marginBottom: 8 }}>
                    <strong>{b.label}</strong> (costing {b.lost} pts): {b.fix}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {res.blockers.length === 0 && (
            <p style={{ marginTop: 14 }}>No blockers found — AI engines can read this page well.</p>
          )}

          <p className="cap-note">This is the full free audit — 11 weighted signals, 6 engine verdicts, one URL at a time, unlimited runs. The planned AnswerReady monitors every page continuously and tells you when an AI engine stops citing you.</p>
        </div>
      )}
    </>
  );
}
