import ToolShell from '../../components/ToolShell';
import ApiHealthWidget from '../../components/tools/ApiHealthWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'API Health';
  const description = 'Check status and latency of your third-party API endpoints — free preview of the 3 worst.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/apihealth', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/apihealth'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/apihealth'] },
  };
}

export default function Page() {
  const tool = getTool('apihealth');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste one endpoint URL per line — each gets 3 quick live samples with a hard 5-second timeout (private/internal addresses are blocked).',
      'You get real status codes with a 2xx/3xx/4xx/5xx class summary, average latency and jitter (max−min of the samples) per endpoint.',
      'Optionally send an Authorization header (Bearer/API key) so authenticated health endpoints check honestly.',
      'Results sort worst-first so the degrading or flapping vendor surfaces at the top of the list.',
    ]}>
      <ApiHealthWidget />
    </ToolShell>
  );
}
