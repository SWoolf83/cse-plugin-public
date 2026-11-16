---
name: studio-check
description: Use when you want to test Creator Studio in the installed Cascade Desktop app with computer use and file findings for breaks.
when_to_use: "Attended, on-demand self-test of the installed Cascade Desktop app. Drives Creator Studio (and its production assistant rail) with the harness computer-use MCP through code-defined scenarios in scenarios.mjs, judges each step from the screen at a named location, stores a step-by-step receipt artifact, files ONE deduplicated finding per new failure and archives findings whose step passes again. Tiers: smoke (every free surface + a throwaway production create/rename/archive) and rail (the rail assistant reads the production title back, reversed). It tests the APP — it never changes real productions, never triggers paid generation, never signs out, and never fixes anything itself. Triggers on 'studio check', 'test the studio', 'smoke test Cascade Desktop', '/cse:studio-check rail'."
argument-hint: "[smoke|rail]"
allowed-tools: Bash(node *), Bash(defaults read *), Bash(pgrep *), Bash(mktemp *), Read, Write, mcp__computer-use__request_access, mcp__computer-use__list_granted_applications, mcp__computer-use__screenshot, mcp__computer-use__zoom, mcp__computer-use__open_application, mcp__computer-use__left_click, mcp__computer-use__triple_click, mcp__computer-use__scroll, mcp__computer-use__type, mcp__computer-use__key, mcp__computer-use__wait, mcp__cascade-api__cascade_log_finding, mcp__cascade-api__cascade_list_packages, mcp__cascade-api__cascade_archive_package, mcp__cascade-api__cascade_create_artifact, mcp__plugin_cse_cascade-api__cascade_log_finding, mcp__plugin_cse_cascade-api__cascade_list_packages, mcp__plugin_cse_cascade-api__cascade_archive_package, mcp__plugin_cse_cascade-api__cascade_create_artifact
---

# /cse:studio-check — test Creator Studio in the installed app

Run one tier of code-defined scenarios against the **installed Cascade Desktop app**
with the harness computer-use MCP, judge every step from the screen, store a receipt,
and turn new failures into deduplicated Cascade findings.

`SC` below is the skill directory: `${CLAUDE_PLUGIN_ROOT}/skills/studio-check`
(repo checkout: `cse/skills/studio-check`). Every node command runs a plain `.mjs`
file there with bare `node` — no build step.

## Hard rules (every step, every tier)

- **Only Cascade Desktop.** Request access only for the apps `scenarios.mjs` prints
  in `allowedApps`. Touch nothing else.
- **Free actions only.** Never click a control for paid generation: generate
  image / video / audio / voice / music, render with AI, upscale, Topaz, Sora, Veo,
  ElevenLabs. If the screen only offers such a control, the step fails — do not click it.
- **Never sign out or log out.** The test login is Steve's real account.
- **Only the throwaway production.** Never open, edit or archive any production
  other than the `Harness test <nonce>` one this run created.
- **Type only the step's `typedText`**, press only its `keys`. Clicks otherwise.
- **No fixing.** This run reports. It never edits code, settings or productions to
  make a step pass.

## 1. Flag check (fail closed)

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/studio-check/flag.mjs"
```

Non-zero exit: print the line it printed (it names `CASCADE_RUNBOOKS_ENABLED=1` as
the way to enable it) and **stop**. No access request, no screenshot.

## 2. Record the app build

```bash
defaults read "/Applications/Cascade Desktop.app/Contents/Info" CFBundleShortVersionString
defaults read "/Applications/Cascade Desktop.app/Contents/Info" CFBundleVersion
```

`appBuild` = `"<short version> (<build>)"`, e.g. `0.1.25 (6694)`. If the app is not
installed, say so in one line and stop.

## 3. Preflight — stop plainly, never retry in a loop

```bash
pgrep -x "Cascade Menu Bar" >/dev/null && echo running || echo missing
```

- `missing` → stop: *"Cascade Menu Bar is not running — open it, then run
  /cse:studio-check again."*
- Computer use must be free. If `request_access` (step 5) or
  `list_granted_applications` errors because another session holds computer use,
  stop: *"Computer use is busy in another session — run this again when it is free."*
  Do not poll or retry.

## 4. Build the scenario

Tier = the argument (`smoke` default, or `rail`).

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/studio-check/scenarios.mjs" smoke
```

