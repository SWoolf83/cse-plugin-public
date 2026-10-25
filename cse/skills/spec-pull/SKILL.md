---
name: spec-pull
description: Use to pull a package into CSE — a specific package by id (the Spec-it handoff) or a pending spec request picked from the queue.
when_to_use: Pull a package into CSE for processing. With a package-id argument (the `/cse:spec-pull <package-id>` command copied from the /work Findings band, or any package id) it fetches THAT package directly and dispatches it to /cse:spec. With no argument it fetches queued spec_request packages, lets you select one, assesses complexity, and dispatches with appropriate depth.
argument-hint: "[package-id]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Task, Skill, cascade_pull_package
---

# Cascade Spec Pull — Queue-to-CSE Pipeline

Pull a package into the Cascade Spec Engine and run it with appropriate depth
based on complexity assessment. Two entry modes:

- **`/cse:spec-pull <package-id>`** — the DIRECT path: fetch that exact
  package (ANY package_type — spec requests, okr-seam findings, tasks…) and
  make it the spec target. This is the command the /work Findings band's
  "Spec it" affordance copies to the clipboard.
- **`/cse:spec-pull`** (no argument) — the QUEUE path: list pending
  `spec_request` packages and pick one.

## Instructions

Follow these 4 phases in order.

---

### Phase 1 — Fetch (direct by id, or queue)

**1a. DIRECT PATH — an argument was provided.**

If the invocation carries an argument that looks like a package id (a UUID),
fetch THAT package directly — do NOT list the queue:

1. Fetch it with the `cascade_pull_package` MCP tool
   (`package_id: <the id>`). If the MCP server is unavailable, fall back to
   `Bash(node bin/cascade.js open <package-id> 2>&1)`.
2. If the package cannot be found (bad id, wrong org, deleted): report that
   plainly and stop — do not silently fall back to the queue.
3. This works for ANY `package_type`, not just `spec_request`. Present the
   package as the spec target: title, status, description, and — for
   okr-seam findings (`type_data.package_type === 'okr_seam_finding'`) — the
   `type_data.finding` payload (importance, `topic_slug`, `motivating_okr`,
   `detail`), which is exactly the context the spec run should serve.
4. Store:
   - `PACKAGE_ID`: the argument id (enables the spec writeback linkage —
     `/cse:spec` persists with `--package-id` so the spec artifact lands back
     on this package)
   - `RAW_INTENT`: the package title + description (+ finding detail when
     present) composed into one intent statement
   - `STRUCTURED_INTENT`: `type_data.structured_intent` if present, else null
   - `CSE_MODE_HINT`: `type_data.cse_mode` if present, else `'auto'`
5. Skip the rest of Phase 1 and Phase 2 step 1 (the package is already
   loaded); continue at Phase 2 step 2.

**1b. QUEUE PATH — no argument.** Proceed exactly as follows.

1. Run the spec queue command to see pending requests:
   ```
   Bash(node bin/cascade.js spec queue --json 2>&1)
   ```

2. If the queue is empty, inform the user:
   "No pending spec requests in the queue. Create one in the web app's Brain Dump (Spec mode) or ask a team member to submit one."
   Stop here.

3. If there are pending requests, present them via AskUserQuestion:
   - header: "Spec Request Queue"
   - question: List each request with its title, CSE mode hint, and age. Format as a numbered list.
   - options: The titles of available requests (max 5), plus "Cancel"

4. If user selects "Cancel", stop.

5. Store the selected package's data:
   - `PACKAGE_ID`: The UUID of the selected package
   - `RAW_INTENT`: The raw_intent from type_data
   - `STRUCTURED_INTENT`: The structured_intent from type_data (may be null)
   - `CSE_MODE_HINT`: The cse_mode from type_data (auto/full/abbreviated)

---

### Phase 2 — Load Package Context

1. Fetch the full package details for additional context:
   ```
   Bash(node bin/cascade.js spec queue --json 2>&1)
   ```
   Extract the selected package's full details from the JSON output.

2. If `STRUCTURED_INTENT` exists, display it as context:
   ```
   Structured Intent (AI-extracted):
   - Summary: {intentSummary}
   - Vertical: {verticalHint}
   - Scope: {scopeKeywords}
   - Complexity: {complexityEstimate}
   ```

