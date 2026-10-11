import { headers } from 'next/headers';

export default async function robots() {
  const h = await headers();
  const origin = h.get('origin') || `https://${h.get('host')}`;
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
