import { NextResponse } from 'next/server';
import { readLeads, leadsCsv, tokenOk } from '../../../lib/leads';

// The storage runs on a disk; without a way to read it, leads are just an
// expensive append-only log. This is the owner's window into that disk:
// JSON by default, `?format=csv` for the ESP import.
//
// Disabled unless `LEADS_TOKEN` is set (`sync: false` in render.yaml), so a
// default deploy exposes nothing. Wrong token is a 401, never a hint; an
// unconfigured service says so with a 503 instead of pretending.
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const expected = process.env.LEADS_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'not configured', hint: 'Set LEADS_TOKEN on this service to enable the owner route.' },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  // Header is the preferred path (tokens in URLs end up in logs); `?token=`
  // exists so the owner can open it in a browser.
  const provided =
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token');
  if (!tokenOk(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let leads;
  try {
    leads = await readLeads();
  } catch {
    return NextResponse.json({ error: 'storage unavailable' }, { status: 500 });
  }

  if (url.searchParams.get('format') === 'csv') {
    return new NextResponse(leadsCsv(leads), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="abetworks-leads.csv"',
      },
    });
  }
  return NextResponse.json({ count: leads.length, leads });
}
