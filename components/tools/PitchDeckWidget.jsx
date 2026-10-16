'use client';
import { useState } from 'react';

export default function PitchDeckWidget() {
  const [desc, setDesc] = useState('');
  const [metricsText, setMetricsText] = useState('ARR $1.2M\nGrowth 14% MoM\nChurn 3%\nGross margin 82%\nRunway 9 months\n320 customers');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  const ready = desc.trim().split(/\s+/).length >= 4;

  async function run(e) {
    e.preventDefault();
    setErr('');
    if (!ready) { setErr('Describe the business in at least 4 words.'); return; }
    setBusy(true); setRes(null);
    try {
      const r = await fetch('/api/pitchdeck', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ desc, metrics: metricsText }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Deck generation failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const shownSlides = res ? res.slides.slice(0, 5) : [];
  const hiddenSlides = res ? res.slides.slice(5) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="pd-desc">One-line business description</label>
        <input id="pd-desc" type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="B2B SaaS that automates GST invoicing for Indian D2C brands" />

        <label htmlFor="pd-metrics">Metrics (optional — ARR, growth %, churn %, CAC, LTV, margin, runway, customers)</label>
        <textarea id="pd-metrics" rows={4} value={metricsText} onChange={(e) => setMetricsText(e.target.value)}
          placeholder={'ARR $1.2M\nGrowth 14% MoM\nChurn 3%\nGross margin 82%\nRunway 9 months\n320 customers'} />

        <div style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Building deck…' : 'Generate deck outline'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>12-slide structure for “{desc.trim().slice(0, 60)}”</h3>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '4px 0' }}>
            <span className={res.stage === 'growth' ? 'pass' : 'warn'} style={{ fontWeight: 800, textTransform: 'uppercase', marginRight: 8 }}>{res.stage} stage</span>
            {res.slideFramework} — {res.stageReason}
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Detected {res.providedCount}/{res.metricCount} metrics · keywords: {res.keywords.join(', ') || '—'}</p>
          <table>
            <thead><tr><th>#</th><th>Slide</th><th>Bullets</th><th>Metric to show here</th><th>What a16z / CB Insights expects</th></tr></thead>
            <tbody>
              {shownSlides.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{s.title}</td>
                  <td><ul style={{ margin: 0, paddingLeft: 16 }}>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul></td>
                  <td className={/collect/.test(s.metric) ? 'warn' : 'pass'} style={{ fontSize: 12 }}>{s.metric}</td>
                  {s.expect ? <td style={{ fontSize: 12 }}> {s.expect}</td> : <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>standard slide expectations</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {hiddenSlides.length > 0 && (
            <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>+ {hiddenSlides.length} more slides ({hiddenSlides.map((s) => s.title.toLowerCase()).join(', ')}) hidden in the preview.</p>
          )}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Questions investors will ask you ({res.stage} lens)</p>
          <ol>{res.questions.map((q, i) => <li key={i} style={{ margin: '6px 0' }}>{q}</li>)}</ol>

          <p className="cap-note">
            Preview reveals the first 5 of 12 slides. The planned PitchDeck exports the full deck outline with speaker notes, fills the collect-this metrics
            from your data, and adds designer-ready layouts.
          </p>
        </div>
      )}
    </>
  );
}
