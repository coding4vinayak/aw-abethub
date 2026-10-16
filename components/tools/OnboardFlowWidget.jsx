'use client';
import { useMemo, useState } from 'react';

const FREE_STEPS = 6;

const DEFAULT_STEPS = `Create your account | Use the invite link from your signup email — takes 10 seconds
video: Watch the 2-minute product tour | See the three screens you will live in every day
Connect your data source | Paste your CRM or billing API key so reports have something to read
Invite your team | Add at least two teammates; single-user accounts churn 3x faster
call: Book the weekly review call | Put a recurring 20-minute slot in the calendar
Run a test alert | Fire one sample alert to a Slack channel to prove the loop works`;

const TYPES = {
  task: { label: 'task', icon: '☐' },
  video: { label: 'video', icon: '▶' },
  call: { label: 'call', icon: '☎' },
};

function detectType(title, guide) {
  const t = `${title} ${guide}`;
  const explicit = title.match(/^\s*(task|video|call)\s*:\s*/i);
  if (explicit) return { type: explicit[1].toLowerCase(), titleClean: title.replace(/^\s*(task|video|call)\s*:\s*/i, '') };
  if (/\bvideo|watch|tour|tutorial|demo reel|loom\b/i.test(t)) return { type: 'video', titleClean: title };
  if (/\bcall\b|\bmeeting\b|schedule|book|\bsync\b|zoom|demos?\b|onboarding session|kick-?off/i.test(t)) return { type: 'call', titleClean: title };
  return { type: 'task', titleClean: title };
}

// Deterministic "time to complete" estimate — explicit durations win, then type baseline + guide reading time.
function estimateMinutes(type, title, guide) {
  const text = `${title} ${guide}`;
  const mins = text.match(/(\d{1,3})\s*(?:min|mins|minutes)\b/i);
  if (mins) return Math.min(120, Math.max(1, Number(mins[1])));
  const secs = text.match(/(\d{1,2})\s*(?:-|\s)?\s*(?:second|sec)s?\b/i);
  if (secs) return Math.max(1, Math.round(Number(secs[1]) / 60));
  const hours = text.match(/(\d{1,2})\s*(?:hour|hr)s?\b/i);
  if (hours) return Math.min(120, Number(hours[1]) * 60);
  const read = Math.round(String(guide || '').trim().split(/\s+/).filter(Boolean).length / 15); // ~15 wpm of guide reading + doing
  if (type === 'video') return 2 + read;
  if (type === 'call') return 20 + read;
  return 3 + read;
}

function parseSteps(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [title, ...rest] = l.split('|');
      const guide = rest.join('|').trim().slice(0, 240);
      const { type, titleClean } = detectType(title.trim(), guide);
      const titleFinal = (titleClean || `Step ${i + 1}`).slice(0, 80);
      return { id: i + 1, title: titleFinal || `Step ${i + 1}`, guide, type, minutes: estimateMinutes(type, titleFinal, guide) };
    });
}

