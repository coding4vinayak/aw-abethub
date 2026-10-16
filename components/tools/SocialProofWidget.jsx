'use client';
import { useEffect, useMemo, useState } from 'react';
import { parseCSV, num } from '../../lib/parse';

// Upgraded along the WiserNotify / Proof / TestFreak playbook:
// time-window filtering, per-row proof-type detection, frequency + scroll
// controls in the embed JSON, and the industry ethics default of hiding
// negative or thin-count proof instead of faking popularity.

const sanitize = (s) => String(s ?? '').replace(/[<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

const TYPES = {
  purchase: { label: 'Purchase', sym: '●', color: '#059669' },
  signup: { label: 'Sign-up', sym: '✓', color: 'var(--accent)' },
  review: { label: 'Review', sym: '★', color: '#b45309' },
};

const NEGATIVE = /\b(refund|cancel|churn|downgrade|complaint|removed|failed|left|unsubscrib\w*)\b/i;

function pickCol(headers, candidates) {
  for (const c of candidates) {
    const h = headers.find((x) => x === c) || headers.find((x) => x.includes(c));
    if (h) return h;
  }
  return null;
}

// Age in ms, two ways: real dates (ISO / dd/mm patterns) and relative numbers
// (minutes under a day, days beyond — same convention the copy uses).
function ageMs(raw) {
  const v = sanitize(raw).toLowerCase();
  if (!v) return null;
  const rel = v.match(/^(\d+(?:\.\d+)?)\s*(minute|min|m|hour|hr|h|day|d)?\b/);
  const n = num(v.replace(/[^0-9.\-]/g, ''));
  if (/ago|since|last/.test(v) && n != null && n > 0) {
    if (/hour/.test(v)) return n * 3600e3;
    if (/day/.test(v)) return n * 86400e3;
    return (n < 1440 ? n : n * 1440) * 60e3;
  }
  if (/\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(v)) {
    const t = Date.parse(v.replace(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/, '$3-$1-$2'));
    if (Number.isFinite(t)) return Math.max(0, Date.now() - t);
  }
  if (n != null && n > 0) return n < 1440 ? n * 60e3 : n * 86400e3;
  return null;
}

function timeAgoFromMs(ms) {
  if (ms == null) return null;
  if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60e3))} minutes ago`;
  if (ms < 86400e3) return `${Math.round(ms / 3600e3)} hours ago`;
  return `${Math.round(ms / 86400e3)} days ago`;
}

// Proof type per row: explicit event column first, then column-hint inference
// (rating → review, plan/signup hints → sign-up, money → purchase).
function detectType(r, cols) {
  if (cols.type != null) {
    const t = sanitize(r[cols.type]).toLowerCase();
    if (/purchas|order|paid|deal|sale|subscri/.test(t)) return 'purchase';
    if (/signup|sign-up|register|trial|plan|account/.test(t)) return 'signup';
    if (/review|rating|star|testimonial|feedback/.test(t)) return 'review';
  }
  const rating = cols.rating != null ? num(r[cols.rating]) : null;
  if (rating != null && rating > 0) return 'review';
  const hint = `${cols.product != null ? r[cols.product] : ''} ${cols.type != null ? r[cols.type] : ''}`.toLowerCase();
  if (/trial|starter|signup|basic account/.test(hint)) return 'signup';
  const amount = cols.amount != null ? num(r[cols.amount]) : null;
  if (amount != null && amount > 0) return 'purchase';
  return 'signup';
}

function buildCopy(r, cols) {
  const who = sanitize(r[cols.who]) || 'A new customer';
  const product = sanitize(r[cols.product]) || 'the plan';
  const city = sanitize(r[cols.city]);
  const amount = cols.amount != null ? num(r[cols.amount]) : null;
  const rating = cols.rating != null ? num(r[cols.rating]) : null;
  const ms = cols.time != null ? ageMs(r[cols.time]) : null;
  const ago = timeAgoFromMs(ms);
  const type = detectType(r, cols);
  let headline;
  if (type === 'review') headline = `${who} left ${rating ? `${Math.round(rating)}★ ` : 'a '}review on ${product}`;
  else if (type === 'signup') headline = `${who}${city ? ` in ${city}` : ''} just signed up for ${product}`;
  else headline = `${who}${city ? ` in ${city}` : ''} just got ${product}`;
  const detail = [amount != null && amount > 0 ? `$${Math.round(amount).toLocaleString()} deal` : null, ago].filter(Boolean).join(' · ');
  return { headline: headline.slice(0, 90), detail: detail.slice(0, 60), type, ms, amount, rating, rawNegative: NEGATIVE.test(`${who} ${product} ${cols.type != null ? r[cols.type] : ''}`) || (amount != null && amount < 0) || (rating != null && rating > 0 && rating <= 2) };
}

const STYLES = {
  bubble: { name: 'Bubble', wrap: { position: 'relative', padding: '14px 16px', borderRadius: 14, background: '#fff', border: '1px solid var(--line)', boxShadow: '0 6px 20px rgba(17,24,39,.10)', maxWidth: 340 }, blurb: 'bottom-left card, soft shadow — highest CTR on content pages' },
  toast: { name: 'Toast', wrap: { padding: '11px 16px', borderRadius: 10, background: 'var(--ink)', color: '#fff', maxWidth: 380, display: 'flex', justifyContent: 'space-between', gap: 12 }, blurb: 'top-right dark strip, auto-dismiss — best for utilities' },
  banner: { name: 'Banner', wrap: { padding: '10px 16px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid #c7d2fe', maxWidth: 460, textAlign: 'center', fontWeight: 600 }, blurb: 'site-wide bar above the fold — best for pricing pages' },
};

function Popup({ style, item }) {
  const s = STYLES[style];
  const t = TYPES[item.type] || TYPES.purchase;
  return (
    <div>
      <div style={s.wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', padding: '1px 7px', borderRadius: 999, background: style === 'toast' ? 'rgba(255,255,255,.14)' : 'var(--free-soft)', color: style === 'toast' ? '#e5e7eb' : t.color }}>
            {t.sym} {t.label}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{item.headline}</span>
        </div>
        {item.detail ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{item.detail}</div> : null}
        {style !== 'toast' ? null : <span style={{ fontSize: 12, opacity: 0.6, alignSelf: 'center' }}>SocialProof</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 5 }}>{s.blurb}</div>
    </div>
  );
}

const WINDOWS = [
  { key: 'all', label: 'All time', ms: Infinity },
  { key: '24h', label: 'Last 24h', ms: 86400e3 },
  { key: '7d', label: 'Last 7 days', ms: 7 * 86400e3 },
];

export default function SocialProofWidget() {
  const [parsed, setParsed] = useState(null); // { all, hasDates, rows }
  const [rows, setRows] = useState(0);
  const [err, setErr] = useState('');
  const [idx, setIdx] = useState(0);
  const [win, setWin] = useState('all');
  const [showEvery, setShowEvery] = useState(4000);
  const [scrollBehavior, setScrollBehavior] = useState('cycle');

  const items = useMemo(() => {
    if (!parsed) return [];
    const w = WINDOWS.find((x) => x.key === win) || WINDOWS[0];
    // negative-proof exclusion: refunds, cancellations, 1–2★ ratings never show
    const clean = parsed.all.filter((it) => !it.rawNegative);
    const within = w.ms === Infinity ? clean : clean.filter((it) => it.ms != null && it.ms <= w.ms);
    return within.slice(0, 3);
  }, [parsed, win]);

  const excluded = parsed ? parsed.all.filter((it) => it.rawNegative).length : 0;

  useEffect(() => {
    if (items.length < 2) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), showEvery);
    return () => clearInterval(t);
  }, [items, showEvery]);

  const embed = useMemo(() => (items.length ? JSON.stringify({
    widget: 'socialproof-embed',
    version: 2,
    branding: 'hub-preview',
    showEvery: showEvery,
    refreshMs: showEvery,
    scrollBehavior: scrollBehavior,
    timeWindow: win,
    hideRule: { minVisibleCount: 5, onBelow: 'pause', reason: 'thin or negative proof erodes trust — hide, never fake' },
    styles: Object.keys(STYLES),
    events: items.map((it) => ({ text: it.headline, detail: it.detail, type: it.type })),
  }, null, 2) : ''), [items, showEvery, scrollBehavior, win]);

  async function onFile(e) {
    setErr(''); setParsed(null); setRows(0); setIdx(0); setWin('all');
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr('Keep files under 8MB.'); return; }
    const { headers, records } = parseCSV(await f.text());
    if (records.length < 1) { setErr('Need a header row and at least 1 data row.'); return; }
    const cols = {
      who: pickCol(headers, ['customer', 'name', 'company', 'account', 'full_name', 'who']),
      product: pickCol(headers, ['product', 'plan', 'package', 'item', 'service', 'sku']),
      city: pickCol(headers, ['city', 'location', 'country', 'region', 'place']),
      amount: pickCol(headers, ['amount', 'value', 'price', 'total', 'arr', 'mrr', 'deal']),
      time: pickCol(headers, ['time', 'ago', 'when', 'date', 'purchased', 'created', 'updated', 'minutes', 'days', 'timestamp']),
      type: pickCol(headers, ['type', 'event', 'category', 'kind', 'action']),
      rating: pickCol(headers, ['rating', 'stars', 'score']),
    };
    if (cols.who == null && cols.product == null) {
      setErr(`Couldn’t find a customer or product column. Headers seen: ${headers.join(', ')}.`);
      return;
    }
    const built = records.map((r) => buildCopy(r, cols)).filter((it) => it.headline);
    const hasDates = cols.time != null && built.some((it) => it.ms != null);
    setRows(records.length);
    setParsed({ all: built, hasDates });
  }

  return (
    <>
      <label htmlFor="sp-csv">Customer activity CSV (stays in your browser — nothing uploaded)</label>
      <input id="sp-csv" type="file" accept=".csv,text/csv" onChange={onFile} />
      {err && <p className="error-note">{err}</p>}

      {parsed && parsed.all.length > 0 && (
        <div className="result" style={{ marginTop: 18 }}>
          <h3>Live preview — {items.length} popup{items.length > 1 ? 's' : ''} cycling every {Math.round(showEvery / 100) / 10}s{rows > items.length ? ` · built from ${rows} rows` : ''}</h3>
          {parsed.hasDates ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 10px' }}>
              {WINDOWS.map((w) => (
                <button key={w.key} type="button" className={w.key === win ? 'btn' : 'btn secondary'}
                  style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { setWin(w.key); setIdx(0); }}>{w.label}</button>
              ))}
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--ink-3)' }}>date column detected — window filter on</span>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 10px' }}>No parsable date column found — window filter disabled.</p>
          )}
          {items.length === 0 ? (
            <p style={{ color: 'var(--ink-3)' }}>Nothing left in {WINDOWS.find((w) => w.key === win)?.label.toLowerCase()} after the negative-proof exclusion — widen the window or check the file.</p>
          ) : (
            <>
              {items.map((it, i) => (
                <div key={i} style={{ margin: '16px 0' }}>
                  <Popup style={Object.keys(STYLES)[i % 3]} item={items[(idx + i) % items.length]} />
                </div>
              ))}

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0' }}>
                <div>
                  <label htmlFor="sp-freq" style={{ fontSize: 12 }}>Show every</label>
                  <select id="sp-freq" value={showEvery} onChange={(e) => setShowEvery(Number(e.target.value))}>
                    <option value={3000}>3 s</option><option value={4000}>4 s</option><option value={6000}>6 s</option><option value={8000}>8 s</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="sp-scroll" style={{ fontSize: 12 }}>Scroll behavior</label>
                  <select id="sp-scroll" value={scrollBehavior} onChange={(e) => setScrollBehavior(e.target.value)}>
                    <option value="cycle">keep cycling</option>
                    <option value="pause-on-hover">pause on hover</option>
                    <option value="show-on-scroll">re-show on scroll into view</option>
                  </select>
                </div>
              </div>

              {(excluded > 0 || items.length < 5) && (
                <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '6px 0' }}>
                  Ethics defaults active: {excluded > 0 ? `${excluded} negative row${excluded > 1 ? 's' : ''} (refund / cancel / 1–2★) excluded. ` : ''}
                  {items.length < 5 ? `Visible count ${items.length} is under 5 — real tools pause the widget rather than inflate small numbers; this preview keeps showing them labelled as a preview only.` : 'Count looks healthy — production widget would show.'}
                </p>
              )}

              <h4 style={{ margin: '20px 0 6px', fontSize: 14 }}>Embed config</h4>
              <pre style={{ margin: 0, padding: '12px 14px', borderRadius: 10, background: 'var(--ink)', color: '#e5e7eb', fontSize: 12, overflowX: 'auto', lineHeight: 1.5 }}>{embed}</pre>
            </>
          )}
          <p className="cap-note">Free preview: 3 rows. The planned SocialProof pulls a live data feed, adds targeting/frequency rules, and removes the branding tag.</p>
        </div>
      )}
    </>
  );
}
