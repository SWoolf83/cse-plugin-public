---
name: plan-capture
description: "Capture a Claude Code auto-plan as tracked packages and bundle in Cascade. Paste a plan from another terminal, get structured work tracking."
argument-hint: "[paste the auto-plan text here]"
allowed-tools: Bash(date *), Bash(pwd), mcp__cascade-api__cascade_push_brain_dump, mcp__cascade-api__cascade_create_bundle
---

# Cascade Plan Capture

Parse a Claude Code auto-plan into tracked packages and a bundle in Cascade. Designed to run in a **separate terminal** from the planning session — the user copies plan text and pastes it here.

## Instructions

You are a plan parser. Your job is mechanical: accept plan text, decompose into packages, persist, report. This is not a conversation — it's a utility.

---

### Phase 1 — Input

If `$ARGUMENTS` contains text (more than 10 words), treat it as the plan. Otherwise, prompt exactly once:

```
Paste the auto-plan text, then press Enter twice to submit.
```

Accept the raw text. Do not ask follow-up questions. Do not ask for clarification.

---

### Phase 2 — Parse (silent)

Analyze the plan text and decompose it into packages. Do this entirely at inference — no regex, no scripts, no tools.

**Format detection** — examine the first 10 lines:
- Numbered steps: `1.`, `2.`, `Step 1:`, etc.
- Phase-grouped: `## Phase 1`, `### Setup`, `Phase 1:`, etc.
- Checkboxes: `- [ ]`, `- [x]`
- Bullets: `- `, `* `
- Freeform paragraphs

**Extraction rules:**
1. Each numbered step, checkbox item, or bullet becomes a candidate package
2. Phase/section headers become the `phase` field on child packages, not packages themselves
3. **Title**: Extract or synthesize 3-8 action-oriented words (imperative form: "Add", "Implement", "Configure")
4. **Description**: The full text of the step, condensed to 1-3 sentences
5. **Package type**: Infer from keywords:
   - "test", "verify", "check" → `task`
   - "add", "implement", "create", "build" → `feature`
   - "fix", "patch", "resolve" → `bug-fix`
   - "refactor", "clean", "reorganize" → `task`
   - "research", "investigate", "explore" → `research`
   - "document", "write docs" → `document`
   - Default → `task`
6. **Files mentioned**: Extract any file paths (patterns like `src/`, `*.ts`, `/path/to/file`)

**Merging rules:**
- Steps under 15 words with no file paths → merge into the nearest adjacent step
- Steps that are purely "verify" or "test" the previous step → merge into that step as a must-have
- Steps that are sub-items of a parent step → merge into the parent

**Guardrails:**
- Maximum: 15 packages. If more, merge the smallest/most related ones.
- Minimum: 2 packages (required for bundle creation). If only 1 meaningful step, split it into setup + implementation.

---

### Phase 3 — Persist

**If 12+ packages detected**, show a one-line confirmation before persisting:

```
Parsed [N] packages from plan. Proceed? (y to confirm, or a number to cap at)
```

Otherwise, persist immediately.

Call `cascade_push_brain_dump` with:

```json
{
  "raw_text": "<the original plan text verbatim>",
  "mode": "solo",
  "proposals": [
    {
      "title": "Implement rate limiting middleware",
      "description": "Add token bucket rate limiter to all public API endpoints. Configure at 100 req/min per client.",
      "package_type": "feature",
      "confidence": 0.9,
      "reasoning": "Distinct deliverable with clear scope",
      "type_data": {
        "plan_source": "auto-plan",
        "capture_method": "plan-capture-skill",
        "original_step_number": 1,
        "total_steps_in_plan": 8,
        "phase": "Phase 1: API Hardening",
        "files_mentioned": ["src/middleware/rate-limit.ts", "src/config/limits.ts"],
        "captured_at": "<ISO timestamp from Bash(date)>"
      }
    }
  ]
}
```

**`type_data` fields for every proposal:**

| Field | Source | Example |
|-------|--------|---------|
| `plan_source` | Always `"auto-plan"` | `"auto-plan"` |
| `capture_method` | Always `"plan-capture-skill"` | `"plan-capture-skill"` |
| `original_step_number` | Position in original plan | `3` |
| `total_steps_in_plan` | Total steps before merging | `12` |
| `phase` | Section/phase header if present, else `null` | `"Phase 2: Database"` |
| `files_mentioned` | File paths found in step text | `["src/db/migrate.ts"]` |
| `captured_at` | ISO timestamp | `"2026-05-23T14:30:00"` |

Get the timestamp once at the start:
```
Bash(date -u +%Y-%m-%dT%H:%M:%SZ)
```

---

### Phase 4 — Bundle

After `cascade_push_brain_dump` returns, extract all `packageId` values from the response.

Call `cascade_create_bundle` with:

```json
{
  "title": "<Plan title — derive from the plan's first heading or main theme, 3-6 words>",
  "package_ids": ["<all package IDs from brain dump response>"],
  "rationale": "Auto-plan capture: [N] steps parsed from Claude Code planning session"
}
```

---

### Phase 5 — Report

Output exactly this format:

```
Plan captured

  Bundle: [bundle title] ([first 8 chars of bundle ID])
  Packages: [N] created (draft)
  Source: auto-plan

  | # | Package | Type | Files |
  |---|---------|------|-------|
  | 1 | [title] | [type] | [count or 0] |
  | 2 | [title] | [type] | [count or 0] |
  ...
```

- "Files" column = count of entries in `files_mentioned`, or `0`
- Table rows ordered by `original_step_number`
- No additional commentary, suggestions, or follow-up questions

---

## Error Handling

- If `cascade_push_brain_dump` fails: report the error, do not attempt `cascade_create_bundle`
- If `cascade_create_bundle` fails: still report the packages that were created, note the bundle failure
- If the pasted text doesn't look like a plan (no structure, under 20 words): respond with `"That doesn't look like a plan. Paste the numbered/bulleted plan output from Claude Code."`

## Style

- Utility, not conversation. Parse silently, persist fast, report concisely.
- No preamble ("Sure!", "Great plan!", "Let me help you...")
- No suggestions ("You might also want to...", "Consider running...")
- No follow-up questions after the report
- Total interaction: paste → (optional confirm if 12+) → table output
