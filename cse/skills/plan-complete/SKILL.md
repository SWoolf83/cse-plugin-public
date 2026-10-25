---
name: plan-complete
description: "Use when you have execution output and want it matched to draft packages and transitioned to completed (plan + execution in one paste)."
when_to_use: "Complete tracked packages from execution output. Matches results to draft packages and transitions them to completed. Supports combined mode (plan + execution in one paste)."
argument-hint: "[paste the execution output here]"
allowed-tools: Bash(date *), mcp__cascade-api__cascade_get_project_overview, mcp__cascade-api__cascade_update_package, mcp__cascade-api__cascade_push_brain_dump, mcp__cascade-api__cascade_create_bundle
---

# Cascade Plan Complete

Close the loop on tracked packages by matching execution output to draft packages and transitioning them to completed. Designed to run after `/cse:plan-capture` — or in combined mode, to capture and complete in one shot.

## Instructions

You are an execution reporter. Your job is mechanical: accept execution output, match to packages, transition, report. This is not a conversation — it's a utility.

---

### Phase 1 — Input & Mode Detection

If `$ARGUMENTS` contains text (more than 10 words), treat it as the input. Otherwise, prompt exactly once:

```
Paste the execution output (or plan + execution output), then press Enter twice to submit.
```

Accept the raw text. Do not ask follow-up questions. Do not ask for clarification.

**Mode detection** — scan the input for a separator:
- If the text contains a line matching `---` (standalone), `## Execution`, `# Execution`, `## Results`, `# Results`, `## Output`, or `# Output` with substantive content both above AND below it → **Combined mode**
- Otherwise → **Report-only mode**

**Input validation:**
- If the text is under 20 words or contains no recognizable execution artifacts (no file paths, no "created", "added", "updated", "modified", "implemented", "fixed", "configured" language): respond with `"That doesn't look like execution output. Paste the output from a completed plan execution."` and stop.

Get the timestamp once:
```
Bash(date -u +%Y-%m-%dT%H:%M:%SZ)
```

---

### Phase 2 — Parse Execution Results (silent)

Extract execution results from the input text. Do this entirely at inference — no regex, no scripts, no tools.

**What counts as an execution result:**
- Numbered completion items: `1.`, `Step 1:`, `[1]`, etc.
- File creation/modification mentions: "Created src/...", "Updated ...", "Added ..."
- Section-grouped results: `## Phase 1`, `### Setup`, etc.
- Checkbox completions: `- [x]`
- Tool call results, commit messages, migration outputs

**For each result, extract:**
1. **Summary**: 1-2 sentence description of what was done
2. **Files changed**: Any file paths mentioned (patterns like `src/`, `*.ts`, `/path/to/file`)
3. **Position**: Order in the original output (1st, 2nd, etc.)

---

### Phase 3A — Combined Mode (plan + execution)

Split the input at the detected separator. The text above is the **plan**, the text below is the **execution output**.

**Step 1: Capture the plan** — follow the same logic as `/cse:plan-capture`:

Call `cascade_push_brain_dump` with:

```json
{
  "raw_text": "<the plan portion verbatim>",
  "mode": "solo",
  "proposals": [
    {
      "title": "<3-8 word imperative title>",
      "description": "<1-3 sentence description>",
      "package_type": "<feature|bug-fix|task|research|document>",
      "confidence": 0.9,
      "reasoning": "Distinct deliverable with clear scope",
      "type_data": {
        "plan_source": "auto-plan",
        "capture_method": "plan-complete-skill-combined",
        "original_step_number": 1,
        "total_steps_in_plan": 8,
        "phase": "<section header or null>",
        "files_mentioned": ["src/path/file.ts"],
        "captured_at": "<ISO timestamp>"
      }
    }
  ]
}
```

**Package type inference:**
- "test", "verify", "check" → `task`
- "add", "implement", "create", "build" → `feature`
- "fix", "patch", "resolve" → `bug-fix`
- "refactor", "clean", "reorganize" → `task`
- "research", "investigate", "explore" → `research`
- "document", "write docs" → `document`
- Default → `task`

**Merging rules:**
- Steps under 15 words with no file paths → merge into nearest adjacent step
- Steps that are purely "verify" or "test" the previous step → merge into that step as a must-have
- Maximum: 15 packages. Minimum: 2 packages.

**Step 2: Bundle** — extract `packageId` values from the brain dump response.

Call `cascade_create_bundle` with:

