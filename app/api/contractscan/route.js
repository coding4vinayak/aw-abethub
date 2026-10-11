import { NextResponse } from 'next/server';
import { aiAvailable, aiJson } from '../../../lib/ai';

export const runtime = 'nodejs';

const MAX_CHARS = 20_000;

const RULES = [
  {
    key: 'Unlimited liability / indemnity',
    risk: 'high',
    re: /\b(indemnif\w*|hold\s+harmless)\b[^.]{0,200}?|\bliability\b[^.]{0,80}?(unlimited|any\s+and\s+all)/gi,
    fix: 'Cap liability at 12 months of fees and make indemnity mutual and limited to third-party IP/data claims.',
  },
  {
    key: 'Auto-renewal',
    risk: 'high',
    re: /\bauto(?:matic(?:ally)?)?\s*renew\w*|evergreen\s+(term|renewal)|renew(?:s|al)?\s+for\s+successive|shall\s+renew\b/gi,
    fix: 'Require written opt-in renewal or at least 30-day exit notice after renewal, with a reminder obligation.',
  },
  {
    key: 'IP assignment',
    risk: 'high',
    re: /\b(?:assign\w*|transfer)\b[^.]{0,120}?\bintellectual\s+property|\bwork(?:s)?\s+made\s+for\s+hire|\ball\s+ip(?:\s+rights)?\b[^.]{0,80}?(vest|belong)/gi,
    fix: 'Keep ownership of your background IP; grant only a licence for deliverables, carving out pre-existing tools.',
  },
  {
    // Spellbook/LegalOn playbook staples: a change-of-control clause that lets
    // the vendor terminate or renegotiate when you are acquired is a deal risk.
    key: 'Change of control',
    risk: 'high',
    re: /\bchange\s+of\s+control\b|\bassign\w*\b[^.]{0,140}?(?:successor|acquisition|merger)|(?:acquisition|merger|change\s+of\s+ownership)[^.]{0,140}?(?:terminat|consent|renegot|void)/gi,
    fix: 'Make assignment permitted to successors/acquirers with notice only — never a unilateral vendor termination trigger.',
  },
  {
    // Most-favored terms can silently reprice you; MFN you grant away upside.
    key: 'Most-favored terms (MFN)',
    risk: 'med',
    re: /\bmost\s+favou?red\b|\bMFN\b|no\s+less\s+favo?urable|best\s+(?:pricing|rate|terms|offer)[^.]{0,100}?(?:offered|available|given|provided|customer)/gi,
    fix: 'If you grant MFN, scope it to identical terms/volume and sunset it; if the vendor grants none, expect price drift — verify against their public price list.',
  },
  {
    key: 'Unlimited expansion fees',
    risk: 'med',
    re: /\bexpansion\s+(?:fee|price|rate|charge)\w*|(?:additional|extra)\s+(?:seats?|users?|licenses?|modules?)[^.]{0,140}?(?:fee|price|rate|charge|at\s+then[-\s]current)|(?:price|fee)[s]?\s+(?:increase|adjust|revis)\w*[^.]{0,100}?(?:annual|each|renewal|discretion|without\s+notice)|uplift\s+(?:fee|rate|charge)/gi,
    fix: 'Fix expansion pricing at the current rate card ± a capped escalator (e.g. 5%/yr); forbid mid-term price changes without 60-day notice.',
  },
  {
    // Data ownership: detect the vendor-keeps-your-data variant, not just "you own your data".
    key: 'Data ownership at risk',
    risk: 'high',
    re: /(?:data|content|information)[^.]{0,140}?(?:shall\s+(?:be|remain)\s+)?(?:the\s+(?:exclusive\s+)?property|owned\s+by|belong(?:s)?\s+to)\s+(?:the\s+)?(?:provider|vendor|supplier|licensor)|(?:provider|vendor|supplier|licensor)[^.]{0,100}?(?:own|retain\s+(?:all\s+)?ownership|perpetual\s+(?:licence|license)|irrevocabl\w+)[^.]{0,100}?data|data[^.]{0,100}?(?:perpetual|irrevocable|royalty[-\s]free)\s+(?:licence|license)/gi,
    fix: 'Assert customer owns all input/business data; vendor gets a processing-only licence that ends on termination, with export and deletion duties.',
  },
  {
    key: 'Exclusivity',
    risk: 'med',
    re: /\bexclusiv(?:e|ity|ly)\b[^.]{0,160}/gi,
    fix: 'Narrow exclusivity to a defined category, territory and term — or convert it to first-right-of-refusal.',
  },
  {
    key: 'Late-payment interest / penalties',
    risk: 'med',
    re: /\b(?:late|overdue)\b[^.]{0,80}?(?:fee|interest|penalt)\w*|\binterest\b[^.]{0,60}?(?:per\s+month|monthly|%|p\.a\.)|default\s+interest/gi,
    fix: 'Cap default interest (e.g. 1.5%/month), require a 14-day cure period after written notice before penalties bite.',
  },
  {
    key: 'Foreign governing law',
    risk: 'med',
    re: /\b(?:governed\s+by|governing\s+law)\b[^.]{0,140}?(?:laws?|courts?|jurisdiction)\b[^.]{0,120}/gi,
    fix: 'Check the venue is workable for you: neutral seat, e-signature-friendly jurisdiction, or move disputes to arbitration.',
  },
  {
    key: 'Payment ahead of delivery',
    risk: 'low',
    re: /\b(?:prepaid|upfront|in\s+advance)\b[^.]{0,120}?(?:fee|payment|invoice|100%|full)/gi,
    fix: 'Tie payments to milestones or keep 20–30% payable on acceptance instead of full prepayment.',
  },
];

