'use client';
import { useState } from 'react';

const CURRENCIES = {
  INR: { locale: 'en-IN', label: 'INR — Indian Rupee (₹)', symbol: '₹' },
  USD: { locale: 'en-US', label: 'USD — US Dollar ($)', symbol: '$' },
  EUR: { locale: 'de-DE', label: 'EUR — Euro (€)', symbol: '€' },
  GBP: { locale: 'en-GB', label: 'GBP — Pound Sterling (£)', symbol: '£' },
  AED: { locale: 'en-AE', label: 'AED — UAE Dirham (د.إ)', symbol: 'د.إ' },
};

const GST_RATE = 0.18;
const VALIDITY_DAYS = 21;
const PREVIEW_ITEMS = 6;

const PAYMENT_TERMS = {
  '50-50': { label: '50% advance / 50% on delivery', short: '50/50 split' },
  net30: { label: 'Net 30 days from delivery invoice', short: 'net 30' },
  milestone: { label: 'Milestones: 30% kickoff / 40% design sign-off / 30% launch', short: 'milestone (30/40/30)' },
};

const EXCLUSIONS = [
  'Third-party licences, hosting, theme or plugin fees (billed at cost if required).',
  'Copy, imagery, product data and brand assets — supplied by you, ready to use.',
  'Anything not itemised in the scope table above is handled as a change order.',
  'Statutory taxes other than the GST lines shown, and any client-side legal review.',
];

function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(base, days) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function parseItems(raw) {
  const items = [], bad = [];
  const lines = String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const parts = line.split('|').map((p) => p.trim());
    const qty = Number(parts[1]);
    const rate = Number(parts[2]);
    if (parts.length !== 3 || parts[0].length < 2 || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) {
      bad.push(`Line ${i + 1}: “${line.slice(0, 60)}” — needs “description | qty | rate” with positive numbers`);
      return;
    }
    items.push({ desc: parts[0], qty, rate, amount: qty * rate, taxable: true });
  });
  return { items, bad };
}

// “₹5,000” / “5000” → absolute; “10%” / “10 percent” → share of subtotal.
function parseDiscount(raw, subtotal, currency) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return { amount: 0, kind: null, note: '' };
  const pct = s.match(/^(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|percent|per\s?cent)$/);
  if (pct) {
    const p = Math.min(50, Math.max(0, Number(pct[1])));
    return { amount: subtotal * p / 100, kind: 'percent', note: `${p}% off subtotal` };
  }
  const cleaned = s.replace(/[^0-9.]/g, '');
  const amt = Number(cleaned);
  if (!cleaned || !Number.isFinite(amt) || amt <= 0) return { amount: 0, kind: 'invalid', note: `“${raw}” is not a discount — use an amount like ${CURRENCIES[currency].symbol}5000 or a percent like 10%` };
  const capped = Math.min(amt, subtotal);
  return { amount: capped, kind: 'amount', note: `${CURRENCIES[currency].symbol}${capped.toLocaleString(CURRENCIES[currency].locale)} off subtotal` };
}

function computeTotals(items, discountAmount) {
  const subtotal = items.reduce((a, it) => a + it.amount, 0);
  const factor = subtotal > 0 ? 1 - Math.min(discountAmount, subtotal) / subtotal : 1;
  const lines = items.map((it) => {
    const net = it.amount * factor;
    const tax = it.taxable ? net * GST_RATE : 0;
    return { ...it, net, tax, lineTotal: net + tax };
  });
  const taxable = lines.reduce((a, l) => a + l.net, 0);
  const untaxed = lines.reduce((a, l) => a + (l.taxable ? 0 : l.net), 0);
  const gst = lines.reduce((a, l) => a + l.tax, 0);
  const total = taxable + untaxed + gst;
  return { subtotal, taxable, untaxed, gst, total, lines };
}

