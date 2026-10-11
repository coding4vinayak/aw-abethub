'use client';
import { useEffect, useMemo, useState } from 'react';

const STATUSES = ['planned', 'in-progress', 'shipped'];
const CATEGORIES = ['feature', 'bug', 'ux'];
const PAY_BONUS = 5; // self-declared "would pay" vote weight
const FREE_CAP = 5;
const LS_KEY = 'hub.featurevote.v1';

function statusClass(s) {
  return s === 'shipped' ? 'pass' : s === 'in-progress' ? 'warn' : 'fail';
}

const CAT_STYLE = {
  feature: { background: 'var(--accent-soft)', color: 'var(--accent)' },
  bug: { background: '#fef2f2', color: 'var(--error)' },
  ux: { background: 'var(--free-soft)', color: 'var(--free)' },
};

// migrate boards saved before categories/pay-weight existed
function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i) => i && i.id).map((i) => ({
    id: i.id,
    text: String(i.text || ''),
    votes: Number.isFinite(i.votes) ? i.votes : 1,
    status: STATUSES.includes(i.status) ? i.status : STATUSES[0],
    category: CATEGORIES.includes(i.category) ? i.category : 'feature',
    wouldPay: Boolean(i.wouldPay),
    created: Number.isFinite(i.created) ? i.created : Date.now(),
  }));
}

const weight = (i) => i.votes + (i.wouldPay ? PAY_BONUS : 0);

function toCSV(ideas) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Idea', 'Category', 'Status', 'Votes', 'Would pay', 'Weighted score', 'Created'].join(',')];
  for (const i of [...ideas].sort((a, b) => weight(b) - weight(a))) {
    rows.push([esc(i.text), i.category, i.status, i.votes, i.wouldPay ? 'yes' : 'no', weight(i), new Date(i.created).toISOString()].join(','));
  }
  return rows.join('\n');
}

export default function FeatureVoteWidget() {
  const [ideas, setIdeas] = useState([]);
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setIdeas(normalize(JSON.parse(raw)));
    } catch { /* ignore corrupt state */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(ideas)); } catch { /* storage full/blocked */ }
  }, [ideas, ready]);

  const atCap = ideas.length >= FREE_CAP;
  const byStatus = useMemo(() => {
    const cols = { planned: [], 'in-progress': [], shipped: [] };
    ideas.forEach((i) => { if (cols[i.status]) cols[i.status].push(i); });
    for (const k of Object.keys(cols)) cols[k].sort((a, b) => weight(b) - weight(a) || a.created - b.created);
    return cols;
  }, [ideas]);

  function addIdea(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || atCap) return;
    setIdeas((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, votes: 1, status: STATUSES[0], category, wouldPay: false, created: Date.now() }]);
    setDraft('');
  }

  function vote(id) {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i)));
  }

  function togglePay(id) {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, wouldPay: !i.wouldPay } : i)));
  }

  function move(id, dir) {
    setIdeas((prev) => prev.map((i) => {
      const idx = STATUSES.indexOf(i.status) + dir;
      if (idx < 0 || idx >= STATUSES.length) return i;
      return { ...i, status: STATUSES[idx] };
    }));
  }

  function remove(id) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }

  function exportCSV() {
    const blob = new Blob([toCSV(ideas)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'featurevote-board.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <form onSubmit={addIdea}>
        <label htmlFor="fv-input">Add a feature idea {ready && ideas.length > 0 ? `(${ideas.length}/${FREE_CAP} free)` : ''}</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input id="fv-input" type="text" placeholder="e.g. Export board to CSV" value={draft}
            onChange={(e) => setDraft(e.target.value)} disabled={atCap} style={{ flex: '1 1 240px' }} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={atCap} aria-label="Idea category" style={{ flex: '0 0 auto', width: 'auto' }}>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="ux">UX</option>
          </select>
          <button className="btn" type="submit" disabled={!draft.trim() || atCap}>Add idea</button>
        </div>
      </form>

      {atCap && <p className="error-note" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Free board limit reached ({FREE_CAP} ideas). FeatureVote paid removes the cap and adds a public embed page plus customer accounts.</p>}

      {ideas.length > 0 ? (
        <div className="result">
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Roadmap pipeline <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· weighted score = votes + 5 when “would pay” is declared</span></span>
            <button className="btn secondary" type="button" onClick={exportCSV} style={{ padding: '6px 14px', fontSize: 13 }}>Export CSV ⤓</button>
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {STATUSES.map((st) => (
              <div key={st} style={{ flex: '1 1 220px', border: '1px solid var(--line)', borderRadius: 10, padding: 10, background: '#fff' }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <span className={statusClass(st)}>{st}</span>
                  <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {byStatus[st].length}</span>
                </p>
                {byStatus[st].length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: 0 }}>empty</p>}
                {byStatus[st].map((i) => (
                  <div key={i.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, background: '#fbfcfe' }}>
                    <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 13 }}>
                      <span style={{ borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, marginRight: 6, ...(CAT_STYLE[i.category] || CAT_STYLE.feature) }}>{i.category}</span>
                      {i.text}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn secondary" onClick={() => vote(i.id)} style={{ padding: '2px 10px', fontSize: 12, fontWeight: 800 }} aria-label={`Upvote ${i.text}`}>▲ {i.votes}</button>
                      <button className="btn secondary" onClick={() => togglePay(i.id)} aria-pressed={i.wouldPay}
                        style={{ padding: '2px 10px', fontSize: 12, fontWeight: 700, ...(i.wouldPay ? { background: 'var(--free-soft)', color: 'var(--free)', border: '1px solid var(--free)' } : {}) }}>
                        {i.wouldPay ? 'would pay ✓ +5' : 'would pay +5'}
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>score {weight(i)}</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button className="btn secondary" onClick={() => move(i.id, -1)} disabled={i.status === STATUSES[0]} style={{ padding: '2px 8px', fontSize: 12 }} aria-label={`Move ${i.text} back`}>◀</button>
                        <button className="btn secondary" onClick={() => move(i.id, 1)} disabled={i.status === STATUSES[STATUSES.length - 1]} style={{ padding: '2px 8px', fontSize: 12 }} aria-label={`Advance ${i.text}`}>▶</button>
                        <button className="btn secondary" onClick={() => remove(i.id)} style={{ padding: '2px 8px', fontSize: 12 }} aria-label={`Delete ${i.text}`}>×</button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="cap-note">This board saves to your browser only. Paid adds a public embeddable board, one-vote-per-customer accounts, and admin-weighted signals so quiet-but-valuable requests surface.</p>
        </div>
      ) : (
        <p style={{ color: 'var(--ink-3)', marginTop: 14 }}>No ideas yet — add your first one above. Votes, “would pay” weights and pipeline columns persist in this browser.</p>
      )}
    </>
  );
}
