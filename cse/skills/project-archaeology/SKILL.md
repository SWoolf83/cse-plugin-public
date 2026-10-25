---
name: project-archaeology
description: "Use when a new org's workspace is empty and you want git history mined to auto-populate Cascade with packages, projects, and categories."
when_to_use: "Mine git history (PRs, merges, directory structure) to auto-populate Cascade with packages, projects, and categories. Solves the empty-workspace cold start problem for new orgs."
argument-hint: "[optional repo path — defaults to current directory]"
allowed-tools: Read, Glob, Grep, Bash(git *), Bash(node *cascade.js *), Bash(jq *), Bash(wc *), Bash(ls *), Bash(date *), Bash(pwd)
---

# Cascade Project Archaeology

Mine git repository history to auto-populate Cascade with packages, projects, and categories. This eliminates the empty-workspace problem when onboarding a new org and provides rich context for downstream AI spec agents.

## When to Use

- Onboarding a new organization to Cascade (cold start)
- Adding a new repo to an existing org's project graph
- Periodic backfill when Cascade wasn't tracking a repo's activity
- Building rich agent context before running specs for a new codebase

## Pipeline Overview

The archaeology pipeline runs in 4 stages:

1. **Extract** — Parse merge commits from git history, filter bots and reverts
2. **Group** — Cluster packages by primary directory of changed files
3. **Categorize** — Detect workspace config, parse READMEs, build category hierarchy
4. **Refine** — Haiku AI pass to merge/rename semantically related projects

## Instructions

You are a project archaeologist. Your job is to guide the user through the full pipeline with review at each stage.

### Phase 1: Setup

Determine the repo path:
- If `$ARGUMENTS` has a path, use it
- Otherwise, use the current working directory

Verify it's a git repo:
```bash
git rev-parse --is-inside-work-tree
```

Check for prior runs:
```bash
node bin/cascade.js archaeology-projects --status
```

### Phase 2: Extraction

Run the extraction:
```bash
node bin/cascade.js archaeology-projects --repo <path> --dry-run
```

Review the output with the user:
- How many merge commits were found?
- How many were excluded (bots, reverts)?
- How many were tagged as low signal?

If no merge commits found, the repo likely uses squash-merge. Inform the user that the extractor falls back to first-parent commits.

### Phase 3: Interactive Review

Show the user the project clusters and category hierarchy. Walk through:

1. **Project list** — "Here are the projects we found. Any look wrong?"
2. **AI suggestions** — "The AI suggests merging X into Y because Z. Accept?"
3. **Categories** — "Here's the category structure. Does this match how you think about the codebase?"

### Phase 4: Persistence

Once the user approves, run without dry-run:
```bash
node bin/cascade.js archaeology-projects --repo <path>
```

Report the results:
- Number of objectives (categories), bundles (projects), and packages (PRs) created
- Any errors
- Link to the Projects page in Cascade

### Phase 5: Context Verification

Verify the archaeology output is usable as agent context:
```bash
cat .cascade/archaeology/manifest.json | jq '.stats'
cat .cascade/archaeology/manifest.json | jq '.projects | length'
```

Confirm the manifest is accessible for future spec agents.

## Options

| Flag | Description |
|------|-------------|
| `--repo <path>` | Repository path (default: current dir) |
| `--org <id>` | Org ID override |
| `--dry-run` | Show what would be created without persisting |
| `--status` | Show last run info |
| `--max <n>` | Max merge commits to process (default: 500) |
| `--no-refine` | Skip AI refinement pass |
| `--json` | Output raw manifest as JSON |

## Guidelines

- Always start with `--dry-run` so the user can review before committing
- Present project clusters in a table format for easy scanning
- When showing AI suggestions, include the reasoning so the user can make informed decisions
- For large repos (500+ PRs), suggest running with `--max 200` first to validate the pipeline
- After persistence, remind the user to check the Projects page in the web app
- The manifest at `.cascade/archaeology/manifest.json` serves as AI agent context

## Cost

- Extraction: free (pure git operations)
- Grouping/categorization: free (local file parsing)
- AI refinement: ~$0.003 per Haiku call (1-2 calls for most repos)
- Total: typically under $0.01 per repo
