# Abetworks Hub

![CI](https://github.com/coding4vinayak/aw-abethub/actions/workflows/ci.yml/badge.svg)


35 single-feature micro-SaaS tools: 5 free lead magnets + 30 paid-preview tools.
One deployable Next.js app; every tool route is independent.

## Run locally

```bash
npm install
npm run lint         # eslint-config-next, zero warnings
npm run build
npm run start        # http://127.0.0.1:3900  (honors $PORT)
npm test             # unit + source guards + a live smoke test (needs the build)
```

## Deploy to Render

1. Push this folder to a GitHub repo.
2. Render → New → Blueprint → pick the repo (reads `render.yaml`).
3. Add domain `hub.abetworks.in` in Render → Settings → Domains, point DNS there.

Leads (email capture) append to `DATA_DIR/leads.json` — the blueprint sets
`DATA_DIR=/data` so the attached disk is what holds them.
View them: `Render → Shell → cat /data/leads.json`.

## Optional AI quality upgrade

Set env `ABET_API_KEY` (and `ABET_API_BASE` if not the default AbetAPI URL).
Tools that compose text (coldopener, coldangle, answerready, emailaudit,
meetingprep) automatically switch from the deterministic engine to AI output.
No key? Everything still works — previews use rule-based results.

## Structure

| Path | Role |
|---|---|
| `lib/registry.js` | **All tool metadata + prices.** Edit prices/copy here. |
| `components/ToolShell.jsx` | Shared page frame: hero, email capture, how-it-works, upsell |
| `app/<slug>/page.jsx` | One route per tool (35 total) |
| `components/tools/*Widget.jsx` | Client logic per tool |
| `tests/*.test.mjs` | Registry/page integrity, SSRF known answers, route guards, live smoke |
| `app/api/<slug>/route.js` | Server engines (DNS, fetch, TLS) — SSRF-guarded via `lib/fetchpage.js` |
| `app/api/lead/route.js` | Email capture → `data/leads.json` |

## Adding a tool

1. Add its entry to `lib/registry.js`.
2. Copy an exemplar: `app/emailhealth/` (server engine) or `app/churnpeek/` (client-only)
   and rename the slug.
3. It appears on the index automatically.
