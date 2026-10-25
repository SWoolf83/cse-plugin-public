---
name: log
description: Capture a decision from the current session to Cascade's organizational decision log. Extracts context automatically.
argument-hint: "[optional: decision summary]"
allowed-tools: Bash(node *cascade.js *)
---

# Cascade Decision Capture

Capture a decision to the organizational decision log. This skill extracts or accepts a decision from the current conversation context and writes it to Cascade.

## Behavior

### If $ARGUMENTS is provided:
Use it as the decision summary. Analyze the recent conversation context to fill in the structured fields.

### If no arguments:
Analyze the recent conversation to identify the most significant decision that was just made or discussed.

## Steps

1. **Extract the decision** from conversation context. Identify:
   - **Title**: A concise name for the decision (imperative or declarative, e.g., "Use SQLite for daemon store")
   - **Chosen**: What option was selected
   - **Reasoning**: Why it was chosen over alternatives
   - **Context**: What prompted this decision (the problem or need)
   - **Options**: What alternatives were considered (JSON array: `[{"label": "...", "description": "..."}]`)

2. **Classify** the decision:
   - **Category**: `technical` | `architectural` | `strategic` | `product` | `operational` | `process`
   - **Significance**: `minor` | `standard` | `significant` | `critical`
   - **Reversibility**: `reversible` | `costly` | `irreversible`
   - **Tags**: 2-5 lowercase domain terms (e.g., `database`, `api`, `auth`, `ux`, `pricing`)

3. **Confirm with the user** by presenting a brief summary:
   ```
   Decision: [title]
   Chosen: [chosen]
   Reasoning: [reasoning]
   Category: [category] | Significance: [significance] | Reversibility: [reversibility]
   Tags: [tags]
   ```
   Ask: "Log this decision to Cascade?" (proceed unless user objects)

4. **Write to Cascade** using the CLI:

```bash
node bin/cascade.js log-decision \
  --title "Decision title here" \
  --chosen "The chosen option" \
  --reasoning "Why this was chosen" \
  --context "What prompted the decision" \
  --tags "tag1,tag2,tag3" \
  --category "technical" \
  --significance "standard" \
  --reversibility "reversible" \
  --source "claude-code"
```

For decisions with multiple options considered, use the --json flag:

```bash
node bin/cascade.js log-decision --json '{"title": "...", "chosen": "...", "reasoning": "...", "context": "...", "options": [{"label": "Option A", "description": "..."}, {"label": "Option B", "description": "..."}], "tags": ["tag1", "tag2"], "category": "technical", "significance": "standard", "reversibility": "reversible", "source": "claude-code"}'
```

5. **Confirm success** and note the decision ID for reference.

## Classification Guide

### Category
- **technical**: Code, libraries, APIs, data structures, algorithms
- **architectural**: System design, patterns, infrastructure, deployment
- **strategic**: Business model, market positioning, competitive moves, pricing
- **product**: Features, UX, user flows, priorities, roadmap
- **operational**: Deployment, monitoring, processes, tools
- **process**: Workflow, methodology, team structure, communication

### Significance
- **minor**: Low impact, trivially reversible (variable naming, minor refactor)
- **standard**: Normal engineering/business decision (library choice, API design)
- **significant**: Affects multiple systems, teams, or customers (database choice, pricing model)
- **critical**: Hard to reverse, high stakes (public API contract, data migration, legal commitment)

### Reversibility
- **reversible**: Can change with minimal cost (internal tool choice, feature flag)
- **costly**: Can change but requires significant effort (database migration, API versioning)
- **irreversible**: Locked in or very expensive to change (public API, contractual obligation)
