'use client';
import { useState } from 'react';

export default function BrandVoiceWidget() {
  const [sample, setSample] = useState('');
  const [check, setCheck] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setErr(''); setRes(null);
    if (sample.trim().split(/\s+/).length < 25) { setErr('Give us at least 25 words of your best copy to build a fingerprint.'); return; }
    if (check.trim().split(/\s+/).length < 10) { setErr('The text to check needs at least 10 words.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/brandvoice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sample, check }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Voice check failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  // Preview cap: worst-deviating 6 metrics shown, full fingerprint computed.
  const shown = res ? [...res.rows].sort((a, b) => b.dev - a.dev).slice(0, 6) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="sample">Your best copy (voice reference)</label>
        <textarea id="sample" placeholder="Paste an email, landing page or post you know sounds like you…"
          value={sample} onChange={(e) => setSample(e.target.value)} />
        <label htmlFor="check" style={{ marginTop: 12 }}>Text to check</label>
        <textarea id="check" placeholder="The new draft your team wants to ship…"
          value={check} onChange={(e) => setCheck(e.target.value)} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !sample.trim() || !check.trim()}>{busy ? 'Scoring…' : 'Score voice match'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.overall}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 deviation — </span>
            <span className={res.verdict === 'ON-BRAND' ? 'pass' : res.verdict === 'NEEDS WORK' ? 'warn' : 'fail'}>{res.verdict}</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}> · fingerprint via {res.source === 'ai' ? 'AI + engine' : 'engine'}</span>
          </p>
          <table>
            <thead><tr><th>Metric</th><th>Your sample</th><th>Checked text</th><th>Deviation</th><th>Verdict</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key}>
                  <td style={{ fontWeight: 700 }}>{r.key} <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>({r.unit})</span></td>
                  <td>{r.s}</td>
                  <td>{r.c}</td>
                  <td className={r.dev <= 20 ? 'pass' : r.dev <= 45 ? 'warn' : 'fail'}>{r.dev}</td>
                  <td className={r.dev <= 20 ? 'pass' : r.dev <= 45 ? 'warn' : 'fail'}>{r.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {res.totalMetrics > shown.length && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
              Preview surfaces the {shown.length} most deviating of {res.totalMetrics} fingerprint metrics
              (sentence openings, syllable density, passive-voice ratio, emoji/hashtag density all computed).
            </p>
          )}
          {res.ai && (
            <div className="card" style={{ background: 'var(--bg)', marginTop: 14 }}>
              <h3>AI voice read</h3>
              <p style={{ margin: '0 0 6px' }}><strong>Reference voice:</strong> {res.ai.voiceProfile}</p>
              <p style={{ margin: '0 0 6px' }}><strong>Diagnosis:</strong> {res.ai.diagnosis}</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {res.ai.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          <p className="cap-note">
            The full 6-metric fingerprint is free to run, one text at a time. BrandVoice paid trains persistent voice
            profiles, auto-rewrites off-brand drafts into your voice, and scores per-channel (email vs social vs docs) — from $12/mo.
          </p>
        </div>
      )}
    </>
  );
}
