import ToolShell from '../../components/ToolShell';
import ColdAngleWidget from '../../components/tools/ColdAngleWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'ColdAngle';
  const description = 'Paste up to 10 prospect websites and get one researched cold-email opener per domain — free preview of the angle engine.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/coldangle', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/coldangle'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/coldangle'] },
  };
}

export default function Page() {
  const tool = getTool('coldangle');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Drop up to 10 prospect URLs, one per line, plus your product in a single sentence — we crawl each homepage live through a guarded fetcher.',
      'Every reachable prospect gets a second crawl: an About/company page discovered from the homepage links (or a common /about path) so the angle is grounded in two pages, not one.',
      'The parser keeps the most concrete phrases from both pages, then rotates six opener archetypes — observation→bridge, question, benchmark, analogy-lite, news-hook, contrarian — so a batch reads like research, not a template mail-merge. Each row is labelled with its angle type.',
    ]}>
      <ColdAngleWidget />
    </ToolShell>
  );
}
