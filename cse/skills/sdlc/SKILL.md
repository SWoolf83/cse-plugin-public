---
name: sdlc
description: Run the AI-native SDLC loop — intent → spec → build → verify → gate → maintain — with Cascade as system of record per stage.
argument-hint: "[<description> | intent <description> | run <intent-file> | pulse | status]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Task, Skill
---

# /cse:sdlc — AI-Native SDLC Loop (PROTOTYPE)

Implements Anthropic's *AI-Native SDLC Playbook* (six stages: Plan → Design → Build →
Test → Deploy → Maintain) as a **thin orchestrator over the existing Cascade Spec
Engine**. This skill NEVER re-implements CSE machinery — Stages 2–5 delegate to
`/cse:spec`, the CSE executor, `cse-verifier`, and `/cse:gate` exactly as they exist
today. What this skill adds is the two ends of the loop the playbook names and CSE
lacks: a durable, approval-gated **intent artifact** at the front, and a
**maintain pulse** that closes the loop by writing new intents from telemetry breaches.

**Source-of-truth rule (non-negotiable):** Cascade is the system of record for every
stage transition. Repo files (`.cascade/intents/`, `.cascade/specs/`) are
git-versioned working copies; the package row + its `type_data.sdlc` chain is the
authoritative audit trail. This is the playbook's "Option A/B" question answered a
third way: the org's AI-native substrate IS the record — no Jira, no external SoR.

## Playbook ↔ CSE mapping (what delegates where)

| Playbook stage | Playbook artifact | This skill does | Delegates to |
|---|---|---|---|
| 1 Plan | `intent.md` | **NEW** — Stage I below | — |
| 2 Design | `spec.md` | stamp transition only | `/cse:spec` Phases 0–3 (discovery, adversarial review, persistence) |
| 3 Build | `plan.md` + diff | stamp transition only | `/cse:spec` Phase 3.5–4 (worktree isolation, waves, deviation rules) |
| 4 Test | feedback loop | stamp + eval accrual | executor Phase 5 (`cse-verifier`, `cascade_verify` verdict, quiet retry) |
| 5 Deploy | review + gates | stamp transition only | `/cse:gate review` + release gates on `cascade spec complete` |
| 6 Maintain | control bands → new `intent.md` | **NEW** — Stage M below | findings → `execution_queue` → `/cse:spec-pull` (existing re-entry lane) |

## Dispatch on `$ARGUMENTS`

- Empty → print usage: `/cse:sdlc <description>` (full loop) · `intent <description>`
  (Stage I only, queue for later) · `run <intent-file>` (resume an accepted intent) ·
  `pulse` (Stage M) · `status` (where every in-flight sdlc package sits). Stop.
- `intent <description>` → Stage I only. After the gate, stop (package queued).
- `run <path>` → Read the intent file, confirm its package id from the frontmatter,
  jump to Stage 2 handoff.
- `pulse` → Stage M only.
- `status` → list packages where `type_data.sdlc` exists, one line each:
  `<slug> · stage <n>-<name> · <age in stage> · <package-id>`. Use
  `cascade_list_packages` and filter. Stop.
- Anything else → full loop: Stage I, then on acceptance continue to Stage 2.

## Stage I — INTENT (playbook Stage 1: capture intent)

1. Brainstorm briefly and conversationally from the user's description. This is NOT
   CSE discovery — no interview, no must-haves. 0–3 questions max, only if the
   problem statement itself is unclear. Discovery belongs to Stage 2.
2. Write the intent artifact to `.cascade/intents/intent-<slug>-<date>.md`
   (slug: lowercase, hyphens, ≤40 chars):

   ```markdown
   ---
   package: <filled in step 3>
   status: proposed
   originated: <date>
   ---
   # Intent: <title>
   ## Problem
   ## Proposed outcome
   ## Affected users & systems
   ## Constraints
   ## Open questions
   ```

   Every section filled from the brainstorm; open questions are honest unknowns for
   Stage 2 discovery, never silently resolved here.
