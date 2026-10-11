import ToolShell from '../../components/ToolShell';
import ChurnPeekWidget from '../../components/tools/ChurnPeekWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Churn Peek';
  const description = 'Upload a customer CSV and get a Vitally-style health score, risk grade and top churn reason for every account, free.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/churnpeek', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('churnpeek');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Drop any CSV export from your CRM or billing tool — the file never leaves your browser.',
      'We auto-detect usage columns (days since activity, logins, tickets — including a recent-window column — seats, used seats, account value) and two comparable usage windows when present.',
      'A health-score model grades every account: log-scale activity decay, recency-weighted ticket load, a 75%-target seat-utilization curve, a risk-trend delta and a high-value amplifier — each with its top reason.',
      'Every account gets its High / Medium / Low grade — all rows, no cap.',
    ]}>
      <ChurnPeekWidget />
    </ToolShell>
  );
}
