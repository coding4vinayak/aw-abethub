import { NextResponse } from 'next/server';
import { appendLead, notifyLead } from '../../../lib/leads';
import { getTool } from '../../../lib/registry';
import { sendMail } from '../../../lib/mail';
import { renderReportEmail, sanitizeReport } from '../../../lib/report-email';

// The hub's own origin, for the link in the report email. Same default as the
// layout's canonical origin, so a link in an email and a link on the page
// cannot point at different hosts.
const HUB = (process.env.HUB_URL || 'https://hub.abetworks.in').replace(/\/+$/, '');

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const email = String(body.email || '').trim().toLowerCase();
  const tool = String(body.tool || '').slice(0, 40);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'bad email' }, { status: 400 });
  }

  // The report the browser is already showing, reduced to something an email
  // can carry. A visitor who has not run the tool yet sends nothing, and the
  // capture still works — the promise then falls back to "we'll follow up".
  const report = sanitizeReport(body.report);
  const toolName = getTool(tool)?.name || tool || 'Your result';

  // The consent, recorded. The capture box promises the report and — if the
  // paid version of that tool ships — one email the day it does; nothing else.
  // A later send has to be able to check what was agreed, so the scope travels
  // with the lead.
  const lead = { email, tool, at: new Date().toISOString(), consent: 'report-and-launch-email' };
  if (report) lead.report = report;

  try {
    await appendLead(lead);
  } catch {
    return NextResponse.json({ error: 'storage unavailable' }, { status: 500 });
  }

  // Fire-and-forget: the visitor's response must never wait on (or fail with)
  // a third-party webhook. notifyLead swallows its own errors and Render runs
  // a long-lived Node process — not a serverless freeze — so the POST finishes
  // in the background. (`after()` from next/server is the intended API here,
  // but as of Next 16.4 its callbacks don't run for route handlers under
  // `next start`; the smoke test proves delivery on a real socket instead.)
  void notifyLead(lead);

  // The promise: one email with the report. The answer says what actually
  // happened — `delivered: true` only when a provider took the message — so
  // the card can tell the visitor the truth instead of claiming a delivery
  // that did not happen.
  let delivered = false;
  let channel = 'log';
  if (report) {
    const mail = renderReportEmail({
      toolName,
      tool,
      report,
      toolUrl: `${HUB}/${tool}`,
    });
    const sent = await sendMail({ to: email, subject: mail.subject, text: mail.text, html: mail.html });
    delivered = sent.channel === 'http' && !sent.error;
    channel = sent.channel;
  }

  return NextResponse.json({ ok: true, delivered, channel, emailed: delivered });
}
