// The registry and the pages it promises.
//
// The hub's index is generated from `lib/registry.js`, so the registry is the
// catalogue every page and every machine-readable file is built from. Two
// ways that can go wrong, both of them a page that lies:
//
// 1. A tool in the catalogue with no page behind it — the index links it, the
//    sitemap lists it, and a visitor gets a 404.
// 2. A tool that claims an API it does not have. The index used to say "each
//    tool is one page and one API route", which was false for the twelve tools
//    that run entirely in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { API_TOOLS, TOOLS, getTool } from '../lib/registry.js';

const ROOT = new URL('..', import.meta.url);

test('every tool in the catalogue has a page behind it', () => {
  for (const tool of TOOLS) {
    assert.ok(
      existsSync(new URL(`app/${tool.slug}/page.jsx`, ROOT)),
      `${tool.slug} is in the catalogue but has no page — the index would link a 404`,
    );
  }
});

test('the API set is exactly the tools that have an API route', () => {
  const onDisk = TOOLS.filter((t) => existsSync(new URL(`app/api/${t.slug}/route.js`, ROOT))).map((t) => t.slug);
  const listed = [...API_TOOLS];
  assert.deepEqual(
    listed.filter((s) => !onDisk.includes(s)),
    [],
    'the index would offer an API that does not exist',
  );
  assert.deepEqual(
    onDisk.filter((s) => !listed.includes(s)),
    [],
    'a tool answers over HTTP but the index does not say so',
  );
});

test('the index does not claim an API for every tool', () => {
  const src = readFileSync(new URL('app/llms.txt/route.js', ROOT), 'utf8');
  assert.ok(
    !/one page and one API route/.test(src),
    'the index must not claim an API route for tools that have none',
  );
  assert.match(src, /API_TOOLS\.size/, 'the index states how many tools answer over HTTP');
  assert.match(src, /runs in your browser/, 'and says what the others do instead');
});

test('the catalogue has no duplicate slugs or names', () => {
  const slugs = TOOLS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'two tools share a slug');
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, 'two tools share a name');
});

test('every tool has a tagline, a tier and an upsell that goes somewhere', () => {
  const slugs = new Set(TOOLS.map((t) => t.slug));
  for (const tool of TOOLS) {
    assert.ok(tool.tagline && tool.tagline.length > 8, `${tool.slug} needs a tagline`);
    assert.ok(['free', 'paid'].includes(tool.tier), `${tool.slug} has an odd tier: ${tool.tier}`);
    assert.ok(tool.upsell?.href, `${tool.slug} has no upsell`);
    const href = tool.upsell.href;
    if (href.startsWith('/')) {
      assert.ok(slugs.has(href.split('?')[0].replace(/^\//, '')), `${tool.slug} upsells at ${href}, which is not a tool`);
    }
  }
});

test('getTool finds a tool and misses cleanly', () => {
  assert.equal(getTool('siteread').name, 'AI Visibility Check');
  assert.equal(getTool('no-such-tool'), undefined);
});
