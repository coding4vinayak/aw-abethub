import { NextResponse } from 'next/server';
import { safeFetch, htmlBits } from '../../../lib/fetchpage';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

function clean(s, max = 90) {
  let out = String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[“”]/g, '"')
    .trim()
    .slice(0, max);
  if (String(s || '').trim().length > max) {
    const last = out.lastIndexOf(' ');
    if (last > max * 0.6) out = out.slice(0, last);
  }
  return out.trim();
}

// Pick the most human-specific phrase we actually observed on the page.
function pickPhrase(bits) {
  const usable = (c) => c.length >= 12 && c.length <= 120 && !c.includes('|') && !/©|\d{4,}/.test(c);
  const candidates = [
    ...bits.h2s,
    ...bits.h1s,
    bits.description,
    bits.title,
  ].map((c) => clean(c)).filter(usable);
  if (candidates.length) {
    // Prefer the longest concrete phrase, capped — marketing slogans beat nav labels.
    return candidates.sort((a, b) => b.length - a.length)[0];
  }
  const sentence = clean(bits.body.split(/(?<=[.!?])\s+/).find((s) => s.length >= 25 && !s.includes('|')) || '', 120);
  return sentence.length >= 20 ? sentence : null;
}

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  let raw = String(q.get('url') || '').trim();
  const product = clean(String(q.get('product') || ''), 300);

  if (!raw) return NextResponse.json({ error: 'Enter the prospect website URL.' }, { status: 400 });
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try { const u = new URL(raw); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch {
    return NextResponse.json({ error: 'That is not a valid URL.' }, { status: 400 });
  }
  if (product.length < 5) {
    return NextResponse.json({ error: 'Describe your product in one line (at least 5 characters).' }, { status: 400 });
  }

  let page;
  try {
    page = await safeFetch(raw, { timeoutMs: 9000 });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg === 'bad url' || msg.includes('private address') || msg.includes('http(s) only')) {
      return NextResponse.json({ error: 'That prospect URL is not publicly fetchable.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not reach the prospect site — it timed out or refused the connection.' }, { status: 502 });
  }
  if (page.status >= 400) {
    return NextResponse.json({ error: `Prospect page returned HTTP ${page.status}.` }, { status: 422 });
  }

  const bits = htmlBits(page.html);
  const phrase = pickPhrase(bits);
  if (!phrase) {
    return NextResponse.json({ error: 'We reached the site but could not extract any readable text to research from.' }, { status: 422 });
  }

  const domain = new URL(page.finalUrl).hostname.replace(/^www\./, '');
  const prodLine = product.replace(/\.$/, '');
  // Extra observed context so the AI (and the fallback note) can reason about the site, not just one line.
  const observed = [bits.title, ...bits.h1s.slice(0, 2), ...bits.h2s.slice(0, 3)]
    .map((c) => clean(c, 100)).filter(Boolean);

  let opener = null, why = null, source = 'engine';
  if (aiAvailable()) {
    try {
      const out = await aiJson(
        'You are an SDR researcher writing ONE cold-email opener. JSON keys: "opener" (exactly two sentences plus one short question CTA; must quote the observed phrase verbatim or near-verbatim; no flattery clichés, no “I hope this finds you well”; ≤90 words) and "why" (one sentence ≤30 words explaining why this opener earns a reply — Instantly/Apollo “hyper-personalization” style).',
        `Prospect site: ${domain}\nObserved phrase from their homepage: “${phrase}”\nOther observed homepage lines: ${JSON.stringify(observed)}\nSender's product (one line): ${prodLine}\nWrite the opener now.`,
        { maxTokens: 350 },
      );
      const cleaned = clean(String(out.opener || ''), 700);
      if (cleaned.length >= 40) {
        opener = cleaned;
        why = clean(String(out.why || ''), 220) || null;
        source = 'ai';
      }
    } catch { /* fall through to deterministic composer */ }
  }

  if (!opener) {
    const variants = [
      { text: `Your “${phrase}” line on ${domain} stood out — most teams in your space talk around that, not about it. ${prodLine} is built to make that exact gap measurable this quarter. Open to a 15-minute look at how it would land on ${domain}?`,
        why: 'It opens with their own words, proves you researched the real site, then ties that claim to a measurable problem you solve — the pattern Instantly/Apollo hyper-personalization prompts chase.' },
      { text: `We crawled ${domain} before writing — “${phrase}” is the line we kept coming back to. ${prodLine} backs that claim up with proof your buyers can verify. Worth 15 minutes to see where it fits?`,
        why: 'Admitting you did the homework flips the power dynamic: the first sentence is verifiable evidence, not a claim, which is exactly what raises reply rates on cold mail.' },
      { text: `The “${phrase}” promise on ${domain} is rarer than it sounds — most sites quietly drop it after the homepage. ${prodLine} helps teams keep that promise measurable instead of aspirational. Is that a problem you're actively working on?`,
        why: 'It frames their marketing promise as a standard they can be measured against — a gentle challenge that invites a reply without insulting them.' },
    ];
    const v = variants[phrase.length % variants.length];
    opener = v.text;
    why = v.why;
  }

  return NextResponse.json({ opener, why, phrase, domain, source });
}
