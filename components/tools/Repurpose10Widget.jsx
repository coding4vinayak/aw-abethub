'use client';
import { useState } from 'react';

const MAX_CHARS = 12000;
const MIN_CHARS = 300;
const PREVIEW_FORMATS = 3;

const STOP = new Set(('the and for that this with from their there they them then than what when where which while into onto about after before because since until against between through during above below your yours our ours his her its are was were been being have has had having would could should will shall may might must need dare a an or but nor so if of in on at by to as it we you me us him he she my is am do does did not no yes just also very really quite basically actually simply much many most more less all any each every some such own same other new now get gets got put puts set sets use uses used using help helps making made make makes like likes way ways thing things people person team teams business businesses company companies customer customers client clients user users instead rather without within across around over under up down out off too both few those these who whom whose how why whether able upon per via etc one two three first second well still even something anything nothing everything').split(' '));

const stem = (w) => {
  if (w.length <= 4) return w;
  return w.replace(/(ing|edly|ies|es|ed|s)$/, (m) => (m === 'ies' ? 'y' : '')) || w;
};

// Tone changes the connective tissue and the length budget — same ranked
// sentences, different voice. (Repurpose.io / Copy.ai sell this as the
// "tone of voice" dropdown.)
const TONES = {
  neutral: {
    label: 'Neutral (engine default)',
    budget: 1.0,
    threadLead: '', liLead: '', nlGreet: 'Hi [first name],',
    pollAsk: 'When it comes to {topic}, what moves the needle most for your team?',
    liClose: 'What would you add to this?',
    threadCta: 'Repost post 1 if it was useful.',
    igClose: "Save this one — you'll want it next time you plan {topic}.",
    ytHook: 'Watch this before you touch {topic}.',
    redditIntro: 'I wrote up what I learned about {topic} — summarising it here for the sub:',
    redditClose: 'Source: my own long-form post on this. Happy to answer questions.',
  },
  punchy: {
    label: 'Punchy (short, bold, low word count)',
    budget: 0.72,
    threadLead: 'Hot take:', liLead: 'Stop scrolling.', nlGreet: 'Quick one,',
    pollAsk: 'Be honest — on {topic}, what actually matters?',
    liClose: 'Agree or disagree — replies open.',
    threadCta: 'Repost it. That is the whole thread.',
    igClose: 'Do not lose this — save it before you forget {topic}.',
    ytHook: '3 seconds on {topic}. Ready? Go.',
    redditIntro: 'Real talk on {topic} — the version I wish someone told me:',
    redditClose: 'TL;DR in my profile if you are allergic to walls of text.',
  },
  professional: {
    label: 'Professional (formal, report-style)',
    budget: 1.18,
    threadLead: 'A practical note:', liLead: 'Worth ten seconds of your reading list.', nlGreet: 'Hello,',
    pollAsk: 'In your experience with {topic}, which factor carries the most weight?',
    liClose: 'I would welcome your perspective in the comments.',
    threadCta: 'If this was useful, share it with a colleague.',
    igClose: 'A reference worth keeping for the next {topic} planning cycle.',
    ytHook: 'One chart on {topic} — sixty seconds, no fluff.',
    redditIntro: 'Sharing a structured summary of our work on {topic} for anyone in a similar position:',
    redditClose: 'Happy to share the methodology privately if useful.',
  },
};

function cleanBody(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 320 && /[a-z]{3}/i.test(s));
}

const tokens = (s) => s.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);

function keywordFreq(sentences) {
  const freq = {};
  for (const s of sentences) {
    for (const w of tokens(s)) {
      if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
      const k = stem(w);
      if (k.length < 4 || STOP.has(k)) continue;
      freq[k] = (freq[k] || 0) + 1;
    }
  }
  return freq;
}

function scoreSentence(s, freq) {
  const words = tokens(s);
  let kw = 0;
  for (const w of words) { const k = stem(w); if (freq[k]) kw += freq[k]; }
  let score = (kw / Math.max(4, words.length)) * 22 + Math.min(words.length, 30) * 0.4;
  if (/\d/.test(s)) score += 6;
  if (/\b(you|your|we|our)\b/i.test(s)) score += 3;
  if (/^(in this|as you can see|it is important|welcome to|conclusion|obviously)/i.test(s)) score -= 8;
  if (/\b(very|really|quite|basically|actually|simply)\b/i.test(s)) score -= 2;
  if (words.length < 8 || words.length > 34) score -= 5;
  if (/https?:|www\./.test(s)) score -= 8;
  return score;
}

