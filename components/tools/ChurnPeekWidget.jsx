'use client';
import { useState } from 'react';
import { parseCSV, num } from '../../lib/parse';

function pick(headers, candidates) {
  for (const c of candidates) {
    const h = headers.find((x) => x.includes(c));
    if (h) return h;
  }
  return null;
}

// All headers that look like a countable usage metric (used for the trend delta).
function usageCols(headers, exclude) {
  return headers.filter((h) =>
    /(login|session|visit|active_days|usage|events?|actions?)/.test(h) &&
    !exclude.includes(h) &&
    !/(days_since|since|last)/.test(h)
  );
}

// Vitally/ChurnZero-style model: log-decayed activity, recency-weighted tickets,
// concave seat-utilization curve, usage trend delta, value amplifier.
function scoreRow(r, cols) {
  const factors = [];
  const add = (key, pts, reason) => { if (pts > 0) factors.push({ key, pts, reason }); };
  let trendNote = null;

  // 1) Activity: logarithmic decay — 7 days is not 7x worse than 1 day.
  if (cols.activity != null) {
    const d = num(r[cols.activity]);
    if (d != null) {
      const capped = Math.min(120, Math.max(0, d));
      const pts = 42 * (Math.log(1 + capped) / Math.log(1 + 120));
      add('activity', pts, `${Math.round(d)} days since last activity (log-decayed)`);
    }
  }

  // 2) Login/session frequency.
  if (cols.logins != null) {
    const l = num(r[cols.logins]);
    if (l != null && l <= 2) add('logins', 20, 'only 1–2 logins in period');
    else if (l != null && l <= 5) add('logins', 8, `${Math.round(l)} logins — dipping below active threshold`);
  }

  // 3) Ticket load, weighted by recency when a recent-window column exists.
  if (cols.tickets != null || cols.ticketsRecent != null) {
    const total = cols.tickets != null ? num(r[cols.tickets]) : null;
    const recent = cols.ticketsRecent != null ? num(r[cols.ticketsRecent]) : null;
    let eff = 0;
    if (recent != null && total != null) eff = recent * 1.5 + Math.max(0, total - recent) * 0.7;
    else if (recent != null) eff = recent * 1.5;
    else eff = total ?? 0;
    const pts = Math.min(24, 9 * Math.log(1 + eff));
    if (recent != null && total != null) add('tickets', pts, `${recent} recent of ${total} tickets (recent weighted 1.5×)`);
    else if (recent != null) add('tickets', pts, `${recent} recent tickets (recency-weighted)`);
    else if ((total ?? 0) >= 2) add('tickets', pts, `${Math.round(total)} support tickets`);
  }

  // 4) Seat utilization: concave curve, target 75%+.
  if (cols.seats != null && cols.used != null) {
    const s = num(r[cols.seats]), u = num(r[cols.used]);
    if (s && s > 0 && u != null) {
      const util = Math.max(0, Math.min(1.2, u / s));
      const pts = util >= 0.75 ? 0 : 22 * Math.pow(1 - util / 0.75, 2);
      if (pts > 0.5) add('seats', pts, `${Math.round(util * 100)}% seat utilization (curve target 75%)`);
    }
  }

  // 5) Risk trend: two usage-ish columns (current vs previous window) → delta.
  if (cols.trendCur && cols.trendPrev) {
    const cur = num(r[cols.trendCur]), prev = num(r[cols.trendPrev]);
    if (cur != null && prev != null && prev > 0) {
      const ratio = cur / prev;
      if (ratio <= 0.6) { add('trend', 14, `${cols.trendCur} down ${Math.round((1 - ratio) * 100)}% vs ${cols.trendPrev} — trajectory worsening`); trendNote = 'down'; }
      else if (ratio >= 1.5) { add('trend', 0, ''); trendNote = 'up'; }
    }
  }

  let risk = factors.reduce((a, f) => a + f.pts, 0);

  // Trend improvement earns an actual discount (Vitally shows trend, not just level).
  if (trendNote === 'up' && risk > 10) {
    risk *= 0.85;
    factors.push({ key: 'trend', pts: -Math.round(risk * 0.15 / 0.85), reason: `${cols.trendCur} up ${Math.round((num(r[cols.trendCur]) / num(r[cols.trendPrev]) - 1) * 100)}% — trajectory improving (15% discount)` });
  }

  // 6) High-value amplifier.
  if (cols.value != null) {
    const v = num(r[cols.value]);
    if (v != null && v > 500 && risk > 30) { add('value', 10, 'high contract value amplifies the risk'); }
  }

  risk = Math.max(0, Math.min(99, Math.round(risk)));
  factors.sort((a, b) => b.pts - a.pts);
  const grade = risk >= 60 ? 'High' : risk >= 35 ? 'Medium' : 'Low';
  return { risk, grade, factors, topReason: factors.length ? factors[0].reason : null };
}

