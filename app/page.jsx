import { TOOLS } from '../lib/registry';

export function generateMetadata() {
  const title = 'Abetworks Hub — 35 single-feature tools, 5 free forever';
  const description = 'Check your site’s AI visibility, email deliverability, churn risk and more in seconds. Real engines, live results, no signup for the free tools.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const SUITE = [
  { name: 'NuCRM', desc: 'The full sales CRM our tools feed into.', href: 'https://abetworks-website.onrender.com/products/' },
  { name: 'LeadGenius', desc: 'Find, verify and enrich outbound leads on autopilot.', href: 'https://abetworks-website.onrender.com/products/' },
  { name: 'AbetAgent', desc: 'Your cloud AI agent — research, execution, memory.', href: 'https://abetworks-website.onrender.com/products/' },
  { name: 'AbetFlow', desc: 'Automations that wire your whole stack together.', href: 'https://abetworks-website.onrender.com/products/' },
];

const FAQS = [
  { q: 'Who is behind these tools?', a: 'Abetworks — the same team behind NuCRM, LeadGenius, AbetAgent and AbetFlow. Each tool here does one job properly, free or from $9/mo, no onboarding call required.' },
  { q: 'Are the free tools really free?', a: 'The five marked FREE run the same engines as the paid products and stay free forever, with no signup. They exist to earn your trust — the paid tools exist to keep working once you need depth, history and automation.' },
  { q: 'What happens to the data I paste?', a: 'It is used to compute your result and nothing else. CSVs like Churn Peek are scored in your browser and never leave it. Only if you type an email into the optional box do we keep a record, and that is just so we can send your report.' },
  { q: 'Can I use the tools without buying the suite?', a: 'Yes — every tool stands alone at its own subdomain too (e.g. siteread.abetworks.in). Buy one tool, use one tool. The suite is there when you outgrow single checks.' },
];

export default function Home() {
  const free = TOOLS.filter((t) => t.tier === 'free');
  const paid = TOOLS.filter((t) => t.tier === 'paid');
  const card = (t) => (
    <a key={t.slug} className="tool-card" href={`/${t.slug}`}>
      <div className="tc-name">
        {t.name}
        <span className={`tc-tier ${t.tier}`}>{t.tier === 'free' ? 'FREE' : t.price}</span>
      </div>
      <div className="tc-desc">{t.tagline}</div>
      <div className="tc-cta">Open tool →</div>
    </a>
  );
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      }) }} />
      <div className="hero">
        <h1>35 tools that do one thing perfectly</h1>
        <p>
          Single-feature checks for founders, sales and ops teams. Five are free forever —
          the rest give you a live, real-data preview before you pay a rupee. No signup,
          no demos, no fake sample dashboards.
        </p>
        <div className="hero-btns">
          <a className="btn" href="#free">Start with the 5 free tools ↓</a>
          <a className="btn btn-ghost" href="https://abetworks-website.onrender.com/products/">See the full suite</a>
        </div>
        <div className="trust-strip" style={{ justifyContent: 'center', marginTop: 18 }}>
          <span>✓ Real engines, live data</span>
          <span>✓ No signup to try</span>
          <span>✓ Cancel-anytime pricing</span>
          <span>✓ Built by Abetworks</span>
        </div>
      </div>

      <h2 className="section-label" id="free">
        Free tools <span className="pill pill-free">no signup required</span>
      </h2>
      <div className="tool-grid">{free.map(card)}</div>

      <h2 className="section-label" id="paid">
        Premium tools <span className="pill pill-paid">try free, then from $9/mo</span>
      </h2>
      <div className="tool-grid">{paid.map(card)}</div>

      <h2 className="section-label" id="suite">Outgrew a single check?</h2>
      <div className="suite-band">
        {SUITE.map((s) => (
          <a key={s.name} className="suite-card" href={s.href} rel="noopener">
            <strong>{s.name}</strong>
            <span>{s.desc}</span>
            <em>Explore →</em>
          </a>
        ))}
      </div>

      <h2 className="section-label" id="faq">Questions founders ask us</h2>
      <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
        {FAQS.map((f, i) => (
          <details key={i} className="faq" open={i === 0}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </>
  );
}
