'use client';
import { useState } from 'react';
import { useCurrentReport } from './ReportContext';

export default function EmailCapture({ tool, toolName, headline, sub }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [delivered, setDelivered] = useState(false);
  const report = useCurrentReport();

  async function submit(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setState('bad'); return; }
    setState('sending');
    try {
      const r = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The report the visitor is already looking at, so the email can be
        // the report rather than a promise to send one later.
        body: JSON.stringify({ email, tool, report: report || undefined }),
      });
      if (!r.ok) { setState('fail'); return; }
      const j = await r.json().catch(() => ({}));
      // The API answers with what actually happened. "Delivered" is only said
      // when a provider took the message — a deployment with no mail provider
      // says so, because telling a visitor their report is in their inbox
      // when it is not is the one thing this card must never do.
      setDelivered(Boolean(j.delivered));
      setState('done');
    } catch {
      setState('fail');
    }
  }

  if (state === 'done') {
    return (
      <div className="result">
        {delivered ? (
          <>
            <h3 className="pass">Report sent ✓</h3>
            <p>
              It’s in your inbox — the result, one fix tip, and a link back to the tool. That’s the
              one email we promised; there is no newsletter behind it.
            </p>
          </>
        ) : (
          <>
            <h3 className="pass">Saved ✓</h3>
            <p>
              Your address is on our list, but this deployment has no mail provider, so the report
              was not emailed — it’s on the page above, and we’ll follow up by email.
            </p>
          </>
        )}
      </div>
    );
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
        One email with your report
        {toolName ? ` — ${toolName}` : ''} — no newsletter, no spam. See our{' '}
        <a href="/privacy">privacy policy</a>; delete your data anytime at privacy@abetworks.in.
      </p>
    </form>
  );
}
