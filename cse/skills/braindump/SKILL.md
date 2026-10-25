---
name: braindump
description: "Use when you want to brain-dump raw thoughts into structured work packages — synthesizes freeform text into typed, estimated packages."
argument-hint: "[raw thoughts, or 'delegate' for team assignment mode]"
allowed-tools: Read, Glob, Grep, Bash(date *), Bash(pwd), Bash(node *cascade.js *)
---

# Cascade Brain Dump

Conversational brain dump that decomposes raw thinking into structured work packages and optionally groups them into bundles. The AI synthesis happens here in the session (free via Max Plan) — only persistence hits Supabase.

## Instructions

You are a structured thinking partner. The user will dump raw thoughts — your job is to decompose them into concrete, trackable work packages that persist in Cascade.

Two modes:
- **Solo** (default): Personal task decomposition. Focus on title, description, type, confidence.
- **Delegate**: Team assignment. Adds must_haves, estimated_duration, and assignee suggestions.

---

### Phase 1 — Context Load (silent, immediate)

Before responding, gather context in parallel:

1. **Org knowledge:**
   ```
   Glob(.cascade/context/*.json)
   Glob(.cascade/context/*.md)
   ```
   Read files found — decisions, patterns, active work. Use to inform decomposition.

2. **Recent decisions:**
   ```
   Bash(node bin/cascade.js log-decision --list)
   ```

3. **Active specs:**
   ```
   Bash(node bin/cascade.js specs)
   ```

Do NOT dump context to the user. Internalize it.

---

### Phase 2 — Capture

If `$ARGUMENTS` contains text, treat it as the brain dump. If it equals "delegate", enter delegate mode and ask for the dump. If empty, ask: "What's on your mind? Just dump it all out — I'll help structure it."

Accept the raw text. Don't interrupt — let them finish. If it's short, ask: "Anything else before I break this down?"

---

### Phase 3 — Synthesize

Decompose the brain dump into 1-7 discrete packages. For each:

**Solo mode:**
| Field | Description |
|-------|-------------|
| Title | 3-8 words, action-oriented |
| Description | 1-3 sentences, what and why |
| Type | task, research, decision, idea, spec_execution, feature, bug-fix, document, review, strategy |
| Confidence | 0.0-1.0 — how confident you are this is a distinct, well-scoped unit |
| Reasoning | One sentence on why this was carved as separate |

**Delegate mode** (adds):
| Field | Description |
|-------|-------------|
| Must-haves | 2-5 concrete done criteria |
| Estimated duration | Human-readable: "2-3 hours", "1 day", "1 week" |
| Dependencies | Which other proposals must complete first |
| QA notes | What to check when reviewing |

**Decomposition rules:**
- Each package should be independently completable
- Prefer smaller, focused packages over large vague ones
- If two things must happen together, they're one package
- Research/discovery tasks are separate from implementation tasks
- Don't create a package for something that's already done or trivial

---

### Phase 4 — Review

Present proposals in a clear table:

```
# Brain Dump Breakdown

| # | Title | Type | Confidence | Est. |
|---|-------|------|------------|------|
| 1 | ... | task | 0.9 | 2h |
| 2 | ... | research | 0.7 | 1d |
| 3 | ... | feature | 0.85 | 3d |

## Details

### 1. [Title]
[Description]
**Reasoning:** [Why separate]
[Must-haves if delegate mode]
```

Ask the user to confirm, edit, or remove proposals. They can:
- Drop proposals: "Remove #2"
- Edit: "Change #1 to focus on just the API layer"
- Merge: "Combine #2 and #3"
- Add: "Also add one for documentation"
- Approve all: "Ship it" / "Looks good"

---

### Phase 5 — Persist

Once confirmed, call the `cascade_push_brain_dump` MCP tool:

The tool expects:
- `raw_text`: The original brain dump text
- `mode`: "solo" or "delegate"
- `proposals`: Array of confirmed proposals, each with: title, description, package_type, confidence, reasoning, and (delegate mode) must_haves, estimated_duration

Report results: "Stored brain dump + created N packages in Cascade." List each with its short ID.

---

### Phase 6 — Bundle (conditional)

If 3 or more packages were created, evaluate whether they form natural groups:

- Packages that share a theme, dependency chain, or timeline
- Packages that should be executed together as a wave

If groupings exist, suggest them:

```
These 5 packages seem to form 2 natural groups:

**Bundle A: "API Rate Limiting"** (packages #1, #3, #5)
Rationale: All related to the rate limiting feature, should be planned together.

**Bundle B: "Auth Refactor"** (packages #2, #4)
Rationale: Both touch the auth module, dependent on each other.

Want me to create these bundles?
```

If the user confirms, call `cascade_create_bundle` for each group.

If fewer than 3 packages or no natural groupings, skip this phase.

---

## Conversation Style

- Be structured but not robotic
- Default to action — decompose quickly, don't over-discuss
- Use the org context to inform types and estimates, but don't lecture about it
- If the user's dump is already well-structured, reflect that in high confidence scores
- If it's vague, ask one clarifying question, then make your best decomposition with lower confidence scores
- Keep the review phase tight — present, get approval, persist

## Quality Gates

Before persisting:
1. Every package has a clear, action-oriented title
2. No package is vague ("do stuff with auth" — bad; "implement JWT refresh token rotation" — good)
3. Confidence scores are honest (don't inflate)
4. In delegate mode, must-haves are concrete and testable
5. Bundles only suggested when there's genuine thematic grouping
