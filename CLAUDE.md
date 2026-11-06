# CLAUDE.md

Project rules for every machine and every Claude session working in this repo.

## CI/CD runs locally — never on GitHub

All builds, tests, syncs, data pipelines and deploys run on a local machine (or in the
Claude session's own sandbox). Never run them on GitHub.

- Do not add or re-enable anything under `.github/workflows/`. No GitHub Actions, no
  scheduled/cron, push or PR triggers.
- Do not add code that starts a GitHub Actions run (`/actions/workflows/.../dispatches`).
- Do not use `mcp__github__actions_run_trigger` or any other way to start a workflow run.
- To run a pipeline by hand: `node automation/local-runner.mjs run reorder` or `... run supply_chain`
  (settings in `automation/.env`).
- Deploys: deploy from a local machine (e.g. Netlify CLI), not from a GitHub workflow.

### How buttons run jobs

Dashboard buttons add a row to Supabase `job_requests`; `automation/local-runner.mjs` on the Mac
runs it. See `automation/LOCAL_RUNNER.md`. Add new jobs there, not as GitHub workflows.
The Ops page uses its own `ops_refresh` queue, run on the Mac by `~/sp-api`.

## Test all code locally

Every change is tested on the machine making it, before it is committed or pushed. Never push
untested code, and never rely on GitHub or Netlify to find failures.

- Run `scripts/test-local.sh` (everything) or `scripts/test-local.sh <project>` (e.g. `miami-dashboard`).
  It checks JavaScript and Python syntax, runs the Python tests and builds every dashboard.
- New code gets a test or at least a check in `scripts/test-local.sh`.
- For a change to how something behaves, also run it for real (dev server, the script itself,
  or `node automation/local-runner.mjs run <job>`) and look at the result.
- Say what was run and whether it passed. If a check fails, fix it or say plainly that it fails and why.
  Do not skip, disable or delete a test to make it pass.
- Optional, once per machine: `git config core.hooksPath .githooks` runs the checks before every push.
