'use client';
import { useState } from 'react';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const DAY = 86400000;

// Late-fee slabs corrected against CBIC sources (verified 2026-09):
// • GSTR-3B — ₹50/day (₹20/day for nil returns), capped ₹5,000 per return
//   (Notification No. 46/2020-Central Tax, from 02.10.2020).
// • GSTR-1 — ₹100/day for aggregate turnover ≤ ₹5 Cr, ₹200/day above it,
//   capped ₹5,000 per return (Notification No. 64/2019-Central Tax).
// The old widget wrongly billed everything at ₹50/day.
function lateFee(daysLate, perDay, capMonth = 5000) {
  if (daysLate <= 0 || perDay <= 0) return 0;
  const fullMonths = Math.floor(daysLate / 30);
  const rem = daysLate % 30;
  return fullMonths * Math.min(30 * perDay, capMonth) + Math.min(rem * perDay, capMonth);
}

// Next monthly GSTR-3B due: 20th of the month after the month you last filed in.
function nextDue(last) {
  const d = new Date(last.getTime());
  d.setMonth(d.getMonth() + 1, 20);
  d.setHours(0, 0, 0, 0);
  return d;
}

const parseOpt = (v) => (String(v).trim() === '' ? null : parseFloat(v));

export default function TaxReadyWidget() {
  const [f, setF] = useState({ gstr1Tax: '', itc2b: '', net3b: '', turnover: '', lastFiling: '', cashPaid: '', itcUsed: '', supplierDays: '', tdsCredit: '', tcsCredit: '' });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function run(e) {
    e.preventDefault();
    setErr(''); setRes(null);
    const gstr1Tax = parseFloat(f.gstr1Tax), itc2b = parseFloat(f.itc2b), net3b = parseFloat(f.net3b), turnover = parseFloat(f.turnover);
    const cashPaid = parseOpt(f.cashPaid), itcUsed = parseOpt(f.itcUsed), supplierDays = parseOpt(f.supplierDays), tdsCredit = parseOpt(f.tdsCredit), tcsCredit = parseOpt(f.tcsCredit);
    const last = f.lastFiling ? new Date(`${f.lastFiling}T00:00:00`) : null;
    if ([gstr1Tax, itc2b, net3b, turnover].some((v) => !Number.isFinite(v))) { setErr('Fill GSTR-1 tax, GSTR-2B ITC, GSTR-3B net liability and turnover as numbers.'); return; }
    if ([gstr1Tax, itc2b, turnover].some((v) => v < 0)) { setErr('Tax, ITC and turnover cannot be negative.'); return; }
    if ([cashPaid, itcUsed, supplierDays, tdsCredit, tcsCredit].some((v) => v != null && (!Number.isFinite(v) || v < 0))) { setErr('Optional fields (cash/ITC paid, supplier days, TDS/TCS) must be non-negative numbers — or leave them blank.'); return; }
    if (!last || Number.isNaN(last.getTime())) { setErr('Enter your last-filing date.'); return; }
    if (last.getTime() > Date.now() + DAY) { setErr('Last-filing date is in the future.'); return; }

    const impliedClaim = gstr1Tax - net3b;
    const expectedNet = gstr1Tax - itc2b;
    const mismatch = net3b - expectedNet;
    const daysLate = Math.max(0, Math.round((Date.now() - nextDue(last).getTime()) / DAY));
    const checks = [];
    const push = (sev, w, title, detail) => checks.push({ sev, w, title, detail });

    // 1. ITC claimed (implied) vs 2B available
    if (impliedClaim > itc2b + 1) push('fail', 15, 'ITC claimed exceeds GSTR-2B', `${inr(impliedClaim)} implied vs ${inr(itc2b)} available in 2B — ${inr(impliedClaim - itc2b)} over-claim. Reduce or book it as ineligible.`);
    else if (impliedClaim < 0) push('fail', 15, 'GSTR-3B net exceeds GSTR-1 tax', `Net liability ${inr(net3b)} is above outward tax ${inr(gstr1Tax)} — arithmetic error before filing.`);
    else push('pass', 15, 'ITC within GSTR-2B', `Implied claim ${inr(impliedClaim)} ≤ available ${inr(itc2b)}.`);

    // 2. 3B vs (GSTR-1 − ITC) tolerance ±1
    if (Math.abs(mismatch) <= 1) push('pass', 15, '3B reconciles to GSTR-1 minus ITC', `Difference ${inr(mismatch)} — within ±₹1 tolerance.`);
    else if (Math.abs(mismatch) <= Math.max(1000, expectedNet * 0.02)) push('warn', 15, 'Minor 3B mismatch', `${inr(mismatch)} off from ${inr(expectedNet)} expected net — check rounding or partial ITC.`);
    else push('fail', 15, '3B does not reconcile', `${inr(net3b)} filed vs ${inr(expectedNet)} expected (GSTR-1 ${inr(gstr1Tax)} − 2B ${inr(itc2b)}): ${inr(mismatch)} gap — amend before the window closes.`);

    // 3. Missed ITC not claimed
    if (itc2b > 1000 && impliedClaim <= 1) push('warn', 10, 'Available ITC left unclaimed', `${inr(itc2b)} in 2B but ~${inr(Math.max(0, impliedClaim))} claimed — next period eligible; don’t let it lapse past the deadline.`);
    else if (itc2b > 1000 && impliedClaim < itc2b) push('warn', 10, 'Partial ITC claimed', `Only ${inr(impliedClaim)} of ${inr(itc2b)} used — verify eligibility split (capital goods / 5% blocks).`);
    else push('pass', 10, 'ITC utilisation consistent', 'Claimed ITC matches availability and liability.');

    // 4. Negative liability → refund carryforward note
    if (net3b < -1) push('warn', 10, 'Negative net liability (refund)', `${inr(net3b)} — carry forward or file refund claim; refund claims past the due date attract no interest and delay processing.`);
    else push('pass', 10, 'No refund carryforward issue', 'Net liability is zero or positive.');

    // 5. Late-fee exposure — corrected per-return slabs (3B ₹50/day ≤₹5k cap; GSTR-1 ₹100/₹200 by ₹5 Cr band)
    const fee3b = lateFee(daysLate, net3b === 0 ? 20 : 50);
    const perDay1 = turnover > 5e7 ? 200 : 100;
    const fee1 = lateFee(daysLate, perDay1);
    if (daysLate > 0) push(fee3b + fee1 >= 10000 ? 'fail' : 'warn', 15, 'Late-fee exposure', `${daysLate} day(s) past the 20th-of-month due date → GSTR-3B ${inr(fee3b)} at ₹${net3b === 0 ? 20 : 50}/day + GSTR-1 ${inr(fee1)} at ₹${perDay1}/day (turnover ${turnover > 5e7 ? 'above' : 'up to'} ₹5 Cr slab), each capped ₹5,000 per return — plus 18% interest on unpaid tax. Pay before the next return to stop stacking.`);
    else push('pass', 15, 'On time', 'Next return window is open — no late fee accrued yet.');

    // 6. QRMP turnover threshold
    if (turnover <= 1.5e7) push('pass', 12, 'Within ₹1.5 Cr QRMP band', `Turnover ${inr(turnover)} — you may opt for QRMP: quarterly GSTR-3B + monthly IFS, halving filing load.`);
    else push('warn', 12, 'Above ₹1.5 Cr — monthly filing only', `Turnover ${inr(turnover)} exceeds the QRMP cap; GSTR-3B is due every 20th. No quarterly relief.`);

    // 7. Missed filing cadence
    const sinceLast = Math.round((Date.now() - last.getTime()) / DAY);
    if (sinceLast > 95) push('fail', 12, 'Returns likely missed', `Last filing ${sinceLast} days ago — at least one monthly return window has closed; each attracts late fee and possible ₹${(Math.ceil(sinceLast / 30) * 5000).toLocaleString('en-IN')}+ exposure.`);
    else if (sinceLast > 45) push('warn', 12, 'Filing cadence slipping', `${sinceLast} days since last filing — verify every cycle after it was filed.`);
    else push('pass', 12, 'Filing cadence current', `Last filing ${sinceLast} day(s) ago.`);

    // 8. Implied tax rate sanity
    if (turnover > 0 && gstr1Tax / turnover > 0.42) push('warn', 8, 'Implied tax rate unusually high', `${((gstr1Tax / turnover) * 100).toFixed(1)}% of turnover — check that outward tax isn’t tax-inclusive or turnover under-reported.`);
    else push('pass', 8, 'Turnover / tax rate plausible', 'Outward tax sits within a normal slab for declared turnover.');

    // 9. (optional) Cash vs ITC utilisation split of the filed liability
    if (cashPaid != null || itcUsed != null) {
      const c = cashPaid ?? 0, u = itcUsed ?? 0;
      const utilised = c + u;
      const due = Math.max(0, net3b);
      if (Math.abs(utilised - due) <= 1) push('pass', 10, 'Cash/ITC split matches net liability', `${inr(c)} cash + ${inr(u)} ITC = ${inr(utilised)} — settles the ${inr(due)} net liability exactly.`);
      else if (utilised > due + 1) push('warn', 10, 'Utilisation exceeds liability', `Cash ${inr(c)} + ITC ${inr(u)} = ${inr(utilised)} vs payable ${inr(due)} — ${inr(utilised - due)} would sit as an electronic cash-credit balance; check for double payment.`);
      else push('fail', 10, 'Cash/ITC split under-pays', `Only ${inr(utilised)} of ${inr(due)} covered — the ${inr(due - utilised)} gap draws 18% interest day one. Add cash or reclaim eligible 2B ITC.`);
    }

    // 10. (optional) Sec 16(2)(b): ITC reversal when supplier unpaid past 180 days
    if (supplierDays != null) {
      if (supplierDays > 180) push('fail', 14, 'ITC at 180-day reversal risk', `Supplier invoice ${Math.round(supplierDays)} days old and unpaid — sec 16(2)(b) requires reversing ITC taken on it with interest. Since 01.04.2024 (Notif. 17/2023) you may instead pay the ITC amount + 18% interest via DRC-03 and re-claim it when you do pay the supplier — model both costs before choosing.`);
      else if (supplierDays > 150) push('warn', 14, 'Supplier payment window closing', `Day ${Math.round(supplierDays)} of 180 on an unpaid supplier invoice — settle in the next ${Math.round(180 - supplierDays)} days or ITC + interest reversal triggers automatically at day 181.`);
      else push('pass', 14, 'ITC safe on supplier payment', `Day ${Math.round(supplierDays)} of the 180-day sec 16(2)(b) window — ITC stays yours if the supplier is paid in time.`);
    }

    // 11. (optional) TDS/TCS credit presence check (Table 6A vs 26AS)
    const tds = tdsCredit ?? 0, tcs = tcsCredit ?? 0;
    if (tds > 0 || tcs > 0) {
      const claims = net3b > 0;
      push(claims ? 'warn' : 'pass', 8, 'TDS/TCS credit to reconcile', `TDS ${inr(tds)} + TCS ${inr(tcs)} entered — confirm the same figure appears in Form 26AS / GST IMP for the period and claim it in Table 6A of GSTR-3B. Mismatched or unclaimed credit becomes a demand later; recovery needs the deductor’s certificate and DRC-03.`);
    }

    const totalW = checks.reduce((a, c) => a + c.w, 0);
    const earned = checks.reduce((a, c) => a + (c.sev === 'pass' ? c.w : c.sev === 'warn' ? c.w * 0.5 : 0), 0);
    const score = Math.round((earned / totalW) * 100);
    const rank = { fail: 0, warn: 1, pass: 2 };
    // importance first: heavier failing checks outrank light ones
    const top = [...checks].sort((a, b) => rank[a.sev] - rank[b.sev] || b.w - a.w).slice(0, 5);
    setRes({ score, top, all: checks.length, daysLate, optionalCount: [cashPaid, itcUsed, supplierDays, tdsCredit, tcsCredit].filter((v) => v != null).length });
  }

  const numFields = [
    ['gstr1Tax', 'GSTR-1 outward tax (₹)', 'e.g. 180000'],
    ['itc2b', 'GSTR-2B available ITC (₹)', 'e.g. 120000'],
    ['net3b', 'GSTR-3B net liability (₹)', 'e.g. 60000'],
    ['turnover', 'Annual turnover (₹)', 'e.g. 9500000'],
  ];
  const optFields = [
    ['cashPaid', 'Cash paid vs liability (₹, optional)', 'e.g. 58000'],
    ['itcUsed', 'ITC used vs liability (₹, optional)', 'e.g. 2000'],
    ['supplierDays', 'Days since unpaid supplier invoice (optional)', 'e.g. 190'],
    ['tdsCredit', 'TDS credit per 26AS (₹, optional)', 'e.g. 15000'],
    ['tcsCredit', 'TCS credit per 26AS (₹, optional)', 'e.g. 4000'],
  ];

  const requiredFilled = ['gstr1Tax', 'itc2b', 'net3b', 'turnover', 'lastFiling'].every((k) => String(f[k]).trim());

  return (
    <>
      <form onSubmit={run} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        {numFields.map(([k, label, ph]) => (
          <div key={k}>
            <label htmlFor={k}>{label}</label>
            <input id={k} type="number" min="0" step="any" placeholder={ph} value={f[k]} onChange={set(k)} />
          </div>
        ))}
        <div>
          <label htmlFor="lastFiling">Last filing date</label>
          <input id="lastFiling" type="date" value={f.lastFiling} onChange={set('lastFiling')} />
        </div>
        {optFields.map(([k, label, ph]) => (
          <div key={k}>
            <label htmlFor={k} style={{ color: 'var(--ink-3)' }}>{label}</label>
            <input id={k} type="number" min="0" step="any" placeholder={ph} value={f[k]} onChange={set(k)} />
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }} />
        <div style={{ alignSelf: 'end', marginTop: 14, gridColumn: '1 / -1' }}>
          <button className="btn" disabled={!requiredFilled}>Run readiness check</button>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result" style={{ marginTop: 16 }}>
          <h3>Filing readiness</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 12, flexWrap: 'wrap' }}>
            <span className={`score-big ${res.score >= 75 ? 'pass' : res.score >= 50 ? 'warn' : 'fail'}`}>{res.score}/100</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>
              {res.daysLate > 0 ? `Filing window slipped ${res.daysLate} day(s).` : 'Window open.'} Showing 5 of {res.all} checks
              {res.optionalCount > 0 ? ` (${res.optionalCount} optional input(s) feeding weighted checks)` : ''}.
            </span>
          </div>
          <table>
            <thead><tr><th>Check</th><th>Status</th><th>Weight</th><th>Finding</th></tr></thead>
            <tbody>
              {res.top.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{c.title}</td>
                  <td className={c.sev}>{c.sev.toUpperCase()}</td>
                  <td>{c.w}</td>
                  <td>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-note">Free preview: top 5 checks from 5 summary numbers. Paid TaxReady ingests your full purchase/sales ledger, reconciles every invoice against 2B, and exports a CA-ready report.</p>
        </div>
      )}
    </>
  );
}
