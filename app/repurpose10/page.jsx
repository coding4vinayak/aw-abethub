import ToolShell from '../../components/ToolShell';
import Repurpose10Widget from '../../components/tools/Repurpose10Widget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Repurpose10';
  const description = 'Paste one blog post and get platform-native X threads, LinkedIn, newsletter, Instagram and more — free preview of 3 of 10 formats.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/repurpose10', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/repurpose10'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/repurpose10'] },
  };
}

export default function Page() {
  const tool = getTool('repurpose10');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Drop in a blog post, article or long update (300+ characters) — links, headings and code blocks are stripped before analysis.',
      'The text is split into sentences and ranked by keyword density, concrete numbers and conversational length, so the strongest lines rise to the top.',
      'Pick a tone — neutral, punchy or professional — and the templates swap their hooks, CTAs and length budgets. Those ranked lines are composed into ten platform-native formats (X thread, LinkedIn post and poll, newsletter with subject line, Instagram caption and carousel outline, YouTube Short hook, Reddit community post), each hard-fitted to its character limit and counted, with copy buttons — the preview reveals three.',
    ]}>
      <Repurpose10Widget />
    </ToolShell>
  );
}
