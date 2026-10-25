---
name: backfill
description: Retrospective work backfill — scan git repos, Cascade activity, or other sources to generate professional work entries for the Work Tracker.
argument-hint: "[source: 'git', 'cascade', or 'both'] [options: --weeks N, --repo /path, --author email]"
allowed-tools: Bash(git *), Bash(node *), Bash(date *), Bash(pwd), Bash(ls *), Bash(cat *), Read, Glob, Grep
---

# Cascade Retrospective Backfill

Generate professional work entries by scanning historical data and backfilling the Work Tracker. This is the "justify your work" skill — it turns raw commit history, decision logs, sessions, and research into clean, manager-readable entries.

## Sources

1. **Git commits** — scan any repo's commit history, group by author/week, synthesize into entries
2. **Cascade activity** — pull from decision_log, engineering_sessions, inquiries, explorations
3. **Both** — combine git + Cascade data for the most complete picture

## Behavior

### Step 1 — Determine Source and Parameters

If `$ARGUMENTS` specifies a source, use it. Otherwise, ask the user:
- "Do you want to backfill from git commits, Cascade activity, or both?"

Determine these parameters (ask if not provided):
- **Source**: `git`, `cascade`, or `both`
- **Weeks**: How far back to scan (default: 4)
- **Repo path**: For git source, which repo (default: current directory)
- **Author filter**: For git source, filter by email (optional)

### Step 2 — Gather Environment

Load the Cascade environment. The backfill scripts and `.env` live in the Cascade
repo checkout, referenced via `$CASCADE_ROOT`. It defaults to the current checkout
location and can be overridden with the `CASCADE_HOME` env var if the repo moves —
so a relocation is a one-variable change, not a skill edit.

> **Note:** shell state does not persist between separate command invocations, so the
> `CASCADE_ROOT=...` line is repeated at the top of each bash block below that uses it.

```bash
pwd
CASCADE_ROOT="${CASCADE_HOME:-/Users/stevewoolf/code/cascade}"
cat "$CASCADE_ROOT/.env" | grep -E "^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|CASCADE_ORG_ID|CASCADE_USER_ID)" | sed 's/=.*/=✓/'
```

### Step 3 — Dry Run First

Always start with a dry run to show the user what will be generated.

**For git source:**
```bash
CASCADE_ROOT="${CASCADE_HOME:-/Users/stevewoolf/code/cascade}"
node "$CASCADE_ROOT/cascade-web/scripts/git-backfill.mjs" --repo <repo-path> --weeks <N> --dry-run
```

**For Cascade activity:**
```bash
CASCADE_ROOT="${CASCADE_HOME:-/Users/stevewoolf/code/cascade}"
node "$CASCADE_ROOT/cascade-web/scripts/retrospective-backfill.mjs" --weeks <N> --dry-run
```

**For both:** run both scripts in dry-run mode.

### Step 4 — Confirm with User

Present the dry-run results and ask:
- "Here's what I'd generate — [N] work entries from [source]. Want me to write these to the tracker?"
- If they want to target an existing project: "Which project should I add these to? Or should I create a new one?"
- If they want to adjust: "Want me to change the time window, filter by author, or modify anything?"

### Step 5 — Execute

Once confirmed, run without `--dry-run`:

```bash
CASCADE_ROOT="${CASCADE_HOME:-/Users/stevewoolf/code/cascade}"
node "$CASCADE_ROOT/cascade-web/scripts/git-backfill.mjs" --repo <repo-path> --weeks <N> [--project <id>]
```

or

```bash
CASCADE_ROOT="${CASCADE_HOME:-/Users/stevewoolf/code/cascade}"
node "$CASCADE_ROOT/cascade-web/scripts/retrospective-backfill.mjs" --weeks <N> [--project <id>]
```

### Step 6 — Report

After execution, summarize:
- How many entries were created
- Which project they were added to
- The public tracker URL: `/track/<org-slug>`
- Suggest: "You can view these in the Work Tracker panel in the sidebar, or share the public link with your team."

## Advanced Options

### Model Selection

Both scripts accept `--model` to swap the synthesis model:

```bash
# Use Sonnet for higher-quality synthesis
node .../git-backfill.mjs --model claude-sonnet-4-5-20250929 --repo . --weeks 2

# Use Haiku for fast, cheap runs
node .../git-backfill.mjs --model claude-haiku-4-5-20251001 --repo . --weeks 4
```

Recommend Haiku for routine weekly backfills, Sonnet for important retrospectives or presentations.

### Multi-Repo Scanning

For teams with multiple repos, run git-backfill once per repo, targeting the same project:

```bash
# First repo — creates the project
node .../git-backfill.mjs --repo /path/to/frontend --weeks 4
# Note the project ID from output

# Additional repos — target same project
node .../git-backfill.mjs --repo /path/to/backend --weeks 4 --project <id>
node .../git-backfill.mjs --repo /path/to/infra --weeks 4 --project <id>
```

### Author Filtering

For extracting one person's work from a shared repo:

```bash
node .../git-backfill.mjs --repo . --author "steve@example.com" --weeks 4
```

## Conversation Style

- Be direct: "I found 45 commits over 2 weeks. Here's the breakdown..."
- Show the dry run output verbatim — let the user see exactly what will be created
- If the output looks thin, suggest a wider time window
- If it looks noisy, suggest author filtering or a different model
- After writing, remind them about the public tracker URL for sharing
