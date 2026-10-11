import { headers } from 'next/headers';
import { TOOLS } from '../lib/registry';

export default async function sitemap() {
  const h = await headers();
  const origin = h.get('origin') || `https://${h.get('host')}`;
  const now = new Date();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...TOOLS.map((t) => ({
      url: `${origin}/${t.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: t.tier === 'free' ? 0.9 : 0.8,
    })),
  ];
}
