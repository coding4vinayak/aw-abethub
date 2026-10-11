import ToolShell from '../../components/ToolShell';
import SocialProofWidget from '../../components/tools/SocialProofWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'SocialProof';
  const description = 'Upload a customer CSV and generate live social-proof popup copy in three styles, with an embed-ready JSON config. Free preview from 3 rows.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/socialproof', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('socialproof');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Drop a CSV of real activity — customer, product, city, amount, date, type and rating columns are auto-detected and the file never leaves your browser.',
      'Each row is classified as a purchase, sign-up or review proof type (explicit event column, then column hints), and rows inside your 24h / 7-day window are previewed live in bubble, toast and banner styles.',
      'Negative proof (refunds, cancellations, 1–2★) is excluded automatically, and thin counts under 5 get the hide-don’t-fake note — the same ethics defaults shipped in WiserNotify and Proof.',
      'You also get an embed JSON with showEvery, scroll behavior and time-window settings plus a min-count hide rule. Paid adds the live data feed, advanced targeting rules and removes the branding tag.',
    ]}>
      <SocialProofWidget />
    </ToolShell>
  );
}
