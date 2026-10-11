import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const MAX_CHARS = 20000;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------- GSTIN: real structure + real mod-11 check-code algorithm ----------
// GSTIN = [2 digit state code][10 char PAN][1 entity code]Z[1 check code] (15 chars).
// The 13 "payload without Z/check" form some exports use is accepted as truncated (warn).
function gstinCheckCode(payload) {
  // payload = every character before the check code (14 chars for a full GSTIN)
  const s = `0${payload}`;
  let sum = 0;
  let factor = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = CHARS.indexOf(s[i]);
    if (v < 0) return null;
    sum += v * factor;
    factor = (factor % 10) + 1;
  }
  return CHARS[(11 - (sum % 11)) % 11];
}

const VALID_STATES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25,
  27, 28, 29, 30, 32, 33, 34, 35, 37,
]);

function validateGstin(raw) {
  const g = String(raw || '').toUpperCase().replace(/[\s.\-]/g, '');
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) {
    // 13-char form: state + PAN + entity, no Z / check code
    if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]$/.test(g)) {
      const state = Number(g.slice(0, 2));
      return {
        gstin: g, length: g.length, stateCode: state, stateOk: VALID_STATES.has(state),
        panOk: true, truncated: true, checksumOk: null, expectedCheck: null,
      };
    }
    return { gstin: g, length: g.length, formatOk: false, stateOk: false, panOk: false, truncated: false, checksumOk: null, expectedCheck: null };
  }
  const state = Number(g.slice(0, 2));
  const payload = g.slice(0, 14);
  const expected = gstinCheckCode(payload);
  return {
    gstin: g,
    length: g.length,
    formatOk: true,
    stateCode: state,
    stateOk: VALID_STATES.has(state),
    panOk: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(g.slice(2, 12)),
    entity: g[12],
    truncated: false,
    checksumOk: expected === g[14],
    expectedCheck: expected,
  };
}

// ---------- money / date helpers ----------
function parseMoney(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[₹$,\s]/g, '').replace(/(cr|crore)$/i, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function grabMoney(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const v = parseMoney(m[1]);
      if (v != null) return { value: v, matched: m[0].replace(/\s+/g, ' ').trim().slice(0, 70) };
    }
  }
  return { value: null, matched: null };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function daysInMonth(y, mth) { return new Date(y, mth, 0).getDate(); }

function normaliseDate(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let day = Number(m[1]), mon = Number(m[2]), yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    // dd/mm/yyyy is the Indian invoice convention; swap only if impossible otherwise
    if (day > 12 && mon <= 12) { /* keep */ }
    else if (mon > 12 && day <= 12) { const t = day; day = mon; mon = t; }
    const calOk = mon >= 1 && mon <= 12 && day >= 1 && day <= daysInMonth(yr, mon);
    const future = calOk && new Date(`${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`) > new Date();
    return {
      iso: calOk ? `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null,
      valid: calOk && !future && yr >= 1990 && yr <= new Date().getFullYear() + 1,
      future,
    };
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})$/);
  if (m) {
    const idx = MONTHS.findIndex((x) => m[2].toLowerCase().startsWith(x));
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    const day = Number(m[1]);
    const mon = idx + 1;
    const calOk = idx >= 0 && yr >= 1990 && day >= 1 && day <= daysInMonth(yr, mon);
    return { iso: calOk ? `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null, valid: calOk, future: false };
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const yr = Number(m[1]), mon = Number(m[2]), day = Number(m[3]);
    const calOk = yr >= 1990 && mon >= 1 && mon <= 12 && day >= 1 && day <= daysInMonth(yr, mon);
    return { iso: calOk ? s : null, valid: calOk && yr <= new Date().getFullYear() + 1, future: false };
  }
  return { iso: null, valid: false, future: false };
}

// ---------- vendor name ----------
const NOISE = /^(tax\s+invoice|invoice|original|duplicate|bill\s+of\s+supply|e[\s-]?invoice|receipt|quotation|estimate|proforma)\b/i;
const FIELD_NOISE = /^(gst(in)?|pan|cin|tan|state\s|place\s|supplier|buyer|bill\s*(to|name)|ship\s*to|company\s*gstin|from|to|s\.?no|sr\.?no|sl\.?no|description|quantity|qty|rate|taxable|igst|cgst|sgst|utgst|cess|tax|total|grand|amount|sub\s?total|discount|round|terms|bank|upi|email|phone|mobile|website|address|pin|gstin\b)/i;
const LEGAL = /\b(pvt|private|ltd|limited|llp|llc|inc|corp|corporation|company|technologies|solutions|services|enterprises|industries|logistics|consulting|digital|labs|ventures|trading|manufacturing)\b/i;

