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
