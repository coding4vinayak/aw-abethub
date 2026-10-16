'use client';
import { useState } from 'react';

// Analysis engine moved to /api/winloss (server): confidence-weighted themes,
// voice-of-customer quotes, win-side themes, per-family fix playbooks and
// quarter detection — with an AI narrative when configured.

export default function WinLossWidget() {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setBusy(true);
    try {
      const r = await fetch('/api/winloss', {
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
        <label htmlFor="wl-text">Deals — one per line: won|lost | amount | notes (dates/quarters in notes are detected)</label>
        <textarea id="wl-text" placeholder={'won | 24000 | fast pilot, champion loved the API because it cut their close time in half\nlost | 18000 | too expensive vs their budget for year one, Q3 spend frozen\nlost | 9500 | went with CompetitorX, switching cost too high\nlost | 30000 | missing SSO, security review blocked procurement in Sep 2026'} value={text}
          onChange={(e) => setText(e.target.value)} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !text.trim()}>{busy ? 'Crunching deals…' : 'Analyse win/loss'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result" style={{ marginTop: 16 }}>
          <h3>Loss themes — {res.lostCount} lost / {res.wonCount} won · {res.totalLost.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total lost · win rate {res.winRate}%</h3>
          <p style={{ fontWeight: 600, margin: '0 0 4px' }}>
            {res.source === 'ai' ? res.aiInsight : res.insight}{' '}
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>· {res.source === 'ai' ? 'AI narrative over computed numbers' : 'computed from confidence-weighted money'}</span>
          </p>
          {res.source === 'ai' && res.aiMorale && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--free)', fontWeight: 600 }}>{res.aiMorale}</p>
          )}

          <table>
            <thead><tr><th>#</th><th>Theme</th><th>Deals</th><th>$ impact</th><th>Confidence</th><th>Share of lost</th></tr></thead>
            <tbody>
              {res.ranked.map((t, i) => (
                <tr key={t.label}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{t.label}</td>
                  <td>{t.count}</td>
                  <td className={i === 0 ? 'fail' : 'warn'}>{t.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td className={t.confidence >= 0.7 ? 'pass' : t.confidence >= 0.5 ? 'warn' : 'fail'}>{Math.round(t.confidence * 100)}%</td>
                  <td>{t.share}%</td>
                </tr>
              ))}
              {res.unclassified.count > 0 && (
                <tr>
                  <td>—</td><td style={{ color: 'var(--ink-3)' }}>Uncategorised notes</td>
                  <td>{res.unclassified.count}</td><td>{res.unclassified.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td>—</td><td>{Math.round((res.unclassified.amount / (res.totalLost || 1)) * 100)}%</td>
                </tr>
              )}
            </tbody>
          </table>

          {res.ranked.map((t) => (
            <div key={`v-${t.label}`} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Voice of customer — {t.label}</div>
              {t.bestQuote ? (
                <div style={{ fontSize: 13, marginTop: 4, padding: '8px 12px', borderRadius: 9, background: 'var(--free-soft)', color: 'var(--ink-2)' }}>
                  “{t.bestQuote}” <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>— most specific sentence in this theme</span>
                </div>
              ) : (
                t.quotes.slice(0, 1).map((q, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--ink-2)', paddingLeft: 12, borderLeft: '3px solid var(--line)', margin: '6px 0' }}>“{q}”</div>
                ))
              )}
            </div>
          ))}

          {res.fixList.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Fix list — playbook per top theme</div>
              {res.fixList.map((fx) => (
                <div key={fx.label} style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fx.label}:</span>
                  <ol style={{ margin: '2px 0 0', paddingLeft: 20, fontSize: 13, color: 'var(--ink-2)' }}>
                    {fx.actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {res.winThemes.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>What’s working — win-side themes ({res.wonCount} won deals)</div>
              {res.winThemes.map((w) => (
                <div key={w.label} style={{ fontSize: 13, marginBottom: 6 }}>
                  <span className="pass">{w.label}</span> · {w.count} deal{w.count > 1 ? 's' : ''} worth {w.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (confidence {Math.round(w.confidence * 100)}%)
                  {w.bestQuote ? <div style={{ color: 'var(--ink-3)', paddingLeft: 12 }}>“{w.bestQuote}”</div> : null}
                </div>
              ))}
            </div>
          )}

          {res.quarters.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Quarter pattern (from dates mentioned in notes)</div>
              {res.quarters.map((q) => (
                <div key={q.quarter} style={{ fontSize: 13 }}>
                  <b>{q.quarter}</b>: {q.count} loss{q.count > 1 ? 'es' : ''} · {q.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} · note confidence {Math.round(q.confidence * 100)}%
                </div>
              ))}
            </div>
          )}

          <p className="cap-note">Free preview: top 3 themes{res.hidden > 0 ? ` (${res.hidden} more found but hidden)` : ''}. The planned WinLoss adds quarterly reports, CRM field ingest and win-side theme comparison.</p>
        </div>
      )}
    </>
  );
}
