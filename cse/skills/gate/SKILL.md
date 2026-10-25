---
name: gate
description: Use when you want to run a gate/workflow of ANY category (qa, review, security…) against your change — pick org workflows, get a verdict.
when_to_use: Runs a gate/workflow of any category against your change. Lists the org's workflow_definitions for the category just-in-time (platform defaults auto-materialized — never empty for a seeded category like 'qa' or 'review'), lets you pick or compose/sequence several mid-stream, then executes each agent-driven — emitting pass/fail/uncertain and recording the run in workflow_executions (+ the package's type_data.gate_runs[] for non-qa gates). `/cse:gate review` runs code-review; `/cse:gate qa` is what /cse:qa delegates to.
argument-hint: "[category] [optional: package id, workflow name, or one-line surface override]"
allowed-tools: Bash(git *), Bash(date *), Bash(pwd), Read, Glob, Grep, Skill, mcp__cascade-api__cascade_workflow, mcp__cascade-api__cascade_list_packages, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__list_console_messages, mcp__playwright__browser_navigate, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_console_messages, mcp__puppeteer__puppeteer_navigate, mcp__puppeteer__puppeteer_screenshot
---

# Cascade Gate Runner (`/cse:gate [category]`)

Run an org gate/workflow of **any category** against the current change. This skill is the
**one generic runner** behind every gate type. It carries **no workflow definitions** — every
workflow is fetched just-in-time from the database via the `cascade_workflow` MCP tool. The
logic lives in the data, not this prompt.

A gate is a `workflow_definitions` row (migration 096) — the SAME primitive as a QA workflow,
distinguished only by `category` (migration 234 added `category` + `is_release_gate`). Gates
are NOT a separate system: `qa` is one category, `review` is another, `security`/`eval` are
future categories. **One runner, any category.** Governance, versioning, and the flows Canvas
UI come from that system for free.

**Advisory by default; enforcement is per-gate opt-in.** A gate verdict is surfaced and
recorded; it blocks nothing UNLESS the org has flagged that workflow as a **release gate**
(`is_release_gate = true`, flipped via `cascade gate require <workflow-name> [--off]`,
admin/executive only). For a required gate, the `check_release_gates` RPC makes the package
close-out (`cascade spec complete` and MCP `cascade_update_package` executing→completed)
**refuse** while the gate's latest verdict is `fail`, `uncertain`, or missing — the package
stays `executing`. See `.cascade/specs/GATES.md` (Enforcement — built).

---

## Phase 0 — Resolve the category (and optional target package)

Parse `$ARGUMENTS`:
- **First token = category** if it is one of the known categories (`qa`, `review`, …). If the
  caller gave no category, default to `qa` (so `/cse:gate` with no args behaves like `/cse:qa`).
- A token that looks like a **UUID** is the **target package** the gate is judging (used for
  recording on `type_data.gate_runs[]` — see Phase 6).
- Any remaining free text is a **one-line surface/scope override** to carry into Phase 4.

If no package id was given and the category records on a package (any non-`qa` gate, e.g.
`review`), ask the user which package this run is for, or offer the most recent `executing`
package via `cascade_list_packages` (status filter) — but never block: if the user declines, run
the gate and record only the `workflow_executions` row.

## Phase 1 — List the category's workflows (never block)

Call the MCP tool. Platform defaults are auto-materialized into your org on first use of a
**seeded** category (`qa` → `qa-quick-smoke`, `review` → `code-review-gate`), so the list is
**never empty** for those and never relies on NULL-org rows:

```
mcp__cascade-api__cascade_workflow  mode="list"  category="<category>"
```

- If `materializedDefaults: true`, tell the user the platform default workflow(s) for that
  category were just seeded into their org.
- If the response carries a `seedError`, report it plainly (typically an admin-write RLS denial —
  definition writes need an executive/admin org role) and stop. Do NOT claim defaults were seeded
  and do NOT treat the empty list as "nothing to run here, all good".
- An empty list with no `seedError` for a seeded category means the org deliberately deactivated
  its workflows (opt-out is respected — inactive rows are never re-seeded). Say so and stop.
- If the category has no platform seed AND the org has none, say so plainly and stop (there is
  nothing to run) — do not invent a workflow.
- If the tool returns "No active organization", stop and tell the user to `cascade login` with
  an org membership — do not guess.

## Phase 2 — Present as a multiple-choice selection

