# Local runner (CI/CD on the Mac, never on GitHub)

Dashboard buttons no longer start GitHub Actions. They add a row to the Supabase table
`job_requests`; `local-runner.mjs` on the Mac picks it up, runs the job, and writes back
`done` or `failed`. The pages show that result.

| Button | Job | What runs |
|---|---|---|
| Miami / China "Refresh from Drive" | `reorder` | `automation/sync-from-drive.mjs` |
| Ad Command Center "Refresh daily data" | `engine_all` / `engine_light` | `ENGINE_ALL_CMD` / `ENGINE_LIGHT_CMD` in `~/sp-api` |
| (no button; run by hand) | `supply_chain` | `supply-chain-dashboard` Drive sync, commits `data/supply-chain` |

The Ops page "Pull fresh data" keeps its own queue (`ops_refresh`), already handled on the Mac by `~/sp-api`.

## Install on the Mac (once)

```sh
cd ~/bodyj4you/automation
cp .env.example .env        # fill in the keys
npm install
node local-runner.mjs run reorder        # try one job by hand
cp com.bodyj4you.runner.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.bodyj4you.runner.plist
tail -f /tmp/bodyj4you-runner.log
```

The plist assumes the repo is at `~/bodyj4you`; edit the path if not.
If the Mac is asleep or the runner is stopped, the pages say the Mac is offline and the request
waits; it runs when the Mac is back.

## Run a job by hand

```sh
node local-runner.mjs run reorder
node local-runner.mjs run supply_chain
```

## Netlify settings

Miami and China sites need `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (same values as Ad Command Center).
`GITHUB_TOKEN` is no longer used on any site and can be deleted.
