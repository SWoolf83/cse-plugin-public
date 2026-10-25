---
name: push
description: "Push current project state to Cascade as a trackable package. Captures git state, plans, specs, and session context."
argument-hint: "[package title or existing package ID to update]"
allowed-tools: Read, Glob, Grep, Bash(git *), Bash(date *), Bash(pwd), Bash(ls *)
---

# Cascade Push

Snapshot the current project state into a Cascade package for tracking. Creates a new package or updates an existing one with current git state, plans, and context.

## Instructions

You create a point-in-time record of where work stands — git state, active plans, specs, recent changes — and persist it as a package in Cascade. Think of it as a structured status update that others in the org can access.

---

### Phase 1 — Gather

Collect project state in parallel:

1. **Git state:**
   ```
   Bash(git status --short)
   Bash(git log --oneline -10)
   Bash(git diff --stat)
   Bash(git branch --show-current)
   ```

2. **Active plans and specs:**
   ```
   Glob(.cascade/specs/*.json)
   Glob(.planning/*.md)
   ```
   Read recent spec files (by date in filename) to understand active work.

3. **Project context:**
   ```
   Bash(pwd)
   Bash(date +%Y-%m-%dT%H:%M:%S)
   ```
   Check for CLAUDE.md, README.md, or package.json for project identity.

4. **Recent session context:**
   ```
   Glob(.cascade/context/*.md)
   ```
   Read any materialized context for org knowledge.

---

### Phase 2 — Synthesize

Build a package description from the gathered state:

**Description template:**
```
Project state snapshot for [project name] on [branch].

## Current State
- Branch: [branch name]
- [N] uncommitted changes, [M] commits ahead of main
- Last commit: [hash] — [message]

## Active Work
[Summary of what's being worked on, derived from specs/plans/git log]

## Key Files Changed
[Top 5-10 files from git diff --stat]

## Context
[Any relevant decisions, patterns, or notes from .cascade/context/]
```

**Type data (JSONB):**
```json
{
  "branch": "feature/rate-limiting",
  "commit_hash": "abc1234",
  "uncommitted_changes": 5,
  "commits_ahead": 3,
  "project_path": "/path/to/project",
  "snapshot_time": "2026-05-08T14:30:00"
}
```

---

### Phase 3 — Create or Update

Determine the action based on `$ARGUMENTS`:

**If $ARGUMENTS is a UUID** (matches `[0-9a-f-]{36}`):
- This is an update to an existing package
- Call `cascade_update_package` with:
  - `package_id`: the UUID
  - `description`: updated state snapshot
  - `type_data`: current git state (shallow-merged with existing)
- Report: "Updated package [short-id] with current state."

**If $ARGUMENTS is text:**
- Use it as the package title
- Call `cascade_create_package` with:
  - `title`: the provided text
  - `description`: synthesized state snapshot
  - `package_type`: "task" (or infer from context — "feature", "bug-fix", etc.)
  - `type_data`: git state object
  - `executor_type`: "human"
- Report: "Created package '[title]' ([short-id])."

**If $ARGUMENTS is empty:**
- Generate a title from git state: "[branch] — [last commit summary]"
- Confirm with user: "I'll push this as '[generated title]'. Good?"
- Then create as above

---

### Phase 4 — Confirm

Report what was pushed:

```
Pushed to Cascade:

  Package: [title] ([short-id])
  Status: draft
  Branch: [branch]
  Snapshot: [timestamp]

To update later: /cse:push [package-id]
To view in app: check the Packages page
```

---

## Conversation Style

- Fast and minimal — this is a utility, not a conversation
- Gather state silently, synthesize quickly, push and confirm
- Don't ask unnecessary questions — infer from context
- If the project state is clean (no changes, no active work), say so and ask if they still want to push

## Quality Gates

1. Description includes actual git state, not placeholders
2. Type data has real values from the gathered state
3. UUID detection is accurate (don't confuse short text with IDs)
4. Update mode preserves existing type_data via shallow merge
