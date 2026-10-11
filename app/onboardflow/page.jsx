import ToolShell from '../../components/ToolShell';
import OnboardFlowWidget from '../../components/tools/OnboardFlowWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'OnboardFlow Checklist Builder';
  const description = 'Turn onboarding steps into an interactive checklist and a paste-ready embed snippet — free preview, 6 steps.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/onboardflow', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('onboardflow');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Write one checklist step per line, optionally add “| guide text” and a “video:” or “call:” prefix — plain lines are typed as tasks.',
      'Every step gets a deterministic time-to-complete estimate (explicit “20 minute” durations win, otherwise type baseline plus guide reading time), and ▲▼ buttons reorder the flow without drag tooling.',
      'You get completion % per status and per step type, a time-to-value total, plus a richer embed JSON (steps, type, guide, order) ready to paste with the <script> snippet.',
    ]}>
      <OnboardFlowWidget />
    </ToolShell>
  );
}
