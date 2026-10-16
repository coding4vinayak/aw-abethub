// The registry is the product catalogue: every price, page and upsell the hub
// renders comes from it. These checks keep the three representations of that
// catalogue — this array, the page folders, and what the README promises —
// from drifting apart silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { TOOLS } from '../lib/registry.js';

const PAGE_DIRS = readdirSync('app', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`app/${d.name}/page.jsx`))
  .map((d) => d.name);

test('slugs are unique and URL-safe', () => {
  const slugs = TOOLS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate slug in registry');
  for (const slug of slugs) assert.match(slug, /^[a-z0-9-]+$/);
});

test('every registry tool has a page, and every tool page is registered', () => {
  const slugs = new Set(TOOLS.map((t) => t.slug));
  for (const slug of slugs) assert.ok(existsSync(`app/${slug}/page.jsx`), `missing page for ${slug}`);
  const extras = PAGE_DIRS.filter((d) => !slugs.has(d));
  assert.deepEqual(extras.sort(), ['privacy', 'terms'], 'only privacy and terms may live outside the registry');
});

test('every entry carries the copy every consumer reads', () => {
  for (const t of TOOLS) {
    for (const field of ['name', 'tagline', 'desc']) {
      assert.equal(typeof t[field], 'string', `${t.slug}.${field} must be text`);
      assert.ok(t[field].trim().length > 0, `${t.slug}.${field} is empty`);
    }
    assert.ok(['free', 'paid'].includes(t.tier), `${t.slug} has an unknown tier`);
    if (t.tier === 'paid') assert.match(String(t.price || ''), /^from \$/, `${t.slug} is paid and needs a price`);
    assert.ok(
      t.upsell && typeof t.upsell.name === 'string' && typeof t.upsell.href === 'string',
      `${t.slug} needs an upsell`,
    );
    if (t.upsell.href.startsWith('/')) {
      const target = t.upsell.href.split('#')[0].slice(1);
      assert.ok(PAGE_DIRS.includes(target), `${t.slug} upsells to ${t.upsell.href}, which has no page`);
    } else {
      assert.match(t.upsell.href, /^https:\/\//, `${t.slug} upsell must be https`);
    }
  }
});

test('the free/paid split matches what the README and the 404 page promise', () => {
  assert.equal(TOOLS.filter((t) => t.tier === 'free').length, 5);
  assert.equal(TOOLS.filter((t) => t.tier === 'paid').length, 30);
  assert.equal(TOOLS.length, 35);
});
