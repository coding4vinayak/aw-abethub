import ToolShell from '../../components/ToolShell';
import ScopeLockWidget from '../../components/tools/ScopeLockWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'ScopeLock';
  const description = 'Match client change requests line by line against your signed SOW, get IN-SCOPE / AMBIGUOUS / EXTRA verdicts and change-order drafts — free preview.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/scopelock', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/scopelock'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/scopelock'] },
  };
}

export default function Page() {
  const tool = getTool('scopelock');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste the signed SOW as one deliverable per line, then the client’s new requests the same way — both stay in your browser. Add your hourly rate to price the fallout.',
      'Every request is normalised and scored against every SOW line with token containment, Jaccard overlap and Levenshtein similarity, and “new feature / also / while you’re at it” phrasing is penalised.',
      'Each request lands as IN-SCOPE, AMBIGUOUS or EXTRA with the matched deliverable and a confidence number. Every EXTRA gets a change-order draft sized small / medium / large, with hours estimated from its complexity drivers and priced at your hourly rate — plus a one-click “email to client” draft that itemises every extra and asks for approve-or-defer in writing.',
    ]}>
      <ScopeLockWidget />
    </ToolShell>
  );
}
