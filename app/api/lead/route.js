import { NextResponse } from 'next/server';
import { appendLead, notifyLead } from '../../../lib/leads';

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
  const lead = { email, tool, at: new Date().toISOString() };
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
  return NextResponse.json({ ok: true });
}
