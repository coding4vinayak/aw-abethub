'use client';
import { useState } from 'react';

export default function EmailCapture({ tool, headline, sub }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');

  async function submit(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setState('bad'); return; }
    setState('sending');
    try {
      const r = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, tool }),
      });
      setState(r.ok ? 'done' : 'fail');
    } catch {
      setState('fail');
    }
  }

  if (state === 'done') {
    return <div className="result"><h3 className="pass">Sent ✓</h3><p>Check your inbox — the full report is on its way.</p></div>;
  }

  return (
    <form onSubmit={submit} className="result" style={{ borderStyle: 'solid' }}>
      <h3>{headline}</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-3)' }}>{sub}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state !== 'sending') setState('idle'); }}
          style={{ flex: '1 1 240px' }}
        />
        <button className="btn" type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send it →'}
        </button>
      </div>
      {state === 'bad' && <p className="error-note">That email doesn’t look right.</p>}
      {state === 'fail' && <p className="error-note">Couldn’t send just now — try again in a moment.</p>}
      <p className="privacy-note">
        One email with your report — no newsletter, no spam. See our <a href="/privacy">privacy policy</a>; delete your data anytime at privacy@abetworks.in.
      </p>
    </form>
  );
}
