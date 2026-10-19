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

Links that should stay on the hub use `HUB_URL` (default
`https://hub.abetworks.in`); metadata/canonical tags use `SITE_URL` (default:
`HUB_URL`). Both are `sync: false` in `render.yaml` — a different origin is an
env change, never a code change.

The Render health check is `/api/health`: it writes and removes a probe file in
`DATA_DIR`, so a deploy whose disk is full, read-only, or unattached never takes
traffic (503 while the probe fails).

Leads (email capture) append to `DATA_DIR/leads.json` — the blueprint sets
`DATA_DIR=/data` so the attached disk is what holds them.

Read them without a shell: `GET /api/leads` answers JSON, `?format=csv` the
ESP-ready export (Bearer header or `?token=`). Set `LEADS_TOKEN` to enable it —
until then the route is an honest 503. Get pinged instead: set
`LEAD_NOTIFY_URL` and every captured lead is POSTed there as JSON
(`{ email, tool, at }`), after the visitor's response, never in its way.
Both vars are `sync: false` in `render.yaml` — the dashboard prompts for them.

## Optional AI quality upgrade

Set env `ABET_API_KEY` (and `ABET_API_BASE`/`ABET_MODEL` if not the default
AbetAPI URL/model). Tools that compose text (coldopener, coldangle, answerready,
emailaudit, meetingprep) automatically switch from the deterministic engine to
AI output. Prefer your own provider? Leave `ABET_API_KEY` blank and set
`OPENAI_API_KEY` (plus optional `OPENAI_BASE_URL`/`OPENAI_MODEL`) to use any
OpenAI-compatible endpoint instead. No key? Everything still works — previews
use rule-based results. Every one of these is `sync: false` in `render.yaml`.

## Structure

| Path | Role |
|---|---|
| `lib/registry.js` | **All tool metadata + prices.** Edit prices/copy here. |
| `components/ToolShell.jsx` | Shared page frame: hero, email capture, how-it-works, upsell |
| `app/<slug>/page.jsx` | One route per tool (35 total) |
| `components/tools/*Widget.jsx` | Client logic per tool |
| `tests/*.test.mjs` | Registry/page integrity, SSRF known answers, route guards, live smoke |
| `app/api/<slug>/route.js` | Server engines (DNS, fetch, TLS) — SSRF-guarded via `lib/fetchpage.js` |
| `lib/leads.js` | Lead store: JSONL append/read, CSV export, token check, notify webhook |
| `app/api/lead/route.js` | Email capture → `data/leads.json` (+ after-response notify) |
| `app/api/leads/route.js` | Owner-only read/export of captured leads (LEADS_TOKEN-gated) |

## Adding a tool

1. Add its entry to `lib/registry.js`.
2. Copy an exemplar: `app/emailhealth/` (server engine) or `app/churnpeek/` (client-only)
   and rename the slug.
3. It appears on the index automatically.