Show the returned `workflows` as a numbered list: name, weight, and one-line description.
Mark every workflow whose `isReleaseGate` is true (already returned by `mode="list"`) as a
**required release gate** — e.g. `[REQUIRED — release gate]` — so the developer knows up front
that this gate's latest verdict will be enforced at package close-out.
Offer two ways to choose:
1. **Pick one** by number.
2. **Compose/sequence several** (e.g. "1 then 3") — they execute in the given order.

If `$ARGUMENTS` matched a workflow name, pre-select it.

## Phase 3 — Allow conversational adjustment

Let the developer add, drop, or reorder selections before anything runs. Re-confirm the final
ordered selection. Do not proceed until they confirm.

## Phase 3.5 — Critic pre-gate triage (per workflow, before its main run)

A **verification critic** is an *on-demand pre-gate triage* stage. It runs **only when
a gate is invoked** — it is deliberately OUT of the CSE execution hot path (never in
`single-session-executor` / `wave-executor` / `executor-instructions`), so harness
performance is unaffected. Its job: cheaply score change-readiness FIRST and, when the
change is clearly not ready, avoid paying for the fuller (expensive) review.

The critic's **behavior is data-driven** — it rides `workflow_definitions.trigger_config.critic`
(JSONB, **no migration**). The parse + action logic is the pure, unit-tested seam in
`src/daemon/critic/config.ts` (`parseCriticConfig`, `resolveCriticAction`); this skill
follows its semantics exactly. Config shape (all optional, fully defaulted):

```jsonc
// workflow_definitions.trigger_config.critic
{ "enabled": false,        // default false — triage OFF unless the workflow opts in
  "threshold": 0.6,        // default 0.6  — readiness at/above which the change is "ready"
  "onLow": "advise" }      // default advise — what a BELOW-threshold score does: advise | short_circuit | retry
```

For **each** chosen workflow, BEFORE running its main body (Phase 4):

1. **Read the critic config** off the definition you fetched (`trigger_config.critic`).
   Apply `parseCriticConfig` defaults: **absent/partial ⇒ `{ enabled:false, threshold:0.6, onLow:'advise' }`**.
   If `enabled` is false, **skip triage entirely** and go straight to Phase 4 (this is the
   default — the critic is opt-in per workflow).

2. **Score readiness agent-side (Max Plan — never a server LLM).** When enabled, quickly assess
   the change's readiness for THIS category as a score in `[0, 1]` with 1–3 short reasons — e.g.
   for `review`/`security`: is there a real diff, does it typecheck/build, are there obvious
   smells; for `qa`: does an affected surface exist and is the dev server reachable. This is a
   fast triage judgment, not the full review. Keep the `{ score, reasons }`.

3. **Resolve the action** = `resolveCriticAction(config, score)`:
   - **disabled OR `score >= threshold`** ⇒ `advise`.
   - **`score < threshold`** ⇒ `config.onLow`.

4. **Act on it:**
   - **`advise`** — annotate the run with the readiness score + reasons and **continue to Phase 4**
     (the fuller workflow still runs; the critic only added a note). This is the safe default.
   - **`short_circuit`** — the change is not ready and the workflow opted to stop early. **Emit an
     early `uncertain` verdict** (never `pass`), **record a normal `workflow_executions` row for it**
     (Phase 6a: `mode="start_execution"` then `mode="complete_execution"` with
     `output_summary.verdict="uncertain"`, carrying `critic: { score, reasons, action:"short_circuit" }`
     in the summary), and **SKIP the fuller review** (do not run Phase 4's main body for this
     workflow). If a target package was given, also record the `uncertain` gate_run (Phase 6b).
     Then move to the next selected workflow.
   - **`retry`** — do NOT invent a new loop here. Defer to the **existing quiet-retry** budget: tell
     the developer the change scored low and should be revised/retried, and continue as the
     surrounding flow's retry semantics dictate (the critic does not implement its own auto-fix loop —
     that is a deferred, separate concern).

Announce the triage outcome to the developer in one line (score, action) so a `short_circuit`
`uncertain` is never silently mistaken for "the gate passed".

## Phase 4 — Execute each selected workflow in order (agent-driven)

> Skip a workflow's Phase 4 body when Phase 3.5 already `short_circuit`ed it (its
> `workflow_executions` row + `uncertain` verdict are already recorded).

For **each** chosen workflow (that was not short-circuited):

1. **Fetch the full definition JIT** (do not assume the step shape):
   ```
   mcp__cascade-api__cascade_workflow  mode="get"  workflow_definition_id="<id>"
   ```
2. **Open the run:**
   ```
   mcp__cascade-api__cascade_workflow  mode="start_execution"  workflow_definition_id="<id>"
   ```
   Keep the returned `executionId`.
