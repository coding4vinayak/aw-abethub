import ToolShell from '../../components/ToolShell';
import ReviewReplyWidget from '../../components/tools/ReviewReplyWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'ReviewReply';
  const description = 'Paste a customer review and get a policy-compliant, issue-by-issue reply draft for Google, G2 or the app stores — free preview.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/reviewreply', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/reviewreply'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/reviewreply'] },
  };
}

export default function Page() {
  const tool = getTool('reviewreply');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste the review, set the star rating, your business name and the platform it came from.',
      'A lexicon pass scores sentiment (with negation flips) and an eleven-family detector names the actual complaints — timing, conduct, product failure, billing, support silence, hygiene, reliability and more.',
      'The reply is assembled from your rating band: an opener that matches the score, one acknowledgement per detected issue, the platform-policy line, and an invite-back-to-resolve close you can post as-is.',
    ]}>
      <ReviewReplyWidget />
    </ToolShell>
  );
}
