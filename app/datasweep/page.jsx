import ToolShell from '../../components/ToolShell';
import DataSweepWidget from '../../components/tools/DataSweepWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'DataSweep';
  const description = 'Upload a CRM CSV and find duplicates, broken emails and missing values free — first 10 issues.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/datasweep', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('datasweep');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Drop any CSV export from your CRM — the file never leaves your browser.',
      'We detect exact and near duplicates, phone-number duplicates after normalisation (formatting is stripped before comparing), invalid emails, empty columns, unparseable dates and casing inconsistencies.',
      'Name columns are fuzzy-clustered into merge suggestions with a WinPure-style match-confidence %, and every column gets a quality bar (completeness + validity + uniqueness).',
      'Issues are severity-ranked — missing critical fields like email or phone come first; the preview caps at the first 10.',
    ]}>
      <DataSweepWidget />
    </ToolShell>
  );
}
