import ToolShell from '../../components/ToolShell';
import ConsentScanWidget from '../../components/tools/ConsentScanWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'ConsentScan';
  const description = 'DPDP/GDPR cookie, tracker and consent gaps for any page — free top-3 findings.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/consentscan', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('consentscan');
  return (
    <ToolShell tool={tool} howItWorks={[
      'We fetch the page live and detect cookie-banner wording, a reject option, installed CMPs (OneTrust, Cookiebot, Sourcepoint, TrustArc, Usercentrics, Iubenda, Osano, CookieYes, Shopify banner) and Google Consent Mode v2 markers.',
      'Every third-party script src and og: resource URL is extracted, counted per vendor family and surfaced as a named tracker inventory.',
      'Findings become a pass/warn/fail DPDP-GDPR checklist with a 0–100 risk score, an A–F grade, worst gaps first.',
    ]}>
      <ConsentScanWidget />
    </ToolShell>
  );
}