---

### Phase 3 — Complexity Assessment

Assess the complexity of the request to determine CSE depth.

1. **Check for explicit CSE mode hint:**
   - If `CSE_MODE_HINT` = `'full'`: always use full CSE (all discovery phases). Skip assessment.
   - If `CSE_MODE_HINT` = `'abbreviated'`: use abbreviated CSE. Skip assessment.
   - If `CSE_MODE_HINT` = `'auto'` or null: proceed with assessment.

2. **Auto-assessment (when cse_mode = 'auto'):**
   Load codebase context if available:
   ```
   Read .cascade/context/scans/codebase-latest.json
   ```

   Score complexity based on these factors:
   - **Systems touched:** Count distinct systems/components mentioned in the intent
     - 1-2 systems → low
     - 3-4 systems → medium
     - 5+ systems → high
   - **Ambiguity level:** How many interpretation choices exist?
     - Clear single path → low
     - Some design choices → medium
     - Fundamental architectural decisions → high
   - **Integration depth:** Does it touch external services, databases, APIs?
     - Self-contained → low
     - 1-2 integrations → medium
     - Multiple external dependencies → high

   **Decision matrix:**
   - ALL factors low → `skip_discovery` (generate spec directly from intent)
   - ANY factor high OR 2+ medium → `full` (complete CSE with all discovery phases)
   - Otherwise → `abbreviated` (Phase 1 with 1-2 targeted questions only)

3. **Report assessment:**
   ```
   Complexity Assessment
   ─────────────────────
   Systems:    {low/medium/high} ({count} systems identified)
   Ambiguity:  {low/medium/high}
   Integration:{low/medium/high}

   CSE Depth:  {full / abbreviated / skip_discovery}
   ```

---

### Phase 4 — Dispatch to CSE

Based on the determined CSE depth:

**FULL CSE (full discovery):**
Invoke the `spec` skill (`/cse:spec`) with the raw intent and package-id:
```
Skill(skill: "spec", args: "{RAW_INTENT} --package-id {PACKAGE_ID}")
```

The /cse:spec skill will run the complete pipeline: discovery questions, spec generation, persistence (with --package-id for writeback), and execution.

**ABBREVIATED CSE (minimal discovery):**
Invoke /cse:spec but instruct it to limit Phase 1:
```
Skill(skill: "spec", args: "{RAW_INTENT} --package-id {PACKAGE_ID} --abbreviated")
```

When the CSE skill sees `--abbreviated`, it should:
- Skip dream extraction (the raw intent IS the dream)
- Ask only 1-2 targeted narrowing questions focused on ambiguity resolution
- Proceed directly to clarity gate

**SKIP DISCOVERY (direct spec generation):**
For low-complexity requests, construct a pre-answered context and go straight to spec generation.

1. Build a synthetic discovery transcript from the available intent:
   ```json
   {
     "discoveryTranscript": [
       {
         "phase": "pre_context",
         "note": "Complexity assessment determined this is a low-complexity request. Discovery skipped — generating spec directly from structured intent."
       }
     ]
   }
   ```

2. Invoke /cse:spec with skip flag:
   ```
   Skill(skill: "spec", args: "{RAW_INTENT} --package-id {PACKAGE_ID} --skip-discovery")
   ```

   When CSE sees `--skip-discovery`, it should:
   - Skip Phase 1 entirely
   - Use the raw_intent + structured_intent to populate Phase 2 directly
   - Still run the clarity gate as a confirmation
   - Proceed normally through Phases 3-6

---

### Error Handling

- If the spec queue command fails (auth expired, network error): inform the user and suggest `cascade login` if needed.
- If the selected package has been claimed by someone else (race condition): inform the user and re-fetch the queue.
- If CSE dispatch fails: report the error clearly and offer to retry or skip.

---

### Notes

- This skill bridges the web app (where spec requests are created) with Claude Code (where CSE runs on interactive tokens).
- The economic model: web app uses minimal API calls (optional Sonnet extraction), while the heavy AI work happens on the user's Claude Code Max Plan tokens.
- After CSE completes, the spec is written back to the database and the package's `spec_artifact_id` is updated, making it visible as "Spec Ready for Review" in the web app.
