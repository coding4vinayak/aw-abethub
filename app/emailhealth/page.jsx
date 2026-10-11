import ToolShell from '../../components/ToolShell';
import EmailHealthWidget from '../../components/tools/EmailHealthWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Email Deliverability Health';
  const description = 'Free SPF, DKIM, DMARC and MX check for any domain in 10 seconds.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/emailhealth', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('emailhealth');
  return (
    <ToolShell tool={tool} howItWorks={[
      'We query your domain’s DNS live: SPF, DMARC, five DKIM selectors, MX (including RFC 7505 null-MX), A/AAAA and a reverse-DNS hint.',
      'DMARC is parsed field by field (p=, pct, rua reporting, strict/relaxed alignment) and SPF is checked against the 10-recursive-lookup limit and wildcard entries.',
      'You get an A–F grade like MXToolbox gives — capped when a core pillar is missing — plus a per-check “what a pro would do” fix sentence.',
    ]}>
      <EmailHealthWidget />
    </ToolShell>
  );
}
