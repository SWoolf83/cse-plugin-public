---
name: scan
description: Trigger a codebase context scan for your org. Analyzes tech stack, architecture, database schema, API surface, security, and more.
allowed-tools: Bash(node *cascade.js *)
---

# Cascade Codebase Scan

Trigger a full codebase context scan for your organization. The scan analyzes 13 dimensions of your codebase:

1. Tech Stack (frameworks, languages, runtimes, versions)
2. Architecture (monolith, microservices, monorepo, etc.)
3. Dependencies (databases, cloud services, third-party APIs)
4. Coding Patterns & Conventions
5. Technical Constraints & Debt
6. Deployment Setup
7. Project Structure & Directory Layout
8. Database Schema (tables, RLS, migrations, relationships)
9. API Surface (routes, auth requirements)
10. Test Coverage (frameworks, tested vs untested areas)
11. Security Posture (auth, middleware, RLS)
12. Integration Points (external services, webhooks, SDKs)
13. Repository Metadata (file count, language breakdown, monorepo detection)

## Usage

Run a scan:
```bash
node bin/cascade.js scan
```

Run a scan for a specific repo/branch:
```bash
node bin/cascade.js scan --repo https://github.com/org/repo --branch main
```

Check the status of the latest scan:
```bash
node bin/cascade.js scan --status
```

The scan runs as a background engineering session. Once completed, template inquiries submitted through Cascade will be automatically enriched with your codebase context.

## After the scan completes

Offer — in ONE sentence, and only once — to (re)generate the managed CLAUDE.md block from the fresh scan results via `/cse:claudemd` (e.g. "Want me to refresh the managed CLAUDE.md block from this scan? I'll show you the diff first."); if the user accepts, follow the `/cse:claudemd` skill (diff shown before any write, content outside the managed markers never touched) — never regenerate or write unprompted.
