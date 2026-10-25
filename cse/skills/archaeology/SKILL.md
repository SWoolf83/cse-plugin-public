---
name: archaeology
description: Use when you want historical decisions mined from repo docs, git history, and PRs and backloaded into Cascade — fixes cold-start.
allowed-tools: Bash(node *cascade.js *), Bash(git *), Bash(gh *), Read, Glob, Grep
---

# Cascade Archaeology — Retrospective Decision Mining

Mine historical decisions from an existing codebase to eliminate the cold-start problem. Instead of starting from zero when adopting Cascade, this skill extracts decisions that were already made and logs them retroactively.

## When to Use

- First time setting up Cascade on an existing project
- Onboarding a new team member who needs historical context
- Periodic sweep for forgotten initiatives or abandoned ideas
- Reconciling what was planned vs. what was built

## Phase 1: Markdown Document Mining

### Step 1: Discover documentation

Find all markdown files that are likely to contain decisions:

```bash
# Priority files — most likely to contain decisions
find . -type f \( -iname "ADR-*" -o -iname "ARCHITECTURE*" -o -iname "DECISION*" -o -iname "DESIGN*" -o -iname "CHANGELOG*" -o -iname "RFC-*" -o -iname "SPEC*" -o -iname "ROADMAP*" -o -iname "MIGRATION*" -o -iname "RETROSPECTIVE*" -o -iname "POSTMORTEM*" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" 2>/dev/null
```

Also check these directories:
- `docs/`, `.planning/`, `adr/`, `decisions/`, `rfcs/`, `specs/`

### Step 2: Read and analyze each document

For each document, read it and extract:

1. **Explicit decisions**: "We decided to...", "We chose X over Y", "The approach is..."
2. **Implicit decisions**: Technology choices, architectural patterns, convention establishments
3. **Abandoned ideas**: "We considered but rejected...", TODO items never completed
4. **Open questions**: Unresolved debates, deferred decisions

### Step 3: Log each decision

For each decision you identify with medium or high confidence:

```bash
node bin/cascade.js log-decision \
  --title "Decision title" \
  --chosen "What was chosen" \
  --reasoning "Why — include the source file reference" \
  --source "retroactive" \
  --source-ref "path/to/source-file.md" \
  --tags "archaeology,retrospective" \
  --category "technical" \
  --significance "standard"
```

### Step 4: Report findings

After mining, provide a structured summary:
- Total documents scanned
- Decisions extracted (grouped by confidence: high/medium/low)
- Abandoned initiatives surfaced (these are gold — forgotten features, deferred ideas)
- Open questions found
- Recommendations for further investigation

## Phase 2: Git Archaeology

After markdown mining, analyze git history:

```bash
# Recent significant commits (merge commits often signal decisions)
git log --merges --oneline --since="6 months ago" | head -30

# PRs if GitHub CLI available
gh pr list --state merged --json number,title,body,mergedAt --limit 30
```

Look for:
- Major dependency additions/removals in commit messages
- Architectural refactors
- PRs with extensive discussion that indicate a decision was debated
- Closed-but-not-merged PRs (abandoned approaches)

```bash
# Abandoned PRs — closed without merging
gh pr list --state closed --json number,title,body,closedAt --limit 20
```

## Phase 3: Cross-Reference (Advanced)

Compare mined decisions against current code state:
- Does a decision reference a dependency that no longer exists?
- Was an architectural pattern decided but never implemented?
- Are there conflicting decisions from different time periods?

Flag these as **drift** — the gap between what was decided and what exists now.

## Guidelines

- Only log decisions with medium or high confidence
- Include the source file in `--source-ref` so decisions are traceable
- Use `--source "retroactive"` to distinguish mined decisions from live-captured ones
- Tag all with `archaeology,retrospective` for filtering
- Group abandoned ideas separately — these are often the most valuable findings
- When in doubt about significance, default to `standard`
- Present abandoned ideas conversationally — "I found something interesting: it looks like there was a plan to X that never materialized. Is this still relevant?"

## CLI Alternative

For batch processing without Claude Code's interactive analysis:

```bash
# Dry run — see what would be extracted
node bin/cascade.js archaeology

# Process and log all medium+ confidence decisions
node bin/cascade.js archaeology --commit

# Scan a specific directory
node bin/cascade.js archaeology --path ./docs

# Output as JSON for further processing
node bin/cascade.js archaeology --json
```
