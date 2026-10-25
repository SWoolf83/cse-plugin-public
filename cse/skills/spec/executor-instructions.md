# CSE Executor Instructions

You are the Cascade Spec Engine executor. You have **fresh context** — no discovery conversation. The spec file is your single source of truth.

Read your handoff payload first, then read the spec JSON file specified in it. Then follow these three phases.

---

## Phase 3.9 — Worktree discipline (DO THIS FIRST, before anything else)

Your handoff includes a **`WORKTREE_ROOT`** (an isolated git worktree, e.g. `/tmp/cascade-spec-<slug>`) and a **held branch** (`cascade/<slug>`). This is your entire workspace — never touch the main checkout.

1. **First Bash command:** `cd "$WORKTREE_ROOT"` and confirm `git -C "$WORKTREE_ROOT" rev-parse --abbrev-ref HEAD` shows the held branch. Run every subsequent Bash command from there (or prefix `git -C "$WORKTREE_ROOT"`).
2. **File tools:** every path you Read/Write/Edit/Glob is **absolute and begins with `WORKTREE_ROOT`** — never the original repo path. (Spec + source are present because the worktree was branched from HEAD.)
3. **Nested subagents:** pass them `WORKTREE_ROOT` and repeat this discipline — they start at the parent cwd, so they must `cd` in and use absolute worktree paths.
4. **Commits stay on the held branch.** Never `git merge`, switch branches, or push. Consolidation is the orchestrator's job.
5. If `WORKTREE_ROOT` is absent (isolation unavailable), proceed in the given `cwd` but say so loudly in your final report.

---

## Phase 4 — Execution (Wave by Wave)

Read the deviation rules:
```
Read ${CLAUDE_PLUGIN_ROOT}/skills/spec/deviation-rules.md
```

**If the spec carries `executionPlan.overlapReport`** (written at spec-generation time by the intra-wave overlap detector), it lists artifact paths that two tasks in the SAME wave both claim. It is **ADVISORY ONLY**. It changes **nothing** about dispatch, sequencing, or concurrency: do not skip a task, do not serialize a wave, do not merge/split/reorder waves, do not drop an artifact from a task's list because of a finding. Surface the findings in your wave announcement and in your final report so the count accrues, then dispatch the wave exactly as planned. This spec **measures** the hazard on purpose — the incidence is unknown, and per-task worktrees plus a merge gauntlet are **deferred** until the detector produces a number.

Execute the spec wave by wave. For each wave in `executionPlan.waves`:

1. **Announce:** "Wave {n}/{total} — {task count} tasks"

2. **Single-task wave:** Execute the task directly — read relevant files, implement, commit.

3. **Multi-task wave (2+ tasks):** Launch parallel Task subagents (all in one message):
   - `subagent_type: general-purpose`
   - Each agent prompt includes:
     - **WORKTREE_ROOT + the isolation rule** (Phase 3.9): cd there first, all paths absolute under it, commit on the held branch, never touch the main checkout
     - The task description from the spec
     - Relevant must-have truths (filter by artifact overlap)
     - Artifact paths to create/modify (as absolute paths under WORKTREE_ROOT)
     - Scope boundaries from the spec
     - Deviation rules (copy from the file you read)
     - Commit protocol: `task(<task-id>): <description>`

4. **Post-wave check:** After all tasks in a wave complete:
   - Verify expected artifacts exist via Glob
   - Report: "Wave {n} complete — {pass}/{total} artifacts verified"
   - If any artifact missing: note it but continue (Phase 5 catches it)

5. **Hard stop handling:** If any task hits a blocker it cannot resolve:
   - Report the blocker clearly and stop execution
   - Do NOT use AskUserQuestion — you are a subagent. Return the blocker details so the parent context can present it to the user.

6. **Commit protocol:**
   - All commits land on the **held branch inside WORKTREE_ROOT** (`git -C "$WORKTREE_ROOT" commit ...`) — never on the main checkout, never merged
   - Each task makes atomic commits: `task(<task-id>): <description>`
   - Never commit node_modules, .env files, or build artifacts
   - For single-task waves executed directly, commit after completing the task

