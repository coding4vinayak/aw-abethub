import ToolShell from '../../components/ToolShell';
import InvoiceParseWidget from '../../components/tools/InvoiceParseWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'Invoice Parse';
  const description = 'Paste raw invoice text and get extracted fields plus real GSTIN checksum and tax-math validation — free preview, 1 invoice.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/invoiceparse', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og/invoiceparse'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/invoiceparse'] },
  };
}

export default function Page() {
  const tool = getTool('invoiceparse');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Copy the text out of the PDF invoice and paste it — no upload, no parsing service in the middle.',
      'Regex extraction pulls vendor, GSTIN, invoice number/date, taxable value, IGST/CGST/SGST and total.',
      'The GSTIN runs the real mod-11 check-code algorithm and state-code rules, then tax rates and total = taxable + tax are reconciled.',
    ]}>
      <InvoiceParseWidget />
    </ToolShell>
  );
}
