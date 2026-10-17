// Unit checks for the lead store — the parts of the pipeline that must not
// depend on a running server. The route-level behavior (auth, export, notify)
// is driven over real HTTP by smoke.test.mjs against a built app; these keep
// the pure functions honest in a second, every time.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'abethub-unit-'));
process.env.DATA_DIR = dir;
const { readLeads, leadsCsv, tokenOk, appendLead, LEADS_FILE } = await import('../lib/leads.js');

after(() => rmSync(dir, { recursive: true, force: true }));

test('a missing leads file is an empty list, not an error', async () => {
  assert.deepEqual(await readLeads(), []);
});

test('a torn last line never hides the leads written before it', async () => {
  await appendLead({ email: 'first@example.com', tool: 'siteread', at: '2026-10-17T00:00:00.000Z' });
  await appendLead({ email: 'second@example.com', tool: 'coldopener', at: '2026-10-17T00:01:00.000Z' });
  appendFileSync(LEADS_FILE, '{"email":"torn@exam'); // kill -9 mid-append
  const leads = await readLeads();
  assert.equal(leads.length, 2, 'the two complete leads must survive a torn tail');
  assert.equal(leads[0].email, 'first@example.com');
  assert.equal(leads[1].email, 'second@example.com');
});

test('the CSV export is ESP-ready and escapes cells', async () => {
  assert.equal(leadsCsv([]), 'email,tool,at\n');
  const csv = leadsCsv([
    { email: 'a,b"c@example.com', tool: 'siteread', at: '2026-10-17T00:00:00.000Z' },
  ]);
  const [header, row] = csv.trimEnd().split('\n');
  assert.equal(header, 'email,tool,at');
  assert.equal(row, '"a,b""c@example.com",siteread,2026-10-17T00:00:00.000Z');
});

test('the token check says yes only to the exact token', () => {
  assert.equal(tokenOk('smoke-token', 'smoke-token'), true);
  assert.equal(tokenOk('smoke-toke', 'smoke-token'), false);
  assert.equal(tokenOk('', 'smoke-token'), false);
  assert.equal(tokenOk('smoke-token', ''), false);
  assert.equal(tokenOk(undefined, 'smoke-token'), false);
});