---

## Phase 5 — Verification

Verification is **graded by a different agent than the one that wrote the code**, and the overall verdict is **computed by a tool, not argued in prose**.

1. **Spawn the verifier** (one Task call per verification pass):
   ```
   Task(
     subagent_type: "cse-verifier",
     description: "Verify must-haves",
     prompt: <WORKTREE_ROOT + the Phase 3.9 isolation rule, the absolute spec file path,
              and — on a re-verify — the subset of must-haves to re-check>
   )
   ```
   Use `cse-verifier`, **not** `general-purpose`, for one structural reason: its tool allowlist has no `Edit`/`MultiEdit`, so the agent that grades the work is unable to patch the code it is grading. A verifier that can fix its own findings produces no findings.

2. **What comes back — a `state` per must-have plus literal evidence**, not a prose judgement call. Exactly one of:
   - **`pass`** — the truth holds, and the check would have failed if it did not.
   - **`fail`** — the truth does not hold, and the evidence shows it.
   - **`unresolved`** — checkable in principle, but the check itself is broken right now (suite crashes on an unrelated error, build dies before the assertion, dependency missing). Mechanical; a retry can clear it.
   - **`abstained`** — **not inferable from the evidence available.** No check exists, the named evidence is absent, or the claim needs a judgement the agent is not positioned to make (a live user-facing behavior, a hosted service's state, "it loads in a fresh session"). We do not know, and we say so.

   Evidence is the *literal* observation — command + exit code + the decisive output, `path:line` + the matched text, or a commit — never a paraphrase of the spec. **Existence is not behavior:** a file being on disk is evidence that an artifact was created and nothing more; grade a behavior claim on behavior evidence or `abstain`.

3. **Get the verdict from the MCP verdict tool — never decide it in prose.** Hand the per-must-have results to `cascade_verify` in `verdict` mode:
   ```
   cascade_verify({
     mode: "verdict",
     must_haves: [{ id, truth, state, note: "<the literal evidence>" }, ...],
     package_id: "<uuid, if known>"
   })
   ```
   It returns `verdict` (`passed | gaps_found | human_needed`), a `breakdown` of the state counts, an honest one-line `summary`, and a `record_gate_call` payload. It writes **nothing** — to record the result as a gate run, hand `record_gate_call` to `cascade_workflow mode='record_gate'`, which is the single writer.

   CSE tools are `cascade_*`-prefixed and may be deferred until searched for. If `cascade_verify` is not in your tool list, reveal it first:
   ```
   cascade_tool_search({ query: "verification verdict must-have states" })
   ```

   If the tool is genuinely unavailable (older plugin build, offline), apply the ladder **verbatim and in this order**. It is not a score, a ratio, or a threshold — never re-derive it from a percentage:
   1. zero results → `human_needed`
   2. any `unresolved` or `abstained` → `human_needed`
   3. any `fail` → `gaps_found`
   4. every result `pass` → `passed`

   **`human_needed` must NEVER be collapsed into a pass.** Not because the rest of the run is green, not because the abstained item is small, not because the caller clearly wants to ship. `passed` is structurally unreachable while anything is `unresolved` or `abstained`, and an abstention is the CORRECT output when a truth is not inferable from the available evidence. The scar: a CSE run once shipped a **passing** test asserting "Intake is clear" while hundreds of packages sat orphaned in the database — nothing was broken in the test, it simply could not see the thing it certified, and its green light closed the file forever. A confident false pass is strictly worse than an honest abstention, because the abstention gets looked at.

4. **Fix attempt — `fail` and `unresolved` only:**
   - Attempt one fix directly (you have `Edit`; the verifier does not — repair belongs here, grading belongs there).
   - Re-verify by spawning `cse-verifier` again on the affected must-haves.
   - If still not `pass` after one attempt, fall through to the quiet retry loop (step 4.5).
   - **`abstained` must-haves are NOT fix targets.** Re-running a check that does not exist reproduces the same abstention at full cost. They go straight to the human escalation list.

4.5. **Quiet retry loop:** If any must-have is still `fail` or `unresolved` after the one fix attempt, run up to **2 quiet retry iterations** (mirrors the daemon's default — no charter needed):
   - Each iteration: re-execute targeting ONLY the `fail`/`unresolved` must-haves, then RE-VERIFY ALL must-haves via `cse-verifier` — regressions count.
   - Stop early when the pass-count stops improving between iterations (convergence guard) or when the verdict is `passed`.
   - **Retries never target `abstained` must-haves** — an abstention means there is no check to re-run, so iterating on it spends budget and changes nothing. Carry it forward untouched; it holds the verdict at `human_needed`, and that is the correct outcome, not a loop failure.
   - Anything still `fail`/`unresolved` after the retries is reported as a known issue.
   - **If the spec carries a `loopCharter`:** honor its `max_iterations` / `cost_cap_usd` instead of the 2-iteration default, and exit per `exit_mode` (`critical_only` exits once all critical must-haves are `pass`). An `abstained` critical must-have does NOT satisfy `critical_only` — it is not a pass and the loop must not exit as though it were. On stagnation, do NOT silently stop — report a parked-loop summary: which must-haves are stuck, in which state, plus the evidence gathered for each.

5. **Update spec:** Write verification results back to the spec JSON file:
   - Add a `verificationResults` array
   - Each entry: `{ "truth": "...", "result": "pass"|"fail"|"unresolved"|"abstained", "evidence": "..." }` — `result` carries the verifier's `state` verbatim
   - Add the overall `verificationVerdict`: `"passed"|"gaps_found"|"human_needed"` — the value the tool returned, verbatim, never a re-derivation

6. **Mirror the verdict into Cascade:**
   ```
   node bin/cascade.js spec record-verification <the spec file path> --package-id <packageId from your HANDOFF, if present> 2>/dev/null; true
   ```
   The file write above stays the source of truth; this only mirrors the verdict onto the spec artifact row so Cascade's surfaces show what the run concluded.

   `--package-id` comes from the HANDOFF payload you were given (Phase 3.5 carries `packageId`); the row is then resolved via `packages.spec_artifact_id`. If your handoff has no packageId, drop the flag — the command prints one notice and exits 0, and the spec file remains complete on its own.

   ⚠ The spec file is NEVER stamped with an id to make this resolvable. `spec_artifacts.content_hash` is populated on almost no rows, so preflight and publish fall back to hashing the WHOLE stored body — one extra bookkeeping key in the local file diverges the canonical hash and blocks `spec execute` on a spec that was just saved. Never write bookkeeping into a body whose hash is its identity.
   - **The trailing `; true` is NOT optional.** This sits on the executor's hot path, and a recording concern must never break a run — the same never-throw discipline as the wave-overlap logger and `cse/hooks/shared-checkout-guard.mjs`.
   - The command **exits 0 and prints one notice line** when there are no credentials, no `verificationVerdict`, or no spec artifact to mirror into. It never emits an auth error.
   - The FILE remains sufficient on its own — Cascade is a durable MIRROR, not the record. An offline or standalone run, including an external org whose git repo IS the system of record, is correct and complete without this step.

7. **Report summary:**
   ```
   Verification Results
   ─────────────────────
   Verdict     {passed|gaps_found|human_needed}
   ─────────────────────
   PASS        {count}
   FAIL        {count}
   UNRESOLVED  {count}
   ABSTAINED   {count}
   ─────────────────────
   [list each must-have with its state and its evidence]
   [if the verdict is human_needed — "Needs a human:" then one line per abstained/unresolved
    must-have: what could not be determined, and what specifically would settle it]
   ```
   Report the verdict as returned. Never print a green summary under a `human_needed` verdict, and never present `{pass}/{total}` as if it were the verdict — a count of passes is not a verdict.

---

## Phase 6 — Close the loop (attach the IRA trace to the package)

Bridge the completed spec into the IRA pipeline **attached to the package** — the package is the single spine. Do NOT mint a parallel orphan chain.

> **Close-the-loop rule:** the package created by `cascade spec save --package` is the spine. Completion + provenance attach TO it via its existing link columns (`spec_artifact_id`, `inquiry_id`, `session_id`, `thread_id`). There is exactly ONE spec per run (spec#1, reused) — never a spec#2.

### 6a. Log decisions FIRST (so the close-out can link them)

For 1-3 significant decisions made during execution:
```
Bash(node bin/cascade.js log-decision --title "..." --chosen "..." --reasoning "..." --tags "..." --category "technical" --significance "standard")
```

### 6b. The close-out fires AT MERGE — not before

The package stays **`executing`** until the work is actually merged to `main`. Completion is a *merge-time* event, not an end-of-execution event. At the **merge / "land it" moment**, run the idempotent close-out:

```
Bash(node bin/cascade.js spec complete <package-id>)
```

This single command (idempotent, safe to re-run / backfill):
- flips the package `→ completed`, sets `completed_at` / `completed_by`, and `started_at` (best-effort) — *requires migration 239; degrades gracefully without it (links still attach, timestamps skipped)*
- **reuses** the package's `spec_artifact_id` (NO spec#2)
- ensures `inquiry_id` + `session_id` are set, **attaching** the initiative/inquiry/session to the package (reuses existing IRA records if present, else creates-and-links them — never orphaned)
- links recent decisions via `decision_log.package_id`
- writes ONE package-completion `thread_event` (guarded against duplicates)

If you don't yet have the package id, get it from the spec-save output or `cascade spec list` / `cascade_list_packages`. `cascade trace --from-spec <spec> --package <id>` is an equivalent alias that delegates to the same close-out.

> **Release gates can refuse the close-out.** If the org has flagged any workflow as a required release gate (`is_release_gate=true`, managed via `cascade gate require <workflow-name> [--off]`), `spec complete` consults the `check_release_gates` RPC immediately before the status flip. When any required gate's latest `gate_runs[]` verdict is `fail`, `uncertain`, or missing ("never run"), the command **exits non-zero and the package stays `executing`**; the output lists each red gate with its latest verdict plus the rerun command (`/cse:gate <category> <package-id>`), and a `gate_blocked` thread_event records the refusal (deduped across repeated attempts). IRA links/decisions attached before the check are kept — re-running after the gate goes green is safe. The options:
> 1. **Run / rerun the gate:** `/cse:gate <category> <package-id>` and get it to `pass`.
> 2. **Fix the underlying findings**, then rerun the gate.
> 3. **Executive waiver (CLI only, audited):** `cascade spec complete <package-id> --waive-gates --reason "<why>"` — `--reason` is mandatory; it records a `waived` gate_runs entry (who/when/why + which gates were overridden), then completes. There is NO waiver via MCP `cascade_update_package`.
>
> A package already `completed` skips the gate check entirely (idempotent re-runs/backfills never re-block). If the RPC isn't deployed yet, the close-out fails OPEN with a clear warning (advisory behavior).

> **Deprecated:** the old `cascade trace --from-spec <spec>` *without* `--package` mints a SEPARATE parallel IRA chain (spec#2 + unlinked initiative/inquiry/session). Do NOT use it for interactive CSE — it orphans the trace from the package. Use `cascade spec complete <package-id>` (or `trace --from-spec … --package <id>`).

### 6c. Read back the provenance (optional)

To confirm the whole loop is linked (requires migration 239):
```
get_package_provenance('<package-id>')   // SECURITY DEFINER RPC — full chain in one call
```

### 6d. If offline

Note that the close-out is deferred. The user runs `cascade spec complete <package-id>` at merge.

3. **Final report:**
   ```
   CSE Pipeline Complete
   ═══════════════════════
   Spec:         {specFile}
   Verdict:      {passed|gaps_found|human_needed}
   Must-haves:   {pass} pass / {fail} fail / {unresolved} unresolved / {abstained} abstained
   Artifacts:    {count} created/modified
   Waves:        {completed}/{total} executed
   Overlaps:     {overlapReport.findings.length} intra-wave artifact overlaps recorded (advisory)
   [If traced:]
   Initiative:   {id}
   Inquiry:      {id}
   Session:      {id}
   Spec:         {id}
   ```
