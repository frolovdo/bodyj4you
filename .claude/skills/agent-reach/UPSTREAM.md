# Provenance

Vendored from [Panniantong/agent-reach](https://github.com/Panniantong/agent-reach) (MIT).

- Upstream version: 1.5.0
- Upstream commit: da5044d (2026-09-01)
- Source path: `agent_reach/skill/` — `SKILL_en.md` copied here as `SKILL.md`, `references/` verbatim.

## This skill needs the CLI to be useful

`SKILL.md` is a **router**. It tells the agent which command to run per platform;
it does not contain the tools. Without them the skill will name commands that
are not on the machine. On each machine that should use it:

```bash
pipx install "git+https://github.com/Panniantong/agent-reach"
agent-reach doctor            # shows which platforms are live
```

Do **not** `pip install agent-reach` from PyPI — that name belongs to an
unrelated project (jgalea/agent-reach 0.1.0), as upstream's README also warns.

`agent-reach install --system --channels ...` is what actually installs the
upstream tools (OpenCLI, twitter-cli, bili-cli, rdt-cli, yt-dlp, mcporter, gh).
Without `--system` it only reports what is missing.

## Updating

Re-copy from a fresh clone of upstream and bump the version/commit above.
