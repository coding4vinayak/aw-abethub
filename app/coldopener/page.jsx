import ToolShell from '../../components/ToolShell';
import ColdOpenerWidget from '../../components/tools/ColdOpenerWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Cold Email Opener';
  const description = 'Free researched cold-email opener built from your prospect’s actual homepage text. One opener, no signup.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/coldopener', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/coldopener'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/coldopener'] },
  };
}

export default function Page() {
  const tool = getTool('coldopener');
  return (
    <ToolShell tool={tool} howItWorks={[
      'We fetch the prospect’s homepage live and extract real headings, description and body phrases with our page parser — nav junk and boilerplate are filtered out.',
      'The best observed phrase is composed into one two-sentence opener plus a question CTA. When our model key is configured, AI writes the opener in Instantly/Apollo hyper-personalization style (via aiJson); otherwise a deterministic researcher template fires — same grounding, same quality bar.',
      'Every opener comes with a “why it works” note and an ai/engine source badge, so you learn the pattern instead of just copying the line.',
    ]}>
      <ColdOpenerWidget />
    </ToolShell>
  );
}
