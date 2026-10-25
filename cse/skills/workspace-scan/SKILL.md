---
name: workspace-scan
description: Use when you want to trigger a Google Workspace context scan — analyzes Drive, calendar, email metadata, and org signals via gws CLI.
allowed-tools: Bash(node *cascade.js *)
---

# Cascade Workspace Scan

Trigger a Google Workspace context scan for your organization. The scan uses the `gws` CLI (Google Workspace CLI with MCP support) to analyze 7 dimensions of your workspace:

1. Drive Structure (folders, shared drives, file counts by type, storage)
2. Recent Documents (last 30 days activity, key topics, active collaborators)
3. Sheets Inventory (spreadsheets with operational data — budgets, trackers, KPIs)
4. Calendar Patterns (meeting frequency, recurring events, focus time ratio)
5. Email Patterns (metadata only — top communication patterns, thread volume)
6. Decision Artifacts (docs with decision/proposal/strategy/roadmap keywords)
7. Organization Signals (team structure inferred from sharing and calendar patterns)

## Prerequisites

- `gws` CLI installed (`gws 0.5.0+`)
- Google Workspace account authenticated via `gws auth login`
- gws MCP server configured in the daemon

## Usage

Run a workspace scan:
```bash
node bin/cascade.js scan --type workspace
```

Run both codebase and workspace scans together:
```bash
node bin/cascade.js scan --type comprehensive
```

Check the status of the latest workspace scan:
```bash
node bin/cascade.js scan --status --type workspace
```

## Privacy

- All operations are READ-ONLY
- Email body content is never read — only metadata (sender, recipient, thread counts)
- Document contents are not read — only titles and metadata
- Results are stored per-org and used to enrich decision frameworks

## How It Works

The scan runs as a background engineering session. The daemon spawns a Claude Code session with gws MCP tools enabled. Once completed, decision frameworks submitted through Cascade will be automatically enriched with your workspace context (meeting patterns, document activity, org signals).
