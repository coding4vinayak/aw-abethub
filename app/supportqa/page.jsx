import ToolShell from '../../components/ToolShell';
import SupportQAWidget from '../../components/tools/SupportQAWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'SupportQA';
  const description = 'Paste support ticket conversations and auto-grade each on resolution, tone, empathy and policy compliance. Free preview grades 3 tickets.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/supportqa', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/supportqa'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/supportqa'] },
  };
}

export default function Page() {
  const tool = getTool('supportqa');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste tickets as Agent: / Customer: lines, separated by blank lines or dashes. “First response: 4 hours” and “SLA: 4h / sla|breached” lines feed the SLA scorecard column.',
      'Each ticket becomes a QA scorecard: overall grade A–F plus weighted sub-scores (resolution, tone & empathy, policy compliance, customer effort, SLA, opportunities) each with a pass/fail threshold you can see on the bar.',
      'The customer-effort proxy measures who carries the conversation (text ratio, turn count, repeat-question markers), and missed-opportunity detection flags feature or pricing asks the agent ignored.',
      'The free preview grades your first 3 tickets; the planned SupportQA scores 100% of volume and tracks trends per agent and week.',
    ]}>
      <SupportQAWidget />
    </ToolShell>
  );
}
