export function generateMetadata() {
  const title = 'Privacy Policy';
  const description = 'What Abetworks collects, why, and how to get it deleted.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/privacy', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'Abetworks Hub', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const S = { maxWidth: 760, margin: '0 auto' };
const H = { fontSize: 17, margin: '26px 0 8px' };
const P = { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 };

export default function Privacy() {
  return (
    <div className="card" style={S}>
      <h1 className="tool-title" style={{ fontSize: 24 }}>Privacy Policy</h1>
      <p style={P}>Abetworks Hub · last updated September 2026</p>

      <h2 style={H}>What we collect</h2>
      <p style={P}>
        Free tools run without an account. When you optionally type an email into a report box, we store
        that email, the tool name and a timestamp in a private on-server file so we can send the report
        and nothing else. Server logs record normal request metadata (IP, user agent) for security and
        basic traffic counts only.
      </p>

      <h2 style={H}>What we never do</h2>
      <p style={P}>
        No advertising trackers, no cookies beyond what the app needs, no selling or sharing of your
        email or inputs. Data pasted into tools is processed to produce your result and not used to
        train anything. CSV tools like Churn Peek score files in your browser — the file never leaves your machine.
      </p>

      <h2 style={H}>AI processing</h2>
      <p style={P}>
        Some tools can optionally call an AI provider to improve results. When that mode is active, the
        text you chose to analyze is sent to the provider under our configuration; results are clearly
        labelled. Deterministic checks (DNS, HTTP, parsing, arithmetic) never involve third parties.
      </p>

      <h2 style={H}>Email marketing</h2>
      <p style={P}>
        Submitting an email means we will send you the report you asked for, and — if the paid
        version of that tool ever ships — one email the day it does. Nothing else: there is no
        newsletter and no drip, and the consent is recorded on the lead so a later message is
        within what you agreed to. One-click unsubscribe in every message, or just ask us to forget
        you. We honor deletion and opt-out requests within 30 days.
      </p>

      <h2 style={H}>Your rights (GDPR / DPDP)</h2>
      <p style={P}>
        You can request access, correction or deletion of any data tied to your email at
        privacy@abetworks.in. Legal basis for the optional email capture above is consent (Art. 6(1)(a)).
      </p>

      <h2 style={H}>Contact</h2>
      <p style={P}>privacy@abetworks.in · Abetworks, abetworks.in</p>
    </div>
  );
}
