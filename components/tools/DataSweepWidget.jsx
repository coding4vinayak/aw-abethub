'use client';
import { useState } from 'react';
import { parseCSV } from '../../lib/parse';

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// normalise a value for duplicate grouping: lowercase, strip non-alphanumerics
function normKey(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// E.164-ish phone normalisation: digits only, drop international 00/1 prefixes
function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^00/, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1); // US +1
  return d;
}

// small bounded levenshtein for near-duplicate detection on short strings
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m = a.length, n = b.length;
  const prev = new Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[n];
}

function looksLikeDateCol(name) {
  return /date|created|updated|_at$|time|expiry|expires|closed|opened|last/i.test(name);
}

function looksLikePhoneCol(name) {
  return /phone|mobile|cell|tel(?!l)|whatsapp|fax/i.test(name) && !/email/.test(name);
}

function looksLikeNameCol(name) {
  return /(^|_)name($|_)|full.?name|first.?name|last.?name|contact|person/i.test(name) && !/company|account|org|domain/i.test(name);
}

function parseDate(v) {
  if (!v) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return !Number.isNaN(Date.parse(v));
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)) return !Number.isNaN(Date.parse(v));
  // pure epoch-like number
  if (/^\d{10}$|^\d{13}$/.test(v)) return true;
  return !Number.isNaN(Date.parse(v));
}

// CRM columns whose emptiness blocks outreach — missing values here rank critical
function isCriticalCol(h) {
  return /(^|_)e-?mail($|_)|email/.test(h) || looksLikePhoneCol(h) || looksLikeNameCol(h) || /company|account|organi[sz]ation|domain/.test(h);
}

function pickKeyCol(headers, records) {
  const cands = ['email', 'company', 'account', 'name', 'domain', 'contact', 'organization', 'title', 'id'];
  for (const c of cands) {
    const h = headers.find((x) => x.includes(c));
    if (h) return h;
  }
  // fall back to first column with reasonable cardinality
  return headers[0] || null;
}

// WinPure-style merge suggestions: display-name clusters by token set + fuzzy edit distance
function mergeSuggestions(records, nameCol) {
  if (!nameCol) return [];
  const byKey = new Map();
  records.forEach((r, idx) => {
    const raw = String(r[nameCol] || '').trim();
    if (raw.length < 3) return;
    const toks = raw.toLowerCase().replace(/[^a-z0-9\s-]+/g, ' ').split(/\s+/).filter(Boolean);
    if (!toks.length) return;
    const key = toks.slice().sort().join(' ');
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ raw, row: idx + 2 });
  });

  const out = [];
  const seen = new Set();
  // same words, different order/case/punctuation → certain merge
  for (const [, g] of byKey) {
    const uniq = [...new Set(g.map((x) => x.raw))];
    if (uniq.length > 1) {
      out.push({ a: uniq[0], b: uniq[1], confidence: 96, reason: 'same words, different order/spelling', rows: [...new Set(g.map((x) => x.row))].slice(0, 4).join(', ') });
    }
  }
  // fuzzy pairs across distinct keys (bounded: only compare the 80 most common clusters)
  const keys = [...byKey.keys()].sort((a, b) => byKey.get(b).length - byKey.get(a).length).slice(0, 80);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const maxLen = Math.max(a.length, b.length);
      if (maxLen < 5) continue;
      const d = editDistance(a, b);
      if (d === 0 || d > Math.max(2, Math.round(maxLen * 0.15))) continue;
      const conf = Math.round(100 - (d / maxLen) * 100);
      if (conf < 72) continue;
      const pk = [a, b].sort().join('|');
      if (seen.has(pk)) continue;
      seen.add(pk);
      out.push({
        a: byKey.get(a)[0].raw,
        b: byKey.get(b)[0].raw,
        confidence: conf,
        reason: `fuzzy match (${d} char${d > 1 ? 's' : ''} differ)`,
        rows: [...new Set([...byKey.get(a), ...byKey.get(b)].map((x) => x.row))].slice(0, 4).join(', '),
      });
    }
  }
  return out.sort((x, y) => y.confidence - x.confidence).slice(0, 5);
}

