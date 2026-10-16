'use client';
import { useState } from 'react';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'be', 'you', 'your', 'we', 'our', 'will', 'must', 'should', 'have', 'has', 'this', 'that', 'from', 'as', 'at', 'by', 'who', 'ability', 'able', 'work', 'working', 'role', 'team', 'teams', 'job', 'candidate', 'candidates', 'years', 'year', 'experience', 'experienced', 'plus', 'strong', 'good', 'great', 'required', 'requirement', 'requirements', 'preferred', 'responsibilities', 'qualifications', 'skills', 'skill', 'etc', 'using', 'use', 'used', 'looking', 'join', 'help', 'day', 'days', 'week', 'month', 'new', 'also', 'into', 'about', 'like', 'across', 'what',
  // role & boilerplate words are not evidence of a specific skill
  'senior', 'junior', 'mid', 'engineer', 'engineers', 'developer', 'developers', 'manager', 'managers', 'lead', 'titles',
  // must-hint vocabulary itself must not become a "term"
  'deep', 'expertise', 'knowledge', 'understanding', 'proficient', 'proficiency', 'essential', 'critical', 'solid', 'advanced', 'minimum']);

const MUST_HINT = /\b(must[- ]?have|must know|must be|essential|critical|core|required|expertise|proficien\w+|deep (knowledge|experience|understanding)|advanced|at least|solid)\b/i;
const REQ_SECTION = /\b(must[- ]?haves?|requirements?|what you (bring|need)|required skills|you (will |')?l?need|technical (skills|stack|require))/i;
const PREF_SECTION = /\b(preferred|nice to have|bonus points|bonus|plus\b|desirable|a plus|good to have|ideally)/i;

// education ladder — highest detected level wins
const EDU_LEVELS = [
  { level: 4, label: 'Doctorate', res: [/\bph\.?d\.?\b/i, /\bdoctorate\b/i] },
  { level: 3, label: 'Masters', res: [/\bmba\b/i, /\bmasters?\b/i, /\bmaster of\b/i, /\bmsc\b/i, /\bm\.?s\.?c\.?\b/i, /\bpost-?graduate\b/i] },
  { level: 2, label: 'Bachelors', res: [/\bbachelors?\b/i, /\bb(?:sc|tech|a|\.?s\.?c\.?)\b/i, /\bb\.?tech\.?\b/i, /\bunder-?graduate\b/i, /\bgraduate\b/i, /\buniversity (?:degree|graduate|graduated)\b/i] },
  { level: 1, label: 'Diploma/secondary', res: [/\bdiploma\b/i, /\bassociate(?:'s)? degree\b/i, /\bhsc\b/i, /\b12th\b/i] },
];

// boundary-aware term regex: \b only where the term actually starts/ends with a word char
function termRe(word, flags = 'i') {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lb = /^\w/.test(word) ? '\\b' : '';
  const rb = /\w$/.test(word) ? '\\b' : '';
  const plural = /\w$/.test(word) ? '(?:es|s)?' : '';
  return new RegExp(`${lb}${esc}${plural}${rb}`, flags);
}

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z][a-z+#.\-/]{1,24}/g) || [])
    .map((w) => w.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

// term weighting: frequency + must-have context + position in JD + section membership.
// ALL candidates are analysed first, then the top 14 by weight — so a late "typescript"
// outranks filler instead of being cut alphabetically.
function extractTerms(jd) {
  const lower = String(jd).toLowerCase();
  const reqIdx = lower.search(REQ_SECTION);
  const prefIdx = lower.search(PREF_SECTION);
  const freq = new Map();
  for (const raw of tokenize(jd)) freq.set(raw, (freq.get(raw) || 0) + 1);

  const stats = [...freq.keys()].map((word) => {
    const re = termRe(word, 'gi');
    let mustHits = 0;
    let firstIdx = -1;
    let m;
    while ((m = re.exec(jd)) !== null) {
      if (firstIdx === -1) firstIdx = m.index;
      const win = jd.slice(Math.max(0, m.index - 80), m.index + word.length + 80);
      if (MUST_HINT.test(win)) mustHits++;
      if (re.lastIndex === m.index) re.lastIndex++; // guard zero-length
    }
    const count = freq.get(word);
    const posRatio = firstIdx >= 0 ? firstIdx / Math.max(1, jd.length) : 1;
    const inReqSection = reqIdx !== -1 && firstIdx >= reqIdx && (prefIdx === -1 || firstIdx < prefIdx);
    const afterPreferred = prefIdx !== -1 && firstIdx >= prefIdx;
    const weightScore = count * 2 + mustHits * 3 + (posRatio < 0.3 ? 2 : posRatio < 0.6 ? 1 : 0) + (inReqSection ? 3 : 0) - (afterPreferred ? 3 : 0);
    const must = !afterPreferred && (mustHits > 0 || inReqSection || (count >= 2 && posRatio <= 0.55));
    return { word, count, mustHits, posRatio, inReqSection, afterPreferred, weightScore, must };
  });

  const terms = stats
    .sort((a, b) => b.weightScore - a.weightScore || a.word.localeCompare(b.word))
    .slice(0, 14);

  if (terms.length && !terms.some((t) => t.must)) {
    const best = terms.reduce((a, b) => (b.weightScore > a.weightScore ? b : a));
    best.must = true;
  }
  return terms;
}

// experience-year extraction: "7 years" statements + work ranges "2019-2024" / "2019 – present"
function experienceYears(text) {
  const s = String(text);
  const nowY = new Date().getFullYear();
  let best = 0;
  const evidence = [];
  for (const m of s.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years|yrs)\b/gi)) {
    const y = parseInt(m[1], 10);
    if (y > 0 && y < 60 && y > best) { best = y; evidence.length = 0; }
    if (y === best) evidence.push(m[0].trim());
  }
  for (const m of s.matchAll(/((?:19|20)\d{2})\s*(?:[-–—]|to)\s*((?:19|20)\d{2}|present|current|now|ongoing)\b/gi)) {
    const start = parseInt(m[1], 10);
    const end = /present|current|now|ongoing/i.test(m[2]) ? nowY : parseInt(m[2], 10);
    if (end < start) continue;
    const span = end - start;
    if (span > best) { best = span; evidence.length = 0; }
    if (span === best && span > 0) evidence.push(m[0].trim());
  }
  for (const m of s.matchAll(/\bsince\s+((?:19|20)\d{2})\b/gi)) {
    const span = nowY - parseInt(m[1], 10);
    if (span > best) { best = span; evidence.length = 0; }
    if (span === best && span > 0) evidence.push(m[0].trim());
  }
  return { years: Math.min(best, 40), evidence: evidence.slice(0, 3) };
}

function educationOf(text) {
  const s = String(text);
  for (const lvl of EDU_LEVELS) {
    for (const re of lvl.res) {
      const m = s.match(re);
      if (m) return { level: lvl.level, label: lvl.label, evidence: m[0] };
    }
  }
  return { level: 0, label: 'none detected', evidence: null };
}

function snippetAround(text, term) {
  const i = String(text).toLowerCase().indexOf(term);
  if (i < 0) return null;
  const start = Math.max(0, i - 26);
  const end = Math.min(text.length, i + term.length + 26);
  return `${start > 0 ? '…' : ''}${String(text).slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function scoreApplicant(text, terms) {
  const low = ` ${String(text)} `;
  const has = (word) => termRe(word).test(low);
  const must = terms.filter((t) => t.must);
  const nice = terms.filter((t) => !t.must);
  const matchedMust = must.filter((t) => has(t.word));
  const matchedNice = nice.filter((t) => has(t.word));
  const missingMust = must.filter((t) => !has(t.word));

  const exp = experienceYears(text);
  const edu = educationOf(text);

  const mustScore = must.length ? (matchedMust.length / must.length) * 60 : 0;
  const niceScore = nice.length ? (matchedNice.length / nice.length) * 15 : 0;
  const yearScore = Math.min(15, exp.years * 2);
  const eduScore = [0, 4, 10, 12, 14][edu.level] / 14 * 10;
  const total = Math.round(Math.min(100, mustScore + niceScore + yearScore + eduScore));

  const evidence = [...matchedMust, ...matchedNice]
    .map((t) => ({ term: t.word, must: t.must, snippet: snippetAround(text, t.word) }))
    .filter((e) => e.snippet)
    .slice(0, 8);

  const flags = [];
  if (missingMust.length) flags.push(`missing must-have: ${missingMust.slice(0, 3).map((t) => t.word).join(', ')}${missingMust.length > 3 ? ` +${missingMust.length - 3}` : ''}`);
  if (exp.years === 0) flags.push('no experience years found');
  if (edu.level === 0) flags.push('no education listed');

  return { total, matchedMust, matchedNice, missingMust, evidence, years: exp.years, yearEvidence: exp.evidence, edu, flags };
}

export default function HireSignalWidget() {
  const [jd, setJd] = useState('');
  const [apps, setApps] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  function run(e) {
    e.preventDefault();
    setErr(''); setRes(null);
    const applicants = apps.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 10);
    if (jd.trim().split(/\s+/).length < 15) { setErr('Job description needs at least 15 words.'); return; }
    if (applicants.length < 1) { setErr('Add at least one applicant (one resume summary per line).'); return; }

    const terms = extractTerms(jd);
    const scored = applicants
      .map((text, i) => {
        const nameMatch = text.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}/);
        const name = nameMatch ? nameMatch[0] : `Applicant ${i + 1}`;
        return { name, text, ...scoreApplicant(text, terms) };
      })
      .sort((a, b) => b.total - a.total);

    setRes({ terms, total: applicants.length, top: scored.slice(0, 3) });
  }

  return (
    <>
      <label htmlFor="hs-jd">Job description</label>
      <textarea id="hs-jd" rows={5} value={jd} onChange={(e) => setJd(e.target.value)}
        placeholder={'We need a senior React engineer with strong TypeScript experience. Must know REST APIs, testing with Jest, and GraphQL. 5+ years experience preferred. Bachelor degree in Computer Science.'} />

      <label htmlFor="hs-apps">Applicants — one resume summary per line</label>
      <textarea id="hs-apps" rows={6} value={apps} onChange={(e) => setApps(e.target.value)}
        placeholder={'Priya Sharma: 7 years React and TypeScript, built GraphQL APIs, Jest testing, BSc Computer Science\nJohn Doe: 2 years HTML/CSS, some JavaScript\nAisha Khan: React since 2018, REST APIs, testing, MBA'} />

      <button className="btn" type="button" onClick={run}>Rank applicants</button>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>Ranked fit <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {res.total} applicant{res.total > 1 ? 's' : ''} scored against {res.terms.length} weighted JD terms</span></h3>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 10px' }}>
            Must-have ({res.terms.filter((t) => t.must).length}): {res.terms.filter((t) => t.must).map((t) => t.word).join(', ') || '—'}
            <br />Nice-to-have: {res.terms.filter((t) => !t.must).map((t) => t.word).join(', ') || '—'}
          </p>
          <table>
            <thead><tr><th>#</th><th>Applicant</th><th>Fit</th><th>Matched evidence</th><th>Gaps</th></tr></thead>
            <tbody>
              {res.top.map((a, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{a.name}</td>
                  <td className={a.total >= 65 ? 'pass' : a.total >= 40 ? 'warn' : 'fail'}>{a.total}</td>
                  <td>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {a.matchedMust.map((t) => (
                        <span key={t.word} style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 600 }}>{t.word} ★</span>
                      ))}
                      {a.matchedNice.map((t) => (
                        <span key={t.word} style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--ink-3)', borderRadius: 999, padding: '1px 9px', fontSize: 12 }}>{t.word}</span>
                      ))}
                      {a.years ? <span style={{ background: 'var(--free-soft)', color: 'var(--free)', borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 600 }}>{a.years}y exp</span> : null}
                      {a.edu.level > 0 ? <span style={{ background: 'var(--free-soft)', color: 'var(--free)', borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 600 }}>{a.edu.label}</span> : null}
                    </span>
                    {a.evidence.length > 0 && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>term-by-term snippets ({a.evidence.length})</summary>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-3)' }}>
                          {a.evidence.map((ev, k) => (
                            <li key={k}><span style={{ fontWeight: 700, color: ev.must ? 'var(--accent)' : 'var(--ink-2)' }}>{ev.term}</span> — “{ev.snippet}”</li>
                          ))}
                          {a.yearEvidence.map((ev, k) => (
                            <li key={`y${k}`}><span style={{ fontWeight: 700, color: 'var(--free)' }}>experience</span> — “{ev}”</li>
                          ))}
                          {a.edu.evidence && (
                            <li><span style={{ fontWeight: 700, color: 'var(--free)' }}>education</span> — “{a.edu.evidence}”</li>
                          )}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className={a.flags.some((f) => f.startsWith('missing must-have')) ? 'fail' : 'warn'} style={{ fontSize: 12 }}>
                    {a.flags.length ? a.flags.join('; ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-note">Preview scores the top 3 applicants. The planned HireSignal ranks the full pile with ATS-style weighting, and adds bias flags (name/gender/age proxies) so scoring stays on skills.</p>
        </div>
      )}
    </>
  );
}
