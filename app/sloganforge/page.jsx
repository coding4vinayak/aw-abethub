import ToolShell from '../../components/ToolShell';
import SloganForgeWidget from '../../components/tools/SloganForgeWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'SloganForge';
  const description = 'Generate 100+ scored slogans from your positioning in playful, premium, technical or urgent tone. Free preview ranks your best 8.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/sloganforge', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/sloganforge'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/sloganforge'] },
  };
}

export default function Page() {
  const tool = getTool('sloganforge');
  return (
    <ToolShell tool={tool} howItWorks={[
      'On the server we parse your positioning sentence, extract real content words, then multiply them through 15 slogan families tuned to your chosen tone (playful, premium, technical, urgent) plus synonym variants.',
      'Every candidate is scored on prime word count, alliteration, brand recall and tone fit — then screened by three copy-desk tests: cliché words (empower/seamless/unleash get cut, not praised), a syllable meter for chantability, and a say-it-out-loud tongue-twister score. Near-identical lines are deduplicated before ranking.',
      'You also get deterministic name/domain availability hints and an optional AI refinement round over your top 3 — sharpened to your tone, cliché-free.',
      'The free preview surfaces the best 8 of 100+ generated lines — the planned SloganForge adds domain availability checks and refinement rounds.',
    ]}>
      <SloganForgeWidget />
    </ToolShell>
  );
}
