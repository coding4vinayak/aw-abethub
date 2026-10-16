'use client';
import { useState } from 'react';

const ENGINES = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'google', label: 'AI Overviews' },
  { key: 'perplexity', label: 'Perplexity' },
];

export default function AnswerReadyWidget() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch(`/api/answerready?url=${encodeURIComponent(url.trim())}`);
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Scan failed — try another URL.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const shown = res ? res.questions.slice(0, 2) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="page">Page URL to scan</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input id="page" type="text" placeholder="https://yoursite.com/" value={url}
            onChange={(e) => setUrl(e.target.value)} style={{ flex: '1 1 260px' }} />
          <button className="btn" disabled={busy || !url.trim()}>{busy ? 'Scanning…' : 'Scan page'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.score}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 answerability — {res.title}</span>
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
            Questions simulated by: {res.source === 'ai' ? 'AI model (live)' : 'deterministic engine'} ·
            {' '}engine reach: ChatGPT {res.engineCounts.chatgpt}/{res.totalQuestions},
            AI Overviews {res.engineCounts.google}/{res.totalQuestions},
            Perplexity {res.engineCounts.perplexity}/{res.totalQuestions}
          </p>
          <table>
            <thead><tr><th>Signal</th><th>Points</th><th>What we found</th></tr></thead>
            <tbody>
              {res.signals.map((s) => (
                <tr key={s.key}>
                  <td style={{ fontWeight: 700 }}>{s.key}</td>
                  <td className={s.points >= s.max * 0.75 ? 'pass' : s.points > 0 ? 'warn' : 'fail'}>{s.points}/{s.max}</td>
                  <td>{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Buyer questions — can each AI engine answer them from your page?</h3>
          <table>
            <thead>
              <tr>
                <th>Question a buyer asks</th>
                {ENGINES.map((en) => <th key={en.key}>{en.label}</th>)}
                <th>Answerable?</th>
                <th>Answerability evidence</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{q.question}</td>
                  {ENGINES.map((en) => (
                    <td key={en.key} className={q.engines[en.key] ? 'pass' : 'fail'}>{q.engines[en.key] ? 'YES' : 'NO'}</td>
                  ))}
                  <td className={q.canAnswer ? 'pass' : 'fail'}>{q.canAnswer ? 'YES' : 'NO'}</td>
                  <td style={{ color: 'var(--ink-3)' }}>{q.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-note">
            Preview shows {shown.length} of {res.totalQuestions} generated buyer questions ({res.answerable} answerable).
            The planned AnswerReady crawls your whole site continuously, scores every page against live AI-engine questions,
            and tracks the gaps before your buyers find them — planned from $9/mo.
          </p>
        </div>
      )}
    </>
  );
}
