import ToolShell from '../../components/ToolShell';
import TaglinelyWidget from '../../components/tools/TaglinelyWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Instant Tagline';
  const description = 'Free tagline generator: brand-ready taglines grouped by the classic advertising formulas (Position, Differentiation, Metaphor…) and scored for length and memorability.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/taglinely', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/taglinely'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/taglinely'] },
  };
}

export default function Page() {
  const tool = getTool('taglinely');
  return (
    <ToolShell tool={tool} howItWorks={[
      'We strip stopwords from your positioning sentence and tag the remaining words as adjectives, nouns, verbs and audience — audience descriptors like “finance” never leak into the lines.',
      'Candidates are generated per classic formula family — What-It-Does + Benefit, Position, Differentiation, Metaphor, Imperative, Superlative, Brand + Promise, Rhythm/Antithesis, Built-for — and each line is labeled with its formula plus a one-line lesson on why that formula works.',
      'Every line is scored 2–10 on word count (4–7 is prime), alliteration, brand recall and contrast structure — best first, all formulas shown, no cap.',
      'When our model key is configured, an extra AI pass drafts candidates against the same formula list (source-labelled); keyless, the deterministic engine stands alone.',
    ]}>
      <TaglinelyWidget />
    </ToolShell>
  );
}
