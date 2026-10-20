// Outbound email for the hub.
//
// The hub promises every captured visitor "one email with your report" (the
// privacy note under the box, and the copy on the capture card). Until this
// file existed, that promise was kept by a person remembering to send it — the
// lead was written to disk and the owner was notified, and the report itself
// was never sent. A promise the product cannot keep is a lie told in the
// conversion copy, so this file exists to keep it.
//
// The rule this file enforces is the same one the other apps in the suite
// use: **the caller is always told which transport actually ran.** `sendMail`
// answers `{ channel: 'http' }` when a provider took the message, and
// `{ channel: 'log' }` when there is no provider and the message was written to
// the server log instead. The capture card turns that into copy the visitor
// can act on: an emailed report says so, and a logged one says that too.
//
// It is dependency-free (`fetch` only) so the hub keeps its small install, and
// an owner who prefers SMTP or SES can point MAIL_WEBHOOK_URL at their own
// endpoint without touching a line of the app.

/** Where a message went, or where it would have gone. */
export const MAIL_CHANNEL = {
  HTTP: 'http',
  LOG: 'log',
};

/** True when a real provider is configured and mail can actually be sent. */
export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.MAIL_WEBHOOK_URL);
}

/**
 * The transport, resolved once per call.
 *
 * Resend is the default because it is the one provider the suite already
 * speaks to; MAIL_WEBHOOK_URL is the escape hatch for anything else, and it
 * takes the same `{from, to, subject, html, text}` shape.
 */
function resolveTransport() {
  const endpoint = process.env.MAIL_WEBHOOK_URL
    ? process.env.MAIL_WEBHOOK_URL
    : 'https://api.resend.com/emails';
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Abetworks Hub <hello@abetworks.in>';
  return { endpoint, apiKey, from };
}

/**
 * Write the message to the server log, and say so. Never a silent no-op.
 *
 * The log is where a deployment without a provider keeps its promise of
 * *some* record — but it is not a delivery, and everything downstream is told
 * so by the channel this returns.
 */
function logMessage({ to, subject, text }) {
  const line = '='.repeat(72);
  const body = [
    '',
    line,
    `EMAIL (not delivered — no mail provider configured) to: ${to}`,
    `Subject: ${subject}`,
    line,
    text,
    line,
    '',
  ].join('\n');
  console.log(body);
  return { channel: MAIL_CHANNEL.LOG };
}

/**
 * Send one message.
 *
 * Never throws: a failed send is a fact the caller must be able to report
 * honestly, not an exception that turns a captured lead into a 500. The
 * returned `error` says what went wrong; `channel` says what actually ran.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) return logMessage({ to, subject, text });

  const { endpoint, apiKey, from } = resolveTransport();
  const headers = { 'content-type': 'application/json' };
  if (apiKey && endpoint.includes('resend.com')) headers.authorization = `Bearer ${apiKey}`;
  if (process.env.MAIL_WEBHOOK_TOKEN) headers.authorization = `Bearer ${process.env.MAIL_WEBHOOK_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // A provider refusing a message is an operational problem. Reported,
      // not swallowed: pretending it was sent means a visitor waits for a
      // report that is never coming.
      const detail = `mail provider refused the message: ${res.status}`;
      console.error(detail);
      return { channel: MAIL_CHANNEL.LOG, error: detail };
    }
    return { channel: MAIL_CHANNEL.HTTP };
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    console.error(`mail send failed: ${detail}`);
    return { channel: MAIL_CHANNEL.LOG, error: detail };
  } finally {
    clearTimeout(timer);
  }
}
