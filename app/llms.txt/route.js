import { API_TOOLS, TOOLS } from '../../lib/registry.js';

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
  // A tool that answers over HTTP says so, with the path. A tool that runs
  // in the browser says nothing about an API, because it has none — and the
  // index used to claim one for every tool.
  const section = (title, tools) => [
    `## ${title}`,
    '',
    ...tools.map((t) =>
      API_TOOLS.has(t.slug)
        ? `- [${t.name}](${origin}/${t.slug}): ${t.tagline} — API: ${origin}/api/${t.slug}`
        : `- [${t.name}](${origin}/${t.slug}): ${t.tagline} — runs in your browser`,
    ),
    '',
  ];

  const lines = [
    '# Abetworks Hub',
    '',
    `> ${TOOLS.length} single-feature micro-SaaS tools from Abetworks: ${free.length} free forever, ${paid.length} live previews of paid products still in build-out. Real engines, live results, no signup.`,
    '',
    `The hub is at ${origin}. Each tool is one page. ${API_TOOLS.size} of the ${TOOLS.length} also answer over HTTP, and each line below says which; the other ${TOOLS.length - API_TOOLS.size} take a file or a pasted block and run entirely in your browser, so nothing is uploaded. The free five run unlimited with no account; each paid preview shows a real, capped slice of the full product's output.`,
    '',
    ...section('Free forever — no signup, unlimited', free),
    ...section('Previews — planned paid tiers, nothing on this site is purchasable yet', paid),
    '## The rest of the Abetworks suite',
    '',
    'Each product is sold standalone from its own host, with its own pricing page and its own machine-readable index at <host>/llms.txt:',
    '',
    '- Product analytics — https://analytics.abetworks.in/',
    '- Lead operations — https://leadworks.abetworks.in/',
    '- Outbound sequences — https://leadgenius.abetworks.in/',
    '- AI agents — https://abetagent.abetworks.in/',
    '- Omnichannel inbox — https://connect.abetworks.in/',
    '- Workflow automation — https://flow.abetworks.in/',
    '- Platform keys, webhooks and metering — https://api.abetworks.in/',
    '- Browser PDF tools — https://pdf.abetworks.in/',
    '',
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
