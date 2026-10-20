// The report email: the promise the hub makes to every captured visitor.
//
// The card says "one email with your report — no newsletter, no spam". That is
// only worth keeping if the email carries the *result* the visitor just
// produced, so the browser sends the report it is already showing and the
// server turns that into a message.
//
// The report arrives from a browser, which makes it untrusted: these checks
// are the bounds that keep a visitor from turning "send me my report" into a
// mail cannon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_LIMITS, renderReportEmail, sanitizeReport } from '../lib/report-email.js';

test('a report is reduced to what an email can carry', () => {
  const report = sanitizeReport({
    title: 'AI Visibility Check — https://example.com',
    headline: '72/100 · grade C',
    rows: [
      { label: 'llms.txt missing (−12 pts)', value: 'Add an llms.txt listing your key pages.' },
      { label: 'no JSON-LD (−8 pts)', value: 'Add Organization + FAQPage schema.' },
    ],
    tip: 'Fix the llms.txt one first — it is one file and three engines read it.',
  });

  assert.equal(report.title, 'AI Visibility Check — https://example.com');
  assert.equal(report.headline, '72/100 · grade C');
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0].label, 'llms.txt missing (−12 pts)');
  assert.ok(report.tip.startsWith('Fix the llms.txt one first'));
});

test('anything that is not a string is dropped, not stringified', () => {
  const report = sanitizeReport({
    title: { nope: true },
    headline: 42,
    rows: [{ label: 12, value: ['a'] }, 'not an object', { label: 'ok', value: 'fine' }],
    tip: null,
  });
  assert.equal(report.title, null);
  assert.equal(report.headline, null);
  assert.equal(report.tip, null);
  assert.deepEqual(report.rows, [{ label: 'ok', value: 'fine' }]);
});

test('a long report is cut, not trusted', () => {
  const report = sanitizeReport({
    title: 'T'.repeat(500),
    headline: 'H'.repeat(500),
    tip: 'X'.repeat(2000),
    rows: Array.from({ length: 100 }, (_, i) => ({ label: `L${i}`, value: 'V'.repeat(500) })),
  });

  assert.equal(report.title.length, REPORT_LIMITS.title);
  assert.equal(report.headline.length, REPORT_LIMITS.headline);
  assert.equal(report.tip.length, REPORT_LIMITS.tip);
  assert.equal(report.rows.length, REPORT_LIMITS.rows);
  assert.equal(report.rows[0].value.length, REPORT_LIMITS.value);
  assert.ok(report.rows[0].value.endsWith('…'), 'a cut string says it was cut');
});

test('nothing to report is nothing to send', () => {
  assert.equal(sanitizeReport(null), null);
  assert.equal(sanitizeReport(undefined), null);
  assert.equal(sanitizeReport({}), null);
  assert.equal(sanitizeReport({ title: '   ' }), null);
  assert.equal(sanitizeReport([{ label: 'a' }]), null);
});

test('the email carries the number, the rows and the tip', () => {
  const report = sanitizeReport({
    title: 'Email Deliverability Health — example.com',
    headline: '58/100 · grade D',
    rows: [{ label: 'SPF record', value: 'FAIL — no SPF record found' }],
    tip: 'SPF: add a single record; do not add two.',
  });

  const mail = renderReportEmail({
    toolName: 'Email Deliverability Health',
    tool: 'emailhealth',
    report,
    toolUrl: 'https://hub.abetworks.in/emailhealth',
  });

  assert.ok(mail.subject.includes('Email Deliverability Health'));
  assert.ok(mail.subject.includes('58/100'));
  assert.ok(mail.text.includes('58/100 · grade D'));
  assert.ok(mail.text.includes('SPF record: FAIL — no SPF record found'));
  assert.ok(mail.text.includes('One fix tip'));
  assert.ok(mail.text.includes('https://hub.abetworks.in/emailhealth'));
  // The HTML says the same thing as the text — a report that reads one way
  // in plain text and another way when rendered is a support ticket.
  assert.ok(mail.html.includes('58/100 · grade D'));
  assert.ok(mail.html.includes('SPF record'));
  assert.ok(mail.html.includes('One fix tip'));
});

test('the HTML cannot be used to smuggle markup in', () => {
  const report = sanitizeReport({
    title: '<script>alert(1)</script>',
    headline: '"><img src=x onerror=alert(1)>',
    rows: [{ label: '<b>bold</b>', value: '<a href="http://evil">x</a>' }],
    tip: '</p><script>alert(2)</script>',
  });

  const mail = renderReportEmail({
    toolName: 'Test tool',
    tool: 'siteread',
    report,
    toolUrl: 'https://hub.abetworks.in/siteread',
  });

  // The tag is escaped, so it cannot open a tag or carry a handler — the
  // *text* of the attack is still there, which is the point of escaping.
  assert.ok(!mail.html.includes('<script'), 'no script tag may survive as markup');
  assert.ok(!mail.html.includes('<img'), 'no image tag may survive as markup');
  assert.ok(mail.html.includes('&lt;script&gt;'), 'it is escaped, not dropped');
  assert.ok(mail.html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'and the original text is still readable');
});
