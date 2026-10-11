import ToolShell from '../../components/ToolShell';
import BrandVoiceWidget from '../../components/tools/BrandVoiceWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'BrandVoice';
  const description = 'Score any text against the voice fingerprint of your best copy — free brand-voice check.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/brandvoice', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('brandvoice');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste your best copy — we build a 10-metric voice fingerprint: sentence rhythm, word and syllable length, formality, enthusiasm, point of view, sentence openings, passive-voice ratio and emoji/hashtag density.',
      'Paste the new draft and we measure how far each metric drifts from your sample — with a directional verdict per metric (too casual, too long, too passive…).',
      'A weighted deviation score gives a straight verdict: on-brand, needs work, or off-brand. With a model configured, an AI layer adds a voice read and rewrite tips.',
    ]}>
      <BrandVoiceWidget />
    </ToolShell>
  );
}
