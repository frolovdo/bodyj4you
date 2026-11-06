# CLAUDE.md

Project rules for every machine and every Claude session working in this repo.

## CI/CD runs locally — never on GitHub

All builds, tests, syncs, data pipelines and deploys run on a local machine (or in the
Claude session's own sandbox). Never run them on GitHub.

- Do not add or re-enable anything under `.github/workflows/`. No GitHub Actions, no
  scheduled/cron, push or PR triggers.
- Do not add code that starts a GitHub Actions run (`/actions/workflows/.../dispatches`).
- Do not use `mcp__github__actions_run_trigger` or any other way to start a workflow run.
- Before pushing, run the project's checks locally and report the result.
- To run a pipeline, run its script directly, e.g.:
  - Reorder pipeline: `cd automation && pip install -r requirements.txt && npm install && node sync-from-drive.mjs`
    (needs `GDRIVE_SA_KEY`, `IN_FOLDER`, `OUT_MIAMI`, `OUT_CHINA` in the environment)
  - Supply chain sync: `cd supply-chain-dashboard && npm ci && npm run sync` (reads `.env`)
- Deploys: deploy from a local machine (e.g. Netlify CLI), not from a GitHub workflow.

### Legacy, still on GitHub (to migrate, do not extend)

These predate the rule. Leave them working until each one has a local replacement,
then remove them:

- `.github/workflows/sync-reorder.yml` — started by the Sync buttons in
  `miami-dashboard/netlify/functions/trigger-sync.mjs` and
  `china-dashboard/netlify/functions/trigger-sync.mjs`
- `.github/workflows/sync-supply-chain.yml`
- `ad-command-center/netlify/functions/refresh.mjs` and `ops-dispatch.mjs` — dispatch
  GitHub workflows for daily refresh / ops refresh
