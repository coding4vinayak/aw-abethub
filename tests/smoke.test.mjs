// The one test that proves the product: a built server answering real HTTP.
// It starts `next start` on a scratch port, drives the pages a buyer lands
// on, and stores a lead through the real capture route into a scratch
// DATA_DIR — then checks the disk actually holds it, that the owner can
// read/export it with a token, and that the notify webhook fires after the
// response. Without a build it skips honestly rather than passing vacuously.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { API_TOOLS, TOOLS } from '../lib/registry.js';

const PORT = 3987;
const NOTIFY_PORT = 3988;
const OWNER_TOKEN = 'smoke-owner-token';
const BASE = `http://127.0.0.1:${PORT}`;
const READY_DEADLINE_MS = 30_000;

if (!existsSync('.next/BUILD_ID')) {
  test('smoke (skipped — run `npm run build` first)', { skip: true }, () => {});
} else {
  let child;
  let dataDir;
  let notifySrv;
  const notifyHits = [];

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'abethub-leads-'));
    // A live receiver for the notify webhook — the point is to prove the POST
    // leaves the app, not that the app can build the object.
    notifySrv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { notifyHits.push(body); res.end('ok'); });
    });
    await new Promise((r) => notifySrv.listen(NOTIFY_PORT, '127.0.0.1', r));
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        LEADS_TOKEN: OWNER_TOKEN,
        LEAD_NOTIFY_URL: `http://127.0.0.1:${NOTIFY_PORT}/hook`,
      },
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
    notifySrv?.close();
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

  test('no rendered link points at a /products/ path that does not exist', async () => {
    // The rendered pages, not the source: a link can be assembled at runtime.
    // Every abetworks.in link on a page must be a host the fleet deploys, the
    // company's contact page, or the site itself — never a /products/ path the
    // marketing site's repository has never had.
    const allowed = new Set([
      'abetworks.in', 'www.abetworks.in',
      'analytics.abetworks.in', 'leadworks.abetworks.in', 'leadgenius.abetworks.in',
      'abetagent.abetworks.in', 'connect.abetworks.in', 'flow.abetworks.in',
      'api.abetworks.in', 'hub.abetworks.in', 'pdf.abetworks.in',
    ]);
    const pages = ['/', ...TOOLS.map((t) => `/${t.slug}`)];
    const offenders = [];
    for (const route of pages) {
      const html = await (await fetch(`${BASE}${route}`)).text();
      for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
        const url = m[1];
        if (url.includes('/products/')) { offenders.push(`${route} → ${url}`); continue; }
        const host = new URL(url).hostname;
        if (host.endsWith('abetworks.in') && !allowed.has(host)) {
          offenders.push(`${route} → ${url}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `links that point nowhere:\n  ${offenders.join('\n  ')}`);
  });

  test('the index tells the truth about which tools answer over HTTP', async () => {
    const text = await (await fetch(`${BASE}/llms.txt`)).text();
    // Every tool that answers over HTTP is named with its path…
    for (const slug of API_TOOLS) {
      assert.ok(text.includes(`/api/${slug}`), `${slug} answers over HTTP but the index does not say so`);
    }
    // …and the ones that do not are not given a path they do not have.
    for (const tool of TOOLS.filter((t) => !API_TOOLS.has(t.slug))) {
      assert.ok(!text.includes(`/api/${tool.slug}`), `${tool.slug} has no API but the index offers one`);
    }
    assert.ok(
      text.includes(`${API_TOOLS.size} of the ${TOOLS.length}`),
      'the index states how many tools answer over HTTP',
    );
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

  test('the owner can read and export leads — and the notify webhook fires', async () => {
    const email = `owner+${Date.now()}@example.com`;
    const res = await fetch(`${BASE}/api/lead`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, tool: 'siteread' }),
    });
    assert.equal(res.status, 200);

    // The notify runs *after* the response, and the previous test's notify may
    // still be in flight — so wait for THIS lead specifically, then insist.
    const deadline = Date.now() + 5000;
    let delivered = [];
    for (;;) {
      delivered = notifyHits.map((raw) => JSON.parse(raw));
      if (delivered.some((h) => h.email === email && h.tool === 'siteread')) break;
      if (Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(
      delivered.some((h) => h.email === email && h.tool === 'siteread'),
      'the notify webhook did not deliver the lead',
    );

    // No token, or a wrong one, is a 401 — never data.
    assert.equal((await fetch(`${BASE}/api/leads`)).status, 401);
    assert.equal((await fetch(`${BASE}/api/leads?token=nope`)).status, 401);

    // With the token: JSON first…
    const json = await fetch(`${BASE}/api/leads`, { headers: { authorization: `Bearer ${OWNER_TOKEN}` } });
    assert.equal(json.status, 200);
    const body = await json.json();
    assert.ok(body.leads.some((l) => l.email === email), 'the captured lead is not readable');

    // …then the ESP export.
    const csv = await fetch(`${BASE}/api/leads?format=csv`, {
      headers: { authorization: `Bearer ${OWNER_TOKEN}` },
    });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const text = await csv.text();
    // The export carries the consent scope, because "what was agreed" is the
    // question to answer before sending anything.
    assert.match(text, /^email,tool,at,consent\n/);
    assert.ok(text.includes(email), 'the export is missing the captured lead');
    assert.ok(text.includes('report-and-launch-email'), 'the export is missing the consent scope');
  });
}
