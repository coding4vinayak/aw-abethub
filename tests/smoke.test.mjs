// The one test that proves the product: a built server answering real HTTP.
// It starts `next start` on a scratch port, drives the pages a buyer lands
// on, and stores a lead through the real capture route into a scratch
// DATA_DIR — then checks the disk actually holds it. Without a build it
// skips honestly rather than passing vacuously.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TOOLS } from '../lib/registry.js';

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;
const READY_DEADLINE_MS = 30_000;

if (!existsSync('.next/BUILD_ID')) {
  test('smoke (skipped — run `npm run build` first)', { skip: true }, () => {});
} else {
  let child;
  let dataDir;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'abethub-leads-'));
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
      env: { ...process.env, DATA_DIR: dataDir },
      stdio: 'ignore',
    });
    const deadline = Date.now() + READY_DEADLINE_MS;
    for (;;) {
      try {
        const res = await fetch(`${BASE}/`);
        if (res.ok) return;
      } catch { /* not up yet */ }
      if (Date.now() > deadline) throw new Error('next start did not become ready in 30s');
      await new Promise((r) => setTimeout(r, 400));
    }
  });

  after(() => {
    child?.kill('SIGTERM');
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  test('the front page and the utility pages answer', async () => {
    for (const route of ['/', '/privacy', '/terms']) {
      const res = await fetch(`${BASE}${route}`);
      assert.equal(res.status, 200, `${route} answered ${res.status}`);
    }
    const html = await (await fetch(`${BASE}/`)).text();
    assert.match(html, /Abetworks/);
  });

  test('three registry tools render their pages', async () => {
    for (const tool of [TOOLS[0], TOOLS[Math.floor(TOOLS.length / 2)], TOOLS[TOOLS.length - 1]]) {
      const res = await fetch(`${BASE}/${tool.slug}`);
      assert.equal(res.status, 200, `/${tool.slug} answered ${res.status}`);
    }
  });

  test('an unknown tool is a real 404, not a hang', async () => {
    const res = await fetch(`${BASE}/no-such-tool-xyz`);
    assert.equal(res.status, 404);
  });

  test('the SSRF guard answers a live private fetch with 400, not a crawl', async () => {
    const target = encodeURIComponent(`http://127.0.0.1:${PORT}/`);
    const res = await fetch(`${BASE}/api/siteread?url=${target}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(String(body.error), /Private or internal/);
  });

  test('a lead lands in DATA_DIR, which is what a mounted disk reads', async () => {
    const bad = await fetch(`${BASE}/api/lead`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', tool: 'siteread' }),
    });
    assert.equal(bad.status, 400);

    const email = `smoke+${Date.now()}@example.com`;
    const ok = await fetch(`${BASE}/api/lead`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, tool: 'siteread' }),
    });
    assert.equal(ok.status, 200);
    const stored = readFileSync(path.join(dataDir, 'leads.json'), 'utf8');
    assert.ok(stored.includes(email), 'the lead the API confirmed is not on disk');
  });
}
