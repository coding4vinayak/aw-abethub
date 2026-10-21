// The hub's copy tells the truth about what it sells, and this pins it there.
//
// The failure mode is not a crash: it is a page whose present tense outran the
// product. "DataSweep paid adds one-click fix rules" was written while DataSweep
// paid did not exist, nothing on the hub is purchasable, and the JSON-LD was
// advertising a $9 Offer for a sale nobody could make. That is a refund dispute
// and a structured-data lie, and neither shows up in a build, a typecheck or an
// HTTP smoke test — a source-reading test is the one that looks. So: paid-tier
// claims are written as planned (the widget files all say "planned" somewhere),
// the "X paid <verb>" phrasing is banned, ToolShell renders offers only for the
// free tools, and the index does not advertise a price as current.
import { test } from 'node:test';
import { TOOLS } from '../lib/registry.js';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const WIDGETS = 'components/tools';
const widgetFiles = readdirSync(WIDGETS).filter((f) => f.endsWith('.jsx'));
const read = (p) => readFileSync(p, 'utf8');

/** "BrandVoice paid trains…", "Paid SocialProof pulls…" — the shape this round removed. */
const PAID_PRESENT_TENSE = /\b(?:[A-Za-z][\w]*\s+)?[Pp]aid\s+(?:adds?|removes?|unlocks?|scores?|ingests?|reads?|matches?|hosts?|probes?|watches|exports?|tracks?|ranks?|monitors?|crawls?|trains?|embeds?|connects?|takes|checks?|pulls?)\b/;

test('no widget sells a paid feature in the present tense', () => {
  const offenders = [];
  for (const file of widgetFiles) {
    const src = read(`${WIDGETS}/${file}`);
    const hit = src.match(PAID_PRESENT_TENSE);
    if (hit) offenders.push(`${file}: "${hit[0]}"`);
  }
  assert.deepEqual(offenders, [], `paid-tier claims must be written as planned:\n  ${offenders.join('\n  ')}`);
});

test('every tool widget writes its paid-tier claims as planned', () => {
  const offenders = widgetFiles.filter((f) => !read(`${WIDGETS}/${f}`).includes('planned'));
  assert.deepEqual(offenders, [], `every widget mentions its planned full version:\n  ${offenders.join('\n  ')}`);
});

test('ToolShell carries a real offer only for the free tools', () => {
  const shell = read('components/ToolShell.jsx');
  assert.match(shell, /'@type': 'Offer', price: '0'/, 'the free offer stays');
  assert.ok(
    !/price: tool\.price/.test(shell),
    'structured data must not claim a purchasable price for a tool nobody can buy',
  );
  assert.match(shell, /tool\.tier === 'free'\s*\n\s*\? \{ offers:/, 'the offers key is behind the free check');
  assert.match(shell, /nothing on this hub is purchasable today/, 'the paid FAQ says nothing is purchasable');
});

test('the index does not advertise a price as current', () => {
  const page = read('app/page.jsx');
  assert.ok(!/then from \$9\/mo/.test(page), 'the premium pill must not read as a current price');
  assert.match(page, /build-out/, 'the index names the paid tiers as in build-out');
});

test('the capture box says only what it can prove', () => {
  const capture = read('components/EmailCapture.jsx');
  assert.ok(!/on its way/.test(capture), 'no report may claim to be travelling that the hub did not send');
  // The box may only say "sent" when the API said the message was delivered.
  assert.match(capture, /setDelivered\(Boolean\(j\.delivered\)\)/, 'the sent claim is gated on the API answer');
  assert.match(capture, /\{delivered \?/, 'and the card branches on that answer, not on its own optimism');
  assert.match(capture, /Report sent ✓/, 'a real delivery says so');
  assert.match(capture, /no mail provider/, 'a deployment without one must say the report was not emailed');
  assert.match(capture, /follow up by email/, 'and the promise it can still keep is named');
});

test('the lead route reports the channel that ran, and the copy follows it', () => {
  const route = read('app/api/lead/route.js');
  assert.match(route, /delivered\s*=\s*sent\.channel\s*===\s*'http'\s*&&\s*!sent\.error/, 'delivered means a provider took the message');
  assert.match(route, /sanitizeReport\(body\.report\)/, 'the report is reduced before it is sent');
  assert.match(route, /renderReportEmail\(/, 'the email is built from the report the visitor produced');
  const mail = read('lib/mail.js');
  assert.match(mail, /MAIL_CHANNEL\.HTTP/, 'the transport names the channel that ran');
  assert.match(mail, /logMessage/, 'and has a log fallback that says it was not delivered');
});

test('the capture box and the privacy page promise the same thing', () => {
  // One consent, said the same way in both places. They used to disagree: the
  // box said "one email with your report — no newsletter", and the privacy
  // page said "the requested report and occasional product emails". A visitor
  // reading both was told two different things about what they had agreed to,
  // and the runbook's plan was a five-to-seven email drip.
  // The JSX wraps lines, so the phrases are compared with the whitespace
  // flattened — otherwise a promise split across two lines reads as absent.
  const flat = (src) => src.replace(/\s+/g, ' ');
  const capture = flat(read('components/EmailCapture.jsx'));
  const privacy = flat(read('app/privacy/page.jsx'));
  for (const [name, src] of [['the capture box', capture], ['the privacy page', privacy]]) {
    assert.match(src, /no newsletter/, `${name} must say there is no newsletter`);
    assert.match(src, /paid version/, `${name} must name the one other email it may send`);
  }
  // A drip may only be mentioned to say it does not exist.
  assert.ok(!/drip/i.test(capture.replace(/no drip/gi, '')), 'the box may not promise a drip');
  assert.ok(!/drip/i.test(privacy.replace(/no drip/gi, '')), 'the privacy page may not promise a drip');
});

test('a captured lead carries the consent it was captured under', () => {
  // The scope has to travel with the lead, or the ESP has to guess — and a
  // guess is how a "one email" promise turns into a seven-email drip.
  const route = read('app/api/lead/route.js');
  assert.match(route, /consent: 'report-and-launch-email'/, 'the route records the scope');
  const leads = read('lib/leads.js');
  assert.match(leads, /'email', 'tool', 'at', 'consent'/, 'the export carries the scope');
});

test('every tool page points at its own card', () => {
  // A page that drifts back to the one static image shares every other tool's
  // card again, which is the thing this replaced.
  for (const tool of TOOLS) {
    const page = read(`app/${tool.slug}/page.jsx`);
    assert.match(page, new RegExp(`images: \\['/og/${tool.slug}'\\]`), `${tool.slug} must name its own card`);
  }
  // The pages that are not tools keep the brand card, because there is no
  // tool card to name.
  for (const page of ['app/privacy/page.jsx', 'app/terms/page.jsx']) {
    assert.match(read(page), /images: \['\/og\.png'\]/, `${page} keeps the brand card`);
  }
});
