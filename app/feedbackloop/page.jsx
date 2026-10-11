import ToolShell from '../../components/ToolShell';
import FeedbackLoopWidget from '../../components/tools/FeedbackLoopWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'FeedbackLoop';
  const description = 'Paste reviews, tickets or NPS verbatims and get ranked themes with sentiment — free preview.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/feedbackloop', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('feedbackloop');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste one feedback item per line — reviews, tickets or NPS comments.',
      'Items are clustered into themes first, then sentiment is averaged per theme; each theme carries its dominant intent tag (bug request, feature, praise or churn risk).',
      'Themes rank by urgency — negative share × mention volume — and a “what to do first” verdict closes it out (AI-drafted when a model is configured). The preview shows 4 themes.',
    ]}>
      <FeedbackLoopWidget />
    </ToolShell>
  );
}