// per-column quality: completeness 50% + validity 30% + uniqueness 20% (match-confidence bar)
function columnQuality(headers, records, total) {
  return headers.map((h) => {
    let empty = 0, invalid = 0, dupRows = 0;
    const isEmail = /email/.test(h) || h === 'contact';
    const isDate = looksLikeDateCol(h);
    const isPhone = looksLikePhoneCol(h);
    const counts = new Map();
    records.forEach((r) => {
      const v = String(r[h] || '').trim();
      if (!v) { empty++; return; }
      if (isEmail && !EMAIL_RE.test(v)) invalid++;
      if (isDate && !parseDate(v)) invalid++;
      if (v !== v.trim()) invalid++;
      const k = isPhone ? normPhone(v) : normKey(v);
      if (k) {
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    });
    for (const [, c] of counts) if (c > 1) dupRows += c - 1;
    const completeness = 1 - empty / (total || 1);
    const validity = 1 - invalid / (total || 1);
    const uniqueness = 1 - dupRows / (total || 1);
    const quality = Math.round(Math.max(0, Math.min(100, (completeness * 0.5 + validity * 0.3 + uniqueness * 0.2) * 100)));
    const parts = [];
    if (empty) parts.push(`${Math.round((empty / (total || 1)) * 100)}% empty`);
    if (invalid) parts.push(`${invalid} invalid`);
    if (dupRows) parts.push(`${dupRows} dup`);
    return { col: h, quality, notes: parts.join(' · ') || 'clean' };
  });
}

function analyze(headers, records) {
  const issues = [];
  const total = records.length;
  const push = (type, field, rows, example, severity) => issues.push({ type, field, rows, example, severity });

  // 1. duplicates on a key column
  const keyCol = pickKeyCol(headers, records);
  if (keyCol) {
    const groups = new Map();
    records.forEach((r, i) => {
      const raw = String(r[keyCol] || '').trim();
      if (!raw) return;
      const k = normKey(raw);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ i, raw });
    });
    let exactDupRows = 0; let exactExample = '';
    for (const [, g] of groups) {
      if (g.length > 1) { exactDupRows += g.length - 1; if (!exactExample) exactExample = `${keyCol}: “${g[0].raw}” appears ${g.length}×`; }
    }
    if (exactDupRows > 0) push('Exact duplicates', keyCol, exactDupRows, exactExample, 'high');

    // near duplicates: compare distinct normalised keys
    const uniq = [...groups.keys()];
    let nearRows = 0; let nearExample = '';
    const seen = new Set();
    for (let a = 0; a < uniq.length && nearRows < total; a++) {
      for (let b = a + 1; b < uniq.length; b++) {
        const d = editDistance(uniq[a], uniq[b]);
        if (d > 0 && d <= 2 && uniq[a].length > 3) {
          const pairKey = [uniq[a], uniq[b]].sort().join('|');
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);
          nearRows += groups.get(uniq[b]).length;
          if (!nearExample) nearExample = `“${groups.get(uniq[a])[0].raw}” ≈ “${groups.get(uniq[b])[0].raw}”`;
        }
      }
    }
    if (nearRows > 0) push('Near duplicates', keyCol, nearRows, nearExample, 'medium');
  }

  // 2. invalid emails
  const emailCol = headers.find((h) => h.includes('email') || h === 'contact');
  if (emailCol) {
    let bad = 0; let example = '';
    records.forEach((r) => {
      const v = String(r[emailCol] || '').trim();
      if (v && !EMAIL_RE.test(v)) { bad++; if (!example) example = v; }
    });
    if (bad > 0) push('Invalid email', emailCol, bad, example, 'high');
  }

  // 3. phone normalisation comparison — same number, different formats
  const phoneCol = headers.find(looksLikePhoneCol);
  if (phoneCol) {
    const byPhone = new Map();
    records.forEach((r, i) => {
      const raw = String(r[phoneCol] || '').trim();
      if (!raw) return;
      const k = normPhone(raw);
      if (!k || k.length < 7) return;
      if (!byPhone.has(k)) byPhone.set(k, []);
      byPhone.get(k).push({ raw, row: i + 2 });
    });
    let dupRows = 0; let example = '';
    let formatVariants = 0;
    for (const [, g] of byPhone) {
      if (g.length > 1) {
        dupRows += g.length - 1;
        const formats = [...new Set(g.map((x) => x.raw))];
        if (formats.length > 1) formatVariants++;
        if (!example) example = `${formats[0]} = ${formats[1]} (row ${g[1].row})`;
      }
    }
    if (dupRows > 0) push('Duplicate phone (normalised)', phoneCol, dupRows, example, 'high');
    if (formatVariants > 0) push('Inconsistent phone formats', phoneCol, formatVariants, 'same number stored in different formats', 'medium');
    let shortPhone = 0; let shortExample = '';
    records.forEach((r) => {
      const v = String(r[phoneCol] || '').trim();
      if (v && normPhone(v).length < 7) { shortPhone++; if (!shortExample) shortExample = v; }
    });
    if (shortPhone > 0) push('Unparseable phone', phoneCol, shortPhone, shortExample, 'medium');
  }

  // 4. missing values — critical fields first, severity-ranked
  headers.forEach((h) => {
    let empty = 0; let firstRow = 0;
    records.forEach((r, i) => {
      const v = String(r[h] || '').trim();
      if (!v && !firstRow) firstRow = i + 2;
      if (!v) empty++;
    });
    const pct = total ? empty / total : 0;
    if (isCriticalCol(h) && empty > 0) {
      push('Missing critical field', h, empty, `${Math.round(pct * 100)}% empty — blocks outreach (row ${firstRow})`, 'critical');
    } else if (pct > 0.2) {
      push('Missing values', h, empty, `${Math.round(pct * 100)}% empty (row #${firstRow - 1})`, 'medium');
    }
  });

  // 5. date-looking cols unparseable
  headers.filter(looksLikeDateCol).forEach((h) => {
    let bad = 0; let example = '';
    records.forEach((r) => {
      const v = String(r[h] || '').trim();
      if (v && !parseDate(v)) { bad++; if (!example) example = v; }
    });
    if (bad > 0) push('Unparseable dates', h, bad, example, 'medium');
  });

  // 6. whitespace / case inconsistency
  headers.forEach((h) => {
    let ws = 0; let wsExample = '';
    records.forEach((r) => {
      const v = String(r[h] || '');
      if (v && v !== v.trim()) { ws++; if (!wsExample) wsExample = JSON.stringify(v.slice(0, 24)); }
    });
    if (ws > 0) push('Leading/trailing whitespace', h, ws, wsExample, 'low');

    // case collisions: same normKey, differing raw spellings
    const byNorm = new Map();
    records.forEach((r) => {
      const v = String(r[h] || '').trim();
      if (!v) return;
      const k = normKey(v);
      if (!byNorm.has(k)) byNorm.set(k, new Set());
      byNorm.get(k).add(v);
    });
    let caseRows = 0; let caseExample = '';
    for (const [, set] of byNorm) {
      if (set.size > 1) {
        const arr = [...set];
        caseRows += arr.length - 1;
        if (!caseExample) caseExample = arr.slice(0, 3).join(' / ');
      }
    }
    if (caseRows > 0) push('Inconsistent casing', h, caseRows, caseExample, 'low');
  });

  const sevRank = { critical: 3, high: 2, medium: 1, low: 0 };
  // stable sort: severity desc, then rows affected desc
  issues.sort((a, b) => (sevRank[b.severity] - sevRank[a.severity]) || (b.rows - a.rows));

  const nameCol = headers.find(looksLikeNameCol) || (keyCol && /name|contact/.test(keyCol) ? keyCol : null);
  const merges = mergeSuggestions(records, nameCol);
  if (merges.length) push('Name merge candidates', nameCol, merges.length, `${merges.length} suggested pair(s), best ${merges[0].confidence}% match`, 'medium');
  const finalIssues = issues.sort((a, b) => (sevRank[b.severity] - sevRank[a.severity]) || (b.rows - a.rows));

  return {
    issues: finalIssues,
    keyCol,
    emailCol,
    phoneCol: phoneCol || null,
    nameCol,
    merges,
    colQuality: columnQuality(headers, records, total),
  };
}

