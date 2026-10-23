import { API_TOOLS, TOOLS } from '../../lib/registry.js';

// /llms-full.txt — the deep-content file the llmstxt convention sits beside
// llms.txt: the same catalogue, with every tool's full description rather than
// its one-liner, so an engine can pull the whole hub's substance in one
// fetch. Generated from the registry like llms.txt, so it can never drift
// from the catalogue the pages render.
//
// The hub's own AI Visibility Check scores this file (4 points) — so the free
// tool a prospect uses to score their site would have scored the hub itself
// down on the one thing it knows how to fix.
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

  // One block per tool: what it is, what it actually computes, what the full
  // version costs once it is purchasable, and where its nearest product
  // upgrade lives. Everything here comes from the registry.
  const block = (t) => {
    const lines = [
      `## ${t.name}`,
      '',
      `${t.tagline}`,
      '',
      t.desc,
      '',
    ];
    if (API_TOOLS.has(t.slug)) {
      lines.push(`Also over HTTP: ${origin}/api/${t.slug}`);
    } else {
      lines.push('Runs entirely in your browser — a file or a pasted block, nothing uploaded.');
    }
    if (t.tier !== 'free') {
      lines.push(`Planned price (nothing purchasable on this site yet): ${t.price ?? 'see the tool page'}.`);
    }
    if (t.upsell) {
      const home = /^https:/.test(t.upsell.href) ? t.upsell.href : `${origin}${t.upsell.href}`;
      lines.push(`The nearest product you can start on today: ${t.upsell.name} — ${home} (${t.upsell.price}).`);
    }
    lines.push(`Try it: ${origin}/${t.slug}`, '');
    return lines;
  };

  const lines = [
    '# Abetworks Hub',
    '',
    `> ${TOOLS.length} single-feature micro-SaaS tools from Abetworks: ${free.length} free forever, ${paid.length} live previews of paid products still in build-out. Real engines, live results, no signup.`,
    '',
    `This is the full-content companion to ${origin}/llms.txt (the one-line index). ${API_TOOLS.size} of the ${TOOLS.length} tools also answer over HTTP; the rest take a file or a pasted block and run entirely in your browser, so nothing is uploaded.`,
    '',
    '## Free forever — no signup, unlimited',
    '',
    ...free.flatMap(block),
    '## Previews — planned paid tiers, nothing on this site is purchasable yet',
    '',
    ...paid.flatMap(block),
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