3. Persist to Cascade as the spine package — a `spec_request` so the EXISTING
   `/cse:spec-pull` queue lane picks it up:
   ```
   cascade_create_package with type spec_request, title = intent title,
   description = problem + proposed outcome,
   type_data.sdlc = { stage: 1, stage_name: "intent",
     intent_file: "<path>", transitions: [{ stage: 1, at: "<ISO>", by: "<user>" }] }
   ```
   Write the returned package id into the intent file frontmatter. If offline, note
   the file is the pending record and Cascade persistence is deferred — say so loudly.
4. **Approval gate** (the playbook's product-owner accept/reject — the git commit of
   the decision is the audit trail). AskUserQuestion, header "Intent gate":
   - "Accept — design it now" → set `type_data.sdlc.stage = 2`, append transition,
     continue to Stage 2.
   - "Accept — queue it" → leave the package `queued`; it surfaces via
     `/cse:spec-pull`. Stop.
   - "Reject" → archive the package with the reason in `type_data.sdlc.rejected_reason`,
     flip intent file `status: rejected`. Stop. A logged rejection is a result, not a
     failure.
5. Metrics stamp: `type_data.sdlc.intent_committed_at` — the playbook's leading
   indicator for Stage 1 (conversation → committed intent, hours not weeks).

## Stage 2→5 — DELEGATION (do not re-implement)

1. Invoke `/cse:spec` via the Skill tool with the intent as seed context, passing the
   package id so `spec save --package-id` links spec → package (the `/cse:spec-pull`
   handoff convention). The intent file's Open Questions section seeds discovery —
   CSE's interview, adversarial `cse-plan-checker` review, worktree execution,
   `cse-verifier` grading, and verdict ladder all run UNCHANGED.
2. After each phase boundary returns, advance the chain — **set BOTH
   `type_data.sdlc.stage` (and `stage_name`) AND append the transition to
   `type_data.sdlc.transitions`**: stage 3 when execution begins (spec locked), stage 4
   when verification reports, stage 5 at gate/merge (`cascade spec complete` — release
   gates already refuse a red gate there).

   ⚠ **Both, every time — writing only the transition is a silent display bug.**
   This instruction previously said "append the stage transition" alone, so a chain
   that ran to deploy kept `sdlc.stage: 2` from the intent gate while `transitions`
   carried `{3},{4},{5}`. Any reader trusting the integer then buckets SHIPPED work
   under Design forever and reports an unbounded false stall on it. Caught by the
   code-review gate on 2026-08-26 (package `6b9efc9f`); `lib/sdlc/loop.ts` now defends
   by resolving the stage from the transition history (latest timestamped entry when
   the history is fully ordered, furthest stage reached when it is not, never below
   the declared integer) — but the reader's tolerance is a backstop, not a licence for
   the writer to under-write. Keep the two in agreement.

   **Always write `at` on every transition.** The ordering above depends on it: an
   untimed entry makes the whole history unorderable, which downgrades the reader to
   a coarser "furthest reached" answer and loses re-entry.
3. **Eval accrual (playbook Play 4b — continuous evals).** After a run whose verdict
   is `passed`, append ONE eval case to `.cascade/evals/cse-regression.jsonl`:
   ```json
   {"at":"<ISO>","spec":"<spec file>","prompt":"<one-line task restatement>","acceptance":["<critical must-have truths>"],"verdict":"passed"}
   ```
   Append-only, never rewritten, never-throw (`; true` — a logging failure must not
   break the run). This accrues the 20–50 real-task corpus the playbook says a config
   regression suite needs, so a future `/cse:release` gate can replay them when the
   plugin, prompts, or model change. Building that replay gate is Phase C of the
   roadmap — this skill only accrues the corpus.

## Stage M — MAINTAIN PULSE (playbook Stage 6: control bands → new intent)

