// The hub's suite links, pinned.
//
// The hub's upsells used to point at `${SUITE_URL}/products/<slug>/` — paths
// the marketing site's repository has never had (it has no `/products/`
// directory at all). Every one of those links was a 404 waiting to happen, on
// the pages where a buyer is most likely to click: the money path of the
// funnel.
//
// So the rule is here, in a test, rather than in a comment: a suite link
// either goes to a host the fleet deploys, or to the company's contact form —
// and never to a `/products/` path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../lib/registry.js';
import { PRODUCT_HOMES, NUCRM_CONTACT } from '../lib/products.js';

/**
 * The hosts the fleet deploys, with the product each one serves.
 *
 * These are the domains the pricing sheet states (aw-deploy
 * `sales/pricing-sheet.md`) and the fleet blueprint declares a service for
 * each — so every one of them answers after deploy day. If a product ever
 * moves, this list and the pricing sheet change together.
 */
const FLEET_HOSTS = {
  'analytics.abetworks.in': 'AbetAnalytics',
  'leadworks.abetworks.in': 'LeadWorks',
  'leadgenius.abetworks.in': 'LeadGenius',
  'abetagent.abetworks.in': 'AbetAgent',
  'connect.abetworks.in': 'AbetConnect',
  'flow.abetworks.in': 'AbetFlow',
  'api.abetworks.in': 'AbetAPI',
};

const hostOf = (url) => new URL(url).hostname;

/** The slugs the hub's own pages are served at. */
const HUB_SLUGS = new Set(TOOLS.map((t) => t.slug));

test("every product home is a host the fleet deploys", () => {
  for (const [slug, url] of Object.entries(PRODUCT_HOMES)) {
    const host = hostOf(url);
    assert.ok(
      Object.prototype.hasOwnProperty.call(FLEET_HOSTS, host),
      `${slug} points at ${host}, which is not a host the fleet deploys`,
    );
  }
  // Nothing extra, nothing missing: the map is the fleet, minus NuCRM.
  const hosts = new Set(Object.values(PRODUCT_HOMES).map(hostOf));
  assert.deepEqual(
    [...hosts].sort(),
    Object.keys(FLEET_HOSTS).sort(),
    'the product homes and the deployed hosts must be the same set',
  );
});

test("the contact fallback reaches a real page of the company's site", () => {
  // The site's own repository has a services/contact.html; that is the page
  // the contact form lives on, so the link is one that exists.
  assert.match(NUCRM_CONTACT, /\/services\/contact\.html$/);
});

test("every tool's upsell goes somewhere that exists", () => {
  const known = new Set([...Object.values(PRODUCT_HOMES), NUCRM_CONTACT]);
  for (const tool of TOOLS) {
    const href = tool.upsell.href;
    if (href.startsWith('/')) {
      // A hub path: it must be a tool the hub actually serves.
      const slug = href.split('?')[0].replace(/^\//, '');
      assert.ok(HUB_SLUGS.has(slug), `${tool.slug} upsells at ${href}, which is not a tool on this hub`);
      continue;
    }
    assert.ok(
      known.has(href),
      `${tool.slug} upsells at ${href}, which is neither a hub tool nor a product home we deploy`,
    );
  }
});

test("no link in the hub points at a /products/ path", () => {
  // The link positions, not the prose: a comment may mention what was wrong.
  const sources = ['lib/registry.js', 'app/page.jsx', 'components/ToolShell.jsx'];
  for (const file of sources) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      assert.ok(!/\/products\//.test(line), `${file} still links a /products/ path: ${line.trim()}`);
    }
  }
});
