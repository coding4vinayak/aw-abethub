import ToolShell from '../../components/ToolShell';
import PingDeckWidget from '../../components/tools/PingDeckWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'PingDeck Uptime & SSL Check';
  const description = 'Ping up to 10 URLs for live status, latency and TLS certificate days-left — free preview of the 2 worst.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/pingdeck', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/pingdeck'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/pingdeck'] },
  };
}

export default function Page() {
  const tool = getTool('pingdeck');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste one URL per line — we fire 3 live requests at each with a guarded fetch (internal addresses blocked) and report the average, the raw samples and the jitter between them.',
      'In parallel we open a real TLS handshake on port 443 for certificate days-left, query public RDAP (rdap.org) for the domain renewal/expiry event, and resolve AAAA records to flag IPv6 readiness.',
      'Targets sort worst-first — down, expired SSL or domain, then expiring soon or slow — so the riskiest site lands on top.',
    ]}>
      <PingDeckWidget />
    </ToolShell>
  );
}
