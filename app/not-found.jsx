import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <p className="eyebrow">404</p>
      <h1 className="tool-title" style={{ fontSize: 26 }}>That tool doesn’t exist (yet)</h1>
      <p className="tool-tagline">
        Every Abetworks single-feature tool is listed on the hub — thirty-five of them, five free forever.
      </p>
      <p style={{ marginTop: 18 }}>
        <Link className="btn" href="/">← Back to all tools</Link>
      </p>
    </div>
  );
}