3. **Run the steps yourself** (this is an interactive-native, agent-driven runner — there is no
   daemon executor). Walk the definition's `steps` DAG in `dependsOn` order. Each step carries a
   `promptTemplate` and `toolRefs` that tell you what to do. The behavior depends on the category:

   ### category `qa` (quick-weight visual smoke)
   - **Detect the changed surface** from git:
     ```
     Bash(git diff --name-only HEAD)
     Bash(git status --porcelain)
     ```
     Map changed `cascade-web/src/app/**` files to Next.js App Router URLs (a `page.tsx` under
     `(group)/foo/bar/` → `/foo/bar`). Use Glob/Read on the route tree if ambiguous. If the user
     gave a one-line override, use it instead. If nothing maps and there's no override → the
     verdict is **uncertain** (Phase 5), not pass.
   - **Tool-preflight the browser MCP.** Check that one of chrome-devtools / playwright /
     puppeteer is available. **If none is present, STOP this workflow and emit explicit setup
     guidance** (which MCP to enable) — never a silent failure.
   - **Screenshot the affected surface.** Navigate the running dev server (default
     `http://localhost:3000`) to each affected route and capture a screenshot. Pull console
     messages where the MCP supports it, to catch render errors.

   ### category `review` (code-review gate)
   - **Detect the diff:** `Bash(git diff HEAD)` (staged + unstaged); if the tree is clean, fall
     back to the last commit. **If there is no diff to review → verdict `uncertain`** (terminal),
     not pass.
   - **Run the review by reusing the `/code-review` skill** on that diff (do NOT rebuild review
     logic): invoke it via the `Skill` tool (`code-review`). If invoking the skill in-session is
     awkward, perform an equivalent careful correctness review of the diff inline, but prefer the
     real skill. Collect its findings and note which are **high-confidence correctness bugs**
     versus lower-confidence or style/cleanup findings.

   ### category `security` (security-review gate)
   - **Detect the diff:** `Bash(git diff HEAD)` (staged + unstaged); if the tree is clean, fall
     back to the last commit. **If there is no diff to review → verdict `uncertain`** (terminal),
     not pass.
   - **Run the review by reusing the `/security-review` skill** on that diff (do NOT rebuild
     security logic): invoke it via the `Skill` tool (`security-review`). If invoking the skill
     in-session is awkward, perform an equivalent careful security review of the diff inline, but
     prefer the real skill. Collect its findings and note each one's **severity** (critical/high
     vs medium/low) and whether the diff **introduced** it.

   ### category `eval` (report-quality gate)
   - **Detect the artifact** (NOT a diff): identify the report `.md` to score — a path argument,
     the target package's stored work product / latest report, or the most recently produced
     report in the tree. **If no report artifact is found → verdict `uncertain`** (terminal), not
     pass. The eval gate scores a produced artifact, not a code change.
   - **Run the eval by reusing the `/cse:eval` skill** on that report (do NOT rebuild eval logic):
     invoke it via the `Skill` tool (`eval`) with the report path. Collect the scorecard — the
     overall score (mean of the 1-5 dimension scores) and the letter grade.

   ### any other category
   - Walk the steps as declared, using their `toolRefs`/`promptTemplate`. Deeper bespoke
     execution beyond what the definition specifies is out of scope for v1 — say so plainly.

   For **standard**/**release** weight beyond the paths above: resolve the steps and governance,
   but say plainly where execution is stubbed in this slice.

## Phase 5 — Emit the verdict (pass / fail / uncertain)

Each workflow run ends in **exactly one** verdict. The three are distinct terminal states.
**`uncertain` must never be reported as `pass`.**

| Verdict | `qa` meaning | `review` / `security` / `eval` meaning | Required evidence |
|---------|--------------|------------------|-------------------|
| **pass** | Affected surface renders the change cleanly | review: no high-confidence correctness bugs; security: no high/critical vulns introduced; eval: overall score ≥ 3.5 (grade B+) | qa: screenshot of **each** affected route + **no error-level console messages**; review/security: clean review; eval: the scorecard |
| **fail** | Broken render, error overlay, or missing change | review: ≥1 high-confidence correctness bug; security: ≥1 high/critical finding; eval: overall score < 3.5 | The defect / the bug / the vulnerability / the low scorecard |
| **uncertain** | Surface unreachable, diff ambiguous, no browser MCP | No diff/artifact, or the review could not be completed | Statement of exactly what blocked a definite verdict |

State the verdict and its evidence explicitly to the developer.

**If this workflow is a required release gate** (`isReleaseGate: true` in Phase 2) and the
verdict is **`fail` or `uncertain`**, also tell the developer what that means for close-out:

- The package's `executing → completed` flip **will be refused** by `cascade spec complete`
  and by MCP `cascade_update_package` (the `check_release_gates` RPC reads the LATEST
  `gate_runs[]` verdict per required gate; `fail`, `uncertain`, and never-run all block).
- The paths forward: **fix and rerun** this gate (`/cse:gate <category> <package-id>`) until
  it passes, or — executive judgment, CLI only — waive at close-out with
  `cascade spec complete <package-id> --waive-gates --reason "<why>"` (audited: the waiver is
  recorded on the package with who/when/why and which gates it overrode).

## Phase 6 — Record the run

### 6a — Close the execution (always)

Close the execution, carrying the verdict in the summary and one row per step:

```
mcp__cascade-api__cascade_workflow  mode="complete_execution"
  execution_id="<executionId>"
  status="completed"            # use "failed" only if the run itself errored, not for a 'fail' verdict
  output_summary={ "verdict": "pass|fail|uncertain", "category": "<category>", "surface": [...], "evidence": [...] }
  steps=[ { "step_id": "...", "step_name": "...", "status": "completed", "output_data": {...} }, ... ]
```

For `qa` runs, `surface` is **required**: the routes/URLs actually verified, so a recorded pass
documents what it covered. For other categories carry the equivalent scope (e.g. the diff range
reviewed) in `surface` or `evidence`.

`status` is the **execution lifecycle** (completed/failed/cancelled). The **verdict**
(pass/fail/uncertain) lives in `output_summary.verdict` — keep them separate so an `uncertain`
verdict on a successfully-completed run is never collapsed into a pass.

### 6b — Record on the target package (gates that judge a package)

For a gate run tied to a package (a `package` id from Phase 0), also append the verdict to the
package's `type_data.gate_runs[]` — a sibling to `type_data.test_runs`, written via shallow-merge
(NO new table). For a non-required gate this is advisory; for a **required release gate** this
recorded verdict is exactly what `check_release_gates` enforces at close-out (latest entry per
gate wins).

```
mcp__cascade-api__cascade_workflow  mode="record_gate"
  package_id="<packageId>"
  gate_category="<category>"            # e.g. "review"
  gate_name="<workflow name>"          # e.g. "code-review-gate"
  verdict="pass|fail|uncertain"
  execution_id="<executionId>"          # links the gate_run back to its workflow_executions row
  verdict_summary="<ONE LINE — keep it short, and pass it LAST>"
```

⚠ **`verdict_summary` goes LAST, and stays to one line.** On 2026-07-29 a multi-paragraph
`verdict_summary` overflowed its own closing tag and swallowed every parameter that followed it —
including `execution_id`, which never reached the server. The tool faithfully recorded
`execution_id: null`, breaking the gate_run → execution link, and the retry left TWO entries on
package `5ccf2a7c` where one was intended. The server now sanitizes the summary and recovers a
swallowed `execution_id` defensively, but ordering is the fix that prevents it at the source.
The full narrative belongs in `complete_execution`'s `output_summary`, NOT here.

Always pass `gate_category` + `gate_name` explicitly. They are never defaulted: if omitted, the
tool resolves them from `execution_id`'s workflow definition, and errors when it can't — a
mislabeled verdict is worse than a rejected call. If no package was given in Phase 0, skip
record_gate entirely (the `workflow_executions` row from 6a is the record).

**The `waived` verdict is NOT yours to emit.** This runner only ever records `pass`, `fail`,
or `uncertain`. A `waived` entry (`{category:'waiver', name:'close-out-waiver',
verdict:'waived', waived_by, overrode:[...]}`) is written **only** by the CLI close-out
(`cascade spec complete --waive-gates --reason`) as the audited executive bypass of red
required gates. Never write one from this skill, and never suggest record_gate as a way to
"waive" a gate.

If several workflows were sequenced, repeat Phases 4–6 for each, then give a short combined
summary (one line per workflow with its verdict).

---

## Notes for the runner

- **Gates are workflows.** Do not special-case storage or invent a "gate engine" — everything
  flows through `cascade_workflow` and the existing `workflow_definitions` / `workflow_executions`
  / `step_executions` tables.
- **The runner never blocks; the close-out does.** This skill surfaces and records verdicts —
  enforcement lives in ONE place, the `check_release_gates` RPC, consulted by the close-out
  writers (`cascade spec complete`, MCP `cascade_update_package`). Do not add blocking logic
  here. See `.cascade/specs/GATES.md` (Enforcement — built).
- **`/cse:qa` is this runner with `category='qa'`.** Keep QA behavior identical when invoked that
  way.