const SEV_CLS = { critical: 'fail', high: 'fail', medium: 'warn', low: 'pass' };

export default function DataSweepWidget() {
  const [meta, setMeta] = useState(null);
  const [issues, setIssues] = useState([]);
  const [merges, setMerges] = useState([]);
  const [colQuality, setColQuality] = useState([]);
  const [err, setErr] = useState('');

  async function onFile(e) {
    setErr(''); setMeta(null); setIssues([]); setMerges([]); setColQuality([]);
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr('Keep files under 8MB.'); return; }
    const { headers, records } = parseCSV(await f.text());
    if (!headers.length || records.length < 2) { setErr('Need a header row and at least 2 data rows.'); return; }
    const { issues: found, keyCol, merges: mg, colQuality: cq } = analyze(headers, records);
    setMeta({ headers, total: records.length, keyCol });
    setIssues(found.slice(0, 10));
    setMerges(mg);
    setColQuality(cq.slice(0, 15));
    if (!found.length) setErr('No data-quality issues found in the first pass — clean file.');
  }

  return (
    <>
      <label htmlFor="ds-csv">CRM export CSV (stays in your browser — nothing uploaded)</label>
      <input id="ds-csv" type="file" accept=".csv,text/csv" onChange={onFile} />

      {meta && issues.length > 0 && (
        <div className="result">
          <h3>
            {issues.length} issue type{issues.length > 1 ? 's' : ''} found
            <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}> · scanned {meta.total} rows, keyed on “{meta.keyCol}”</span>
          </h3>
          <table>
            <thead><tr><th>Type</th><th>Severity</th><th>Column</th><th>Rows affected</th><th>Example</th></tr></thead>
            <tbody>
              {issues.map((it, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }} className={it.rows > meta.total * 0.25 ? 'fail' : it.rows > 2 ? 'warn' : 'pass'}>{it.type}</td>
                  <td className={SEV_CLS[it.severity]} style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>{it.severity}</td>
                  <td style={{ wordBreak: 'break-all' }}>{it.field}</td>
                  <td>{it.rows}</td>
                  <td style={{ wordBreak: 'break-all', color: 'var(--ink-3)' }}>{it.example || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {merges.length > 0 && (
            <>
              <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Name merge suggestions</p>
              <table>
                <thead><tr><th>Variant A</th><th>Variant B</th><th>Match confidence</th><th>Why</th></tr></thead>
                <tbody>
                  {merges.map((m, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{m.a}</td>
                      <td>{m.b}</td>
                      <td className={m.confidence >= 90 ? 'pass' : 'warn'}>{m.confidence}%</td>
                      <td style={{ color: 'var(--ink-3)' }}>{m.reason} · rows {m.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p style={{ fontWeight: 700, margin: '14px 0 4px' }}>Column quality <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 12 }}>· completeness 50% + validity 30% + uniqueness 20%</span></p>
          <table>
            <thead><tr><th>Column</th><th style={{ width: '45%' }}>Quality</th><th>Findings</th></tr></thead>
            <tbody>
              {colQuality.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, wordBreak: 'break-all' }}>{c.col}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', display: 'inline-block' }}>
                        <span style={{ display: 'block', height: '100%', width: `${c.quality}%`, borderRadius: 999, background: c.quality >= 85 ? 'var(--free)' : c.quality >= 60 ? '#b45309' : 'var(--error)' }} />
                      </span>
                      <span className={c.quality >= 85 ? 'pass' : c.quality >= 60 ? 'warn' : 'fail'} style={{ fontSize: 12, minWidth: 36, textAlign: 'right' }}>{c.quality}%</span>
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink-3)', fontSize: 12 }}>{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="cap-note">Preview shows the first 10 issue types. The planned DataSweep adds one-click fix rules (dedupe merge, title-case, whitespace trim) and writes the cleaned rows straight back to your CRM.</p>
        </div>
      )}

      {err && <p className="error-note">{err}</p>}
    </>
  );
}
