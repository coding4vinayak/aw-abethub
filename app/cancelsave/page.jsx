import ToolShell from '../../components/ToolShell';
import CancelSaveWidget from '../../components/tools/CancelSaveWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'CancelSave';
  const description = 'Pick the right cancellation save-offer from reason, value and tenure — free decision preview.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/cancelsave', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/cancelsave'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/cancelsave'] },
  };
}

export default function Page() {
  const tool = getTool('cancelsave');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Tell us why the customer is cancelling, their monthly value, how long they have stayed, and your product cohort (B2B SaaS, mobile, e-commerce).',
      'The matrix scores all four save offers (discount, pause, downgrade, annual) for save probability AND margin economics — concession cost vs expected saved margin over the cohort lifetime.',
      'You get the highest-net-upside offer, a ready-to-send retention script and the exit-survey micro-questions to ask on the way out — free, one cancellation at a time.',
    ]}>
      <CancelSaveWidget />
    </ToolShell>
  );
}
