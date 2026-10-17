// Lead storage + the two things a captured lead needs next: an owner who can
// read it, and a signal that it arrived. The disk (`DATA_DIR`, /data on Render)
// is the source of truth; everything here works against the same JSONL file the
// capture route appends to — exported so the disk check, the owner route and
// the notify hook can never disagree about where leads live.
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// `DATA_DIR` points at the mounted disk on a host that has one (the Render
// blueprint sets /data); without it, leads land next to the app, which is fine
// locally and ephemeral on a host — the variable is what makes the disk count.
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

export async function appendLead(lead) {
  await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
  await fs.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n');
}

// Tolerant read: the file is JSONL appended by a running server, so a torn
// last line (kill -9 mid-append) must not hide every lead written before it.
export async function readLeads() {
  let raw;
  try {
    raw = await fs.readFile(LEADS_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return raw.split('\n').flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  });
}

const csvCell = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// What the ESP import wants: one row per lead, stable columns.
export function leadsCsv(leads) {
  const rows = [['email', 'tool', 'at'], ...leads.map((l) => [l.email, l.tool, l.at])];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

// Constant-time token check for the owner route. Compared as sha256 digests so
// a length mismatch can't leak through timingSafeEqual's equal-length rule.
export function tokenOk(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

// Fire-and-forget owner notification. A dead webhook must never fail a lead —
// by the time this runs the lead is already on disk, and the failure belongs in
// the operator's logs, not in the visitor's browser.
//
// This fetch deliberately skips `lib/fetchpage.js`: that guard exists for
// *caller-supplied* URLs (SSRF). This URL comes from the operator's own
// environment, same trust level as the DATA_DIR that stores the lead.
export async function notifyLead(lead) {
  const url = process.env.LEAD_NOTIFY_URL;
  if (!url) return { skipped: 'LEAD_NOTIFY_URL not set' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) console.error(`lead notify ${url} answered ${res.status}`);
    return { status: res.status };
  } catch (err) {
    console.error(`lead notify ${url} failed: ${err.message}`);
    return { error: err.message };
  }
}