It prints `{tier, nonce, title, allowedApps, steps}` and has already validated every
step against the paid-generation / sign-out denylist and the named-location rule
(exit 3 on a bad scenario — stop and report it). Keep the JSON: `nonce` and `title`
identify the throwaway production for this run only.

## 5. request_access — exactly `allowedApps`

Call `mcp__computer-use__request_access` with exactly the printed `allowedApps`
(`["Cascade Desktop"]`) and a reason naming the tier. Then
`open_application("Cascade Desktop")` and take a screenshot. There is no address bar
or command palette: navigate only by clicking the left nav.

## 6. Run each step

For each step, in order, unless a previous step left the app somewhere the step
cannot start from (then mark it `skipped` with the reason in `seen`):

1. Do the `instruction`: clicks; type `typedText` verbatim when present; press
   `keys` when present. Nothing else.
2. `wait` briefly if the screen is still loading, then `screenshot`.
3. Look **only at the step's `location`** (e.g. `production header`,
   `rail assistant reply`, `main panel`). Use `zoom` for small text. Never judge
   from text you typed yourself — the rail question you typed proves nothing.
4. Record `{id, instruction, expectation, location, status, seen, at}` where `seen`
   is the **exact text you read** at that location (or a precise description of what
   is there, e.g. "error screen: Something went wrong"). `status` is `pass` only when
   the expectation is plainly met; anything unclear is `fail`.

**Rail tier:** after `ask-title-backwards`, wait for the reply to finish streaming
before judging. Pass only if the reversed nonce from the scenario JSON appears in
the assistant's reply.

**Cleanup always runs.** Steps with `cleanup: true` (archiving the throwaway
production) run even after earlier failures. If the production was never created,
mark the archive step `skipped`. For the **rail** tier, also archive its
`Harness test <nonce>` Showrunner document if a UI control or a Cascade MCP tool
allows it; if neither does, name it in the report as the one permitted leftover.

Write the results with `Write` to a temp file (`mktemp -d` for the folder):

```json
{ "tier": "smoke", "nonce": "…", "appBuild": "0.1.25 (6694)",
  "startedAt": "<iso>", "finishedAt": "<iso>",
  "steps": [ { "id": "…", "instruction": "…", "expectation": "…",
               "location": "…", "status": "pass", "seen": "…", "at": "<iso>" } ] }
```

## 7. Store the receipt

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/studio-check/report.mjs" receipt "$RUN_DIR/results.json"
```

Call `cascade_create_artifact` with `title` = the receipt's `runLabel`,
`renderer: "text"`, `tags: ["studio-check", "runbook_receipt"]`, and `content` = the
printed receipt JSON. Keep the returned artifact id. (v1 receipts are text frames:
what was seen at each location. Screenshots are not saved.) If the call fails,
report the local results path instead — never lose the run.

## 8. Findings — file new, skip duplicates, archive resolved

1. `cascade_list_packages {status: "draft", limit: 100}`. Keep entries whose title
   starts with `Studio check [` and write them as `[{id, title}]` to
   `$RUN_DIR/open.json`. (Only the newest 100 draft packages are searched — say so in
   the report.)
2. ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/studio-check/report.mjs" plan "$RUN_DIR/results.json" "$RUN_DIR/open.json"
   ```
3. For each `file` entry: `cascade_log_finding` with its `title`, `description`,
   `detail`, `topic_slug: "studio-check"`, `importance: "normal"`,
   `no_ladder_target: true`.
4. `skip` entries: already filed — do nothing.
5. For each `archive` id: `cascade_archive_package {package_id, action: "archive",
   reason: "studio-check step passed again"}`.

Findings come only from real step failures. A run stopped by the preflight files
nothing.

## 9. Report

Lead with the verdict, then a table:

| step | location | result | seen |
|---|---|---|---|

Then: app build, tier, receipt artifact id, findings filed / skipped as duplicates /
archived (with ids), the 100-row search cap, and any leftover (the rail tier's
Showrunner document, if it could not be archived).
