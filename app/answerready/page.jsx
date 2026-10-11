import ToolShell from '../../components/ToolShell';
import AnswerReadyWidget from '../../components/tools/AnswerReadyWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'AnswerReady';
  const description = 'Check whether AI search engines can actually answer questions about your business — free preview scan.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/answerready', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('answerready');
  return (
    <ToolShell tool={tool} howItWorks={[
      'We fetch your page and its robots.txt live, then extract headings, sentences and structured data.',
      'Six answerability signals (question headings, concise definitions, FAQPage schema, JSON-LD, readable text, robots) build a 0–100 score.',
      'We generate 5 buyer questions, then simulate each one per engine (ChatGPT, Google AI Overviews, Perplexity) — showing the exact citable sentence found, or the terms missing.',
    ]}>
      <AnswerReadyWidget />
    </ToolShell>
  );
}
