import ToolShell from '../../components/ToolShell';
import SiteReadWidget from '../../components/tools/SiteReadWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'AI Visibility Check';
  const description = 'Free AI-readability score for any website — see if ChatGPT, Perplexity and Gemini can actually read your pages, plus your top 3 blockers.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/siteread', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/siteread'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/siteread'] },
  };
}

export default function Page() {
  const tool = getTool('siteread');
  return (
    <ToolShell tool={tool} howItWorks={[
      'We fetch your page, robots.txt, llms.txt and llms-full.txt live from our server — the same raw HTML most AI crawlers see.',
      'Eleven weighted signals run: meta/og:title/canonical, heading-hierarchy depth, server-rendered text, JS-only hydration, paragraph chunk-readability, JSON-LD, FAQPage schema and the full robots.txt rulebook.',
      'robots.txt is parsed per crawler identity, so you get a Profound-style readiness table for ChatGPT, Claude, Perplexity, Gemini, Apple Intelligence and Common Crawl — pass / check / blocked.',
      'You get a 0–100 score with an A–F grade, the top 3 blockers with one-line fixes, and a written verdict (AI-composed when our model key is configured, deterministic otherwise).',
    ]}>
      <SiteReadWidget />
    </ToolShell>
  );
}
