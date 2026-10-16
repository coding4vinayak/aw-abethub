'use client';
import { useState } from 'react';

// The full generation engine now lives in /api/sloganforge (server):
// 15 tone-tuned families × word-variant matrix, plus new copy-desk signals —
// cliché screening, syllable meter, a “say it out loud” test and deterministic
// name/domain availability HINTS. AI refinement rounds run server-side too.

const chip = (tone) => ({
  display: 'inline-block', margin: '2px 6px 2px 0', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600,
  background: tone === 'bad' ? '#fef2f2' : tone === 'mid' ? 'var(--accent-soft)' : 'var(--free-soft)',
  color: tone === 'bad' ? 'var(--error)' : tone === 'mid' ? 'var(--accent)' : 'var(--free)',
});

export default function SloganForgeWidget() {
  const [brand, setBrand] = useState('');
  const [positioning, setPositioning] = useState('');
  const [tone, setTone] = useState('playful');
  const [results, setResults] = useState(null);
  const [refined, setRefined] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);

  async function run(e) {
    e.preventDefault();
    setErr(''); setResults(null); setRefined(null); setBusy(true);
    try {
      const r = await fetch('/api/sloganforge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, positioning, tone }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Something went wrong.');
      else setResults(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  async function refine() {
    if (!results) return;
    setRefining(true); setErr('');
    try {
      const r = await fetch('/api/sloganforge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, positioning, tone, refine: true }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Something went wrong.');
      else setRefined(j);
    } catch { setErr('Network error — refinement failed; your slogans above stand on their own.'); }
    setRefining(false);
  }

  const dh = results?.domainHint;

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="sf-brand">Brand name</label>
        <input id="sf-brand" type="text" placeholder="e.g. Ledgerly" value={brand}
          onChange={(e) => setBrand(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        <label htmlFor="sf-pos" style={{ marginTop: 12 }}>One-sentence positioning</label>
        <input id="sf-pos" type="text" placeholder="e.g. We reconcile every invoice instantly so finance teams close the books without stress" value={positioning}
          onChange={(e) => setPositioning(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        <label htmlFor="sf-tone" style={{ marginTop: 12 }}>Tone</label>
        <select id="sf-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="playful">Playful</option>
          <option value="premium">Premium</option>
          <option value="technical">Technical</option>
          <option value="urgent">Urgent</option>
        </select>
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !brand.trim() || !positioning.trim()}>{busy ? 'Forging…' : 'Forge slogans'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {results && (
        <div className="result" style={{ marginTop: 16 }}>
          <h3>Top 8 of {results.total} generated ({results.unique} after de-duplication)</h3>
          {dh && (
            <p style={{ fontSize: 13, margin: '0 0 10px', color: dh.tone === 'ok' ? 'var(--free)' : '#b45309', fontWeight: 600 }}>
              Name/domain hint: {dh.text}
            </p>
          )}
          {results.top.map((t, i) => (
            <div key={t.text} style={{ padding: '10px 0', borderBottom: i < results.top.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{t.text}</span>
                <span style={{ color: 'var(--ink-3)', fontSize: 13, whiteSpace: 'nowrap' }}>{t.score}/10</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', margin: '6px 0 4px', overflow: 'hidden' }}>
                <div style={{ width: `${t.score * 10}%`, height: '100%', background: t.score >= 8 ? 'var(--free)' : t.score >= 6 ? '#b45309' : 'var(--ink-3)' }} />
              </div>
              <div>
                {t.cliche.length > 0 && <span style={chip('bad')}>cliché: {t.cliche.join(', ')} — {t.clicheNote}</span>}
                <span style={chip(t.chant === 'hard to chant (>14 syllables)' ? 'bad' : t.chant === 'chantable' ? 'good' : 'mid')}>
                  {t.syllables} syllables · {t.chant}
                </span>
                <span style={chip(t.sayScore >= 8 ? 'good' : t.sayScore >= 5 ? 'mid' : 'bad')}>
                  say-it-out-loud {t.sayScore}/10 — {t.sayLabel}
                </span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.rationale}{t.sayNotes ? ` · ${t.sayNotes}` : ''}</span>
            </div>
          ))}

          {results.aiAvailable && (
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn secondary" onClick={refine} disabled={refining}>
                {refining ? 'Copy chief refining…' : 'Run AI refinement round on top 3'}
              </button>
            </div>
          )}

          {refined?.refined?.length > 0 && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--free-soft)' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>
                Refinement round{' '}
                <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {refined.source === 'ai' ? 'AI copy-chief pass' : 'engine fallback'}</span>
              </p>
              {refined.refined.map((r, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: 13 }}>
                  {r.original && <div style={{ color: 'var(--ink-3)' }}>was: “{r.original}”</div>}
                  <div style={{ fontWeight: 700 }}>→ “{r.text}”</div>
                  {r.why && <div style={{ color: 'var(--ink-2)' }}>{r.why}</div>}
                </div>
              ))}
            </div>
          )}

          <p className="cap-note">Free preview: your best 8 of {results.total}+ scored slogans. The planned SloganForge checks domain availability on every line and runs refinement rounds in your brand voice.</p>
        </div>
      )}
    </>
  );
}
