'use client';
import { useState } from 'react';

export default function MeetingPrepWidget() {
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [attendees, setAttendees] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/meetingprep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, notes, attendees }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Brief failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const ready = Boolean(url.trim() && notes.trim().split(/\s+/).length >= 5);

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="mp-url">Company website URL</label>
        <input id="mp-url" type="text" placeholder="prospect.com" value={url} onChange={(e) => setUrl(e.target.value)} />

        <label htmlFor="mp-notes">Meeting notes / context (what you last heard, open items, what this call is for)</label>
        <textarea id="mp-notes" rows={8} maxLength={12000} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={'Priya said onboarding is still pending and they need SSO before renewal.\nFollow up on the pilot pricing quote — Marcus is waiting on legal.\nDo we have budget for another 20 seats?'} />
        <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '6px 0' }}>{notes.trim() ? notes.trim().split(/\s+/).length : 0} words</p>

        <label htmlFor="mp-att">Attendee names (one line, comma separated)</label>
        <input id="mp-att" type="text" placeholder="Priya Menon, Marcus Lee" value={attendees} onChange={(e) => setAttendees(e.target.value)} />

        <div style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={busy || !ready}>{busy ? 'Researching…' : 'Build my brief'}</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>One-page brief · {res.company.domain}</h3>

          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>Company snapshot</p>
          {res.company.fetchError ? (
            <p className="error-note" style={{ marginTop: 0 }}>{res.company.fetchError}</p>
          ) : (
            <table>
              <tbody>
                {res.company.blurb ? <tr><td style={{ fontWeight: 700 }}>Company blurb{res.company.aboutUrl ? ' (about page)' : ' (meta description)'}</td><td>{res.company.blurb}</td></tr> : null}
                {res.company.title ? <tr><td style={{ fontWeight: 700 }}>Title tag</td><td>{res.company.title}</td></tr> : null}
                {res.company.description ? <tr><td style={{ fontWeight: 700 }}>Meta description</td><td>{res.company.description}</td></tr> : null}
                {res.company.h2s.length ? <tr><td style={{ fontWeight: 700 }}>Site headings (live)</td><td>{res.company.h2s.join(' · ')}</td></tr> : null}
                <tr><td style={{ fontWeight: 700 }}>Readable body</td><td>{res.company.textLen.toLocaleString()} chars{res.company.hasOg ? ' · social/OG tags present' : ' · no OG tags'}</td></tr>
              </tbody>
            </table>
          )}

          {res.signals && res.signals.length > 0 && (
            <>
              <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Signals from their site (live)</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {res.signals.map((s, i) => (
                  <li key={i} style={{ margin: '5px 0' }}>
                    {s.text} <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>— read from {s.from}; treat as a live initiative, ask what changed</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Discussion context ({res.context.sentences} statements read)</p>
          {res.context.openItems.length ? (
            <table>
              <thead><tr><th>Open item</th><th>Type</th></tr></thead>
              <tbody>
                {res.context.openItems.map((o, i) => (
                  <tr key={i}><td>{o.text}</td><td className={o.kind === 'question' ? 'warn' : 'pass'}>{o.kind}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ color: 'var(--ink-3)' }}>No open items detected — your notes contain no “need”, “pending”, “follow up” or question marks.</p>}
          {res.context.keywords.length ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Topic keywords: {res.context.keywords.join(', ')}</p> : null}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Attendee gap flags</p>
          {res.gaps.length ? (
            <table>
              <thead><tr><th>Name</th><th>Flag</th></tr></thead>
              <tbody>
                {res.gaps.map((g, i) => (
                  <tr key={i}><td style={{ fontWeight: 700 }}>{g.who}</td><td className="warn">{g.flag}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="pass">Every attendee is referenced in your notes and no unlisted names appeared.</p>}

          {res.decisionMakers && res.decisionMakers.length > 0 && (
            <>
              <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Decision-makers in your notes</p>
              <table>
                <thead><tr><th>Name</th><th>Role signal</th><th>On the invite?</th></tr></thead>
                <tbody>
                  {res.decisionMakers.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{d.name}</td>
                      <td>{d.role}</td>
                      <td className={d.onInvite ? 'pass' : 'fail'}>{d.onInvite ? 'yes' : 'NOT invited — the person with sign-off may not be in the room'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>3 questions to ask ({res.source === 'ai' ? 'AI-drafted' : 'engine-drafted'})</p>
          <ol>
            {res.questions.map((q, i) => <li key={i} style={{ margin: '6px 0' }}>{q}</li>)}
          </ol>

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Risks</p>
          <table>
            <tbody>
              {res.risks.map((r, i) => <tr key={i}><td className="fail">RISK</td><td>{r}</td></tr>)}
            </tbody>
          </table>

          <p className="cap-note">
            This is your one free brief{res.capped ? ' (notes truncated at 12,000 chars)' : ''}. The planned MeetingPrep connects your calendar and generates this
            page automatically for every call — company snapshot, name gaps, questions and risks in your inbox 10 minutes before start.
          </p>
        </div>
      )}
    </>
  );
}