function fit(str, max) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  const base = (sp > max * 0.45 ? cut.slice(0, sp) : cut).replace(/[^A-Za-z0-9!"')\]%.]+$/, '');
  return `${base}…`.slice(0, max);
}

const tag = (w) => `#${String(w).replace(/[^A-Za-z0-9]/g, '').replace(/^(.)/, (c) => c.toUpperCase())}`;

function hardTrim(str, max) {
  const s = String(str);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  const nl = cut.lastIndexOf('\n');
  const at = Math.max(sp > max * 0.6 ? sp : -1, nl > max * 0.6 ? nl : -1);
  return `${(at > 0 ? cut.slice(0, at) : cut).replace(/\s+$/, '')}…`;
}

const cap1 = (w) => String(w).charAt(0).toUpperCase() + String(w).slice(1);

function buildOutputs(source, sentences, kws, toneKey) {
  const T = TONES[toneKey] || TONES.neutral;
  const B = (n) => Math.max(28, Math.round(n * T.budget));
  const top = sentences.map((s) => s.replace(/"/g, '"')).filter((s, i, a) => a.indexOf(s) === i);
  const s1 = top[0] || fit(source, 200);
  const s2 = top[1] || s1;
  const s3 = top[2] || s2;
  const s4 = top[3] || s3;
  const s5 = top[4] || s4;
  const s6 = top[5] || s5;
  const short = [...top].sort((a, b) => a.length - b.length)[0] || s1;
  const tags = kws.slice(0, 3).map(tag).join(' ');
  const topic = fit(kws.length ? `${kws[0]} ${kws[1] || ''}`.trim() : 'this', 60);
  const fill = (tpl) => tpl.replace(/\{topic\}/g, topic);

  // LinkedIn poll: two sentences (context + question) and four options ≤30 chars.
  const pollOptions = [
    fit(cap1(kws[0] || 'Budget'), 30),
    fit(cap1(kws[1] || 'Tooling'), 30),
    fit(cap1(kws[2] || 'Process'), 30),
    'Something else — replies',
  ];

  // IG carousel: one bullet per slide, taken directly from ranked sentences.
  const carouselSlides = [
    ['Slide 1 (title)', fit(s1, B(60))],
    ['Slide 2 (why it matters)', fit(s2, B(85))],
    ['Slide 3', fit(s3, B(85))],
    ['Slide 4', fit(s4, B(85))],
    ['Slide 5', fit(s5, B(85))],
    ['Slide 6 (payoff)', fit(short, B(85))],
    ['Slide 7 (CTA)', `Follow for more on ${topic}`],
  ];

  return [
    {
      label: 'X thread · post 1 of 3 (opener)', limit: 280,
      text: [T.threadLead, fit(s1, B(200))].filter(Boolean).join(' ') + `\n\nA thread on ${topic}. 1/`,
    },
    {
      label: 'X thread · post 2 of 3 (the proof)', limit: 280,
      text: `${fit(s2, B(235))}\n\n${tags}`,
    },
    {
      label: 'X thread · post 3 of 3 (close + CTA)', limit: 280,
      text: `${fit(s3, B(190))}\n\nIf you only keep one thing: ${fit(short, B(55))}\n\n${T.threadCta}`,
    },
    {
      label: 'LinkedIn post (hook + spacing + hashtags)', limit: 3000,
      text: `${T.liLead}\n\n${fit(s1, B(105))}\n\n${fit(s2, B(250))}\n\n${fit(s3, B(250))}\n\n${fit(s4, B(220))}\n\n${T.liClose}\n\n${tags} ${tag(kws[3] || kws[0])}`,
    },
    {
      label: 'LinkedIn poll (2 sentences + 4 options ≤30 chars)', limit: 3000,
      text: `${fit(s1, B(110))}\n${fit(fill(T.pollAsk), 240)}\nOptions:\n${pollOptions.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
    },
    {
      label: 'Newsletter intro (subject + preheader + body)', limit: 3000,
      text: `Subject: ${fit(s1.replace(/[.]$/, ''), B(58))}\nPreheader: ${fit(`${s2} ${topic}`, B(90))}\n\n${T.nlGreet}\n\n${fit(s1, B(230))}\n\nThis week we broke down ${topic}:\n\n• ${fit(s2, B(120))}\n• ${fit(s3, B(120))}\n• ${fit(s4, B(120))}\n\nFull read: [link]\n\n— [Your name]`,
    },
    {
      label: 'Instagram caption + hashtags', limit: 2200,
      text: `${fit(s1, B(150))}\n\n${fit(s2, B(150))}\n\n${fill(T.igClose)}\n\n.\n.\n${tags} ${kws.slice(3, 7).map(tag).join(' ')}`.trim(),
    },
    {
      label: 'IG carousel outline (slide bullets from sentences)', limit: 3000,
      text: carouselSlides.map(([h, b]) => `${h}: ${b}`).join('\n'),
    },
    {
      label: 'YouTube Short hook + beat sheet', limit: 3000,
      text: `0-3s HOOK (say to camera): "${fit(fill(T.ytHook) + ' ' + fit(s1, B(80)), B(130))}"\n\n3-25s BEAT 1: ${fit(s2, B(160))}\n\n25-45s BEAT 2: ${fit(s3, B(160))}\n\n45-55s PROOF: show the numbers behind "${fit(short, B(70))}"\n\nCTA: "Follow for the full breakdown — link in bio."\n\nOn-screen text: ${kws.slice(0, 2).map((k) => k.toUpperCase()).join(' · ')}`,
    },
    {
      label: 'Reddit community post (title + body + TL;DR)', limit: 3800,
      text: `Title: ${fit(s1.replace(/[.]$/, ''), 300)}\n\nBody:\n\n${fill(T.redditIntro)}\n\n1) ${fit(s2, B(240))}\n2) ${fit(s3, B(240))}\n3) ${fit(s4, B(240))}\n4) ${fit(s5, B(240))}\n\n${fit(s6, B(240))}\n\n${T.redditClose}\n\nTL;DR: ${fit(short, B(140))}`,
    },
  ].map((o) => {
    const text = hardTrim(o.text, o.limit);
    return {
      label: o.label, limit: o.limit, text, chars: text.length,
      trimmed: text.length !== o.text.length,
    };
  });
}

export default function Repurpose10Widget() {
  const [text, setText] = useState('');
  const [tone, setTone] = useState('neutral');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(-1);

  function run(e) {
    e.preventDefault();
    setErr(''); setRes(null); setCopied(-1);
    const raw = text.trim();
    if (raw.length < MIN_CHARS) { setErr(`Paste at least ${MIN_CHARS} characters of a real post — short blurbs give nothing to repurpose.`); return; }
    const body = cleanBody(raw).slice(0, MAX_CHARS);
    const sentences = splitSentences(body);
    if (sentences.length < 3) { setErr('Could not find 3 usable sentences. Paste full prose with proper sentence endings, not bullet fragments.'); return; }
    const freq = keywordFreq(sentences);
    const kws = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || b.length - a.length).slice(0, 8);
    if (kws.length < 3) { setErr('Not enough descriptive vocabulary to build platform-native variants — try a longer post.'); return; }
    const ranked = sentences
      .map((s) => ({ s, score: scoreSentence(s, freq) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.s);
    setRes({ outputs: buildOutputs(body, ranked, kws, tone), tone, sentences: sentences.length, keywords: kws.map((k) => `${k} ×${freq[k]}`), chars: body.length });
  }

  async function copy(o, i) {
    try {
      await navigator.clipboard.writeText(o.text);
      setCopied(i);
      setTimeout(() => setCopied(-1), 2000);
    } catch { setErr('Your browser blocked clipboard access — select the text and copy manually.'); }
  }

  const shown = res ? res.outputs.slice(0, PREVIEW_FORMATS) : [];

  return (
    <>
      <form onSubmit={run}>
        <label htmlFor="post">Your blog post or long text (up to {MAX_CHARS.toLocaleString()} characters)</label>
        <textarea id="post" rows={9} style={{ minHeight: 220 }} maxLength={MAX_CHARS}
          placeholder="Paste the article you want turned into platform-native content…"
          value={text} onChange={(e) => setText(e.target.value)} />
        <label htmlFor="tone" style={{ marginTop: 10, display: 'block' }}>Tone of voice</label>
        <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} style={{ maxWidth: 340 }}>
          {Object.entries(TONES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={text.trim().length < MIN_CHARS}>Repurpose it</button>
          <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{text.trim().length.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars</span>
        </div>
      </form>

      {err && <p className="error-note">{err}</p>}

      {res && (
        <div className="result">
          <h3>Generated from {res.sentences} sentences · {TONES[res.tone]?.label.split(' ')[0] || 'Neutral'} tone</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 0 }}>
            Top keywords: {res.keywords.slice(0, 6).join(' · ')}
          </p>
          {shown.map((o, i) => (
            <div key={o.label} style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13 }}>{o.label}</strong>
                <span style={{ fontSize: 12, color: o.chars > o.limit ? 'var(--error)' : 'var(--ink-3)' }}>
                  {o.chars} / {o.limit} chars{o.trimmed ? ' · hard-trimmed to limit' : ''}
                </span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, margin: '8px 0 10px' }}>{o.text}</p>
              <button className="btn secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => copy(o, i)}>
                {copied === i ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          ))}

          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12 }}>
            {res.outputs.length - shown.length} more formats computed and hidden in this preview.
          </p>

          <p className="cap-note">
            The preview shows {shown.length} of {res.outputs.length} platform formats per run. The planned Repurpose10 unlocks all
            ten, plus BrandVoice tone matching so the output reads like you, not like a template — planned from $9/mo.
          </p>
        </div>
      )}
    </>
  );
}