export default function OnboardFlowWidget() {
  const [stepsText, setStepsText] = useState(DEFAULT_STEPS);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(() => ({ 1: true, 2: true }));
  const [order, setOrder] = useState(null);

  const steps = useMemo(() => parseSteps(stepsText), [stepsText]);

  // effective display order: custom order while it still matches the parsed set, else parse order
  const ordered = useMemo(() => {
    if (order && order.length === steps.length && steps.every((s) => order.includes(s.id))) {
      return order.map((id) => steps.find((s) => s.id === id)).filter(Boolean);
    }
    return steps;
  }, [order, steps]);

  const shown = ordered.slice(0, FREE_STEPS);
  const hidden = Math.max(0, ordered.length - FREE_STEPS);
  const doneCount = shown.filter((s) => done[s.id]).length;
  const pct = shown.length ? Math.round((doneCount / shown.length) * 100) : 0;
  const totalMinutes = shown.reduce((a, s) => a + s.minutes, 0);
  const remainingMinutes = shown.filter((s) => !done[s.id]).reduce((a, s) => a + s.minutes, 0);

  // completion % per status (done vs open) and per step type
  const byStatus = ['done', 'open'].map((st) => {
    const list = shown.filter((s) => (st === 'done' ? done[s.id] : !done[s.id]));
    return { status: st, n: list.length, pct: shown.length ? Math.round((list.length / shown.length) * 100) : 0 };
  });
  const byType = ['task', 'video', 'call'].map((tp) => {
    const list = shown.filter((s) => s.type === tp);
    const d = list.filter((s) => done[s.id]).length;
    return { type: tp, n: list.length, done: d, pct: list.length ? Math.round((d / list.length) * 100) : null, minutes: list.reduce((a, s) => a + s.minutes, 0) };
  }).filter((x) => x.n > 0);

  // Cheap enough to compute per render, and React Compiler memoizes it on its
  // own terms — unlike a hand-rolled useMemo whose deps it cannot verify.
  const cfg = {
    widget: 'onboardflow',
    version: 2,
    theme: 'light',
    progress: 'bar',
    storage: 'local',
    totals: { steps: shown.length, estimatedMinutes: totalMinutes, openMinutes: remainingMinutes },
    steps: shown.map((s, i) => ({
      order: i + 1,
      id: s.id,
      label: s.title,
      type: s.type,
      guide: s.guide || null,
      estimatedMinutes: s.minutes,
      status: done[s.id] ? 'done' : 'open',
    })),
  };
  const snippet = [
    '<!-- OnboardFlow free preview snippet -->',
    `<script type="application/json" id="onboardflow-config">${JSON.stringify(cfg, null, 0)}</script>`,
    '<script src="https://cdn.abetworks.in/onboardflow/v1/embed.js" defer></script>',
    '<div data-onboardflow="checklist" data-storage="local"></div>',
  ].join('\n');
  const embed = { cfg, snippet };

  function toggle(id) {
    setDone((d) => ({ ...d, [id]: !d[id] }));
    setCopied(false);
  }

  function move(index, dir) {
    const cur = [...ordered.map((s) => s.id)];
    const a = cur.indexOf(shown[index].id);
    const b = a + dir;
    if (a < 0 || b < 0 || b >= cur.length) return;
    [cur[a], cur[b]] = [cur[b], cur[a]];
    setOrder(cur);
    setCopied(false);
  }

  function copy() {
    setErr(''); setCopied(false);
    try {
      navigator.clipboard?.writeText(embed.snippet);
      setCopied(true);
    } catch {
      setErr('Your browser blocked clipboard access — select the snippet and copy manually.');
    }
  }

  return (
    <>
      <label htmlFor="of-steps">Your onboarding checklist — one step per line, optional “| guide text”, optional “video:” / “call:” prefix</label>
      <textarea id="of-steps" rows={9} maxLength={4000} value={stepsText}
        onChange={(e) => { setStepsText(e.target.value); setCopied(false); setOrder(null); }} placeholder={DEFAULT_STEPS} />

      {steps.length === 0 && <p className="error-note">Type at least one step.</p>}

      {steps.length > 0 && (
        <>
          <h3 style={{ margin: '18px 0 8px' }}>Live preview — click a step to toggle it, ▲▼ to reorder</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 12, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width .25s ease' }} />
            </div>
            <span className={pct === 100 ? 'pass' : 'warn'} style={{ fontWeight: 800, fontSize: 14 }}>{pct}%</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 10px' }}>
            {doneCount}/{shown.length} done · est. time to complete all {totalMinutes} min · {remainingMinutes} min still open
          </p>

          <div className="card" style={{ padding: 0, border: '1px solid var(--line)' }}>
            {shown.map((s, i) => (
              <div key={s.id} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%',
                padding: '12px 14px', borderBottom: i === shown.length - 1 ? '0' : '1px solid var(--line)',
                background: done[s.id] ? '#f0fdf4' : 'transparent',
              }}>
                <button type="button" onClick={() => toggle(s.id)} aria-pressed={Boolean(done[s.id])}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%', textAlign: 'left',
                    border: 0, padding: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', flex: 1,
                  }}>
                  <span style={{
                    flex: '0 0 auto', width: 20, height: 20, borderRadius: 6, border: `2px solid ${done[s.id] ? 'var(--free)' : 'var(--line)'}`,
                    background: done[s.id] ? 'var(--free)' : '#fff', color: '#fff', fontWeight: 800, fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{done[s.id] ? '✓' : ''}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, color: 'var(--ink)', textDecoration: done[s.id] ? 'line-through' : 'none' }}>
                      {i + 1}. {s.title}
                    </span>
                    {s.guide ? <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{s.guide}</span> : null}
                    <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 8px' }}>
                      {TYPES[s.type].icon} {s.type} · ~{s.minutes} min
                    </span>
                  </span>
                </button>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}
                    style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 6, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.35 : 1, fontSize: 11, padding: '2px 6px' }}>▲</button>
                  <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i >= shown.length - 1 || (hidden > 0 && i === shown.length - 1)}
                    style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 6, cursor: 'pointer', opacity: (i >= shown.length - 1 || (hidden > 0 && i === shown.length - 1)) ? 0.35 : 1, fontSize: 11, padding: '2px 6px' }}>▼</button>
                </span>
              </div>
            ))}
          </div>
          {pct === 100 && <p className="pass" style={{ marginTop: 10 }}>Checklist complete — this is the state that predicts activation.</p>}

          <h3 style={{ margin: '18px 0 8px' }}>Completion by status</h3>
          <table>
            <thead><tr><th>Status</th><th>Steps</th><th>Share</th></tr></thead>
            <tbody>
              {byStatus.map((b) => (
                <tr key={b.status}>
                  <td style={{ fontWeight: 700 }} className={b.status === 'done' ? 'pass' : 'warn'}>{b.status.toUpperCase()}</td>
                  <td>{b.n}</td>
                  <td>{b.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {byType.length > 0 && (
            <table>
              <thead><tr><th>Type</th><th>Steps</th><th>Done</th><th>Completion</th><th>Est. minutes</th></tr></thead>
              <tbody>
                {byType.map((b) => (
                  <tr key={b.type}>
                    <td style={{ fontWeight: 700 }}>{TYPES[b.type].icon} {b.type}</td>
                    <td>{b.n}</td>
                    <td>{b.done}</td>
                    <td className={b.pct === 100 ? 'pass' : b.pct === 0 ? 'fail' : 'warn'}>{b.pct}%</td>
                    <td>{b.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {hidden > 0 && <p className="cap-note">{hidden} further step{hidden > 1 ? 's' : ''} are parsed but hidden — the free preview renders {FREE_STEPS} steps.</p>}

          <h3 style={{ margin: '18px 0 8px' }}>Embed snippet</h3>
          <pre style={{
            background: 'var(--ink)', color: '#e5e7eb', padding: 14, borderRadius: 10, fontSize: 12,
            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
          }}>{embed.snippet}</pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn secondary" type="button" onClick={copy}>Copy snippet</button>
            {copied && <span className="pass" style={{ fontSize: 13 }}>Copied.</span>}
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{shown.length} steps · {byType.map((t) => `${t.n} ${t.type}`).join(' · ')} · {JSON.stringify(embed.cfg).length} bytes of config</span>
          </div>
          {err && <p className="error-note">{err}</p>}

          <p className="cap-note">
            Free preview builds a {FREE_STEPS}-step checklist and the paste-ready embed config. The planned OnboardFlow hosts the widget in your product,
            tracks completion, time-to-value and drop-off per step, and lets you A/B the order.
          </p>
        </>
      )}
    </>
  );
}