Deterministic detection, agent diagnosis, human triage — in that order.

1. Read `.cascade/sdlc/bands.json` if it exists. Format:
   ```json
   {"metrics":[{"name":"verification_first_pass_rate","source":"specs","window":10,"warn_below":0.6,"act_below":0.4}]}
   ```
   If absent, compute defaults from what Cascade already emits — no new
   infrastructure. Read the verdicts from the **system of record**:
   ```
   node bin/cascade.js spec verdicts --last 10 --json
   ```
   It returns a JSON array; each element carries `specArtifactId`, `verdict`, `total`,
   `counts` (pass/fail/unresolved/abstained), `originalCounts` (the pre-settlement
   states, so a settled abstention stays countable), `settledCount`, `recordedAt` and
   `intent`. Derive first-pass rate and human_needed rate from that. With `--json` it
   ALWAYS prints an array — an empty one, plus an `offline —` notice on stderr, when
   there are no credentials — so a consumer never has to parse a notice.

   Fall back to scanning the last 10 `.cascade/specs/*.json` for `verificationVerdict`
   **ONLY when that command reports it is offline.** This mirrors the file-first /
   DB-mirror rule the write path uses: the file is sufficient on its own, Cascade is the
   durable mirror.

   Overlap incidence still comes from `.cascade/telemetry/wave-overlap.jsonl`.

   **A settled abstention stays visible.** `originalCounts.abstained` survives
   settlement on purpose: a verifier that systematically cannot check a whole CLASS of
   truth must remain countable after humans have settled every individual instance of
   it. Read the band off `originalCounts`, not off `counts`, or the pulse goes blind to
   exactly the blind spot it exists to surface.

   ⚠ **Two traps this pulse's own first run walked into — its evidence CORRECTS the
   intent that spawned it.**
   - **The verdict never reached Cascade AT ALL.** Measured 2026-08-26: **0 of 409**
     `spec_artifacts` carried `spec_body->>verificationVerdict`. So the "40% unrecorded"
     figure in this pulse's own intent was measured against LOCAL FILES that exist on a
     single machine, and was never a statement about the system of record. Any rate
     computed from files describes one laptop, not the org.
   - **`spec_artifacts.status='complete'` is NOT evidence that anything ran.** It is
     stamped at SAVE time by `specSave` (`bin/cascade.js`). Do not derive a completion
     rate, a first-pass rate, or any band from it.
2. For each metric: inside band → one line, done. **Warn band** → diagnose read-only
   (read the failing specs/evidence) and report findings — no writes. **Act band** →
   diagnose, then write a NEW intent artifact (Stage I steps 2–3, originator
   "sdlc-pulse", with the evidence in Problem) and log it via `cascade_log_finding`.
3. **Badge discipline (HARD RULE from CLAUDE.md):** a pulse-generated intent is a
   FINDING — listed, never counted. Do NOT enqueue it into `execution_queue` and do
   NOT create work the badge counts. A human converts a finding to counted work by
   accepting it; an auto-producer that outruns its consumer is the exact failure the
   claimable rules exist to prevent.
4. Report: metrics table (value, band, trend), findings written, intents drafted.
   Never ask a question at the end — findings are the deliverable.

## Guardrails

- **Never modify `/cse:spec`, `executor-instructions.md`, or the verifier from this
  skill.** The hybrid lives entirely in this file; killing it costs nothing.
- **No migrations.** All state rides in `packages.type_data` (jsonb) and git files.
- **Silence rule:** never volunteer sdlc status at session start; `status` is
  user-invoked only.
- Prototype status: this skill is Phase A of the SDLC-hybrid roadmap (see
  `.cascade/whitepapers/ai-native-sdlc-hybrid.md`). Phases B (per-stage metrics
  rollup), C (eval replay gate in `/cse:release`), D (cron-driven pulse) land only
  after this loop has been run end-to-end at least three times.
