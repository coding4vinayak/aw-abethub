import ToolShell from '../../components/ToolShell';
import ContractScanWidget from '../../components/tools/ContractScanWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'ContractScan';
  const description = 'Flag risky liability, lock-in and termination clauses in vendor contracts — free 3-clause scan.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/contractscan', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/contractscan'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/contractscan'] },
  };
}

export default function Page() {
  const tool = getTool('contractscan');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste up to 20,000 characters of the contract — it is scanned in the request and never stored.',
      'Detectors hunt auto-renewal, unlimited liability/indemnity, IP assignment, change-of-control, most-favored (MFN) terms, uncapped expansion fees, data-ownership grabs, exclusivity, penalty interest, foreign governing law — plus missing SLA and without-cause exit clauses.',
      'You get a risk heat summary (X high / Y med / Z low), an overall contract grade A–F, and each hit quoted with a plain-English fix. With a model configured, AI extracts and grades clauses and every fragment must be verbatim in your text.',
    ]}>
      <ContractScanWidget />
    </ToolShell>
  );
}
