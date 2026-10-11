'use client';
import { useState } from 'react';

export default function ContractScanWidget() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    if (text.length < 200) { setErr('Paste at least 200 characters of contract text.'); return; }
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/contractscan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 20000) }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Scan failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const shown = res ? res.findings.slice(0, 3) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="contract">Contract text (up to 20,000 characters)</label>
        <textarea id="contract" style={{ minHeight: 200 }} maxLength={20000}
          placeholder="Paste the vendor agreement text here…"
          value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy || text.length < 200}>{busy ? 'Scanning…' : 'Scan clauses'}</button>
          <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{text.length.toLocaleString()} / 20,000 chars</span>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.riskScore}</span>
            <span style={{ color: 'var(--ink-3)' }}> / 100 risk score — contract grade </span>
            <span className={/^[AB]/.test(res.grade) ? 'pass' : res.grade === 'C' ? 'warn' : 'fail'} style={{ fontWeight: 800 }}>{res.grade}</span>
            <span style={{ color: 'var(--ink-3)' }}> · {res.totalFindings} clause flag{res.totalFindings === 1 ? '' : 's'} in {res.chars.toLocaleString()} chars{res.truncated ? ' (scanned up to the 20k limit)' : ''} · reviewer: {res.source === 'ai' ? 'AI extract-and-grade' : 'clause detectors'}</span>
          </p>
          <p style={{ margin: '8px 0 0' }}>
            <span className="fail" style={{ fontWeight: 700 }}>{res.heat.high} high</span>
            <span style={{ color: 'var(--ink-3)' }}> · </span>
            <span className="warn" style={{ fontWeight: 700 }}>{res.heat.med} med</span>
            <span style={{ color: 'var(--ink-3)' }}> · </span>
            <span className="pass" style={{ fontWeight: 700 }}>{res.heat.low} low</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}> risk heat</span>
          </p>
          {res.findings.length === 0 && <p className="pass" style={{ marginTop: 12 }}>No risky clause families matched. Still have a human skim the payment and scope sections.</p>}
          {shown.map((f, i) => (
            <div key={i} style={{ marginTop: 14 }}>
              <h3>
                <span className={f.risk === 'high' ? 'fail' : f.risk === 'med' ? 'warn' : 'pass'}>{f.risk.toUpperCase()}</span>
                {'  '}{f.clause}
              </h3>
              <p style={{ margin: '0 0 6px', fontStyle: 'italic', color: 'var(--ink-3)' }}>{f.fragment}</p>
              <p style={{ margin: 0 }}><strong>Fix:</strong> {f.fix}</p>
            </div>
          ))}
          <p className="cap-note">
            Preview analyzes {shown.length} of {res.totalFindings} flagged clauses per scan. ContractScan paid
            uploads full PDFs, runs every detector plus jurisdiction checks, exports a redline list and keeps a
            risk history per vendor — from $19/mo.
          </p>
        </div>
      )}
    </>
  );
}
