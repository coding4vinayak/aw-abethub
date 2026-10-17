// /llms.txt is the hub's card for AI crawlers. It must never drift from the
// catalogue it summarises (every tool linked, every tier labelled) and it must
// keep carrying the copy-truth honesty — the paid tiers are previews and the
// file must say so. A registry the card can't see is a page an AI can't cite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../lib/registry.js';
import { GET } from '../app/llms.txt/route.js';

test('llms.txt answers as plain text with every registry tool linked', async () => {
  const res = await GET(new Request('https://hub.abetworks.in/llms.txt'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const text = await res.text();
  for (const tool of TOOLS) {
    assert.ok(
      text.includes(`https://hub.abetworks.in/${tool.slug}`),
      `llms.txt is missing ${tool.slug}`,
    );
  }
  assert.match(text, /^# Abetworks Hub/, 'the H1 is the convention');
  assert.match(text, /free forever/i, 'the free/paid split is part of the card');
});

test('llms.txt keeps the paid tiers honest and the sitemap pointed at', async () => {
  const res = await GET(new Request('https://hub.abetworks.in/llms.txt'));
  const text = await res.text();
  assert.match(text, /nothing on this site is purchasable yet/i);
  assert.match(text, /planned/i, 'prices are named as the planned catalogue');
  assert.match(text, /\/sitemap\.xml/, 'the machine index is linked');
});

test('llms.txt falls back to the canonical origin when the URL is unusable', async () => {
  const res = await GET({ url: 'not-a-url' });
  const text = await res.text();
  assert.match(text, /https:\/\/hub\.abetworks\.in\//, 'fallback origin must be canonical');
});
