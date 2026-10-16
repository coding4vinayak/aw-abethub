// The guarded fetch is the only door between this server and caller-supplied
// URLs. These are known answers, kept off the network on purpose: the failures
// the table covers were real bypasses once — 172.20.x.x (Docker's own range)
// was allowed by a 172.16.-only prefix, and `redirect: 'follow'` let a public
// host bounce the server into a private one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, safeFetch, htmlBits } from '../lib/fetchpage.js';

const BLOCKED = [
  '127.0.0.1', '127.255.255.255', '10.0.0.1', '10.255.255.255',
  '169.254.169.254', '192.168.0.1', '192.168.255.255',
  '172.16.0.1', '172.20.10.5', '172.31.255.254',
  '100.64.0.1', '100.127.255.255', '0.0.0.0', '0.10.10.10',
  '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fea0::1',
  '::ffff:192.168.1.1', '::ffff:127.0.0.1',
];
const PUBLIC = [
  '9.9.9.9', '8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1',
  '100.63.255.255', '100.128.0.1', '192.169.0.1',
  '2606:4700:4700::1111', '2001:db8::1',
];

test('known answers: the private ranges, in both families', () => {
  for (const ip of BLOCKED) assert.equal(isPrivateAddress(ip), true, `${ip} must be blocked`);
  for (const ip of PUBLIC) assert.equal(isPrivateAddress(ip), false, `${ip} must be allowed`);
});

test('the v4-mapped hex spelling Node hands back is blocked too', () => {
  // new URL('http://[::ffff:127.0.0.1]/').hostname normalizes to '[::ffff:7f00:1]'
  assert.equal(isPrivateAddress('::ffff:7f00:1'), true);
  assert.equal(isPrivateAddress('::ffff:c0a8:101'), true); // 192.168.1.1
  assert.equal(isPrivateAddress('::ffff:808:808'), false); // 8.8.8.8
});

test('literal private targets are refused before any socket opens', async () => {
  await assert.rejects(safeFetch('http://127.0.0.1/'), /private address blocked/);
  await assert.rejects(safeFetch('http://169.254.169.254/latest/meta-data/'), /private address blocked/);
  await assert.rejects(safeFetch('http://[::1]:8080/'), /private address blocked/);
  await assert.rejects(safeFetch('http://10.0.0.5/'), /private address blocked/);
  await assert.rejects(safeFetch('http://172.20.0.1/'), /private address blocked/);
});

test('junk and non-http schemes fail closed', async () => {
  await assert.rejects(safeFetch('not a url'), /bad url/);
  await assert.rejects(safeFetch('file:///etc/passwd'), /http\(s\) only/);
  await assert.rejects(safeFetch('gopher://example.com/'), /http\(s\) only/);
});

test('htmlBits pulls real metadata and drops scripts', () => {
  const bits = htmlBits(
    '<html><head><title>Hi &amp; Bye</title><meta name="description" content="D &quot;x&quot;"></head>' +
      '<body><h1>One</h1><h1>Two</h1><script>var secret = 1;</script><p>Body text</p></body></html>',
  );
  assert.equal(bits.title, 'Hi & Bye');
  assert.ok(bits.description.startsWith('D '));
  assert.deepEqual(bits.h1s, ['One', 'Two']);
  assert.equal(bits.scriptCount, 1);
  assert.ok(!bits.body.includes('secret'));
  assert.ok(bits.body.includes('Body text'));
});
