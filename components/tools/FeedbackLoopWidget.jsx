'use client';
import { useState } from 'react';

export default function FeedbackLoopWidget() {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setBusy(true);
    try {
      const r = await fetch('/api/feedbackloop', {
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

  const cls = (pct) => (pct >= 60 ? 'fail' : pct >= 30 ? 'warn' : 'pass');
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="fl-text">Feedback items — one per line (reviews, tickets, NPS verbatims)</label>
        <textarea id="fl-text" rows={8} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'Onboarding is slow and confusing\nI love how fast the export works\nReporting dashboards keep crashing\nGreat support but the price is too expensive\nThe new search is finally intuitive and fast'} />
        <button className="btn" type="submit" disabled={busy || lines < 3}>{busy ? 'Clustering themes…' : 'Analyse feedback'}</button>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>Themes <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {res.total} items analysed{res.capped ? ', ranked list capped to top 4' : ''}</span></h3>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-3)' }}>
            Sentiment mix:
            {' '}<span className="pass">{res.overall.positive} positive</span>,{' '}
            <span className="fail">{res.overall.negative} negative</span>,{' '}
            {res.overall.mixed} mixed, {res.overall.neutral} neutral
            {res.overall.churnRisk ? `, ${res.overall.churnRisk} churn-risk` : ''}
          </p>
          <table>
            <thead><tr><th>Theme</th><th>Mentions</th><th>Sentiment</th><th>% negative</th><th>Intent</th><th>Urgency</th><th>Sample quote</th></tr></thead>
            <tbody>
              {res.themes.map((t) => (
                <tr key={t.theme}>
                  <td style={{ fontWeight: 700 }}>{t.theme}</td>
                  <td>{t.mentions}</td>
                  <td className={t.sentiment === 'positive' ? 'pass' : t.sentiment === 'negative' ? 'fail' : 'warn'}>{t.sentiment} ({t.avgSentiment > 0 ? '+' : ''}{t.avgSentiment})</td>
                  <td className={cls(t.pctNeg)}>{t.pctNeg}%</td>
                  <td>{t.intent ? <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>{t.intent}</span> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                  <td style={{ fontWeight: 700 }}>{t.urgency}</td>
                  <td style={{ color: 'var(--ink-3)' }}>{t.sample || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!res.themes.length && <p style={{ color: 'var(--ink-3)' }}>Nothing repeats twice in this batch — no themes to rank yet.</p>}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>
            What to do first{' '}
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>· {res.source === 'ai' ? 'AI triage' : 'computed ranking'}</span>
          </p>
          <div style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--free-soft)', color: 'var(--ink-2)' }}>
            {res.verdict}
          </div>

          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '10px 0 0' }}>
            Intent mix: {Object.entries(res.intentMix).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · ') || 'no strong intents detected'}
          </p>

          <p className="cap-note">Preview ranks the top 4 themes from one batch. FeedbackLoop paid ingests continuously (app, email, in-product), dedupes, and charts each theme&apos;s sentiment per release.</p>
        </div>
      )}
    </>
  );
}
