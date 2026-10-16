'use client';
import { useState } from 'react';

const MAX_URLS = 10;
const PREVIEW_ROWS = 3;

export default function ColdAngleWidget() {
  const [urls, setUrls] = useState('');
  const [product, setProduct] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(-1);

  const lines = urls.split('\n').map((l) => l.trim()).filter(Boolean);

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null); setCopied(-1);
    try {
      const r = await fetch('/api/coldangle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls: lines, product }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Research failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  async function copy(text, i) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(-1), 2000);
    } catch { setErr('Your browser blocked clipboard access — select the text and copy manually.'); }
  }

  const rows = res ? res.rows.filter((r) => !r.error) : [];
  const failed = res ? res.rows.filter((r) => r.error) : [];
  const shown = rows.slice(0, PREVIEW_ROWS);

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="prospects">Prospect websites — one per line (max {MAX_URLS})</label>
        <textarea id="prospects" rows={5} style={{ minHeight: 120 }} value={urls}
          placeholder={'https://prospect-one.com\nhttps://prospect-two.com\nhttps://prospect-three.com'}
          onChange={(e) => setUrls(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
          <span>{lines.length} of {MAX_URLS} prospects queued</span>
          {lines.length > MAX_URLS && <span className="fail">Trim to {MAX_URLS} lines</span>}
        </div>
        <label htmlFor="product" style={{ marginTop: 10, display: 'block' }}>Your product, in one line</label>
        <input id="product" type="text" placeholder="e.g. We turn support tickets into roadmap priorities" value={product}
          onChange={(e) => setProduct(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy || lines.length === 0 || lines.length > MAX_URLS || product.trim().length < 5}>
            {busy ? 'Researching up to ' + lines.length + ' sites…' : 'Research my list'}
          </button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>
            Resolved angle for {rows.length} prospect{rows.length === 1 ? '' : 's'}
            <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>
              {' '} · {res.attempted} sent, {res.failed} unreachable · {res.enriched ?? 0} enriched with a second page
            </span>
          </h3>
          <table>
            <thead>
              <tr><th>Prospect domain</th><th>Hook phrase observed</th><th>Opener</th></tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.url + i}>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r.domain}</td>
                  <td style={{ fontStyle: 'italic', color: 'var(--ink-3)', verticalAlign: 'top' }}>
                    “{r.phrase}”
                    {r.detail && (
                      <div style={{ fontStyle: 'normal', fontSize: 12, marginTop: 4 }}>
                        + “{r.detail}” <span style={{ color: 'var(--ink-3)' }}>(second page)</span>
                      </div>
                    )}
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <span style={{
                      display: 'inline-block', background: 'var(--accent-soft)', color: 'var(--accent)',
                      fontWeight: 700, fontSize: 11, padding: '3px 9px', borderRadius: 999,
                      letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6,
                    }}>
                      {r.angleType || 'angle'}
                    </span>
                    <p style={{ margin: '0 0 6px', lineHeight: 1.55 }}>{r.opener}</p>
                    <button className="btn secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => copy(r.opener, i)}>{copied === i ? 'Copied ✓' : 'Copy'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {failed.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10, marginBottom: 0 }}>
              Not researched: {failed.map((f) => `${f.domain} (${f.error})`).join('; ')}
            </p>
          )}

          <p className="cap-note">
            Preview caps the batch at {shown.length} of {res.researched} researched prospects per run — one angle each, no subject
            lines. The planned ColdAngle writes 10 distinct angles per prospect plus subject lines and the follow-up sequence, on a
            schedule for your whole list — planned from $15/mo.
          </p>
        </div>
      )}
    </>
  );
}
