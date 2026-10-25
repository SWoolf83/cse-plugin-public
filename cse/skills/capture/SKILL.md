---
name: capture
description: "Use when you've finished significant work and want it captured as a completed tracked package in Cascade (gathers git/plan/session state)."
when_to_use: "Capture completed work as a tracked package in Cascade. Gathers git state, plan context, and session activity, then logs it as a completed package for individual task tracking."
argument-hint: "[optional title — auto-generated from git state if omitted]"
allowed-tools: Read, Glob, Grep, Bash(git *), Bash(date *), Bash(pwd), Bash(ls *), Bash(node *cascade.js *)
---

# Cascade Capture

Log completed work as a tracked package in Cascade. Designed for retroactive capture after auto-plan executions, ad-hoc coding sessions, or any work that didn't go through the formal spec engine but is still worth tracking.

## Instructions

You are a work recorder. Your job is fast and deterministic: gather what happened, synthesize a clean summary, persist it, done. This is not a conversation — it's a utility.

---

### Phase 1 — Gather (silent, immediate)

Collect everything relevant in parallel:

1. **Git state:**
   ```
   Bash(git log --oneline -15)
   Bash(git diff --stat HEAD~5 HEAD)
   Bash(git branch --show-current)
   Bash(git log --format="%H %s" -5)
   ```

2. **Session context:**
   ```
   Bash(pwd)
   Bash(date +%Y-%m-%dT%H:%M:%S)
   ```

3. **Plans and specs (if any):**
   ```
   Glob(.cascade/specs/*.json)
   Glob(.planning/*.md)
   ```
   Read the most recent spec or plan file if one exists — it may describe the work that was just done.

4. **Decisions logged this session:**
   ```
   Bash(node bin/cascade.js log-decision --list --limit 5)
   ```

---

### Phase 2 — Synthesize

Build three fields from the gathered context:

**Title** (3-8 words, action-oriented):
- If `$ARGUMENTS` has text, use it as the title
- If empty, generate from the most prominent recent commits
- Examples: "Add rate limiting middleware", "Refactor auth module to JWT", "Fix daemon health check"

**Description** (1-5 sentences):
- What changed and why
- Key files or modules affected
- Any decisions made during the work
- Branch name and commit range

**Result summary** (1-2 sentences):
- The outcome: what's different now
- "Rate limiting is live on all public endpoints, using token bucket at 100 req/min"

**Type data** (structured JSONB):
```json
{
  "branch": "main",
  "commit_range": "abc1234..def5678",
  "commits": ["abc1234 — message", "def5678 — message"],
  "files_changed": 8,
  "insertions": 245,
  "deletions": 12,
  "plan_source": "auto-plan" | "spec-engine" | "ad-hoc",
  "captured_at": "2026-05-08T14:30:00"
}
```

**Package type** — infer from the work:
- New functionality → `feature`
- Bug fix → `bug-fix`
- Code cleanup → `refactor`
- Config/infra → `task`
- Investigation → `research`
- Default to `task`

---

### Phase 3 — Persist

Call the `cascade_log_completed_work` MCP tool with:
- `title`: synthesized title
- `description`: synthesized description
- `result_summary`: synthesized outcome
- `package_type`: inferred type
- `type_data`: structured git metadata

---

### Phase 4 — Confirm

Report concisely:

```
Captured: [title] ([short-id])
Type: [package_type] | Status: completed
Branch: [branch] | Commits: [N]
Files: [N] changed (+[ins] -[del])
```

---

## When to Use This Skill

This skill is designed for three scenarios:

1. **After auto-plan execution** — Claude Code entered planning mode on its own, executed a plan, and now the work should be recorded
2. **End of ad-hoc session** — You've been coding for a while without formal spec tracking and want to log what happened
3. **Proactive capture** — The agent notices significant work was done and offers to capture it

## Proactive Behavior

If you are an AI agent and you just completed significant work (3+ files changed, architectural decisions made, or a plan was executed), you SHOULD suggest running this skill:

> "That was a solid chunk of work. Want me to `/cse:capture` it for tracking?"

Keep it to one line. Don't nag — offer once.

## Style

- Fast and silent — gather, synthesize, persist, confirm
- No unnecessary questions — infer everything from git and context
- The only question allowed: confirming the title if `$ARGUMENTS` was empty and the auto-generated title seems ambiguous
- Total output: the 4-line confirmation block, nothing more
