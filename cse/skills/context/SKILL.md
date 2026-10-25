---
name: context
description: Show what Cascade knows about this repository — latest scan results, tech stack, architecture, and enrichment data.
allowed-tools: Bash(node *cascade.js *), Read, Glob
---

# Cascade Context

Show what Cascade knows about this repository from local context files and the latest codebase scan.

## Quick Path: Local Context

First check if synced context exists locally (much faster than Supabase queries):

```bash
ls .cascade/context/ 2>/dev/null
```

If `.cascade/context/` exists, read the key files:
- `.cascade/context/system/org-context.json` — org name, member count
- `.cascade/context/system/active-assumptions.json` — current unfalsified assumptions
- `.cascade/context/scans/codebase-latest.json` — latest codebase scan (tech stack, architecture, dependencies, schema, etc.)
- `.cascade/context/scans/workspace-latest.json` — latest workspace scan (if available)
- `.cascade/context/patterns/patterns.json` — top decision patterns by frequency
- `.cascade/context/portfolio/documents.json` — portfolio document summaries
- `.cascade/context/decisions/` — completed decision files (markdown)
- `.cascade/context/research/` — research report files (markdown)

Check `.cascade/context/.sync-meta.json` for when the context was last synced.

If the context is stale (more than 1 hour old) or missing, refresh it:

```bash
node bin/cascade.js sync --force
```

## Fallback: Direct Scan Status

If no local context exists, check the latest scan status directly:
```bash
node bin/cascade.js scan --status
```

The scan captures 13 dimensions of your codebase context:
- **Tech Stack** — frameworks, languages, runtimes with versions
- **Architecture** — high-level architecture pattern
- **Dependencies** — external dependencies (databases, cloud services, APIs)
- **Patterns** — coding patterns, conventions, and standards
- **Constraints** — technical constraints, limitations, or debt
- **Deployment** — deployment setup and infrastructure
- **Project Structure** — directory layout and organization
- **Database Schema** — tables, columns, FK relationships, RLS policies
- **API Surface** — route handlers, auth requirements
- **Test Coverage** — test files, frameworks, tested vs untested areas
- **Security Posture** — auth approach, middleware, RLS coverage
- **Integration Points** — external services, webhooks, MCP servers, SDKs
- **Repository Metadata** — file count, language breakdown, monorepo detection

If no scan exists yet, run one with:
```bash
node bin/cascade.js scan
```

To refresh local context after a new scan:
```bash
node bin/cascade.js sync --force
```
