// Source guards for the API fleet: the wiring that no single request
// exercises. A route that stops exporting a handler, a caller-supplied URL
// that skips the guarded fetch, or a lead file that forgets its disk are all
// silent at runtime until the day they are not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const routes = readdirSync('app/api', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `app/api/${d.name}/route.js`)
  .filter((file) => existsSync(file));

test('every API route exports at least one HTTP method', () => {
  assert.ok(routes.length >= 20, `expected the route fleet, found ${routes.length}`);
  for (const file of routes) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /export async function (GET|POST|PATCH|PUT|DELETE)\b/, `${file} exports no handler`);
  }
});

test('no route talks to a caller-supplied URL outside the guarded fetch', () => {
  for (const file of routes) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/[\s=(]fetch\(/.test(src), `${file} calls fetch() directly — use safeFetch/publicFetch`);
  }
});

test('the guarded fetch re-checks every redirect hop', () => {
  const src = readFileSync('lib/fetchpage.js', 'utf8');
  assert.match(src, /redirect: 'manual'/, 'follow would skip the hop check');
  const loop = src.indexOf('for (let hop');
  assert.ok(loop !== -1, 'the redirect loop is the guard');
  assert.ok(src.indexOf('await assertPublic(url)', loop) > loop, 'each hop is checked before it is fetched');
});

test('the authenticated probe reuses the guard instead of copying it', () => {
  const src = readFileSync('app/api/apihealth/route.js', 'utf8');
  assert.match(src, /import { publicFetch, safeFetch }/);
  assert.ok(!src.includes("startsWith('172.16.')"), 'a second address list is a second answer');
});

test('lead captures honor DATA_DIR so the mounted disk is what holds them', () => {
  const src = readFileSync('app/api/lead/route.js', 'utf8');
  assert.match(src, /process\.env\.DATA_DIR/);
});
