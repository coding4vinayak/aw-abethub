import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'data', 'leads.json');

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
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const lead = { email, tool, at: new Date().toISOString() };
    await fs.appendFile(FILE, JSON.stringify(lead) + '\n');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'storage unavailable' }, { status: 500 });
  }
}
