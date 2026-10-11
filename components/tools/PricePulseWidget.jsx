'use client';
import { useState } from 'react';

const money = (v) => `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function lineCount(t) {
  return String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
}

function looksLikeUrl(t) {
  const s = String(t || '').trim();
  return /^https?:\/\/\S+$/i.test(s) || (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/[^\s]*)?$/i.test(s) && !/\s/.test(s));
}

export default function PricePulseWidget() {
  const [mineText, setMineText] = useState('');
  const [theirText, setTheirText] = useState('');
  const [comp, setComp] = useState('Competitor');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  const label = comp.trim() || 'Competitor';
  const theirLive = looksLikeUrl(theirText);
  const mineLive = looksLikeUrl(mineText);

  async function run(e) {
    e.preventDefault();
    setErr(''); setRes(null);
    if (!mineText.trim() || !theirText.trim()) {
      setErr('Both sides need plans — paste lines like “Pro $49/mo” or give a pricing page URL.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/pricepulse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comp, mine: mineText, theirs: theirText }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Compare failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const pairs = res ? res.pairs : [];
  const shown = pairs.slice(0, 3);
  const hidden = Math.max(0, pairs.length - shown.length);

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="pp-comp">Competitor name</label>
        <input id="pp-comp" type="text" value={comp} onChange={(e) => { setComp(e.target.value); setRes(null); }} placeholder="Notion" />

        <label htmlFor="pp-mine">Your pricing — paste one plan per line (e.g. “Starter $19/mo”) or give your pricing page URL</label>
        <textarea id="pp-mine" rows={5} maxLength={6000} value={mineText} onChange={(e) => { setMineText(e.target.value); setRes(null); }}
          placeholder={'Free $0\nStarter $19/mo\nPro $49/mo\nEnterprise $199/mo'} />

        <label htmlFor="pp-theirs">{label}’s pricing — paste their plan rows or drop in their live pricing page URL</label>
        <textarea id="pp-theirs" rows={5} maxLength={6000} value={theirText} onChange={(e) => { setTheirText(e.target.value); setRes(null); }}
          placeholder={'Basic $18/mo\nBusiness $54/mo\n…or https://competitor.com/pricing'} />

        <div style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Comparing…' : 'Compare prices'}</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '8px 0 0' }}>
          {mineLive ? 'Your side will be fetched live.' : mineText.trim() ? `${lineCount(mineText)} of your lines queued.` : ''}
          {mineLive && theirLive ? ' ' : ''}
          {theirLive ? `${label} side will be fetched live from the URL (plans are read from the page text — JS-rendered pages may need a paste).` : theirText.trim() ? `${lineCount(theirText)} of ${label}'s lines queued.` : ' Both sides accepted as text or URL.'}
        </p>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && pairs.length > 0 && (
        <div className="result">
          <h3>You vs {res.comp}{res.theirs.source === 'live' ? ' (live page)' : ''}</h3>
          {res.fetched && res.theirs.source === 'live' ? (
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 0 }}>
              Fetched {res.fetched.host} · HTTP {res.fetched.status} · {res.fetched.plans} plan price{res.fetched.plans === 1 ? '' : 's'} read from the page text.
            </p>
          ) : null}
          <table>
            <thead><tr><th>Your plan</th><th>{res.comp}'s plan</th><th>Matched by</th><th>Price gap</th></tr></thead>
            <tbody>
              {shown.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{p.mine.name} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{money(p.mine.monthly)}/mo</span></td>
                  <td>{p.theirs.name} <span style={{ color: 'var(--ink-3)' }}>{money(p.theirs.monthly)}/mo</span></td>
                  <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.by}</td>
                  <td className={p.verdict === 'match' ? 'pass' : p.verdict === 'cheaper' ? 'pass' : 'warn'}>
                    {p.verdict === 'match' ? 'MATCH' : p.verdict === 'cheaper' ? `CHEAPER ${Math.abs(p.diffPct)}%` : `PRICIER ${p.diffPct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{hidden} further aligned pair{hidden > 1 ? 's' : ''} hidden in the preview.</p>}

          {(res.gaps.theirsOnly.length > 0 || res.gaps.mineOnly.length > 0) && (
            <table>
              <thead><tr><th>Coverage gap</th><th>Detail</th></tr></thead>
              <tbody>
                {res.gaps.theirsOnly.map((g, i) => (
                  <tr key={`t${i}`}><td className="fail">They have, you don't</td><td>{g.name} · {money(g.monthly)}/mo</td></tr>
                ))}
                {res.gaps.mineOnly.map((g, i) => (
                  <tr key={`m${i}`}><td className="warn">You have, they don't</td><td>{g.name} · {money(g.monthly)}/mo</td></tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Positioning calls</p>
          <ul>{res.tips.map((t, i) => <li key={i} style={{ margin: '6px 0' }}>{t}</li>)}</ul>

          {res.anchorTip && (
            <>
              <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Price-anchor tip</p>
              <p style={{ margin: 0 }}>{res.anchorTip}</p>
            </>
          )}

          <p className="cap-note">
            Free preview compares {Math.min(3, pairs.length)} aligned rows, once, manually pasted. PricePulse paid watches the competitor page
            continuously and sends you the old-vs-new diff the moment they change a price.
          </p>
        </div>
      )}
    </>
  );
}
