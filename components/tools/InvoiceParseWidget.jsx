'use client';
import { useState } from 'react';

const SAMPLE = `TAX INVOICE
Abet Technologies Pvt Ltd
06AAGCE2703D1Z9
Invoice No: ATL/2024-25/0142
Invoice Date: 14/08/2024
Place: Gurugram, HR

HSN/SAC  Description  Qty  Rate  Taxable
998314   Cloud seats   10   1200  12000.00

Taxable Value: ₹12000.00
CGST @ 9%      ₹1080.00
SGST @ 9%      ₹1080.00
Grand Total: ₹14160.00`;

const money = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function InvoiceParseWidget() {
  const [text, setText] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/invoiceparse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Parse failed.');
      else setRes(j);
    } catch { setErr('Network error — try again.'); }
    setBusy(false);
  }

  const fieldRows = res ? [
    ['Vendor name', res.fields.vendor, res.fields.vendor ? 'pass' : 'warn'],
    ['GSTIN', res.fields.gstin ? `${res.fields.gstin}${res.fields.gstinStateCode ? ` · state ${res.fields.gstinStateCode}` : ''}` : null, null],
    ['Invoice number', res.fields.invoiceNumber, res.fields.invoiceNumber ? 'pass' : 'warn'],
    ['Invoice date', res.fields.invoiceDate ? `${res.fields.invoiceDate}${res.fields.invoiceDateRaw ? ` (from “${res.fields.invoiceDateRaw}”)` : ''}` : null, res.fields.invoiceDateValid ? 'pass' : res.fields.invoiceDate ? 'warn' : 'fail'],
    ['Currency', res.fields.currency, res.fields.currency ? (res.fields.currency.includes('+') ? 'fail' : 'pass') : 'warn'],
    ['E-invoice IRN', res.fields.irn, res.fields.irn ? 'pass' : null],
    ['Taxable value', money(res.fields.taxable), res.fields.taxable != null ? 'pass' : 'warn'],
    ['IGST', money(res.fields.igst), null],
    ['CGST', money(res.fields.cgst), null],
    ['SGST / UTGST', money(res.fields.sgst), null],
    ['Total', money(res.fields.total ?? null), res.fields.total != null ? 'pass' : 'warn'],
  ] : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="inv-text">Raw invoice text (open the PDF, Ctrl+A, Ctrl+C, paste here)</label>
        <textarea id="inv-text" rows={12} maxLength={20000} value={text}
          onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} />
        <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '6px 0' }}>{(text || '').length} chars · free preview parses 1 invoice</p>
        <button className="btn" type="submit" disabled={busy || !text.trim()}>{busy ? 'Extracting…' : 'Extract &amp; validate'}</button>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <p style={{ margin: 0 }}>
            <span className="score-big">{res.grade}</span>
            <span style={{ color: 'var(--ink-3)' }}> grade · {res.score} / 100 invoice trust score{res.invoiceCount > 1 ? ` · ${res.invoiceCount} invoices detected in this paste` : ''}</span>
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>via {res.source === 'ai' ? 'AI + checksum engine' : 'deterministic engine'}</span>
          </p>

          <h3 style={{ marginTop: 14 }}>Extracted fields</h3>
          <table>
            <thead><tr><th>Field</th><th>Value</th></tr></thead>
            <tbody>
              {fieldRows.map(([k, v, st]) => (
                <tr key={k}>
                  <td style={{ fontWeight: 700 }}>{k}</td>
                  <td className={st || undefined} style={{ wordBreak: 'break-word' }}>{v == null ? <span style={{ color: 'var(--ink-3)' }}>not found</span> : v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {res.fields.lineItems && res.fields.lineItems.length > 0 && (
            <>
              <h3>Line items ({res.fields.lineItems.length} rows)</h3>
              <table>
                <thead><tr><th>HSN/SAC</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                <tbody>
                  {res.fields.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td>{li.hsn || <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                      <td style={{ fontWeight: 700 }}>{li.desc}</td>
                      <td>{li.qty ?? '—'}</td>
                      <td>{money(li.rate)}</td>
                      <td className={li.qty != null && li.rate != null && Math.abs(li.qty * li.rate - li.amount) > 1 ? 'fail' : undefined}>{money(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Validation</h3>
          <table>
            <thead><tr><th>Check</th><th>Result</th><th>Why</th></tr></thead>
            <tbody>
              {res.checks.map((c) => (
                <tr key={c.key}>
                  <td style={{ fontWeight: 700 }}>{c.key}</td>
                  <td className={c.state}>{c.state.toUpperCase()}</td>
                  <td>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="cap-note">
            Free preview validates one pasted invoice, {res.capped ? 'truncated at 20,000 chars, ' : ''}with the real GSTIN check-code algorithm.
            InvoiceParse paid takes bulk PDF uploads, extracts line items per row, flags duplicate invoice numbers across vendors, and exports
            straight to Tally/QuickBooks/Zoho Books.
          </p>
        </div>
      )}
    </>
  );
}
