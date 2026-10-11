import ToolShell from '../../components/ToolShell';
import PromptShieldWidget from '../../components/tools/PromptShieldWidget';
import { getTool } from '../../lib/registry';

export function generateMetadata() {
  const title = 'PromptShield';
  const description = 'Scan any prompt for injection payloads and PII before it reaches your AI agent — free preview verdict.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/promptshield', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function Page() {
  const tool = getTool('promptshield');
  return (
    <ToolShell tool={tool} howItWorks={[
      'Paste the exact string your agent will receive — user text, a retrieved document, or the ticket you are about to summarise.',
      'Thirteen detector families run as pattern detectors with confidence scores: override, prompt extraction, prompt-peek phrasing, DAN-style role-play, secret exfil, role/message spoofing (including [system] and <<SYS>> format injection), tool hijack, pastebin-style exfil URLs, encoding smuggling, obfuscated base64 blobs, translate-to-bypass tricks, and indirect instructions hidden inside quoted data — plus zero-width/bidi/homoglyph checks.',
      'A PII pass looks for emails, phones, Luhn-validated cards, GSTINs, Aadhaar-shaped 12-digit numbers (real Verhoeff checksum), IFSC bank codes and passport numbers; weighted severity × confidence produces the SAFE / FLAG / BLOCK verdict, and when an AI key is configured the scan also gets a classification and safe-rewrite suggestion.',
    ]}>
      <PromptShieldWidget />
    </ToolShell>
  );
}
