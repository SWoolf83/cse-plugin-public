# studio-check

`/cse:studio-check [smoke|rail]` tests the **installed Cascade Desktop app** by
driving Creator Studio with the harness computer-use MCP. It is attended and
on-demand: the session you run it in holds the screen.

## What it tests

| tier | steps |
|---|---|
| `smoke` | Songs, Reels, Shots, LightCraft, PhotoCraft, Work (+ Agents tab) each render; a throwaway `Harness test <nonce>` production is created, renamed, re-opened after navigating away (the rename must persist in the production header), then archived. |
| `rail` | The same throwaway production; **Start the assistant**; the rail is asked for the production title written backwards — without the title or nonce being typed — and passes only if the reversed nonce appears in the assistant's reply. Then archived. |

The steps live in `scenarios.mjs` as data. Each names the location it is judged
at (`main panel`, `production header`, `rail assistant reply`), never the user's own
message.

## Guardrails

- `allowedApps` is `['Cascade Desktop']`, equal to the `studio-smoke` /
  `studio-rail` entries in `run-runbook/runbooks.ts` (test-asserted).
- `validateScenario` rejects any step whose instruction or typed text targets paid
  generation (generate image/video/audio/voice/music, render with AI, upscale,
  Topaz, Sora, Veo, ElevenLabs) or sign-out / log-out, and any expectation with no
  location or located in the user's own message. Counter-examples are tests.
  This checks the shipped step text; what gets clicked at run time is governed by
  `SKILL.md`'s hard rules.
- Gated by `CASCADE_RUNBOOKS_ENABLED=1` (`flag.mjs`, same rule as
  `run-runbook/feature-flags.ts`), fail closed.
- Cleanup steps run even after failures. The rail tier's Showrunner document is the
  one permitted leftover when nothing can archive it; the report names it.

## Receipts and findings

- `node report.mjs receipt <results.json>` prints a receipt in the run-runbook
  receipt shape (text frames in v1, no screenshots), stored with
  `cascade_create_artifact`.
- A failed step becomes ONE finding titled `Studio check [<tier>/<step id>] failed`
  (topic `studio-check`). Identity is only (tier, step id) — the nonce never enters
  the title or the fingerprint (`fingerprint.mjs`, a vectors-tested copy of the fleet
  fingerprint), so the same failure on the next run is a duplicate, not a new finding.
- `node report.mjs plan <results.json> <open.json>` decides: **file** new failures,
  **skip** ones with an open finding, **archive** open findings whose step passed.
  Open findings are found in the newest 100 draft packages.

## Not included

No autonomous fixes, no paid generation, no real productions, no unattended or
scheduled runs, no screenshots in receipts.