function pickVendor(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[|•▪]+/g, ' ').trim()).filter(Boolean);
  let best = null;
  for (const line of lines.slice(0, 40)) {
    if (line.length < 3 || line.length > 70) continue;
    if (/[0-9]{6,}/.test(line)) continue;          // numbers/addresses
    if (/@|https?:|www\./i.test(line)) continue;   // contact lines
    if (NOISE.test(line) || FIELD_NOISE.test(line)) continue;
    if (!/[A-Za-z]{3,}/.test(line)) continue;
    const score = (LEGAL.test(line) ? 100 : 0) + Math.min(20, line.length / 3);
    if (!best || score > best.score) best = { name: line, score };
    if (LEGAL.test(line)) break;
  }
  return best ? best.name : null;
}

function detectGstin(text) {
  const up = text.toUpperCase();
  const all = [];
  // full 15-char GSTIN, tolerating spaces typed inside the code
  const full = /(?:^|[^A-Z0-9])(\d{2}\s?[A-Z]{5}\s?\d{4}\s?[A-Z]\s?[0-9A-Z]\s?Z\s?[0-9A-Z])(?![A-Z0-9])/g;
  let m;
  while ((m = full.exec(up)) && all.length < 5) {
    const code = m[1].replace(/\s/g, '');
    if (!all.includes(code)) all.push(code);
  }
  if (all.length) return { codes: all };
  // 13-char truncated form (state + PAN + entity, no Z / check code).
  // The lookahead stops it swallowing letters from the next word ("…P1" + "Invoice").
  const trunc = /(?:^|[^A-Z0-9])(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z])(?![A-Z0-9])/g;
  while ((m = trunc.exec(up)) && all.length < 5) {
    if (!all.includes(m[1])) all.push(m[1]);
  }
  return { codes: all };
}

// ---------- line-item table extraction (desc | qty | rate | amount rows) ----------
const SUMMARY_LINE = /grand\s*total|sub\s*-?\s*total|taxable|assessable|balance|rounding|cgst|sgst|igst|utgst|cess|total\s*(?:amount|payable|due)|amount\s*(?:due|paid|payable)|invoice\s*(?:total|amount)/i;

function numberTokens(str) {
  return (str.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map((t) => t.replace(/,/g, ''));
}

function looksLikeHsn(tok) {
  return /^\d{6,10}$/.test(tok) && !tok.includes('.');
}

function parseLineItems(text) {
  const items = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length > 220) continue;
    if (SUMMARY_LINE.test(line)) continue;
    if (/hsn\/?sac|description|quantity/i.test(line) && !/-?\d[\d,]*\.\d{2}/.test(line)) continue; // header row
    // split into cells: pipes first, else 2+ spaces / tabs
    let cells = line.includes('|')
      ? line.split('|').map((c) => c.trim()).filter(Boolean)
      : line.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) cells = line.split(/\s+/);
    // drop cells that are only a % (a rate label, not money)
    cells = cells.filter((c) => !/^\d+(\.\d+)?%$/.test(c));
    if (cells.length < 3) continue;
    // trailing numeric cells: amount ← rate ← qty, optional leading HSN/SAC cell
    const numsIdx = [];
    for (let i = cells.length - 1; i >= 0 && numsIdx.length < 4; i--) {
      const toks = numberTokens(cells[i]);
      if (toks.length === 1 && cells[i].replace(/[₹$,.\s]/g, '').match(/^-?\d+(?:\.\d+)?$/) && toks[0] === cells[i].replace(/[₹$,]/g, '').trim()) numsIdx.unshift(i);
      else if (toks.length === 1 && /^-?[\d,.]+$/.test(cells[i].trim()) && /[\d]/.test(cells[i])) numsIdx.unshift(i);
      else break;
    }
    if (numsIdx.length < 3) continue;
    let hsn = null;
    let numCells = numsIdx.map((i) => cells[i]);
    const firstTok = numberTokens(numCells[0])[0];
    if (numCells.length === 4 && looksLikeHsn(firstTok)) { hsn = firstTok; numCells = numCells.slice(1); }
    if (numCells.length > 3) numCells = numCells.slice(-3);
    if (numCells.length !== 3) continue;
    const qty = parseMoney(numCells[0]);
    const rate = parseMoney(numCells[1]);
    const amount = parseMoney(numCells[2]);
    if (qty == null || rate == null || amount == null) continue;
    if (Math.abs(qty * rate - amount) > Math.max(1.5, amount * 0.05)) continue; // doesn't reconcile → not an item row
    const descCells = cells.filter((c, i) => !numsIdx.includes(i));
    const desc = descCells.join(' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!desc || !/[A-Za-z]{2,}/.test(desc)) continue;
    // HSN/SAC sometimes sits inside the description cell
    let desc2 = desc;
    if (!hsn) {
      const dm = desc.match(/\b(\d{6,10})\b/);
      if (dm) { hsn = dm[1]; desc2 = desc.replace(/\b\d{6,10}\b/, ' ').replace(/\s+/g, ' ').trim(); }
    }
    const pct = line.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    items.push({ desc: desc2 || desc, qty, rate, amount, hsn, lineRate: pct ? Number(pct[1]) : null });
    if (items.length >= 40) break;
  }
  return items;
}

