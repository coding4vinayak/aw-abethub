import ToolShell from '../../components/ToolShell';
import ChurnSignalWidget from '../../components/tools/ChurnSignalWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'ChurnSignal';
  const description = 'Churn risk scoring with reason codes and a save-play per account, from a CSV.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/churnsignal', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('churnsignal');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Drop your CRM or billing export — the file is scored in your browser, never stored.',
      'A weighted model reads usage decay, support load, seat utilization and account value.',
      'Every account gets a risk score, human reason codes, and a recommended save-play.',
    ]}>
      <ChurnSignalWidget />
    </ToolShell>
  );
}