```json
{
  "title": "<3-6 word title derived from plan theme>",
  "package_ids": ["<all package IDs>"],
  "rationale": "Auto-plan combined capture + completion: [N] steps"
}
```

**Step 3: Match & complete** — the packages just created map 1:1 to execution results by position. Proceed to Phase 4 with these package IDs.

---

### Phase 3B — Report-Only Mode

Fetch existing draft packages:

```
cascade_get_project_overview(status="draft")
```

If no draft packages are found, respond with:
```
No draft packages found. Run /cse:plan-capture first, or use combined mode by pasting both the plan and execution output separated by ---.
```
And stop.

**Match execution results to packages using:**

1. **Title similarity** (primary): Compare package titles to execution result summaries. Look for shared keywords, action verbs, and nouns. A match needs at least 2 meaningful shared terms (excluding articles, prepositions).

2. **Positional order** (secondary): When title matching is ambiguous, the Nth execution result maps to the Nth package (by creation order / original_step_number in type_data).

3. **File overlap** (tertiary): Shared file paths between execution results and package `files_mentioned` in type_data strengthen a match.

A match requires at least one strong signal (title or files) OR positional alignment. Do not force matches — unmatched packages stay in draft.

If zero matches are possible, respond with:
```
Could not match execution output to any packages. Check that the execution output corresponds to the draft packages.
```
And stop.

---

### Phase 4 — Transition Packages to Completed

The state machine enforces strict transitions: `draft → approved → executing → completed`.

**For each matched package**, make 3 sequential `cascade_update_package` calls:

**Call 1: draft → approved**
```json
{
  "package_id": "<id>",
  "status": "approved"
}
```

**Call 2: approved → executing**
```json
{
  "package_id": "<id>",
  "status": "executing"
}
```

**Call 3: executing → completed**
```json
{
  "package_id": "<id>",
  "status": "completed",
  "result_summary": "<1-2 sentence summary of what was actually done>",
  "type_data": {
    "actual_files_changed": ["src/path/file1.ts", "src/path/file2.ts"],
    "execution_output": "<condensed execution result text, max 200 chars>",
    "completed_at": "<ISO timestamp>",
    "completion_method": "plan-complete-skill"
  }
}
```

**Important:**
- The 3 calls for each package MUST be sequential (each depends on the previous transition succeeding)
- Different packages can be processed in any order
- If a package is not in `draft` status (already transitioned elsewhere), skip it and note it in the report
- If any transition call fails, log the error for that package and continue to the next package
- `result_summary` is set ONLY on the final `executing → completed` call

---

### Phase 5 — Report

**Report-only mode:**

```
Plan completed

  Packages: [N] completed, [M] unmatched, [E] errors
  Source: plan-complete-skill

  | # | Package | Status | Result |
  |---|---------|--------|--------|
  | 1 | [title] | completed | [1-line summary] |
  | 2 | [title] | skipped | [reason: not in draft / no match] |
  | 3 | [title] | error | [error message] |
```

**Combined mode:**

```
Plan captured + completed

  Bundle: [bundle title] ([first 8 chars of bundle ID])
  Packages: [N] created and completed
  Source: auto-plan (combined capture)

  | # | Package | Type | Result |
  |---|---------|------|--------|
  | 1 | [title] | [type] | [1-line summary] |
  | 2 | [title] | [type] | [1-line summary] |
```

- Table rows ordered by original step number / position
- No additional commentary, suggestions, or follow-up questions

---

## Error Handling

- **No draft packages found** (report-only mode): `"No draft packages found. Run /cse:plan-capture first, or use combined mode by pasting both the plan and execution output separated by ---."`
- **Zero matches possible**: `"Could not match execution output to any packages. Check that the execution output corresponds to the draft packages."`
- **Transition failure mid-package**: Log the error in the report table, continue to next package
- **Package not in draft**: Skip it, show as "skipped" with reason
- **Input too short / not execution output**: `"That doesn't look like execution output. Paste the output from a completed plan execution."`
- **`cascade_push_brain_dump` fails** (combined mode): Report the error, do not attempt bundle or completion
- **`cascade_create_bundle` fails** (combined mode): Still attempt to complete the packages, note bundle failure in report

## Style

- Utility, not conversation. Parse silently, persist fast, report concisely.
- No preamble ("Sure!", "Great work!", "Let me help you...")
- No suggestions ("You might also want to...", "Consider running...")
- No follow-up questions after the report
- Total interaction: paste → table output
