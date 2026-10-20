import ToolCapture from './ToolCapture';
import Link from 'next/link';

export default function ToolShell({ tool, children, howItWorks = [], capture }) {
  const paid = tool.tier !== 'free';
  // Only the free tools carry a real offer: everything marked "paid" is a
  // working preview of a product still in build-out, and structured data
  // claiming a purchasable price for it would describe a sale nobody can make.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    description: tool.desc,
    applicationCategory: 'BusinessApplication',
    ...(tool.tier === 'free'
      ? { offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
      : {}),
  };

  const steps = howItWorks.length
    ? howItWorks
    : [
        'Paste or upload your input — no account, no onboarding call.',
        `${tool.name} runs real checks and scoring models, not a fake demo.`,
        'See genuine results instantly — the full version (accounts, history, schedules) is in build-out; leave your email and we’ll tell you when it ships.',
      ];

  const faqs = [
    {
      q: `What does ${tool.name} do?`,
      a: tool.desc,
    },
    {
      q: 'Is the free preview real or a demo?',
      a: `Real. ${tool.name} runs the real engine — checks, scoring and parsing rules, not a mocked-up demo${paid ? ', and the full version will simply lift the caps you see on this page' : ''}. No fabricated numbers, no fake screenshots.`,
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
          q: `Can I buy ${tool.name} yet?`,
          a: `Not yet. This page is a working preview — the engine is real, but accounts, schedules, history and alerts are still in build-out and nothing on this hub is purchasable today. Leave your email in the box above and we’ll tell you the day it ships. The nearest Abetworks product you can start on today is ${tool.upsell.name} (${tool.upsell.price}).`,
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
        <Link className="back" href="/">← All hub tools</Link>
        <p className="eyebrow">Abetworks · single-feature tool</p>
        <h1 className="tool-title">
          {tool.name}{' '}
          <span className={`tc-tier ${tool.tier}`}>{tool.tier === 'free' ? 'FREE' : 'PREVIEW'}</span>
        </h1>
        <p className="tool-tagline">{tool.tagline}</p>
        <div className="trust-strip">
          <span>✓ No signup</span>
          <span>✓ Real engines, not a demo</span>
          {paid && <span>✓ Preview — the paid tier is in build-out</span>}
          <span>✓ Nothing uploaded unless you ask</span>
        </div>
      </div>

      <div className="card">
        {capture !== false ? (
          // The capture card carries the result the visitor just produced, so
          // the widget and the card have to share a tree: ToolCapture is that
          // tree, and the card's promise ("one email with your report") is
          // kept by the hub sending it.
          <ToolCapture
            tool={tool.slug}
            toolName={tool.name}
            headline={
              tool.tier === 'free'
                ? 'Want this report, plus one fix tip?'
                : 'Get early access when it ships'
            }
            sub={
              tool.tier === 'free'
                ? 'We’ll email your result and one tip to fix the biggest gap. No newsletter, no spam.'
                : 'We’ll email you when the full version ships. No newsletter, no spam.'
            }
          >
            {children}
          </ToolCapture>
        ) : (
          children
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
          <p>{paid
            ? `The full ${tool.name} is in build-out. Until it ships, ${tool.upsell.name} is the next-best Abetworks tool for this job.`
            : `${tool.upsell.name} is the next step when a single free check is not enough.`}</p>
        </div>
        <a href={tool.upsell.href.startsWith('/') ? `${tool.upsell.href}?src=hub-${tool.slug}` : tool.upsell.href}>
          Try {tool.upsell.name} →
        </a>
      </div>
    </article>
  );
}
