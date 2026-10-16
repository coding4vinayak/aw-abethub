'use client';
import { useState } from 'react';

export default function ColdOpenerWidget() {
  const [url, setUrl] = useState('');
  const [product, setProduct] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null); setCopied(false);
    try {
      const r = await fetch(`/api/coldopener?url=${encodeURIComponent(url.trim())}&product=${encodeURIComponent(product.trim())}`);
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Something went wrong.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(res.opener);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setErr('Your browser blocked clipboard access — select the text and copy manually.'); }
  }

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="prospect">Prospect website URL</label>
        <input id="prospect" type="text" placeholder="https://prospect-company.com" value={url}
          onChange={(e) => setUrl(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        <label htmlFor="product" style={{ marginTop: 12, display: 'block' }}>Your product, in one line</label>
        <input id="product" type="text" placeholder="e.g. We turn support tickets into roadmap priorities" value={product}
          onChange={(e) => setProduct(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || !url.trim() || !product.trim()}>
            {busy ? 'Researching…' : 'Write my opener'}
          </button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result" style={{ marginTop: 16 }}>
          <h3>Your researched opener{' '}
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase', verticalAlign: 'middle' }}>
              {res.source === 'ai' ? 'AI-drafted' : 'engine-drafted'}
            </span>
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{res.opener}</p>
          {res.why && (
            <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, padding: '8px 12px', borderLeft: '3px solid var(--line)', background: 'rgba(0,0,0,0.02)' }}>
              <strong>Why it works:</strong> {res.why}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy opener'}</button>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
              Grounded in real text from {res.domain}: “{res.phrase}”
            </span>
          </div>
          <p className="cap-note">The full researched opener — unlimited runs, no signup. The planned ColdAngle adds 10 angles per prospect, subject lines and the follow-up sequence.</p>
        </div>
      )}
    </>
  );
}
