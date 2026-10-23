import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/llms-full.txt/route.js';
import { API_TOOLS, TOOLS } from '../lib/registry.js';

test('llms-full.txt answers as plain text with every tool and its full description', async () => {
  const res = await GET(new Request('https://hub.abetworks.in/llms-full.txt'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const text = await res.text();
  assert.match(text, /^# Abetworks Hub/, 'same convention as llms.txt');
  for (const tool of TOOLS) {
    assert.ok(text.includes(`## ${tool.name}`), `the full file has a block for ${tool.name}`);
    assert.ok(
      text.includes(tool.desc) || text.includes(tool.desc.replace(/’/g, "'")),
      `the full file carries ${tool.name}'s real description, not just its one-liner`,
    );
    assert.ok(
      text.includes(`https://hub.abetworks.in/${tool.slug}`),
      `the full file links ${tool.name} to its page`,
    );
  }
});

test('llms-full.txt says which tools answer over HTTP and which run in the browser', async () => {
  const res = await GET(new Request('https://hub.abetworks.in/llms-full.txt'));
  const text = await res.text();
  assert.ok(API_TOOLS.size > 0, 'the registry does declare API tools');
  for (const tool of TOOLS) {
    if (API_TOOLS.has(tool.slug)) {
      assert.match(text, new RegExp(`Also over HTTP: https://hub\\.abetworks\\.in/api/${tool.slug}`));
    } else {
      assert.ok(
        text.includes('Runs entirely in your browser'),
        `${tool.name} is browser-only, and the full file should say so`,
      );
    }
  }
});

test('llms-full.txt keeps the paid tiers honest, like llms.txt does', async () => {
  const res = await GET(new Request('https://hub.abetworks.in/llms-full.txt'));
  const text = await res.text();
  assert.match(text, /nothing (purchasable|is purchasable)/i);
  assert.match(text, /planned/i, 'prices are named as the planned catalogue');
  for (const tool of TOOLS) {
    if (tool.tier !== 'free') {
      assert.ok(
        text.includes(`${tool.name}`) && text.includes(tool.price ?? ''),
        `${tool.name} is a paid preview and its planned price should be stated`,
      );
    }
  }
});

test('llms-full.txt falls back to the canonical origin when the URL is unusable', async () => {
  const res = await GET({ url: 'not-a-url' });
  const text = await res.text();
  assert.match(text, /https:\/\/hub\.abetworks\.in\//, 'fallback origin must be canonical');
});
