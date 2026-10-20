// The report email: what the hub promised the visitor.
//
// The capture card says "one email with your report — no newsletter, no
// spam". That promise is only worth keeping if the email carries the *result*
// the visitor just produced, and not a "we'll be in touch". So the browser
// sends the report it is already showing, and this file turns that into an
// email — after refusing anything that does not belong in one.
//
// The bounds are the point. A report arrives from a browser, so it is
// untrusted input: strings are cut to a length that fits an email, the row
// count is capped, and anything that is not a string is dropped rather than
// stringified into "[object Object]". A visitor cannot use this to send a
// megabyte, an HTML injection, or a mailer that looks like someone else.

export const REPORT_LIMITS = {
  title: 120,
  headline: 160,
  label: 60,
  value: 240,
  tip: 600,
  rows: 20,
};

const str = (value, max) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Reduce an untrusted report to something an email can carry.
 *
 * Returns null when there is nothing worth sending — the caller then falls
 * back to the "we'll follow up" wording rather than emailing an empty report.
 */
export function sanitizeReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const title = str(raw.title, REPORT_LIMITS.title);
  const headline = str(raw.headline, REPORT_LIMITS.headline);
  const tip = str(raw.tip, REPORT_LIMITS.tip);

  const rows = [];
  if (Array.isArray(raw.rows)) {
    for (const row of raw.rows.slice(0, REPORT_LIMITS.rows)) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const label = str(row.label, REPORT_LIMITS.label);
      const value = str(row.value, REPORT_LIMITS.value);
      if (!label && !value) continue;
      rows.push({ label: label || '—', value: value || '—' });
    }
  }

  if (!title && !headline && !tip && rows.length === 0) return null;
  return { title: title || null, headline: headline || null, rows, tip: tip || null };
}

/**
 * Render the report email.
 *
 * Plain text first, because that is what a mail client shows when the HTML
 * is not rendered, and because it is what the log fallback writes. The HTML is
 * the same content with the same escapes — a report that says one thing in
 * text and another in the rendered part is a support ticket.
 */
export function renderReportEmail({ toolName, tool, report, toolUrl, hubName = 'Abetworks Hub' }) {
  const title = report.title || `${toolName} result`;
  const subject = `${toolName}: ${report.headline || title}`;

  const textLines = [
    `${title}`,
    report.headline ? `Result: ${report.headline}` : null,
    '',
  ];
  for (const row of report.rows) textLines.push(`${row.label}: ${row.value}`);
  if (report.rows.length) textLines.push('');
  if (report.tip) textLines.push(`One fix tip: ${report.tip}`);
  textLines.push('');
  textLines.push(`Run it again or see the full tool: ${toolUrl}`);
  textLines.push('');
  textLines.push('This is the one email we said we would send. No newsletter, no spam.');
  const text = textLines.filter((l) => l !== null).join('\n');

  const rowHtml = report.rows
    .map(
      (row) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(row.label)}</td>` +
        `<td style="padding:6px 0;color:#111827">${escapeHtml(row.value)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html><body style="margin:0;background:#f9fafb;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af">${escapeHtml(hubName)}</p>
      <h1 style="margin:0 0 20px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
      ${report.headline ? `<p style="margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:-0.01em">${escapeHtml(report.headline)}</p>` : ''}
      ${rowHtml ? `<table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">${rowHtml}</table>` : ''}
      ${report.tip ? `<p style="margin:0 0 24px;padding:12px 14px;background:#f9fafb;border-left:3px solid #4f46e5;font-size:14px;line-height:1.6"><strong>One fix tip.</strong> ${escapeHtml(report.tip)}</p>` : ''}
      <a href="${escapeHtml(toolUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">Open ${escapeHtml(toolName)}</a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9ca3af">This is the one email we said we would send. No newsletter, no spam. Tool: ${escapeHtml(tool)}</p>
    </div>
  </div>
</body></html>`;

  return { subject, text, html };
}
