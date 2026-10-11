export function generateMetadata() {
  const title = 'Terms of Service';
  const description = 'The simple rules for using Abetworks tools.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/terms', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const S = { maxWidth: 760, margin: '0 auto' };
const H = { fontSize: 17, margin: '26px 0 8px' };
const P = { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 };

export default function Terms() {
  return (
    <div className="card" style={S}>
      <h1 className="tool-title" style={{ fontSize: 24 }}>Terms of Service</h1>
      <p style={P}>Abetworks Hub · last updated September 2026</p>

      <h2 style={H}>The deal</h2>
      <p style={P}>
        Use the tools for your own business analysis. Free tiers are provided “as is”, rate-limited
        reasonably, and can be used commercially. Don’t abuse the endpoints (mass automated scraping,
        probing other people’s infrastructure at scale, illegal use).
      </p>

      <h2 style={H}>Accuracy</h2>
      <p style={P}>
        Results are computed from live public data and deterministic checks where possible, and clearly
        labelled when model-based. Scores are decision support, not professional advice — for tax, legal
        or compliance decisions, confirm with a qualified professional (our tax tools show the CBIC
        notifications they derive from precisely for this reason).
      </p>

      <h2 style={H}>Subscriptions</h2>
      <p style={P}>
        Paid plans are month-to-month, cancel anytime from the product, no lock-in. Trial periods convert
        only with a card on file and an advance notice email. We don’t charge hidden fees.
      </p>

      <h2 style={H}>Liability</h2>
      <p style={P}>
        Our aggregate liability for any claim is limited to the amount you paid Abetworks in the 12
        months preceding it. Nothing here excludes liability we cannot legally exclude.
      </p>

      <h2 style={H}>Changes</h2>
      <p style={P}>
        If these terms change materially we email paid customers; continued use after notice means
        acceptance. Governing law: India, Bengaluru. Questions: legal@abetworks.in.
      </p>
    </div>
  );
}
