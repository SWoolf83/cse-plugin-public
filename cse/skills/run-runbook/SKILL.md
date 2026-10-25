---
name: run-runbook
description: Use when you want to run a vetted computer-use Runbook by slug — attended, on the Max Plan (e.g. /cse:run-runbook open-app).
when_to_use: Runbooks — the attended, Max-Plan computer-use EXECUTION lane (Track A). Given a Runbook slug + typed params, validates them against the in-code allowlist (runbooks.ts), checks the CASCADE_RUNBOOKS_ENABLED feature flag, requests computer-use access ONLY for the Runbook's declared allowedApps, drives the Runbook goal via the harness computer-use MCP taking a screenshot after each meaningful step, and assembles a filmstrip receipt (receipt.ts). Everything is attended and rides the Max Plan — the executor here is the interactive session, not a daemon. Unattended/remote runs go through Track B (api-loop.ts), not this skill. Triggers on "run runbook", "/cse:run-runbook <slug>", "open-app runbook", "type-into-notes runbook".
argument-hint: "<slug> [--param key=value ...]   (slugs: open-app {appName}, type-into-notes {text})"
allowed-tools: Bash(node *), Read, mcp__computer-use__request_access, mcp__computer-use__screenshot, mcp__computer-use__open_application, mcp__computer-use__left_click, mcp__computer-use__type, mcp__computer-use__key, mcp__computer-use__wait, mcp__computer-use__list_granted_applications
---

# /cse:run-runbook — Track A (attended, Max Plan)

Run a **vetted, allowlisted Runbook** by slug against the machine you're sitting at,
using the **harness computer-use MCP** (`mcp__computer-use__*`). This is the primary,
on-site path: attended, single-session, and it rides the **Max Plan** — no API key,
no billing.

> **Security boundary (non-negotiable):** a trigger names only a Runbook **slug** +
> typed **params**. The Runbook's goal, guardrails, **allowed apps**, and success
> criteria live in `runbooks.ts` (code) — never in the trigger. `request_access` and
> app scoping use ONLY the Runbook's declared `allowedApps`. Fail closed on any
> unknown slug or invalid params.

The relationship to Remote Mission Control (RMC): RMC is the **control/safety plane**
around this actuation — kill switch (the brake), keep-awake (the precondition: the
screen must be awake for computer-use), and approvals (the human gate). This skill is
the **actuation plane**. RMC is not deprecated.

## The recipe

Run these steps in order. Stop the moment any gate fails — do not partially actuate.

### 1. Parse the invocation

Parse `<slug>` and any `--param key=value` pairs from the arguments into a raw
params object. Do not infer or add params the user didn't give.

### 2. CHECK THE FEATURE FLAG (fail closed — do this BEFORE anything else)

```bash
node -e "const {isRunbookLaneEnabled}=require('${CLAUDE_PLUGIN_ROOT}/skills/run-runbook/feature-flags'); process.exit(isRunbookLaneEnabled()?0:1)"
```

If this exits non-zero, the lane is **disabled**. Report: *"Runbook lane is disabled
(CASCADE_RUNBOOKS_ENABLED is not set). No access requested, nothing actuated."* and
**STOP**. Do not call `request_access`, do not screenshot, do not type.

### 3. Validate slug + params against the in-code allowlist (fail closed)

Resolve the invocation via `invocation.ts` — this rejects unknown slugs and
out-of-schema params, and pulls goal/guardrails/**allowedApps**/successCriteria from
code:

```bash
node -e '
const {resolveInvocation}=require("'"$CLAUDE_PLUGIN_ROOT"'/skills/run-runbook/invocation");
const raw = JSON.parse(process.argv[1]);      // {slug, params}
const r = resolveInvocation(raw.slug, raw.params, "cli", "max_mcp");
if (!r.ok) { console.error("REJECTED: " + r.error); process.exit(1); }
console.log(JSON.stringify(r.invocation, null, 2));
' "$RAW_JSON"
```

If it prints `REJECTED: …`, report the reason and **STOP**. Otherwise you now have a
validated invocation whose `allowedApps`, `goal`, `guardrails`, and `successCriteria`
came from code.

### 4. request_access — ONLY the Runbook's allowedApps

Call `mcp__computer-use__request_access` with **exactly** the invocation's
`allowedApps` (e.g. `["Finder"]` for `open-app`, `["Notes"]` for `type-into-notes`)
and a `reason` derived from the Runbook's `goal`. Never request an app the Runbook
did not declare. The user approves each app explicitly.

### 5. Drive the goal via the harness computer-use MCP, screenshotting each step

Work toward the invocation's `goal`, honoring every entry in `guardrails`:

- Take a `mcp__computer-use__screenshot` **after each meaningful step** (open, click,
  type, key) — these frames become the filmstrip.
- Use `open_application`, `left_click`, `type`, `key`, `wait` as needed — but only
  ever act on apps in `allowedApps`.
- After each screenshot, verify you're on track toward the `successCriteria`; if a
  guardrail would be violated, stop.

Remember the tier rules from the computer-use MCP: browsers are read-only and
terminals/IDEs are click-only — the proof Runbooks (`Finder`, `Notes`) are full-tier.

### 6. Assemble + persist the filmstrip receipt

Collect the ordered frames and per-step outcomes and hand them to `receipt.ts`
(`assembleReceipt` + `persistReceipt`) — persisting a Cascade artifact when online,
or a local JSON file offline. Report the receipt location and whether the
`successCriteria` were met.

## Scope

- **Attended, Max Plan, single session.** The harness computer-use MCP is
  single-session-exclusive and per-session-consent (verified empirically). Unattended
  runs are NOT this skill — they go through Track B (`api-loop.ts`, off by default).
- **Two proof Runbooks only** (`open-app`, `type-into-notes`). Grow the library once
  both tracks are proven.
- Free-form / goal-from-the-trigger execution is **not** allowed — a trigger may only
  name an allowlisted slug + validated params.
