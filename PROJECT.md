---
id: bodyj4you
name: "BodyJ4You sites: Advertising tool, Operations site, older dashboards"
repo: frolovdo/bodyj4you
folder: ~/bodyj4you
sector: advertising
status: active
machines: both
projects: [ads-tool]
apis: [netlify, supabase, amazon-ads, amazon-sp]
keys: [ADS_CLIENT_ID, ADS_CLIENT_SECRET, ADS_REFRESH_TOKEN, ADS_PROFILE_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY, BONY_MAIL_TOKEN, GDRIVE_SA_KEY]
schedules:
  - {job: "Netlify scheduled function daypart-run", when: "hourly at :02", runs: "ad-command-center/netlify/functions/daypart-run.mjs", machine: netlify}
  - {job: ".github/workflows/sync-reorder.yml", when: "manual button only", runs: "reorder sync", machine: github}
  - {job: ".github/workflows/sync-supply-chain.yml", when: "manual button only", runs: "supply chain sync", machine: github}
agent_cli: none
connectors: [supabase]
---
# BodyJ4You sites: Advertising tool, Operations site, older dashboards

## What it is
`ad-command-center/` is the owner's online Amazon ads tool (React + Vite on Netlify, Node functions, Supabase for state); its `ops-src/` holds the Operations site. The Mac engine in `~/sp-api/adsops` and `~/sp-api/ops` feeds both. The other folders are the first-generation dashboards (Miami, China, supply chain, TikTok) and small side projects.

## How to run
- Read `CLAUDE.md` first: all builds and deploys run locally, never on GitHub, and every change is tested locally.
- Checks: `scripts/test-local.sh` (everything) or `scripts/test-local.sh <project>`.
- Advertising tool: `cd ad-command-center && npm install && npm run dev` (build: `npm run build`).
- Reorder pipeline: `cd automation && pip install -r requirements.txt && npm install && node sync-from-drive.mjs`. Supply chain: `cd supply-chain-dashboard && npm ci && npm run sync`.

## Where things are
- `ad-command-center/`: `src/`, `ops-src/`, `netlify/functions/`, `supabase/`, `README.md`, `ROADMAP.md`. Live: bodyj4you-ad-command-center.netlify.app (Advertising) and bodyj4you-ops.netlify.app (Operations).
- `miami-dashboard/`, `china-dashboard/`, `supply-chain-dashboard/`, `tiktok-dashboard/`, `automation/`: older dashboards and their sync.
- `shopify-agentic/`, `telegram-game/`, `bundle_report_tool/`, `ads/`, `_archive/`.
- `ad-command-center/.env` is the vault target `ad-command-center`.

## Do not break
- The Advertising and Operations sites are used daily by the owner; the Mac jobs in `~/sp-api` push data into their Supabase tables.
- Do not add or re-enable GitHub workflows (rule in `CLAUDE.md`). The two existing ones are legacy, started by the Sync buttons of the old Miami and China dashboards.
- `daypart-run` duplicates the Mac job `com.bodyj4you.ads-daypart`; whether it is live on Netlify was not checked.
- Netlify deploys cost credits: preview locally and publish once (memory `netlify-publish-sparingly`).
