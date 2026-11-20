# BodyJ4You sites: Advertising tool, Operations site, older dashboards: guide for any AI agent

The web front ends of BodyJ4You: the Advertising tool (`ad-command-center`), the Operations site source, and the older reorder and CEO dashboards.

## Read first
1. `PROJECT.md` here: status, how to run, schedules, keys (names only).
2. Project guide: read `CLAUDE.md` in this folder; it applies to every agent.
3. Workspace rules: `~/.claude/CLAUDE.md` (same text in `~/claude-config/CLAUDE.md`). Valid for every agent.
4. Knowledge base: `~/claude-config/memory/MEMORY.md` is the index. Open the entries that match the task.
5. Earlier work: `python3 ~/claude-config/journal.py recent ads-tool 5`

## Rules that always apply
- Pull before work. If your agent is not Claude Code (no sync hooks): run `python3 ~/claude-config/sync_all.py pull` at the start and `python3 ~/claude-config/sync_all.py push` at the end.
- Secrets: never print, log or commit a value. Names are in `PROJECT.md`; check with `python3 ~/sp-api/tools/vault.py status`.
- Before any live write (listings, prices, inventory, ads, sites): save before and after values to `changes/YYYY-MM-DD-<what>.csv` and say where it is.
- Schedules in `PROJECT.md` are live. Do not rename, move or change the arguments of files they call without the owner's OK.
- Mac: `./tool.py`. PC: `python tool.py`. Write paths as `~/...`, never as a machine-specific home folder.
- If your agent is not Claude Code: before ending, write a session record (layout in `~/command-center/docs/ARCHITECTURE.md`, section 3).

## Project notes
- A second clone exists at `~/Projects/bodyj4you-repo`. Work in `~/bodyj4you` only.
- Design rules shared by all tools: `~/bodyj4you-os/DESIGN.md` (memory `os-one-design-system`).
- Memory entries: `action-center`, `ads-approval-queue-system`, `ads-tool-writing-rules`, `ops-page-pull`.
