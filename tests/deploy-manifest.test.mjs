// The Blueprint (`render.yaml`) is the checklist: every env var the app reads
// must be a key in the manifest, so an import asks for exactly what the hub
// needs — and a new read in app/, lib/ or components/ can never silently miss
// the Render dashboard. Round 21 found six reads (ABET_MODEL, HUB_URL, SITE_URL,
// OPENAI_*) that an import never asked for; this guard keeps that closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Vars the platform provides — the manifest must never ask for these. */
const RUNTIME_PROVIDED = new Set(['NODE_ENV']);

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

test('render.yaml declares every env the code reads', () => {
  const declared = new Set(
    (readFileSync(path.join(ROOT, 'render.yaml'), 'utf8').match(/key:\s*[A-Z0-9_]+/g) ?? []).map((k) =>
      k.replace(/key:\s*/, ''),
    ),
  );
  const read = new Set();
  const roots = ['app', 'lib', 'components'].map((d) => path.join(ROOT, d));
  for (const file of roots.flatMap(sourceFiles)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.match(/process\.env\.[A-Z][A-Z0-9_]*/g) ?? []) {
      read.add(m.replace('process.env.', ''));
    }
    for (const m of text.match(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g) ?? []) {
      read.add(m.replace(/process\.env\[['"]|['"]\]/g, ''));
    }
  }
  const missing = [...read].filter((v) => !declared.has(v) && !RUNTIME_PROVIDED.has(v)).sort();
  assert.deepEqual(missing, [], `render.yaml is missing: ${missing.join(', ')}`);
});

test('healthCheckPath probes the disk the leads live on — not a page', () => {
  const manifest = readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
  const health = manifest.match(/healthCheckPath:\s*(\S+)/)?.[1];
  assert.ok(health, 'render.yaml declares a healthCheckPath');
  assert.equal(health, '/api/health', 'the health check proves lead storage, not just that / renders');
  assert.ok(
    existsSync(path.join(ROOT, 'app', health.slice(1), 'route.js')),
    `${health} is backed by a route file`,
  );
});
