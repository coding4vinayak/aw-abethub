import EmailCapture from './EmailCapture';

export default function ToolShell({ tool, children, howItWorks = [], capture }) {
  const paid = tool.tier !== 'free';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    description: tool.desc,
    applicationCategory: 'BusinessApplication',
    offers:
      tool.tier === 'free'
        ? { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
        : { '@type': 'Offer', price: tool.price.replace(/[^0-9.]/g, ''), priceCurrency: 'USD' },
  };

  const steps = howItWorks.length
    ? howItWorks
    : [
        'Paste or upload your input — no account, no onboarding call.',
        `${tool.name} runs real checks and scoring models, not a fake demo.`,
        'See genuine results instantly; the paid version unlocks depth, history and automation.',
      ];

  const faqs = [
    {
      q: `What does ${tool.name} do?`,
      a: tool.desc,
    },
    {
      q: 'Is the free preview real or a demo?',
      a: `Real. ${tool.name} runs the same engines the paid product uses${paid ? ' — the free preview just shows a capped slice of the full output' : ''}. No fabricated numbers, no fake screenshots.`,
    },
    {
      q: 'Is my data stored?',
      a: 'Your input is processed to produce the result and is not sold or shared. Nothing is published anywhere. Only if you type an email into the optional capture box do we keep a lead record so we can send your report.',
    },
    {
      q: `How accurate are the results?`,
      a: 'Checks are deterministic where possible (live DNS, robots.txt, HTTP, arithmetic, parsing rules) and clearly labelled when a step is a model-based estimate. We show the evidence behind every score, not just the score.',
    },
    paid
      ? {
          q: `What do I get for the money?`,
          a: `The full uncapped output of this check, on your whole dataset, on a schedule, with history — plus alerts when things change. Start with ${tool.upsell.name} (${tool.upsell.price}) or see the whole Abetworks suite.`,
        }
      : {
          q: 'Why is this free?',
          a: 'It is a lead magnet from Abetworks — one job done properly, forever free, no signup. If it earns your trust, the paid suite right next door goes deeper.',
        },
  ];

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <div className="tool-hero">
        <a className="back" href="/">← All hub tools</a>
        <p className="eyebrow">Abetworks · single-feature tool</p>
        <h1 className="tool-title">
          {tool.name}{' '}
          <span className={`tc-tier ${tool.tier}`}>{tool.tier === 'free' ? 'FREE' : 'PREVIEW'}</span>
        </h1>
        <p className="tool-tagline">{tool.tagline}</p>
        <div className="trust-strip">
          <span>✓ No signup</span>
          <span>✓ Real engines, not a demo</span>
          <span>✓ Nothing uploaded unless you ask</span>
        </div>
      </div>

      <div className="card">
        {children}
        {capture !== false && (
          <EmailCapture
            tool={tool.slug}
            headline={
              tool.tier === 'free'
                ? 'Want the full report?'
                : 'Get the full version emailed to you'
            }
            sub="We'll send your complete result plus one tip to fix the biggest gap. No newsletter, no spam."
          />
        )}
      </div>

      <div className="card">
        <h2 className="section-h">How it works</h2>
        <ol className="how-list">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>

      <div className="card">
        <h2 className="section-h">Frequently asked questions</h2>
        {faqs.map((f, i) => (
          <details key={i} className="faq" open={i === 0}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>

      <div className="upsell">
        <div>
          <p className="eyebrow" style={{ color: '#a5b4fc', marginTop: 0 }}>Part of the Abetworks suite</p>
          <h4>{tool.upsell.name} — {tool.upsell.price}</h4>
          <p>Run this on your whole pipeline, on a schedule, with history and alerts.</p>
        </div>
        <a href={tool.upsell.href.startsWith('/') ? `${tool.upsell.href}?src=hub-${tool.slug}` : tool.upsell.href}>
          Try {tool.upsell.name} →
        </a>
      </div>
    </article>
  );
}
