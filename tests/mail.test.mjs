// The mail transport, and the rule it exists to enforce: the caller is always
// told which transport actually ran.
//
// A hub that says "your report is in your inbox" when it was written to a log
// is worse than a hub that says nothing, because the visitor stops looking.
// So `sendMail` answers `http` only when a provider took the message, and
// `log` otherwise — and the capture card turns that into copy the visitor can
// act on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MAIL_CHANNEL, mailConfigured, sendMail } from '../lib/mail.js';

const ENV_KEYS = ['RESEND_API_KEY', 'MAIL_WEBHOOK_URL', 'MAIL_WEBHOOK_TOKEN', 'MAIL_FROM'];

function withEnv(values, fn) {
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, values);
  try {
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('with no provider configured, mail is not configured', () => {
  withEnv({}, () => {
    assert.equal(mailConfigured(), false);
  });
  withEnv({ RESEND_API_KEY: 're_x' }, () => {
    assert.equal(mailConfigured(), true);
  });
  withEnv({ MAIL_WEBHOOK_URL: 'https://mail.example/hook' }, () => {
    assert.equal(mailConfigured(), true);
  });
});

test('no provider means the message is written to the log, and said so', async () => {
  const logged = [];
  const original = console.log;
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const result = await withEnv({}, () =>
      sendMail({ to: 'visitor@example.com', subject: 'Your report', text: 'the report body' }),
    );
    assert.equal(result.channel, MAIL_CHANNEL.LOG);
    assert.equal(result.error, undefined, 'a missing provider is not an error, it is a fact');
  } finally {
    console.log = original;
  }
  assert.ok(logged.some((l) => l.includes('visitor@example.com')), 'the message is in the log');
  assert.ok(logged.some((l) => l.includes('not delivered')), 'and the log says it was not delivered');
});

test('a webhook provider takes the message, and the answer says so', async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { hits.push({ url: req.url, body: JSON.parse(body || '{}') }); res.end('ok'); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    const result = await withEnv({ MAIL_WEBHOOK_URL: `http://127.0.0.1:${port}/send` }, () =>
      sendMail({
        to: 'visitor@example.com',
        subject: 'Your report',
        text: 'the report body',
        html: '<p>the report body</p>',
      }),
    );
    assert.equal(result.channel, MAIL_CHANNEL.HTTP);
    assert.equal(result.error, undefined);
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].body.to, ['visitor@example.com']);
    assert.equal(hits[0].body.subject, 'Your report');
    assert.equal(hits[0].body.text, 'the report body');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('a provider that refuses is reported, never swallowed', async () => {
  const server = http.createServer((req, res) => { res.writeHead(500); res.end('no'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));

  try {
    const result = await withEnv({ MAIL_WEBHOOK_URL: `http://127.0.0.1:${port}/send` }, () =>
      sendMail({ to: 'visitor@example.com', subject: 's', text: 't' }),
    );
    assert.equal(result.channel, MAIL_CHANNEL.LOG, 'a refused message is not a delivery');
    assert.match(result.error, /refused the message: 500/);
  } finally {
    console.error = original;
    await new Promise((r) => server.close(r));
  }
  assert.ok(errors.length > 0, 'the operator sees it in the log too');
});

test('an unreachable provider is reported, and does not throw', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const result = await withEnv({ MAIL_WEBHOOK_URL: 'http://127.0.0.1:1/send' }, () =>
      sendMail({ to: 'visitor@example.com', subject: 's', text: 't' }),
    );
    assert.equal(result.channel, MAIL_CHANNEL.LOG);
    assert.ok(result.error, 'the failure is named');
  } finally {
    console.error = original;
  }
});
