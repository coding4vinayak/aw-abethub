import ToolShell from '../../components/ToolShell';
import EmailAuditWidget from '../../components/tools/EmailAuditWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'EmailAudit';
  const description = 'Score any marketing email for spam risk and get a compliant subject rewrite — free preview.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/emailaudit', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/emailaudit'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/emailaudit'] },
  };
}

export default function Page() {
  const tool = getTool('emailaudit');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste the subject line and body — plain text, full HTML or raw headers (we detect and split them) — nothing is stored.',
      'Ten content signals build a 0–100 spam risk score with a per-signal point breakdown: a 60-term weighted spammy-word lexicon, the same lexicon scored separately in the subject, ALL-CAPS word ratio, shortened URLs, a markup-to-text ratio as an image-to-text proxy, spam-folder phrases, exclamation density, link density, subject length and a missing unsubscribe link.',
      'We estimate the spam-folder probability and suggest a rewritten, compliant subject using a template (AI-polished when configured).',
    ]}>
      <EmailAuditWidget />
    </ToolShell>
  );
}
