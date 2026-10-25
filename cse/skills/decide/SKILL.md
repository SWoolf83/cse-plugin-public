---
name: decide
description: Pull all relevant Cascade context before making a technical decision. Fetches precedent patterns, recent decisions, and codebase scan data.
argument-hint: "[decision topic]"
allowed-tools: Bash(node *cascade.js *), Read, Grep
---

# Cascade Decision Context

Pull all relevant context from Cascade to inform a technical decision. Given $ARGUMENTS as the decision topic, this skill gathers:

1. **Codebase scan context** — what Cascade knows about the tech stack and architecture
2. **Existing patterns** — search the codebase for relevant conventions related to the decision
3. **Active sessions** — check if related engineering work is already in progress

## Usage

First, get the latest scan context:
```bash
node bin/cascade.js scan --status
```

Then check for active engineering sessions that may be related:
```bash
node bin/cascade.js specs
```

Use the gathered context to frame the decision within the existing codebase patterns, constraints, and conventions. Consider:
- Does the codebase already have a pattern for this?
- What constraints does the current architecture impose?
- Are there active sessions that might affect this decision?
- What does the tech stack suggest about the best approach?