export default function ChurnPeekWidget() {
  const [rows, setRows] = useState(0);
  const [err, setErr] = useState('');
  const [accts, setAccts] = useState([]);
  const [colsFound, setColsFound] = useState(null);

  async function onFile(e) {
    setErr(''); setAccts([]); setRows(0); setColsFound(null);
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr('Keep files under 8MB.'); return; }
    const { headers, records } = parseCSV(await f.text());
    if (records.length < 2) { setErr('Need a header row and at least 2 data rows.'); return; }

    const ticketCols = headers.filter((h) => /(ticket|support|request)/.test(h));
    const cols = {
      name: pick(headers, ['company', 'account', 'customer', 'name', 'organization']),
      activity: pick(headers, ['days_since', 'last_activity', 'last_login', 'inactive', 'days']),
      logins: pick(headers, ['login', 'session', 'visit', 'active_days']),
      tickets: ticketCols.find((h) => !/(30|7|recent|last|prev|month)/.test(h)) || ticketCols[0] || null,
      ticketsRecent: ticketCols.length > 1
        ? ticketCols.find((h) => /(30|7|recent|last|prev|month)/.test(h))
        : ticketCols.length === 1 && /(30|7|recent|last|prev|month)/.test(ticketCols[0]) ? ticketCols[0] : null,
      seats: pick(headers, ['seat', 'license', 'user_count', 'licenses']),
      used: pick(headers, ['used', 'active_users', 'utili']),
      value: pick(headers, ['value', 'amount', 'arr', 'mrr', 'revenue', 'price', 'spend']),
    };
    // Trend columns: a "previous window" usage column compared against its current twin.
    const uc = usageCols(headers, [cols.activity]);
    const prevH = uc.find((h) => /(prev|last|previous|before|q1|prior)/.test(h));
    if (prevH) {
      const base = prevH.replace(/(last_?30|prev(ious)?_?30|previous|last|prev|before|q1|prior)/gi, '').replace(/_+$/, '').replace(/^_+/, '');
      cols.trendPrev = prevH;
      cols.trendCur = uc.find((h) => h !== prevH && (base.length < 2 || h.includes(base))) || uc.find((h) => h !== prevH) || null;
    }

    if (cols.activity == null && cols.logins == null && cols.tickets == null && cols.ticketsRecent == null) {
      setErr(`Couldn’t find a usage column. Headers seen: ${headers.join(', ')}. Look for “last_activity”, “logins” or “tickets”.`);
      return;
    }
    setColsFound(Object.entries(cols).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · '));
    setRows(records.length);
    const scored = records.map((r, i) => {
      const s = scoreRow(r, cols);
      return { name: cols.name ? (r[cols.name] || `row ${i + 2}`) : `row ${i + 2}`, ...s };
    }).sort((a, b) => b.risk - a.risk);
    setAccts(scored);
  }

  const counts = accts.reduce((m, a) => ({ ...m, [a.grade]: (m[a.grade] || 0) + 1 }), {});

  return (
    <>
      <label htmlFor="csv">Customer CSV (stays in your browser — nothing uploaded)</label>
      <input id="csv" type="file" accept=".csv,text/csv" onChange={onFile} />
      {err && <p className="error-note">{err}</p>}

      {accts.length > 0 && (
        <div className="result">
          <h3>Health-scored accounts — {rows} rows analyzed
            <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 14 }}>
              {' '}· {counts.High || 0} High · {counts.Medium || 0} Medium · {counts.Low || 0} Low risk
            </span>
          </h3>
          {colsFound && (
            <p className="cap-note" style={{ marginTop: 0 }}>Model columns detected: {colsFound}. Activity uses log-scale decay; tickets are recency-weighted; seats follow a 75% utilization curve.</p>
          )}
          <table>
            <thead><tr><th>#</th><th>Account</th><th>Risk</th><th>Grade</th><th>Top reason</th><th>All factors</th></tr></thead>
            <tbody>
              {accts.map((t, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{t.name}</td>
                  <td className={t.grade === 'High' ? 'fail' : t.grade === 'Medium' ? 'warn' : 'pass'}>{t.risk}</td>
                  <td className={t.grade === 'High' ? 'fail' : t.grade === 'Medium' ? 'warn' : 'pass'}>{t.grade}</td>
                  <td>{t.topReason || 'healthy — no risk factors above threshold'}</td>
                  <td style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t.factors.filter((f) => f.reason).map((f) => f.reason).join('; ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-note">Every account scored, every factor shown — this is the full free model, unlimited files. The planned ChurnSignal adds save-plays per customer and risk-over-time tracking.</p>
        </div>
      )}
    </>
  );
}
