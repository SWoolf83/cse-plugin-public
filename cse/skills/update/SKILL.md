---
name: update
description: "Update the cse plugin to the version its marketplace offers, then verify the install actually matches the source."
when_to_use: "The status line shows a yellow '◆ CSE x → y · /cse:update'; or after changing cse/ source and wanting the installed copy refreshed; or when a skill you know exists is not invocable."
allowed-tools: Bash(claude plugin *), Bash(node scripts/check-plugin-drift.mjs*), Bash(npm run build:cse-plugin*), Read
---

# /cse:update — refresh the installed cse plugin

The status line renders `◆ CSE <version>` on every message. When the installed
version falls behind the marketplace it turns yellow and points here.

## Run it

```bash
claude plugin update cse@cascade-hq
```

Then **verify**, because the update reporting success is not the same as the
install matching the source:

```bash
node scripts/check-plugin-drift.mjs
```

Expect four green checks: descriptions within cap, skill registry in sync,
vendored artifacts fresh, plugin in sync.

**Tell the user to restart** — skills, MCP tools and hooks load at session start,
so nothing new is invocable until then. Per the repo's handoff rule, OFFER TO
WRITE A HANDOFF FIRST via `cascade_handoff` (write): a restart wipes the working
agent's context, and without one the next session resumes blind.

## The trap: `update` compares VERSIONS, not content

`claude plugin update` will report *"already at the latest version"* while the
drift guard correctly reports skills missing from the install. That is not a
contradiction — the installed manifest and the source manifest carry the same
version number while the source has moved on. This is the normal state after
editing `cse/` in the repo, because for a `directory` marketplace the source IS
the repo.

**Fix:** bump `cse/.claude-plugin/plugin.json`, re-vendor, then update.

```bash
# 1. bump "version" in cse/.claude-plugin/plugin.json
npm run build:cse-plugin      # re-vendor MCP + hooks + skill registry
node scripts/check-plugin-drift.mjs
claude plugin update cse@cascade-hq
```

Skipping the re-vendor leaves `mcp/cascade-api/skill-registry.json` stale, so the
MCP server's skill list disagrees with the skills on disk — the drift guard
catches this, which is why it runs before the update rather than after.

## If drift still fails

- **descriptions over the 140-char cap** — skill descriptions are loaded into
  context on EVERY session whether or not the skill is used, so the cap is a real
  per-session cost. Trim to a trigger-first one-liner and move nuance to
  `when_to_use:`.
- **vendored artifacts stale** — `npm run build:cse-plugin`.
- **missing in install** — the version was not bumped. See above.

## Honest limit

For a `directory` marketplace the update is a local copy, so "latest" means
whatever is in the repo right now — including uncommitted work. For a `github`
marketplace it means the last published release, which is what `/cse:release`
produces.
