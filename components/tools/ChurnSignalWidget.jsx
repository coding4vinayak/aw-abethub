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

function scoreRow(r, cols) {
  let risk = 0; const reasons = [];
  if (cols.activity != null) {
    const days = num(r[cols.activity]);
    if (days != null && days > 30) { risk += Math.min(40, days / 3); reasons.push(`${Math.round(days)}d inactive`); }
  }
  if (cols.logins != null) {
    const l = num(r[cols.logins]);
    if (l != null && l <= 2) { risk += 25; reasons.push('only 1–2 logins'); }
  }
  if (cols.tickets != null) {
    const t = num(r[cols.tickets]);
    if (t != null && t >= 3) { risk += 20; reasons.push(`${Math.round(t)} tickets`); }
  }
  if (cols.seats != null && cols.used != null) {
    const s = num(r[cols.seats]), u = num(r[cols.used]);
    if (s && u != null && u / s < 0.4) { risk += 20; reasons.push(`${Math.round((u / s) * 100)}% seat usage`); }
  }
  if (cols.value != null) {
    const v = num(r[cols.value]);
    if (v != null && v > 500 && risk > 30) { risk += 10; reasons.push('high value at risk'); }
  }
  risk = Math.min(99, Math.round(risk));
  let play;
  if (risk >= 70) play = 'Executive outreach within 48h + targeted offer (see CancelSave)';
  else if (risk >= 45) play = 'Success check-in call; retrain on the unused feature area';
  else if (reasons.length) play = 'Send value-recap email with usage highlights';
  else play = 'No risk signals — keep quarterly cadence';
  return { risk, reasons, play };
}

export default function ChurnSignalWidget() {
  const [top, setTop] = useState([]);
  const [total, setTotal] = useState(0);
  const [atRisk, setAtRisk] = useState(0);
  const [err, setErr] = useState('');

  async function onFile(e) {
    setErr(''); setTop([]);
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr('Keep files under 8MB.'); return; }
    const { headers, records } = parseCSV(await f.text());
    if (records.length < 2) { setErr('Need a header row and at least 2 data rows.'); return; }
    const cols = {
      name: pick(headers, ['company', 'account', 'customer', 'name', 'organization']),
      activity: pick(headers, ['days_since', 'last_activity', 'last_login', 'inactive', 'days']),
      logins: pick(headers, ['login', 'session', 'visit', 'active_days']),
      tickets: pick(headers, ['ticket', 'support', 'request']),
      seats: pick(headers, ['seat', 'license', 'user_count', 'licenses']),
      used: pick(headers, ['used', 'active_users', 'utili']),
      value: pick(headers, ['value', 'amount', 'arr', 'mrr', 'revenue', 'price', 'spend']),
    };
    if (cols.activity == null && cols.logins == null && cols.tickets == null) {
      setErr(`Couldn’t find a usage column. Headers seen: ${headers.join(', ')}. Look for “last_activity”, “logins” or “tickets”.`);
      return;
    }
    const scored = records.map((r, i) => ({ r, name: cols.name ? r[cols.name] : `row ${i + 2}`, ...scoreRow(r, cols) }))
      .sort((a, b) => b.risk - a.risk);
    setTotal(records.length);
    setAtRisk(scored.filter((s) => s.risk >= 45).length);
    setTop(scored.slice(0, 5));
  }

  return (
    <>
      <label htmlFor="csv">Customer export CSV (processed in your browser — nothing stored)</label>
      <input id="csv" type="file" accept=".csv,text/csv" onChange={onFile} />
      {err && <p className="error-note">{err}</p>}

      {top.length > 0 && (
        <div className="result">
          <h3>{total} accounts scored · <span className="fail">{atRisk} at risk</span></h3>
          <table>
            <thead><tr><th>#</th><th>Account</th><th>Risk</th><th>Reason codes</th><th>Save-play</th></tr></thead>
            <tbody>
              {top.map((t, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{t.name}</td>
                  <td className={t.risk >= 60 ? 'fail' : t.risk >= 45 ? 'warn' : 'pass'}>{t.risk}</td>
                  <td>{t.reasons.join('; ') || '—'}</td>
                  <td>{t.play}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-note">Preview shows the top 5 of {total}. The planned ChurnSignal ranks every account, exports the full report, and tracks risk movement week over week.</p>
        </div>
      )}
    </>
  );
}
