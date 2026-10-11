import ToolShell from '../../components/ToolShell';
import FeatureVoteWidget from '../../components/tools/FeatureVoteWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'FeatureVote';
  const description = 'A public roadmap board where users submit and upvote features. Free for 5 ideas.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/featurevote', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('featurevote');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Type a feature idea, tag it feature / bug / UX, and add it to the board — up to 5 free.',
      'Upvote ideas, and self-declare “would pay” for a +5 vote weight — Canny-style weighted signal, not loudest-voice bias.',
      'Move ideas through the planned → in-progress → shipped pipeline columns with the ◀ ▶ arrows and export the whole board as CSV. Everything saves in your browser.',
    ]}>
      <FeatureVoteWidget />
    </ToolShell>
  );
}
