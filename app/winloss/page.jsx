import ToolShell from '../../components/ToolShell';
import WinLossWidget from '../../components/tools/WinLossWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'WinLoss';
  const description = 'Paste won/lost deal notes and get loss themes ranked by real revenue impact, a biggest-leak insight and sample quotes. Free preview ranks top 3 themes.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/winloss', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/winloss'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/winloss'] },
  };
}

export default function Page() {
  const tool = getTool('winloss');
  return (
    <ToolShell tool={tool} howItWorks={[
      'One deal per line: won or lost, then the amount, then your notes — straight from your CRM export or call log. Dates or quarter labels inside notes (Q3, Sep 2026, 2026-09-12) are detected automatically.',
      'Every note gets a confidence score (length, numbers, causal wording, verbatim quotes), then lost deals are classified into six keyword families and ranked by confidence-weighted revenue — vague one-word notes can’t outrank real evidence.',
      'Each theme surfaces its voice-of-customer best quote (the most specific sentence, not the longest), a three-step fix playbook, win-side “what’s working” themes and a quarter pattern — with an AI narrative over the computed numbers when configured.',
      'You get a ranked loss table plus a one-paragraph diagnosis of your biggest leak with the fix. The planned full version adds full quarterly reports and direct CRM field ingest.',
    ]}>
      <WinLossWidget />
    </ToolShell>
  );
}