export default function QuoteCraftWidget() {
  const [client, setClient] = useState('');
  const [service, setService] = useState('');
  const [items, setItems] = useState('Homepage redesign & build | 1 | 45000\nCore page templates (6) | 6 | 6500\nSEO + performance pass | 1 | 12000');
  const [weeks, setWeeks] = useState('6');
  const [currency, setCurrency] = useState('INR');
  const [discount, setDiscount] = useState('');
  const [validUntil, setValidUntil] = useState(() => isoDate(addDays(new Date(), VALIDITY_DAYS)));
  const [payTerms, setPayTerms] = useState('50-50');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const money = (n, cur = currency) => new Intl.NumberFormat(CURRENCIES[cur].locale, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n);

  function buildTerms(r) {
    const terms = [];
    if (r.payKey === '50-50') {
      terms.push(`1. Payment: 50% advance (${money(r.total * 0.5)}) to schedule, 50% (${money(r.total * 0.5)}) on delivery and acceptance.`);
    } else if (r.payKey === 'net30') {
      terms.push(`1. Payment: net 30 — the full ${money(r.total)} is invoiced on delivery and due within 30 days.`);
    } else {
      terms.push(`1. Payment: milestone schedule — 30% (${money(r.total * 0.3)}) at kickoff, 40% (${money(r.total * 0.4)}) at design sign-off, 30% (${money(r.total * 0.3)}) at launch.`);
    }
    terms.push('2. Late payment: 12% per annum interest on amounts overdue by more than 14 days.');
    terms.push(`3. Validity: this quote holds until ${r.validUntilText}; after that rates are re-confirmed.`);
    terms.push('4. Exclusions:');
    EXCLUSIONS.forEach((x) => terms.push(`   - ${x}`));
    terms.push('5. Out-of-scope requests are quoted as change orders before work starts.');
    return terms.join('\n');
  }

  function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setCopied(false); setEditing(null);
    const c = client.trim().slice(0, 60);
    const s = service.trim().slice(0, 400);
    if (!c) { setErr('Enter the client name for the proposal.'); return; }
    if (s.length < 10) { setErr('Describe the service in a line or two (10+ characters).'); return; }
    const w = Number(weeks);
    if (!Number.isFinite(w) || w < 1 || w > 52) { setErr('Timeline must be between 1 and 52 weeks.'); return; }
    const { items: list, bad } = parseItems(items);
    if (bad.length) { setErr(`Line items must read “description | qty | rate”. Fix these:\n${bad.slice(0, 5).join('\n')}`); return; }
    if (!list.length) { setErr('Add at least one line item.'); return; }

    const subtotalPreview = list.reduce((a, it) => a + it.amount, 0);
    const disc = parseDiscount(discount, subtotalPreview, currency);
    if (disc.kind === 'invalid') { setErr(disc.note); return; }

    const today = new Date();
    const vDate = new Date(`${validUntil}T12:00:00`);
    const validText = Number.isFinite(vDate.getTime()) && vDate > today
      ? fmtDate(vDate)
      : fmtDate(addDays(today, VALIDITY_DAYS));
    const validIsoUsed = Number.isFinite(vDate.getTime()) && vDate > today ? validUntil : isoDate(addDays(today, VALIDITY_DAYS));

    const totals = computeTotals(list, disc.amount);
    const base = {
      ref: `QC-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(Math.round(totals.total)).slice(-4)}`,
      client: c, service: s, items: list, weeks: w, currency,
      payKey: payTerms,
      discountNote: disc.note, discountAmount: disc.amount,
      issued: fmtDate(today),
      validUntil: validIsoUsed, validUntilText: validText,
      delivery: fmtDate(addDays(today, Math.round(w * 7))),
      ...totals,
    };
    base.scopeText = `Scope.\n${s}`;
    base.timelineText = `Timeline.\n${w} week${w === 1 ? '' : 's'} from kickoff — delivery target ${base.delivery}.`;
    base.termsText = buildTerms(base);
    setRes(base);
  }

  function toggleTax(i) {
    if (!res) return;
    const next = res.items.map((it, j) => (j === i ? { ...it, taxable: !it.taxable } : it));
    const totals = computeTotals(next, res.discountAmount);
    const r = { ...res, items: next, ...totals };
    r.termsText = buildTerms(r);
    setRes(r);
  }

  function editSection(key) {
    setEditing(key);
    setDraft(res[key]);
  }

  function saveSection(key) {
    const v = draft.trim();
    if (!v) { setEditing(null); return; }
    setRes((r) => ({ ...r, [key]: v }));
    setEditing(null);
  }

  function proposalText() {
    const r = res;
    const rows = r.lines.map((it) => `  • ${it.desc} — ${it.qty} × ${money(it.rate)} = ${money(it.amount)}${it.taxable ? '' : '  (no GST)'}`).join('\n');
    const discLine = r.discountAmount > 0 ? [`Discount: -${money(r.discountAmount)} (${r.discountNote})`] : [];
    const gstLine = r.lines.some((l) => l.taxable)
      ? `GST @${GST_RATE * 100}% on taxable lines: ${money(r.gst)}`
      : 'GST: 0 — no taxable line items';
    return [
      `QUOTE ${r.ref} — prepared for ${r.client}`,
      `Issued ${r.issued} · valid until ${r.validUntilText} · currency ${currency}`,
      '',
      r.scopeText.replace(/^Scope\.\n/, 'SCOPE OF WORK\n'),
      '',
      'LINE ITEMS',
      rows,
      `Subtotal: ${money(r.subtotal)}`,
      ...discLine,
      gstLine,
      `TOTAL: ${money(r.total)}`,
      '',
      r.timelineText.replace(/^Timeline\.\n/, 'TIMELINE\n'),
      '',
      'TERMS',
      r.termsText,
    ].join('\n');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(proposalText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setErr('Your browser blocked clipboard access — select the text and copy manually.'); }
  }

  function downloadTxt() {
    const blob = new Blob([proposalText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${res.ref}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const shown = res ? res.lines.slice(0, PREVIEW_ITEMS) : [];

  const section = (key, title, node) => (
    <div style={{ position: 'relative' }}>
      {editing === key ? (
        <>
          <textarea rows={key === 'termsText' ? 9 : 3} value={draft} onChange={(e) => setDraft(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }} aria-label={`Edit ${title}`} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }} className="qc-no-print">
            <button type="button" className="btn secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => saveSection(key)}>Save</button>
            <button type="button" className="btn secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {node}
          <button type="button" className="btn secondary qc-edit-btn qc-no-print" onClick={() => editSection(key)}
            style={{ position: 'absolute', top: 0, right: 0, padding: '2px 9px', fontSize: 11 }}>Edit</button>
        </>
      )}
    </div>
  );

  return (
    <>
      <form onSubmit={run}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label htmlFor="client">Client name</label>
            <input id="client" type="text" placeholder="e.g. Kettle & Co. Retail" value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="currency">Currency</label>
            <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {Object.entries(CURRENCIES).map(([code, v]) => <option key={code} value={code}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 1 130px' }}>
            <label htmlFor="weeks">Timeline (weeks)</label>
            <input id="weeks" type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </div>
        </div>

        <label htmlFor="service" style={{ marginTop: 12, display: 'block' }}>Service / scope summary</label>
        <input id="service" type="text" placeholder="e.g. Shopify storefront rebuild with SEO migration" value={service}
          onChange={(e) => setService(e.target.value)} />

        <label htmlFor="lines" style={{ marginTop: 12, display: 'block' }}>Line items — one per line as “description | qty | rate”</label>
        <textarea id="lines" rows={5} value={items} onChange={(e) => setItems(e.target.value)} />
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
          {String(items).split('\n').filter((l) => l.trim()).length} line item(s) · GST {GST_RATE * 100}% on lines you mark taxable · discount and terms below
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="discount" style={{ marginTop: 0 }}>Discount ({CURRENCIES[currency].symbol} or %)</label>
            <input id="discount" type="text" placeholder={`e.g. ${CURRENCIES[currency].symbol}5000 or 10%`} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <label htmlFor="valid" style={{ marginTop: 0 }}>Valid until</label>
            <input id="valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label htmlFor="payterms" style={{ marginTop: 0 }}>Payment terms</label>
            <select id="payterms" value={payTerms} onChange={(e) => setPayTerms(e.target.value)}>
              {Object.entries(PAYMENT_TERMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn">Build the quote</button>
          {res && <button type="button" className="btn secondary" onClick={() => window.print()}>Print / save as PDF</button>}
          {res && <button type="button" className="btn secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy as text'}</button>}
          {res && <button type="button" className="btn secondary" onClick={downloadTxt}>Download .txt</button>}
        </div>
      </form>

      {err && <p className="error-note" style={{ whiteSpace: 'pre-line' }}>{err}</p>}

      {res && (
        <div className="result">
          <div id="quotecraft-print" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 18 }}>
            {res.items.length > 2 && (
              <div style={{
                textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
                color: 'var(--ink-3)', borderBottom: '1px dashed var(--line)', paddingBottom: 6, marginBottom: 10,
              }}>
                Abetworks QuoteCraft · free preview document · no accept-tracking or e-sign
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '2px solid var(--ink)', paddingBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Quote {res.ref}</h3>
                <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Prepared for {res.client}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-3)' }}>
                <div>Issued: {res.issued}</div>
                <div>Valid until: <strong style={{ color: 'var(--ink)' }}>{res.validUntilText}</strong></div>
                <div>Currency: {res.currency}</div>
                <div>Payment: {PAYMENT_TERMS[res.payKey].short}</div>
              </div>
            </div>

            {section('scopeText', 'Scope', (
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: '12px 0', paddingRight: 54 }}>
                <strong>Scope.</strong> {res.scopeText.replace(/^Scope\.\n/, '')}
              </p>
            ))}

            <table>
              <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th className="qc-no-print">GST 18%</th><th>Net line</th></tr></thead>
              <tbody>
                {shown.map((it, i) => (
                  <tr key={i}>
                    <td>{it.desc}</td>
                    <td>{it.qty}</td>
                    <td>{money(it.rate)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(it.amount)}</td>
                    <td className="qc-no-print">
                      <input type="checkbox" checked={it.taxable} onChange={() => toggleTax(i)} aria-label={`Apply GST to ${it.desc}`} style={{ cursor: 'pointer' }} />
                      <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 6 }}>{it.taxable ? 'taxed' : 'exempt'}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {money(it.net + it.tax)}
                      {!it.taxable && <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>no GST</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {res.items.length > shown.length && (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
                {res.items.length - shown.length} more line item(s) in the totals — the free document shows {shown.length}.
              </p>
            )}

            <div style={{ marginTop: 12, fontSize: 14, maxWidth: 340, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(res.subtotal)}</span></div>
              {res.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--free)' }}>
                  <span>Discount ({res.discountNote})</span><span>−{money(res.discountAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>GST @{GST_RATE * 100}% {res.lines.some((l) => !l.taxable) ? '(taxable lines only)' : ''}</span>
                <span>{money(res.gst)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6, fontWeight: 800, fontSize: 16 }}>
                <span>Total</span><span>{money(res.total)}</span>
              </div>
            </div>

            {section('timelineText', 'Timeline', (
              <p style={{ fontSize: 14, margin: '14px 0 4px', paddingRight: 54 }}>
                <strong>Timeline.</strong> {res.timelineText.replace(/^Timeline\.\n/, '')}
              </p>
            ))}

            {section('termsText', 'Terms', (
              <>
                <h4 style={{ margin: '16px 0 4px', fontSize: 14, paddingRight: 54 }}>Terms</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{res.termsText}</pre>
              </>
            ))}
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>View plain-text proposal</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginTop: 8 }}>{proposalText()}</pre>
          </details>

          <p className="cap-note">
            Free preview builds one quote document with {shown.length} of {res.items.length} line items and no tracking.
            The planned QuoteCraft adds a unique accept-URL with open/view tracking, your branding and letterhead, unlimited quotes
            and revision history — planned from $12/mo.
          </p>
        </div>
      )}

      {res && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #quotecraft-print, #quotecraft-print * { visibility: visible !important; }
            #quotecraft-print .qc-no-print { display: none !important; }
            #quotecraft-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; background: #fff; border: none !important; }
            #quotecraft-print table { width: 100%; }
          }
        `}</style>
      )}
    </>
  );
}