// HS/SAC code shape check: HS = 6-8 digits, SAC (services) = 99-prefixed 6-digit
function classifyHsn(code) {
  if (!code) return null;
  if (/^99\d{4}$/.test(code)) return { code, kind: 'SAC (services)', shapeOk: true };
  if (/^99\d{6}$/.test(code)) return { code, kind: 'SAC (services)', shapeOk: true };
  if (/^\d{6,8}$/.test(code)) return { code, kind: 'HS (goods)', shapeOk: true };
  return { code, kind: 'HS/SAC', shapeOk: false };
}

const GST_SLABS = [0, 3, 5, 12, 18, 28];

function detectCurrency(text) {
  const found = [];
  if (/₹|INR|\bRS\.?\s?\d|RUPEE/i.test(text)) found.push('INR');
  if (/\$\s?\d|USD|DOLLAR/i.test(text)) found.push('USD');
  if (/€\s?\d|EUR|EURO/i.test(text)) found.push('EUR');
  if (/£\s?\d|GBP/i.test(text)) found.push('GBP');
  if (/AUD/i.test(text)) found.push('AUD');
  if (/AED/i.test(text)) found.push('AED');
  return found;
}

function detectIrn(text) {
  const m = text.match(/\bIRN\b|invoice\s+reference\s+number/i);
  const hex = text.match(/\b[0-9a-f]{64}\b/i); // 64-hexchar ACMS IRN
  return { mentioned: Boolean(m), hexPresent: Boolean(hex) };
}

