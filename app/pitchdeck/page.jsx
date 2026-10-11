import ToolShell from '../../components/ToolShell';
import PitchDeckWidget from '../../components/tools/PitchDeckWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Pitch Deck Outline Generator';
  const description = 'Describe your business, drop in metrics — get a 12-slide investor outline and the questions they will ask. Free preview of 5 slides.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/pitchdeck', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('pitchdeck');
  return (
    <ToolShell tool={tool} howItWorks={[
      'One line on the business plus any metrics you have (ARR, growth, churn, CAC, margin, runway) in a box.',
      'We regex-detect which metrics you actually provided and classify your stage — seed (a16z narrative order) vs growth (CB Insights traction-led order) — from the numbers present, not from what you claim.',
      'You get a 12-slide outline — title, tailored bullets, the metric to show, and a “what a16z/CB expects on this slide” line per slide — plus up to 8 investor questions tied to your specific metric gaps and stage.',
    ]}>
      <PitchDeckWidget />
    </ToolShell>
  );
}
