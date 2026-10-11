import ToolShell from '../../components/ToolShell';
import PricePulseWidget from '../../components/tools/PricePulseWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Price Pulse Competitor Pricing Diff';
  const description = 'Paste pricing or drop in a competitor pricing page URL — get a per-tier price-gap table, coverage gaps and price-anchor tips. Free preview of 3 rows.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/pricepulse', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('pricepulse');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste your plans and a competitor’s one per line — or drop in their live pricing page URL and we fetch it server-side and read plan blocks ($amount + the plan name in front of it) out of the page text.',
      'We match tiers by name family then fall back to price-ladder position, and compute the % you are cheaper or pricier.',
      'You get the diff table, the rungs they offer that you don’t, three positioning calls, and a price-anchor tip on how the cheapest/most-expensive visible plan frames every other number.',
    ]}>
      <PricePulseWidget />
    </ToolShell>
  );
}