// ---------- core deterministic extraction (shared by engine + AI validation) ----------
function extractInvoice(capped) {
  const up = capped.toUpperCase();
  // Amounts must never capture a rate: blank out every "N%" token first.
  const amounts = up.replace(/\d+(?:\.\d+)?\s*%/g, ' PCT ');

  const gstFound = detectGstin(capped);
  const gstinRaw = gstFound.codes[0] || null;
  const gstin = gstinRaw ? validateGstin(gstinRaw) : null;

  const vendor = pickVendor(capped);
  const invNo = (capped.match(/invoice\s*(?:no|num|number|#)[.\s:]*([A-Za-z0-9][A-Za-z0-9\-_\/]{2,29})/i) || [])[1] || null;
  const dateRaw =
    (capped.match(/invoice\s*(?:date|dt)[.\s:]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{2,4}|\d{4}-\d{2}-\d{2})/i) || [])[1] ||
    (capped.match(/(?:^|[\s(])(?:date|dt|inv\.?\s*date)\s*[:\-]\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/im) || [])[1] ||
    (capped.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})\b/i) || [])[1] || null;
  const date = dateRaw ? normaliseDate(dateRaw) : { iso: null, valid: false };

  const taxable = grabMoney(amounts, [
    /TAXABLE[ \t]*(?:VALUE|AMOUNT|TOTAL|PRICE)?[ \t]*[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
    /ASSESSABLE\s*VALUE[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
    /SUB\s?-?TOTAL[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
  ]);
  const igst = grabMoney(amounts, [/IGST[^0-9\n]{0,25}([0-9][0-9,]*\.?[0-9]{0,2})/, /INTEGRATED\s*TAX[^0-9\n]{0,25}([0-9][0-9,]*\.?[0-9]{0,2})/]);
  const cgst = grabMoney(amounts, [/CGST[^0-9\n]{0,25}([0-9][0-9,]*\.?[0-9]{0,2})/, /CENTRAL\s*TAX[^0-9\n]{0,25}([0-9][0-9,]*\.?[0-9]{0,2})/]);
  const sgst = grabMoney(amounts, [/SGST[^0-9\n]{0,25}([0-9][0-9,]*\.?[0-9]{0,2})/, /STATE\s*TAX[^0-9\n]{0,25}([0-9][0-9,]*\.?[0-9]{0,2})/, /UTGST[^0-9\n]{0,25}([0-9][0-9,]*\.?[0-9]{0,2})/]);
  const cess = grabMoney(amounts, [/CESS[^0-9\n]{0,20}([0-9][0-9,]*\.?[0-9]{0,2})/]);
  const total = grabMoney(amounts, [
    /GRAND\s*TOTAL[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
    /TOTAL\s*(?:AMOUNT|PAYABLE|VALUE)[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
    /INVOICE\s*(?:TOTAL|AMOUNT)[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
    /AMOUNT\s*(?:DUE|PAID|PAYABLE)[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
    /TOTAL[^0-9\n]{0,18}([0-9][0-9,]*\.?[0-9]{0,2})/,
  ]);

  // rates: any "N%" sitting next to a tax word
  const rates = [...new Set([...up.matchAll(/(?:IGST|CGST|SGST|UTGST|GST|CESS|TAX)\s*(@)?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/g)].map((m) => Number(m[2])))];
  const taxSum = [igst.value, cgst.value, sgst.value, cess.value].reduce((a, v) => (v == null ? a : a + v), 0);
  const hasTaxNumbers = [igst.value, cgst.value, sgst.value, cess.value].some((v) => v != null);
  const effectiveRate = taxable.value && hasTaxNumbers ? (taxSum / taxable.value) * 100 : null;

  const lineItems = parseLineItems(capped);
  const currencies = detectCurrency(capped);
  const irn = detectIrn(capped);

  return { up, gstFound, gstin, vendor, invNo, dateRaw, date, taxable, igst, cgst, sgst, cess, total, rates, taxSum, hasTaxNumbers, effectiveRate, lineItems, currencies, irn };
}

function gradeFromScore(score) {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Send JSON: { text: "<raw invoice text>" }.' }, { status: 400 });
  }
  const text = String(body?.text || '');
  if (!text.trim()) return NextResponse.json({ error: 'Paste the raw invoice text (select-all in the PDF, then copy).' }, { status: 400 });
  if (text.trim().split(/\s+/).length < 5) return NextResponse.json({ error: 'That does not look like invoice text yet — paste at least a few lines from the PDF.' }, { status: 400 });

  const capped = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const e = extractInvoice(capped);
  let source = 'engine';
  let aiFields = null;

  // ---- AI mode for unstructured invoices: fill gaps, validate against the deterministic engine ----
  if (aiAvailable()) {
    try {
      const out = await aiJson(
        'You extract invoice fields from raw unstructured invoice text (India GST invoices). Deterministic fields already found: ' +
        JSON.stringify({ vendor: e.vendor, gstin: e.gstin?.gstin || null, invoiceNumber: e.invNo, invoiceDate: e.date.iso, taxable: e.taxable.value, igst: e.igst.value, cgst: e.cgst.value, sgst: e.sgst.value, total: e.total.value }).slice(0, 600) +
        ' Return: { vendor, gstin, invoiceNumber, invoiceDate, currency, taxable, igst, cgst, sgst, cess, total, lineItems: [{ desc, hsn, qty, rate, amount }] }. Numbers only, no thousands separators, dates as given. Null anything not present.',
        capped.slice(0, 9000),
        { maxTokens: 1200, timeoutMs: 30000 }
      );
      if (out && typeof out === 'object') {
        aiFields = {
          vendor: typeof out.vendor === 'string' ? out.vendor.trim().slice(0, 80) : null,
          gstin: typeof out.gstin === 'string' ? out.gstin.toUpperCase().replace(/[\s.\-]/g, '').slice(0, 20) : null,
          invoiceNumber: typeof out.invoiceNumber === 'string' ? out.invoiceNumber.trim().slice(0, 40) : null,
          invoiceDate: typeof out.invoiceDate === 'string' ? out.invoiceDate.trim().slice(0, 24) : null,
          currency: typeof out.currency === 'string' ? out.currency.toUpperCase().slice(0, 3) : null,
          taxable: parseMoney(out.taxable),
          igst: parseMoney(out.igst), cgst: parseMoney(out.cgst), sgst: parseMoney(out.sgst), cess: parseMoney(out.cess),
          total: parseMoney(out.total),
          lineItems: Array.isArray(out.lineItems) ? out.lineItems.slice(0, 40)
            .map((li) => li && typeof li === 'object' ? {
              desc: String(li.desc || '').slice(0, 90), hsn: li.hsn == null ? null : String(li.hsn).slice(0, 12),
              qty: parseMoney(li.qty), rate: parseMoney(li.rate), amount: parseMoney(li.amount),
            } : null)
            .filter((li) => li && li.desc && li.amount != null) : null,
        };
        source = 'ai';
      }
    } catch { /* deterministic engine stays authoritative */ }
  }

  const mergeNum = (det, ai) => (det != null ? det : ai != null ? ai : null);
  const taxableVal = mergeNum(e.taxable.value, aiFields?.taxable);
  const igstVal = mergeNum(e.igst.value, aiFields?.igst);
  const cgstVal = mergeNum(e.cgst.value, aiFields?.cgst);
  const sgstVal = mergeNum(e.sgst.value, aiFields?.sgst);
  const cessVal = mergeNum(e.cess.value, aiFields?.cess);
  const totalVal = mergeNum(e.total.value, aiFields?.total);
  const vendor = e.vendor || aiFields?.vendor || null;
  const invNo = e.invNo || aiFields?.invoiceNumber || null;
  // AI gstin is only trusted after the real mod-11 engine has vetted it
  const gstin = e.gstin || (aiFields?.gstin ? validateGstin(aiFields.gstin) : null);
  let date = e.date; let dateRaw = e.dateRaw;
  if (!dateRaw && aiFields?.invoiceDate) {
    dateRaw = aiFields.invoiceDate;
    date = normaliseDate(dateRaw);
  }
  const lineItems = e.lineItems.length ? e.lineItems : (aiFields?.lineItems?.length ? aiFields.lineItems : []);
  const currencyList = e.currencies.length ? e.currencies : (aiFields?.currency ? [aiFields.currency] : []);
  const taxSum = [igstVal, cgstVal, sgstVal, cessVal].reduce((a, v) => (v == null ? a : a + v), 0);
  const hasTaxNumbers = [igstVal, cgstVal, sgstVal, cessVal].some((v) => v != null);
  const effectiveRate = taxableVal && hasTaxNumbers ? (taxSum / taxableVal) * 100 : null;

  const checks = [];
  const add = (key, state, detail) => checks.push({ key, state, detail });

  if (!gstin) add('GSTIN found', 'warn', 'No GSTIN in the paste — an invoice without the supplier GSTIN cannot be filed for ITC.');
  else if (gstin.truncated) add('GSTIN found', 'warn', `${gstin.gstin} is ${gstin.length} chars — looks like the supplier GSTIN without the “Z” + check code. Ask for the full 15-char GSTIN.`);
  else if (!gstin.formatOk) add('GSTIN format', 'fail', `“${gstin.gstin}” is not a valid GSTIN shape (2 digits + 10-char PAN + entity + Z + check code).${source === 'ai' ? ' (AI-proposed GSTIN rejected by the checksum engine.)' : ''}`);
  else if (!gstin.stateOk) add('State code', 'fail', `State code ${String(gstin.stateCode).padStart(2, '0')} is not an assignable Indian GST state code (01–37, with 16/26/31/36 reserved).`);
  else if (!gstin.panOk) add('PAN segment', 'fail', `The PAN portion of ${gstin.gstin} does not match AAAAA9999A.`);
  else if (gstin.checksumOk) add('GSTIN checksum', 'pass', `${gstin.gstin} passes the mod-11 check code (state ${String(gstin.stateCode).padStart(2, '0')}).`);
  else add('GSTIN checksum', 'fail', `${gstin.gstin} fails the GST check-code algorithm — the last char should be “${gstin.expectedCheck}”. High chance of a typo or a fake GSTIN.`);

  if (!e.rates.length && effectiveRate == null) add('Tax rate', 'warn', 'No GST rate found in the text — confirm the line rates manually.');
  else {
    const bad = e.rates.filter((r) => !(r > 0 && r <= 28));
    const effBad = effectiveRate != null && (effectiveRate < 0 || effectiveRate > 28.5);
    if (bad.length || effBad) {
      add('Tax rate', 'fail', `Rates outside the statutory slabs: ${(bad.length ? bad.join(', ') : `${effectiveRate.toFixed(2)}% effective`)}% — GST slabs are 0.25/3/5/12/18/28%.`);
    } else {
      add('Tax rate', 'pass', `Detected rate(s) ${e.rates.join(', ') || `${effectiveRate.toFixed(2)}% effective`} — inside the 0–28% band.`);
    }
  }

  if (taxableVal == null || totalVal == null || !hasTaxNumbers) {
    add('Total reconciliation', 'warn', 'Could not read taxable value, tax and total all together — one of the numbers is missing from the paste.');
  } else {
    const expected = taxableVal + taxSum;
    const diff = totalVal - expected;
    if (Math.abs(diff) <= 0.5) add('Total reconciliation', 'pass', `Total ${totalVal.toFixed(2)} = taxable ${taxableVal.toFixed(2)} + tax ${taxSum.toFixed(2)}. Matches.`);
    else add('Total reconciliation', 'fail', `Total ${totalVal.toFixed(2)} ≠ taxable ${taxableVal.toFixed(2)} + tax ${taxSum.toFixed(2)} (= ${expected.toFixed(2)}). Off by ${diff > 0 ? '+' : ''}${diff.toFixed(2)} — check rounding, freight or hidden cess.`);
  }
  // rounding tolerance: a legitimate invoice may round to the nearest rupee (±1)
  if (taxableVal != null && totalVal != null) {
    const rDiff = hasTaxNumbers ? totalVal - (taxableVal + taxSum) : totalVal - taxableVal;
    if (Math.abs(rDiff) > 0.5 && Math.abs(rDiff) <= 1) add('Rounding tolerance', 'pass', `Total is off by ${rDiff > 0 ? '+' : ''}${rDiff.toFixed(2)} from taxable + tax — within the ±1 rupee rounding tolerance invoices are allowed. Reconciliation accepted on rounding.`);
    else if (Math.abs(rDiff) > 1) add('Rounding tolerance', 'fail', `Gap of ${rDiff > 0 ? '+' : ''}${rDiff.toFixed(2)} exceeds the ±1 rounding tolerance — this is a real arithmetic error or a hidden charge (freight/cess), not rounding.`);
    else add('Rounding tolerance', 'pass', 'No rounding gap beyond ±1.');
  }

  if (cgstVal != null && sgstVal == null && igstVal == null) add('CGST/SGST split', 'warn', 'CGST present with no matching SGST — intra-state supply must charge both equally.');
  else if (cgstVal != null && sgstVal != null) {
    const d = Math.abs(cgstVal - sgstVal);
    add('CGST/SGST split', d <= 0.5 ? 'pass' : 'fail', d <= 0.5 ? 'CGST and SGST are equal — correct intra-state split.' : `CGST ${cgstVal.toFixed(2)} vs SGST ${sgstVal.toFixed(2)} differ by ${d.toFixed(2)} — must be a 50/50 split.`);
  } else if (igstVal != null && (cgstVal != null || sgstVal != null)) add('Tax mechanism', 'fail', 'Both IGST and CGST/SGST charged — a supply is either inter-state or intra-state, never both.');
  else if (igstVal != null) add('Tax mechanism', 'pass', 'Inter-state supply: IGST only, no CGST/SGST pair. Consistent.');
  else add('Tax mechanism', 'warn', 'No IGST and no CGST/SGST pair could be read — the tax lines did not parse.');

  if (!invNo) add('Invoice number', 'warn', 'No invoice number found — duplicate-payment detection is impossible without it.');
  else add('Invoice number', 'pass', `Invoice ${invNo} captured for duplicate checking.`);

  if (!dateRaw) add('Invoice date', 'warn', 'No invoice date found — the supply period (which GSTR-1 month it belongs to) is unknown.');
  else if (date.future) add('Invoice date', 'warn', `“${dateRaw}” is in the future — check the supplier did not mistype the year.`);
  else if (!date.iso) add('Invoice date', 'fail', `“${dateRaw}” is not a real calendar date — likely a dd/mm vs mm/dd mix-up.`);
  else add('Invoice date', 'pass', `${date.iso} is a valid, non-future invoice date.`);

  // ---- line items ----
  if (!lineItems.length) {
    add('Line items', 'warn', 'No description|qty|rate|amount rows could be parsed — the totals rest on a single header number.');
  } else {
    const sum = lineItems.reduce((a, li) => a + (li.amount || 0), 0);
    if (taxableVal != null) {
      const d = sum - taxableVal;
      if (Math.abs(d) <= 1) add('Line items', 'pass', `${lineItems.length} line item(s) parsed, summing to ${sum.toFixed(2)} — reconciles with taxable value ${taxableVal.toFixed(2)} within ±1.`);
      else add('Line items', 'fail', `Parsed line items sum to ${sum.toFixed(2)} but the header says taxable ${taxableVal.toFixed(2)} (off by ${d > 0 ? '+' : ''}${d.toFixed(2)}) — hidden discount or the wrong table was read.`);
    } else add('Line items', 'pass', `${lineItems.length} line item(s) parsed (${sum.toFixed(2)} total) — no taxable-value header to reconcile against.`);
  }

  // ---- HS/SAC codes + valid-rate check ----
  const hsnCodes = lineItems.map((li) => classifyHsn(li.hsn)).filter(Boolean);
  if (!lineItems.length) add('HS/SAC code', 'warn', 'No line items → no HSN/SAC could be checked. Codes are mandatory on the invoice above ₹5 Cr turnover.');
  else if (!hsnCodes.length) add('HS/SAC code', 'warn', `None of the ${lineItems.length} line items carries an HSN (goods) or SAC (services, 99-prefixed) code — GSTR-1 reporting will not map.`);
  else {
    const badShapes = hsnCodes.filter((h) => !h.shapeOk);
    const allRates = [...new Set([
      ...e.rates,
      ...lineItems.map((li) => li.lineRate).filter((r) => r != null),
      effectiveRate != null ? Number(effectiveRate.toFixed(1)) : null,
    ].filter((r) => r != null))];
    const onSlab = (r) => GST_SLABS.includes(r) || Math.abs(r - 0.25) < 0.001 || (r > 0 && r < 1) || GST_SLABS.includes(r * 2); // CGST+SGST halves (e.g. 9%+9% = 18%)
    const slabBad = allRates.filter((r) => !onSlab(r));
    const parts = [];
    if (badShapes.length) parts.push(`${badShapes.map((h) => h.code).join(', ')} is not a valid 6–8 digit HS or 99-prefixed SAC code`);
    if (slabBad.length) parts.push(`rate(s) ${slabBad.join(', ')}% are not statutory GST slabs (0/3/5/12/18/28%)`);
    if (parts.length) add('HS/SAC + rate', 'fail', `${parts.join('; ')}.`);
    else add('HS/SAC + rate', 'pass', `${hsnCodes.length}/${lineItems.length} line(s) carry ${hsnCodes[0].kind} codes (${hsnCodes.map((h) => h.code).join(', ')}) and the applied rate(s) ${allRates.join(', ') || 'match'} sit on a statutory slab.`);
  }

  // ---- e-invoice IRN ----
  if (e.irn.hexPresent) add('E-invoice IRN', 'pass', 'A 64-character IRN is present — this invoice was reportable on the IRM and its hash can be re-verified.');
  else if (e.irn.mentioned) add('E-invoice IRN', 'pass', 'IRN referenced on the invoice (e-invoiced via the IRM). Ask for the 64-char hash to fully verify.');
  else if (gstin && !gstin.truncated && gstin.stateOk) add('E-invoice IRN', 'warn', 'No IRN / e-invoice reference — if the supplier crosses ₹5 Cr turnover, every GST invoice needs an IRN from the IRM before it is valid.');

  // ---- currency ----
  if (!currencyList.length) add('Currency', 'warn', 'No currency symbol or code found — amounts are assumed INR from the GST context.');
  else if (currencyList.length > 1) add('Currency', 'fail', `Mixed currency markers (${currencyList.join(' + ')}) in one invoice — a single GST invoice must state one legal currency; ₹/$ confusion breaks the tax math.`);
  else add('Currency', 'pass', `All amounts read in ${currencyList[0]}.`);

  // ---- duplicate invoice + vendor (two invoices pasted into one text) ----
  const blocks = [];
  const noRe = /invoice\s*(?:no|num|number|#)[.\s:]*([A-Za-z0-9][A-Za-z0-9\-_\/]{2,29})/gi;
  let bm; const hits = [];
  while ((bm = noRe.exec(capped))) hits.push({ idx: bm.index, num: bm[1] });
  for (let i = 0; i < Math.min(hits.length, 6); i++) {
    const slice = capped.slice(hits[i].idx, i + 1 < hits.length ? hits[i + 1].idx : capped.length);
    blocks.push({ num: hits[i].num, vendor: pickVendor(slice) });
  }
  const invoiceCount = Math.max(blocks.length, (e.up.match(/INVOICE\s*(?:NO|NUMBER|#)/g) || []).length);
  let duplicateHit = null;
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const sameNum = blocks[i].num.toLowerCase() === blocks[j].num.toLowerCase();
      const sameVendor = blocks[i].vendor && blocks[j].vendor && blocks[i].vendor.toLowerCase() === blocks[j].vendor.toLowerCase();
      if (sameNum && (sameVendor || !blocks[i].vendor || !blocks[j].vendor)) duplicateHit = blocks[i].num;
      else if (sameNum) duplicateHit = blocks[i].num;
    }
  }
  if (duplicateHit) add('Duplicate check', 'fail', `Invoice number “${duplicateHit}” appears twice in this paste — same-number double entry is a classic duplicate-payment trap. Only one invoice should be booked.`);
  else if (blocks.length > 1) add('Duplicate check', 'warn', `${blocks.length} different invoices pasted together; no number repeats. The free preview validates the first one only — watch for the same vendor billing you twice under near-miss numbers.`);
  else add('Duplicate check', 'pass', 'Single invoice detected — no duplicate number/vendor collision in this paste.');

  const multiple = (e.gstFound.codes.length > 1 && blocks.length > 1) || blocks.length > 1;

  const score = (() => {
    let s = 100;
    for (const c of checks) { if (c.state === 'fail') s -= 34; else if (c.state === 'warn') s -= 12; }
    return Math.max(0, Math.min(100, Math.round(s)));
  })();

  return NextResponse.json({
    capped: text.length > MAX_CHARS,
    invoiceCount: multiple ? Math.max(e.gstFound.codes.length, invoiceCount) : 1,
    source,
    score,
    grade: gradeFromScore(score),
    fields: {
      vendor: vendor || null,
      gstin: gstin ? gstin.gstin : null,
      gstinStateCode: gstin && gstin.stateCode != null ? String(gstin.stateCode).padStart(2, '0') : null,
      gstinExpectedCheck: gstin ? gstin.expectedCheck : null,
      invoiceNumber: invNo || null,
      invoiceDateRaw: dateRaw || null,
      invoiceDate: date.iso,
      invoiceDateValid: date.valid,
      taxable: taxableVal,
      igst: igstVal,
      cgst: cgstVal,
      sgst: sgstVal,
      cess: cessVal,
      taxTotal: hasTaxNumbers ? Number(taxSum.toFixed(2)) : null,
      total: totalVal,
      rates: e.rates.length ? e.rates : effectiveRate != null ? [Number(effectiveRate.toFixed(2))] : [],
      currency: currencyList.length > 1 ? `${currencyList.join(' + ')} (mixed)` : currencyList[0] || null,
      lineItems,
      irn: e.irn.hexPresent ? '64-char IRN present' : e.irn.mentioned ? 'IRN mentioned' : null,
    },
    checks,
  });
}