const ORDER = { high: 0, med: 1, low: 2 };

function quoteAround(text, index, length) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

function runDetectors(clipped) {
  const findings = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const hits = [];
    let lastEnd = -1;
    let m;
    while ((m = rule.re.exec(clipped)) !== null) {
      if (hits.length > 0 && m.index - lastEnd < 80) { lastEnd = Math.max(lastEnd, m.index + m[0].length); continue; } // same clause wording, don't double-report
      if (hits.length >= 3) break;
      hits.push({ fragment: quoteAround(clipped, m.index, m[0].length), fix: rule.fix });
      lastEnd = m.index + m[0].length;
    }
    for (const h of hits) findings.push({ clause: rule.key, risk: rule.risk, ...h });
  }

  // Absence check: you WANT a mutual termination-for-convenience exit…
  const hasExit = /\bterminat\w*\b[^.]{0,120}?(for\s+)?convenience|terminate\s+(the\s+)?agreement\s+(at\s+(any|its)\s+time|without\s+cause)/i.test(clipped);
  if (!hasExit) {
    const mentionsTermination = /terminat/i.test(clipped);
    findings.push({
      clause: 'No termination-for-convenience clause',
      risk: 'med',
      fragment: mentionsTermination
        ? 'The contract discusses termination but no without-cause exit right was found.'
        : 'No termination wording found at all — the exit path is undefined.',
      fix: 'Add a mutual right to terminate on 30–60 days’ written notice, with fees payable only for work accepted to date.',
    });
  }
  // …and an SLA/availability commitment if this is a service deal.
  const hasSla = /\bsla\b|service\s+level\s+(?:agreement|target|commitment|credit)|uptime\s+(?:of|target|guarantee|rate)?|\b99\.\d{1,2}\s*%|availability\s+(?:of|commitment|guarantee)/i.test(clipped);
  if (!hasSla) {
    findings.push({
      clause: 'No SLA / uptime commitment',
      risk: 'med',
      fragment: 'No SLA, service-level or uptime language found — you have no remedy if the service degrades.',
      fix: 'Add a 99.5%+ monthly uptime SLA with service credits (e.g. 5% of monthly fee per 0.5% below target) and a chronic-failure termination right.',
    });
  }

  findings.sort((a, b) => ORDER[a.risk] - ORDER[b.risk]);
  return findings;
}

function summarize(findings) {
  const heat = { high: 0, med: 0, low: 0 };
  for (const f of findings) heat[f.risk] = (heat[f.risk] || 0) + 1;
  const riskScore = Math.min(95, findings.reduce((acc, f) => acc + (f.risk === 'high' ? 25 : f.risk === 'med' ? 12 : 5), 0));
  const grade = riskScore <= 10 ? 'A' : riskScore <= 30 ? 'B' : riskScore <= 50 ? 'C' : riskScore <= 70 ? 'D' : 'F';
  return { heat, riskScore, grade };
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const text = String(body?.text || '').trim();
  if (text.length < 200) {
    return NextResponse.json({ error: 'Paste at least 200 characters of contract text.' }, { status: 400 });
  }
  const clipped = text.slice(0, MAX_CHARS);

  // Deterministic detector pass always runs — it is the floor and the fallback.
  const engineFindings = runDetectors(clipped);

  // AI mode (Spellbook/LegalOn-style): model extracts and grades clauses from
  // the real text; output is validated and falls back to detectors on anything odd.
  let findings = engineFindings;
  let source = 'engine';
  if (aiAvailable()) {
    try {
      const j = await aiJson(
        'You are a vendor-contract reviewer for the customer side. Extract risky or missing clauses from the contract text. Return JSON: {"findings":[{"clause":"short clause family name","risk":"high|med|low","fragment":"exact quoted snippet (≤160 chars) from the contract","fix":"one plain-English negotiation fix"}]}. Include missing protections (no termination-for-convenience, no SLA) as findings too. At most 10 findings, no commentary.',
        `CONTRACT (first ${Math.min(clipped.length, 12000)} chars):\n${clipped.slice(0, 12000)}`,
        { maxTokens: 1200, timeoutMs: 45000 },
      );
      const arr = Array.isArray(j?.findings) ? j.findings : [];
      const norm = arr
        .filter((f) => f && typeof f.clause === 'string' && ORDER[f.risk])
        .slice(0, 10)
        .map((f) => ({
          clause: String(f.clause).slice(0, 80),
          risk: f.risk,
          fragment: String(f.fragment || '').slice(0, 220),
          fix: String(f.fix || '').slice(0, 300),
        }));
      // Sanity: AI must at least ground its fragments in the actual contract.
      const grounded = norm.filter((f) => f.fragment && clipped.includes(f.fragment.replace(/^…|…$/g, '')));
      if (norm.length >= 2 && grounded.length >= Math.min(2, norm.length)) {
        findings = norm.sort((a, b) => ORDER[a.risk] - ORDER[b.risk]);
        source = 'ai';
      }
    } catch { /* deterministic detectors stay */ }
  }

  const { heat, riskScore, grade } = summarize(findings);

  return NextResponse.json({
    chars: clipped.length,
    truncated: text.length > MAX_CHARS,
    source,
    totalFindings: findings.length,
    riskScore,
    grade,
    heat,
    findings,
  });
}
