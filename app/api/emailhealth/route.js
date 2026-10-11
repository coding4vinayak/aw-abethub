import { NextResponse } from 'next/server';
import { promises as dns } from 'dns';

export const runtime = 'nodejs';

const DKIM_SELECTORS = ['default', 'google', 's1', 'selector1', 'mail'];

// TXT lookup: null = lookup failed / no record, [] never happens (resolveTxt throws on empty).
async function txtRaw(name) {
  try { return (await dns.resolveTxt(name)).map((parts) => parts.join('')); } catch { return null; }
}
async function ok(fn, fallback) { try { return await fn(); } catch { return fallback; } }

// ---- DMARC parser (MXToolbox/dmarcian style: p, sp, pct, rua, ruf, adkim, aspf, fo) ----
function parseDmarc(rec) {
  const out = { policy: null, subPolicy: null, pct: 100, rua: [], ruf: [], adkim: 'r', aspf: 'r', fo: null, version: null };
  for (const part of String(rec).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (k === 'v') out.version = v.toUpperCase();
    else if (k === 'p') out.policy = v.toLowerCase();
    else if (k === 'sp') out.subPolicy = v.toLowerCase();
    else if (k === 'pct') out.pct = Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : 100;
    else if (k === 'rua') out.rua = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'ruf') out.ruf = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'adkim') out.adkim = v.toLowerCase();
    else if (k === 'aspf') out.aspf = v.toLowerCase();
    else if (k === 'fo') out.fo = v.toLowerCase();
  }
  return out;
}

// ---- SPF helpers ----
function spfMechanisms(spf) {
  return spf.split(/\s+/).map((t) => t.toLowerCase()).filter(Boolean);
}
// Naive count of mechanisms that trigger a recursive DNS lookup (RFC 7208 limit = 10).
function spfLookupCount(spf) {
  let n = 0;
  for (const tok of spfMechanisms(spf)) {
    if (/^(include:|a[:/]|mx[:/]|ptr:|redirect=|exists:)/.test(tok)) n += 1;
  }
  return n;
}
// Wildcard SPF: an a:/include:/mx: mechanism pointing at a '*' hostname pattern.
function spfHasWildcard(spf) {
  return spfMechanisms(spf).some((tok) => /(^|:)(include|a|mx)[^:]*\*/.test(tok) || /^(a|include|mx)[:=].*\*/.test(tok));
}

function dkimKeyBits(p) {
  // base64 body length × 6 bits ≈ key size; round to nearest common size.
  const bytes = Math.floor((p.length * 3) / 4);
  const bits = bytes * 8;
  if (bits >= 1800) return 2048;
  if (bits >= 800) return 1024;
  return bits;
}

function gradeFor(score, checks) {
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c.status]));
  let grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  // Pro tools cap the grade when a core pillar is missing, regardless of total points.
  if (byKey.dmarc === 'fail' && grade < 'C') grade = 'C';
  if (byKey.spf === 'fail' && grade < 'D') grade = 'D';
  if (byKey.dkim === 'fail' && grade === 'A') grade = 'C';
  if (byKey.dkim === 'warn' && grade === 'A') grade = 'B';
  return grade;
}

