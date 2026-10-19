import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../../../lib/leads';

// The app's one piece of state lives on the disk: every captured lead appends
// to `DATA_DIR/leads.json` (the Render disk at /data). A health check that
// only proves the Next server answers would keep a deploy live that can no
// longer persist a lead — so this probe writes and removes a file, and a
// read-only, full, or unmounted disk fails the deploy instead of silently
// eating leads. Render counts only 2xx/3xx as healthy; failure here is 503.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, `.health-${process.pid}`);
    await fs.writeFile(probe, 'ok');
    await fs.rm(probe, { force: true });
    return NextResponse.json({ ok: true, storage: 'writable', time: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { ok: false, storage: 'unavailable', time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
