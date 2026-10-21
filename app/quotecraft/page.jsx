import ToolShell from '../../components/ToolShell';
import QuoteCraftWidget from '../../components/tools/QuoteCraftWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'QuoteCraft';
  const description = 'Turn scope line items into a client-ready quote with GST, validity date, terms and a printable proposal — free preview.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/quotecraft', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/quotecraft'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/quotecraft'] },
  };
}

export default function Page() {
  const tool = getTool('quotecraft');
  return (
    <ToolShell tool={tool} howItWorks={[
      'List your line items as “description | qty | rate”, set the timeline in weeks, and optionally a discount (₹/$/€ amount or a %), a valid-until date and a payment plan (50/50, net 30 or 30/40/30 milestones) — nothing is sent anywhere, the maths runs in your browser.',
      'Every line carries its own GST toggle: taxed lines add 18%, exempt lines flow through clean, and the discount is applied pro-rata before tax is computed.',
      'Scope, timeline and terms are each editable after generation; the engine writes the full proposal document — line-item table with per-line net totals included — ready to print to PDF, copy as text or download as a .txt.',
    ]}>
      <QuoteCraftWidget />
    </ToolShell>
  );
}
