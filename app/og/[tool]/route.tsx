import { ImageResponse } from "next/og";
import { getTool } from "../../../lib/registry.js";

// The card a person sees when a hub link lands in WhatsApp, Slack, LinkedIn or
// email — before the click.
//
// One static image used to serve all thirty-five tool pages, so a share of
// "AI Visibility Check" showed a card that said "35 tools that do one thing
// perfectly" and not the name of the tool. This is generated per tool instead:
// the tool's own name, its own tagline, and — for the paid previews — the
// honest state of the tier, because a card that implied a paid tool was
// available today would be a lie in the one place a stranger is looking.
//
// The card is generated (no binary asset), so it is the right size for every
// platform that crops, and it costs nothing to keep true.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(_request: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params;
  const tool = getTool(slug);
  if (!tool) return new Response("Not found", { status: 404 });

  const free = tool.tier === "free";
  const tier = free ? "Free forever · no signup" : "Preview — the paid tier is in build-out";
  const url = `hub.abetworks.in/${tool.slug}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0b1220 0%, #1e293b 55%, #312e81 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "#4f46e5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
            }}
          >
            A
          </div>
          <div style={{ fontSize: 32 }}>Abetworks Hub</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 82, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{tool.name}</div>
          <div style={{ fontSize: 36, color: "#c7d2fe" }}>{tool.tagline}</div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 28,
            color: "#94a3b8",
          }}
        >
          <div>{url}</div>
          <div>{tier}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
