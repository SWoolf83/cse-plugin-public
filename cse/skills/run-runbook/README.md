# run-runbook — the computer-use execution lane

A computer-use **execution substrate** for Cascade, in two tracks that share ONE
Runbook allowlist and ONE invocation contract. It adds the **actuation plane** on top
of Remote Mission Control's control/safety plane.

## The instructions-as-data boundary (non-negotiable)

A **trigger** names only a Runbook **`slug`** + typed **`params`**. A Runbook's goal,
guardrails, **allowed apps**, and success criteria live in **code** (`runbooks.ts`) —
never in a trigger. Everything fails closed:

- unknown slug ⇒ rejected before any actuation;
- params outside the Runbook's declared `paramSchema` ⇒ rejected;
- `request_access` (Track A) and app scoping (Track B) use ONLY the Runbook's
  declared `allowedApps`.

This is what makes a phone/PWA/daemon trigger safe to admit later: the transport can
only ever ask for a vetted slug, never for arbitrary steps or apps.

## The two tracks (empirical permission finding — decision 0f479b6b)

There are **two** ways to do computer use, with **opposite** permission models. We
verified this empirically on 2026-07-03 (`list_granted_applications` refused —
"in use by another Claude session").

| | **Track A — harness computer-use MCP** | **Track B — Computer Use API loop** |
|---|---|---|
| Module | `SKILL.md` (`/cse:run-runbook`) | `api-loop.ts` |
| Engine | `mcp__computer-use__*` in the interactive session | own loop → Anthropic Messages API |
| Permission | per-session `request_access` dialog; **single-session-exclusive** | OS-level macOS TCC only (Accessibility + Screen Recording), **durable for a signed app** |
| Human gate | attended, per-session consent | **none built in** — client-side tool, API returns actions we execute |
| Metering | **Max Plan** (no API key) | **API usage** (billed) |
| Attended? | yes (on-site, primary) | can run unattended / remote |
| Default | on when the lane flag is on | **OFF by default** |

- **Track A is the primary, on-site path** and MUST work on the Max Plan. Its executor
  is the **interactive Max session**, not a daemon — the `SKILL.md` recipe is what that
  session follows.
- **Track B is built now, used someday.** It exists so we have the remote/unattended
  capability, but it is gated OFF and API-billed. A full live run needs an
  `ANTHROPIC_API_KEY`, an on-Mac host, and (for durable TCC) a signed app — so it is
  built + unit-tested against a **mocked** Anthropic client now, and verified live
  later. This is the Perplexity-Computer path (Perplexity uses the API, not their own
  model).

The pinned Track-B contract: tool type `computer_20251124`, beta header
`computer-use-2025-11-24`, model `claude-opus-4-8`.

## How RMC relates (it is NOT deprecated)

Remote Mission Control is the **control/safety plane** around this actuation:

- **kill switch = the brake** — flip it and running work stops;
- **keep-awake = the precondition** — the screen must be awake for computer-use to
  see and act;
- **approvals = the human gate**.

This lane is the **actuation plane**. RMC ships only coarse verbs (kill / keep-awake /
approve); this lane adds the fine-grained, allowlisted execution.

## Feature flag (the kill switch)

The exact cse-plugin flag mechanism was not pre-specified, so we chose the **env-var,
fail-closed** pattern the repo already uses for daemon-side guards
(`GITHUB_SYNC_ENABLED`, and the retired `CASCADE_DAEMON_MODE` /
`CLOUD_EXECUTION_ENABLED`). A DB-backed org flag (like `scheduled_execution_enabled`)
isn't reachable from inside the plugin skills, so the env-var flag is the in-plugin
analog. All flags count as enabled ONLY for `"1"` / `"true"`:

| Flag | Gates | Notes |
|---|---|---|
| `CASCADE_RUNBOOKS_ENABLED` | **both tracks** | Off ⇒ the whole lane is inert: no `request_access`, no API call, no synthetic input. Flipping it off instantly disables everything. |
| `CASCADE_RUNBOOKS_API_ENABLED` | **Track B only** | Required in addition to the lane flag. |
| `ANTHROPIC_API_KEY` | **Track B only** | An explicit key must be present; Track B never runs on Max Plan credentials. |

See `feature-flags.ts` (`isRunbookLaneEnabled`, `trackBGate`).

## Native synthetic-input choice

`native-input.ts` defines the deterministic primitive interface (`NativeInput`:
`openApp`, `waitForWindow`, `key`, `type`, `click`, `screenshot`) plus a default
macOS backend built from OS-native tools (`open`, `screencapture`,
`osascript`/System Events) behind an **injectable command runner**.

**The production target is a bundled, signed native sidecar** invoked as the Cascade
desktop app's own child process — so its macOS TCC grants (Accessibility + Screen
Recording) sit on ONE stable, signed identity and persist durably across rebuilds
(the same durable-TCC property the signed menu-bar helper buys). We deliberately did
**not** take a hard dependency on an in-process binding like nut.js: its prebuilt
native addons carry a code-signing identity we don't control, which would fragment the
TCC grant. The sidecar can later replace the default backend behind the same
`NativeInput` interface without touching any caller.

## Files

| File | Role |
|---|---|
| `runbooks.ts` | Frozen in-code Runbook allowlist (shared by both tracks). |
| `invocation.ts` | Shared typed invocation contract + fail-closed param validation (the reuse seam). |
| `feature-flags.ts` | The kill switch (lane flag + Track-B gate). |
| `native-input.ts` | Deterministic native synthetic-input primitives. |
| `receipt.ts` | Filmstrip receipt assembly + persistence (Cascade artifact / local fallback). |
| `SKILL.md` | Track A: `/cse:run-runbook` recipe (attended, Max). |
| `api-loop.ts` | Track B: Computer Use API agent loop (off by default, API-billed). |
| `__tests__/runbook.test.ts` | Unit coverage (fail-closed, flag gating, Track-B control flow vs a mocked client). |

## Deferred (wiring, not capability)

- phone / PWA / plugin / Codex triggers and a menu-bar/toolbar daemon host for Track B
  — the `invocation.ts` contract is designed to admit them (`triggerSource` enum
  already includes them); a `runbook_invocations` DB relay table lands with the phone
  trigger (NOT a `remote_commands` verb).
- rich real-world Runbooks (e.g. Logic Pro studio-setup) — two proof Runbooks now;
  grow the library once both tracks are proven live.
- reusing the harness computer-use MCP for **unattended** runs — impossible
  (single-session-exclusive + per-session consent, verified). Unattended goes through
  Track B, not the MCP.

## Typecheck & test

```bash
# Typecheck this module (root tsconfig only includes src/**, so use the local config):
npx tsc -p cse/skills/run-runbook/tsconfig.json --noEmit

# Run the unit tests:
npx vitest run cse/skills/run-runbook/__tests__/runbook.test.ts
```
