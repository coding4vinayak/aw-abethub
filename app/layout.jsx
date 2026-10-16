import Link from 'next/link';
import './globals.css';

const HUB = process.env.HUB_URL || 'https://hub.abetworks.in';

export const metadata = {
  metadataBase: new URL(process.env.SITE_URL || HUB),
  title: {
    default: 'Abetworks Hub — single-feature tools that do one thing perfectly',
    template: '%s · Abetworks Hub',
  },
  description:
    'Free and premium micro-SaaS tools from Abetworks. Paste, upload, get an answer — no signup for previews.',
  openGraph: {
    siteName: 'Abetworks Hub',
    type: 'website',
    title: 'Abetworks Hub — single-feature tools that do one thing perfectly',
    description: 'Five free forever tools and thirty premium micro-SaaS apps. Real results in your browser, before you pay.',
    images: ['/og.png'],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export const viewport = { themeColor: '#4f46e5' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="top-accent" aria-hidden="true" />
        <header className="site-header">
          <div className="wrap header-row">
            <Link className="logo" href="/">
              <span className="logo-mark">A</span>
              Abetworks <em>Hub</em>
            </Link>
            <nav className="header-nav">
              <Link href="/#free">Free tools</Link>
              <Link href="/#paid">Premium tools</Link>
              <a className="header-cta" href="https://abetworks-website.onrender.com/" target="_blank" rel="noopener">
                Full suite →
              </a>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <div className="footer-brand">Abetworks <em>Hub</em></div>
            <p className="footer-line">
              Part of the Abetworks AI business suite — NuCRM, LeadGenius, AbetAgent, AbetFlow and more.
            </p>
            <div className="footer-row">
              <span>© 2026 Abetworks. Built for teams that sell, serve and scale.</span>
              <span className="footer-links">
                <a href="https://abetworks.in/">abetworks.in</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