export async function GET(req) {
  const domain = String(new URL(req.url).searchParams.get('domain') || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Enter a plain domain like example.com (no http://, no email address).' }, { status: 400 });
  }

  const [rootTxt, dmarcTxt, mxAll, aAll, aaaaAll] = await Promise.all([
    txtRaw(domain),
    txtRaw(`_dmarc.${domain}`),
    ok(() => dns.resolveMx(domain), null),
    ok(() => dns.resolve4(domain), []),
    ok(() => dns.resolve6(domain), []),
  ]);

  // Fail fast on a domain that resolves nowhere at all — probably not registered.
  const dead = (rootTxt === null) && (dmarcTxt === null) && (mxAll === null) && aAll.length === 0 && aaaaAll.length === 0;
  if (dead) {
    return NextResponse.json({ error: `Nothing resolves for ${domain} — check the spelling or pick a domain that is actually live.` }, { status: 422 });
  }

  const spfAll = (rootTxt || []).filter((t) => /^v=spf1/i.test(t));
  const spf = spfAll.length ? spfAll[0] : null;
  const dmarcRec = (dmarcTxt || []).map((t) => t.replace(/\s+/g, '')).find((t) => /v=DMARC1/i.test(t)) || null;
  const mx = (mxAll || []).filter((m) => m.exchange && m.exchange !== '.');
  const nullMx = (mxAll || []).some((m) => m.exchange === '.'); // RFC 7505 "0 ." — domain declares it receives no mail

  // DKIM: probe the common selectors, like MXToolbox's DKIM lookup does.
  const dkimResults = await Promise.all(DKIM_SELECTORS.map(async (sel) => {
    const txts = await txtRaw(`${sel}._domainkey.${domain}`);
    const rec = (txts || []).map((t) => t.replace(/\s+/g, '')).find((t) => /v=DKIM1/i.test(t));
    return rec ? { sel, rec } : null;
  }));
  const dkimFound = dkimResults.filter(Boolean);
  const dkimWeak = dkimFound.filter((d) => {
    const m = d.rec.match(/\bp=([^;\s]+)/i);
    return !m || m[1] === '' || dkimKeyBits(m[1]) < 1024;
  });

  // MX host must resolve to a real address; PTR/FCrDNS is the pro-tool deliverability hint.
  let mxHostIp = null, mxPtr = null;
  if (mx.length) {
    const top = mx.sort((a, b) => a.priority - b.priority)[0].exchange.replace(/\.$/, '');
    const ips = await ok(() => dns.resolve4(top), []);
    if (ips.length) {
      mxHostIp = ips[0];
      const ptrs = await ok(() => dns.reverse(mxHostIp), []);
      mxPtr = ptrs.find((p) => p.toLowerCase() === top.toLowerCase()) || ptrs[0] || null;
    }
  }

  const checks = [];
  const add = (key, label, status, detail, guidance) => checks.push({ key, label, status, detail, guidance });

  // --- SPF record + all mechanism ---
  if (!spf) {
    add('spf', 'SPF record', 'fail',
      'No v=spf1 record on the domain.',
      'Anyone on the internet can forge mail from this domain. Publish a single SPF record ending in “-all”.');
  } else if (spfAll.length > 1) {
    add('spf', 'SPF record', 'fail',
      `${spfAll.length} SPF records found — receivers fail SPF outright when there is more than one.`,
      'RFC 7208 allows exactly one SPF record. Merge them into a single include: chain.');
  } else if (/\+\s?all/i.test(spf)) {
    add('spf', 'SPF record', 'fail',
      'SPF ends in “+all” — you are explicitly authorizing every server on earth.',
      'Replace “+all” with “-all”. “+all” is the single most damaging SPF misconfiguration a filter can see.');
  } else if (/(~all|-all|all)/i.test(spf)) {
    add('spf', 'SPF record', 'pass',
      `One SPF record with a hard/soft fail: “${spf.slice(0, 140)}${spf.length > 140 ? '…' : ''}”.`,
      /-all/.test(spf) ? 'Good — “-all” is what Gmail and Microsoft want. Keep the record this clean.'
        : 'Upgrade “~all” to “-all” once your report feed (DMARC rua) shows no legit senders left outside the list.');
  } else {
    add('spf', 'SPF record', 'warn',
      `SPF exists but has no “all” terminator: “${spf.slice(0, 140)}”.`,
      'End your SPF record with “-all” — without a terminator, unlisted senders get a neutral pass on many receivers.');
  }

  // --- SPF recursive-lookup budget (10-lookup limit, includes counted naively) ---
  if (spf) {
    const n = spfLookupCount(spf);
    if (n > 10) {
      add('spflookups', 'SPF lookup count', 'fail',
        `${n} lookup-triggering mechanisms (include:/a:/mx:/redirect:) — over the RFC 7208 limit of 10.`,
        'Receivers stop evaluating at lookup #10 and mark the mail temperror/flaky. Flatten includes with an SPF-flattening service or remove stale senders.');
    } else if (n >= 8) {
      add('spflookups', 'SPF lookup count', 'warn',
        `${n} of the 10 allowed recursive lookups used.`,
        'You are close to the limit — every new sender tool will need an include, so audit for senders you already dropped.');
    } else {
      add('spflookups', 'SPF lookup count', 'pass',
        `${n} of the 10 allowed recursive lookups used.`,
        'Comfortably inside the SPF lookup budget — room to add a sender or two.');
    }
    if (spfHasWildcard(spf)) {
      add('wildcard', 'Wildcard SPF entry', 'fail',
        'A mechanism points at a wildcard hostname (an entry containing “*” like a:*.mail.example.com).',
        'Wildcards in SPF silently authorize every subdomain that ever gets an A record. Replace with the explicit hostname you mean to allow.');
    } else {
      add('wildcard', 'Wildcard SPF entry', 'pass', 'No wildcard mechanisms found.',
        'All SPF entries are explicit hostnames — nothing is authorized by accident.');
    }
  }

  // --- DKIM across selector probes ---
  if (dkimFound.length === 0) {
    add('dkim', 'DKIM signatures', 'fail',
      `No v=DKIM1 record on any probed selector (${DKIM_SELECTORS.join(', ')}).`,
      'Without DKIM your mail has no cryptographic seal and spam filters treat it as anonymous. Enable DKIM in your sending service and publish the public key.');
  } else if (dkimWeak.length === dkimFound.length) {
    add('dkim', 'DKIM signatures', 'warn',
      `${dkimFound.length} selector(s) respond (${dkimFound.map((d) => d.sel).join(', ')}) but the p= key is missing/short (<1024 bits).`,
      'Rotate DKIM keys to at least 2048-bit. Short keys still “work” but filters trust them less.');
  } else if (dkimFound.length === 1) {
    add('dkim', 'DKIM signatures', 'warn',
      `1 working selector: ${dkimFound[0].sel} (~${(() => { const m = dkimFound[0].rec.match(/\bp=([^;\s]+)/i); return m ? dkimKeyBits(m[1]) : '?'; })()}-bit key).`,
      'Publish a second selector and rotate — services that keep one selector forever are the ones that leak it.');
  } else {
    add('dkim', 'DKIM signatures', 'pass',
      `${dkimFound.length} selectors answering (${dkimFound.map((d) => d.sel).join(', ')}).`,
      'Multiple valid DKIM selectors — good. Signing with more than one key per message also survives a single provider migration.');
  }

  // --- DMARC ---
  if (!dmarcRec) {
    add('dmarc', 'DMARC record', 'fail',
      'No _dmarc TXT record found.',
      'Publish “v=DMARC1; p=none; rua=mailto:dmarc@yourdomain” today just to start collecting data — a domain with no DMARC is a spoofing free-for-all.');
  } else {
    const d = parseDmarc(dmarcRec);
    if (d.version !== 'DMARC1') {
      add('dmarc', 'DMARC record', 'fail', `Record exists but v tag is “${d.version || 'missing'}” — must be exactly DMARC1.`,
        'Fix the record to start with “v=DMARC1;”.');
    } else {
      add('dmarc', 'DMARC record', 'pass', `Record present: “${dmarcRec.slice(0, 140)}${dmarcRec.length > 140 ? '…' : ''}”.`,
        'DMARC is published — receivers can now demand alignment from senders claiming your domain.');

      const effPolicy = d.policy;
      if (effPolicy === 'reject') {
        add('policy', 'DMARC enforcement', 'pass', `p=${d.policy}${d.subPolicy ? ` (subdomains p=${d.subPolicy})` : ''}, pct=${d.pct}%.`,
          'Reject is the strongest posture — forged mail is dead on arrival. Keep it.');
      } else if (effPolicy === 'quarantine') {
        add('policy', 'DMARC enforcement', 'warn', `p=quarantine, pct=${d.pct}%.`,
          'Quarantine is the safe middle step. Move to p=reject once ~30 days of reports show zero unauthenticated legit sources.');
      } else if (effPolicy === 'none') {
        add('policy', 'DMARC enforcement', 'warn', `p=none${d.pct < 100 ? `, pct=${d.pct}%` : ''} — monitoring mode only.`,
          'p=none teaches spoofer nothing. Collect reports for a month, then ramp p=quarantine → p=reject.');
      } else {
        add('policy', 'DMARC enforcement', 'fail', `Unrecognized p=${d.policy || '(missing)'}.`,
          'Only none/quarantine/reject are valid — receivers ignore anything else entirely.');
      }
      if (d.pct < 100 && (d.policy === 'quarantine' || d.policy === 'reject')) {
        add('pct', 'DMARC coverage (pct)', 'warn', `pct=${d.pct}% — enforcement applies to only that share of traffic.`,
          'pct is a ramp knob, not a permanent setting — raise it to 100 once the reports are clean.');
      }

      const badRua = d.rua.some((r) => !/^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(r));
      if (d.rua.length === 0) {
        add('rua', 'DMARC aggregate reports (rua)', 'warn',
          'No rua= address — nobody sends you the daily “who is signing as you” reports.',
          'Add rua=mailto:dmarc-reports@yourdomain (or a service like dmarcian/Postmark) — reports are how you fix deliverability with facts instead of guesses.');
      } else if (badRua) {
        add('rua', 'DMARC aggregate reports (rua)', 'fail',
          `rua address is malformed: ${d.rua[0].slice(0, 60)}`,
          'rua must be a full mailto: address, and remote addresses need a verification record. Fix the syntax or reports silently never arrive.');
      } else {
        add('rua', 'DMARC aggregate reports (rua)', 'pass',
          `Reports go to ${d.rua.length} address(es): ${d.rua.map((r) => r.replace(/^mailto:/i, '')).join(', ').slice(0, 80)}.`,
          d.ruf.length ? 'Forensic (ruf) reports also configured — nice, most domains skip that.'
            : 'Aggregate reporting is wired. Add ruf= if you want copy-of-failure samples too.');
      }

      const strict = (d.adkim === 's' ? 'adkim=s ' : '') + (d.aspf === 's' ? 'aspf=s' : '');
      add('alignment', 'DMARC alignment mode', d.adkim === 's' || d.aspf === 's' ? 'pass' : 'warn',
        strict.trim() ? `Strict alignment: ${strict.trim()}.` : 'Defaulting to relaxed alignment (adkim=r, aspf=r).',
        'Relaxed alignment lets subdomain-sent mail pass; strict is stronger but breaks some SaaS senders — switch per provider only when reports prove it is safe.');
    }
  }

  // --- MX ---
  if (mx.length) {
    add('mx', 'MX records', 'pass', `${mx.length} MX host(s): ${mx.map((m) => `${m.exchange} (pri ${m.priority})`).join(', ').slice(0, 120)}.`,
      'Mail routing is published with proper preference order — receivers know exactly where to deliver.');
  } else if (nullMx) {
    add('mx', 'MX records', 'pass', 'Null MX (RFC 7505) present — the domain declares it never receives mail.',
      'Correct setup for a send-only domain. It also tells spammers their spoof has nowhere to be reported back to.');
  } else {
    add('mx', 'MX records', 'fail', 'No MX records and no null-MX declaration.',
      'This domain cannot receive mail. Add an MX record, or publish a null MX (“0 .”) if it is send-only.');
  }

  // --- A/AAAA for the mail path ---
  if (mxHostIp) {
    add('mxhost', 'MX host resolves', 'pass', `${mx.sort((a, b) => a.priority - b.priority)[0].exchange} resolves to ${mxHostIp}.`,
      'The primary MX is reachable over IPv4 — delivery targets exist.');
  } else if (mx.length) {
    add('mxhost', 'MX host resolves', 'fail', 'MX hostnames are listed but none resolve to an address.',
      'Broken glue: mail bounces at the DNS step. Fix the A/AAAA record on the MX hostname.');
  } else if (aAll.length || aaaaAll.length) {
    add('mxhost', 'Domain A/AAAA', 'pass', `Domain resolves (${aAll[0] || aaaaAll[0]}).`,
      'Web presence is fine; add MX records if this domain should also receive mail.');
  } else {
    add('mxhost', 'Domain A/AAAA', 'warn', 'No A/AAAA record on the domain itself.',
      'Mail can still flow via MX, but SPF “a” mechanisms and DMARC lookups on the root will fail. Point the root at your site.');
  }

  // --- PTR / FCrDNS hint ---
  if (mxHostIp) {
    add('ptr', 'Reverse DNS (PTR) hint', mxPtr ? 'pass' : 'warn',
      mxPtr ? `PTR for ${mxHostIp} → ${mxPtr}.` : `No PTR record for receiving MX IP ${mxHostIp}.`,
      mxPtr ? 'Forward-confirmed reverse DNS present on the mail host — legacy filters like it and it costs nothing to keep.'
        : 'PTR on your mail host matters far more than on the MX: sending servers without matching rDNS are the #1 silent-block reason at big ISPs.');
  } else {
    add('ptr', 'Reverse DNS (PTR) hint', 'warn', 'Could not test rDNS (no resolvable MX host).',
      'Once mail flows, check that your sending IP’s PTR equals its hostname — mismatches get greylisted.');
  }

  // --- Weighted score (percent of achievable points) ---
  const WEIGHTS = { spf: 14, spflookups: 7, wildcard: 4, dkim: 15, dmarc: 8, policy: 12, pct: 3, rua: 7, alignment: 3, mx: 10, mxhost: 8, ptr: 3 };
  let got = 0, max = 0;
  for (const c of checks) {
    const w = WEIGHTS[c.key] || 5;
    max += w;
    got += c.status === 'pass' ? w : c.status === 'warn' ? w / 2 : 0;
  }
  const score = Math.max(1, Math.min(100, Math.round((got / max) * 100)));
  const grade = gradeFor(score, checks);

  return NextResponse.json({
    domain,
    score,
    grade,
    checks,
    meta: {
      spfLookupCount: spf ? spfLookupCount(spf) : null,
      dkimSelectorsFound: dkimFound.map((d) => d.sel),
      nullMx,
    },
  });
}
