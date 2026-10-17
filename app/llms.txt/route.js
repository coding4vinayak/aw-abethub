import { TOOLS } from '../../lib/registry.js';

// /llms.txt — the hub's card for AI crawlers (llmstxt.org convention): what
// this site is, every tool with its one-liner, and the honest state of the
// paid tiers. Generated from the registry rather than kept as a static file,
// so it can never drift from the catalogue the pages render.
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let origin = 'https://hub.abetworks.in';
  try {
    origin = new URL(req.url).origin;
  } catch {
    // keep the canonical fallback
  }

  const free = TOOLS.filter((t) => t.tier === 'free');
  const paid = TOOLS.filter((t) => t.tier !== 'free');
  const section = (title, tools) => [
    `## ${title}`,
    '',
    ...tools.map((t) => `- [${t.name}](${origin}/${t.slug}): ${t.tagline}`),
    '',
  ];

  const lines = [
    '# Abetworks Hub',
    '',
    `> ${TOOLS.length} single-feature micro-SaaS tools from Abetworks: ${free.length} free forever, ${paid.length} live previews of paid products still in build-out. Real engines, live results, no signup.`,
    '',
    `The hub is at ${origin}. Each tool is one page and one API route. The free five run unlimited with no account; each paid preview shows a real, capped slice of the full product's output. The rest of the Abetworks suite (sales CRM, outbound, product analytics, agents, automation) lives at https://abetworks.in.`,
    '',
    ...section('Free forever — no signup, unlimited', free),
    ...section('Previews — planned paid tiers, nothing on this site is purchasable yet', paid),
    '## Notes',
    '',
    '- Every price on the hub is the planned catalogue; no purchase is possible on this site today.',
    '- Each tool page states what it actually computes, and what its full version will add; FAQ answers are grounded in the real engine.',
    `- Machine-readable index of every page: ${origin}/sitemap.xml`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
