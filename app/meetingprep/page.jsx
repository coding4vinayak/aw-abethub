import ToolShell from '../../components/ToolShell';
import MeetingPrepWidget from '../../components/tools/MeetingPrepWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Meeting Prep Brief';
  const description = 'Paste a company URL and your notes — get a one-page pre-call brief with attendee gaps, risks and 3 questions.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/meetingprep', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('meetingprep');
  return (
    <ToolShell tool={tool} howItWorks={[
      'We fetch the company site live — plus their /about page (or an about URL hinted in the sitemap) — for a real company blurb, falling back to the meta description.',
      'Recent H2 headings are surfaced as “signals from their site”: live initiatives to ask about, the way Clay enriches a lead from their own pages.',
      'Your notes are split into statements; named people carrying a role signal (CEO, head, VP, owner, lead…) are flagged as decision-makers against the attendee line.',
      'You get a one-page brief: company snapshot, discussion context, three questions grounded in detected topics, and the risks they hide.',
    ]}>
      <MeetingPrepWidget />
    </ToolShell>
  );
}
