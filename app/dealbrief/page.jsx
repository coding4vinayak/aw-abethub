import ToolShell from '../../components/ToolShell';
import DealBriefWidget from '../../components/tools/DealBriefWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'DealBrief';
  const description = 'Paste a sales call transcript and get a structured deal brief — stakeholders, BANT, objections, next steps.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/dealbrief', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/dealbrief'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/dealbrief'] },
  };
}

export default function Page() {
  const tool = getTool('dealbrief');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste the transcript with a “Name: line” for each speaker.',
      'We run a MEDDIC-style coverage check — metrics, economic buyer, decision criteria, decision process, paper process — flagging every gap with the transcript line that proves coverage.',
      'Action items are extracted with their dates (“next week”, “tuesday”, “mar 12”); competitors and incumbent tools named in the call get their own table.',
      'The summary is AI-drafted when a model is configured, otherwise computed from the same facts — BANT signals and objections round it out. The free preview reads the first 3,000 words.',
    ]}>
      <DealBriefWidget />
    </ToolShell>
  );
}
