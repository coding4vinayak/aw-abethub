import ToolShell from '../../components/ToolShell';
import HireSignalWidget from '../../components/tools/HireSignalWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'HireSignal';
  const description = 'Score inbound applicants against your job description — ranked fit with matched evidence, free preview.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/hiresignal', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('hiresignal');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste the job description; we weight its terms — must-have vs nice-to-have by frequency, “must/required/essential” context, position in the JD and Requirements-vs-Preferred section.',
      'Add applicants one per line — each is scored on must-have coverage, experience years (“7 years”, “2019–2024”, “since 2018”) and an education ladder (diploma → bachelors → masters → doctorate).',
      'Get a ranked table with a gap flag for every missing must-have and expandable evidence snippets per matched term; the preview scores the top 3.',
    ]}>
      <HireSignalWidget />
    </ToolShell>
  );
}
