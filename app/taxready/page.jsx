import ToolShell from '../../components/ToolShell';
import TaxReadyWidget from '../../components/tools/TaxReadyWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'TaxReady';
  const description = 'Pre-filing GST readiness check for Indian businesses: ITC vs GSTR-2B, 3B reconciliation, QRMP eligibility and late-fee estimate. Free top-5 checks.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/taxready', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/taxready'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/taxready'] },
  };
}

export default function Page() {
  const tool = getTool('taxready');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Enter your GSTR-1 outward tax, GSTR-2B available ITC, GSTR-3B net liability, annual turnover and last-filing date — plus optional cash/ITC utilisation split, supplier-payment age and TDS/TCS credit numbers. Nothing is uploaded anywhere.',
      'We run the real reconciliations: claimed ITC vs 2B, 3B vs (GSTR-1 − ITC) at ±1 tolerance, negative-liability refund handling and the ₹1.5 Cr QRMP threshold — with web-verified late-fee slabs (GSTR-3B ₹50/day, nil ₹20/day, ₹5,000 per-return cap per Notif. 46/2020; GSTR-1 ₹100/day up to ₹5 Cr turnover and ₹200/day above per Notif. 64/2019) plus 18% interest.',
      'Optional inputs unlock more weighted checks: cash-vs-liability split, the section 16(2)(b) 180-day ITC reversal risk (with the post-April-2024 pay-and-retain option) and TDS/TCS credit reconciliation into Table 6A.',
      'You get a 0–100 readiness score where every check carries an importance weight, and the 5 most critical checks as pass/warn/fail. The planned TaxReady ingests your full ledger, reconciles every invoice and produces a CA-shareable report.',
    ]}>
      <TaxReadyWidget />
    </ToolShell>
  );
}
