---
name: mine
description: Extract decisions, insights, competitive signals, and risk indicators from meeting transcripts.
argument-hint: "<path-to-transcript>"
allowed-tools: Read, Write, Grep, Glob, Bash(date *), Bash(pwd), Bash(echo *), Bash(wc *)
---

# Cascade Transcript Mining

Extract structured organizational intelligence from meeting transcripts, notes, or conversation logs. Routes each extracted item to the correct location.

## Instructions

You are an intelligence extraction agent. Follow these phases exactly.

---

### Phase 1 — Input & Setup

1. The transcript path is: `$ARGUMENTS`
2. If `$ARGUMENTS` is empty, tell the user: "Usage: /cse:mine <path-to-transcript>" and stop.
3. Read the transcript file.
4. Get today's date: `Bash(date +%Y-%m-%d)`
5. Get the working directory: `Bash(pwd)`
6. Output filename: `cascade-mine-{date}-{first-5-words-slugified}.md`

### Phase 2 — Meeting Metadata

From the transcript, identify:
- **Date** — when did this meeting happen? Look for date headers, timestamps, or contextual clues.
- **Participants** — who was present? Look for speaker labels, @-mentions, or named references.
- **Duration** — if timestamps exist, calculate approximate duration.
- **Meeting type** — classify as: standup, planning, strategy, 1:1, all-hands, client call, board meeting, ad-hoc, unknown.

### Phase 3 — Intelligent Extraction

Read the full transcript carefully. For EVERY substantive thread of discussion, classify it into one or more of these categories:

#### 3a. Decisions Made
For each decision identified:
- **What was decided** — the specific choice made
- **Who decided** — the person(s) who made or approved the decision
- **Rationale** — why this was chosen over alternatives
- **Alternatives discussed** — what else was considered
- **Assumptions stated** — facts asserted without evidence that the decision depends on
- **Reversibility** — can this be easily undone? (type-1: hard to reverse, type-2: easy to reverse)

Format each as:
```
DECISION: [subject line]
Decided by: [name]
Rationale: [why]
Alternatives: [what else was considered]
Assumptions: [list of assumptions]
Reversibility: [type-1 or type-2]
```

#### 3b. Action Items
For each commitment:
- **Who** — the person who committed
- **What** — the specific deliverable
- **When** — the deadline (explicit or implied)
- **Context** — what discussion led to this

Format each as:
```
ACTION: [what]
Owner: [who]
Deadline: [when, or "unspecified"]
```

#### 3c. Competitive Mentions
For each competitor or external entity named:
- **Entity** — the company, product, or person
- **What was said** — the specific claim or observation
- **Source context** — who said it and in what context
- **Impact assessment** — high/medium/low impact on our strategy

Format each as:
```
COMPETITOR: [entity name]
Signal: [what was said]
Said by: [who]
Impact: [high/medium/low] — [why]
```

#### 3d. Strategy Signals
For each discussion about direction, priorities, or positioning:
- **Signal** — what was said about strategy
- **Who** — who stated this
- **Alignment check** — does this align with or contradict documented strategy?

If you have access to strategy documents (check `.planning/` directory and any Portfolio files), compare against them. If contradictory, flag explicitly:
```
STRATEGY SIGNAL: [what was said]
By: [who]
Alignment: CONTRADICTS documented direction "[quote from strategy doc]"
```

#### 3e. Risk Signals
For each mention of something that could threaten current plans:
- **Risk** — what could go wrong
- **Likelihood** — how likely based on context (high/medium/low)
- **Early warning indicators** — what would we watch for
- **Source** — who mentioned it and in what context

Format each as:
```
RISK: [description]
Likelihood: [high/medium/low]
Early warnings: [what to watch]
Source: [who said it]
```

#### 3f. Assumptions Stated
For each fact asserted without supporting evidence:
- **Assumption** — the falsifiable statement
- **Who stated it** — the person who asserted this
- **Decision dependency** — which decisions depend on this being true

### Phase 4 — Strategy Alignment Check

1. Check if any strategy docs exist:
   - `Glob(.planning/*.md)`
   - `Glob(cascade-portfolio/knowledge/**/*.md)` (if Portfolio exists)
2. If strategy docs are found, read key sections.
3. Compare each extracted strategy signal against documented direction.
4. Score overall alignment:
   - **Aligned** (>80% of signals consistent)
   - **Drifting** (50-80% consistent)
   - **Contradictory** (<50% consistent)

### Phase 5 — Output

Write a structured extraction report to `{cwd}/{output-filename}` with this format:

```markdown
# Meeting Intelligence Report

**Date:** {meeting date}
**Participants:** {list}
**Duration:** {if known}
**Type:** {classification}
**Extracted by:** Cascade Mining Agent

---

## Summary

{2-3 sentence executive summary of what happened in this meeting}

## Decisions ({count})

{each decision in structured format}

## Action Items ({count})

{each action item}

## Competitive Intelligence ({count})

{each competitive mention}

## Strategy Signals ({count})

{each signal with alignment check}

## Risk Indicators ({count})

{each risk signal}

## Assumptions Stated ({count})

{each assumption with dependency mapping}

## Strategy Alignment

**Overall:** {Aligned/Drifting/Contradictory}
{explanation}

---

## Extraction Stats

| Category | Count |
|----------|-------|
| Decisions | {n} |
| Action Items | {n} |
| Competitive Mentions | {n} |
| Strategy Signals | {n} |
| Risk Indicators | {n} |
| Assumptions | {n} |
| **Total Items** | **{total}** |
```

### Phase 6 — Terminal Report

Print a concise summary to the terminal:

```
Cascade Mining Complete

Meeting: {date} — {type} with {participant count} participants
Output:  {output-filename}

Extracted:
  Decisions:            {count}
  Action Items:         {count}
  Competitive Mentions: {count} → {entity names}
  Strategy Signals:     {count} ({aligned}/{contradictory})
  Risk Indicators:      {count}
  Assumptions:          {count}

Strategy Alignment: {score}
```

---

## Quality Gates

Before finalizing output, verify:

1. Every extracted decision has an assumptions field (even if "none identified")
2. Every competitive mention identifies the entity by name
3. Every action item has an owner (even if "unassigned")
4. Strategy contradictions are flagged prominently, not buried
5. Zero information loss: if it was discussed substantively, it was extracted or explicitly marked as "not actionable: {reason}"
6. No hallucinated items — every extraction must be traceable to specific transcript content

## Edge Cases

- **No clear decisions:** If the meeting was purely informational, say so. Extract action items and signals but note "No decisions were made in this meeting."
- **Unclear participants:** Use speaker labels as-is (e.g., "Speaker 1", "Unknown")
- **Multiple meetings in one file:** Treat each as a separate extraction with its own metadata block
- **Non-English content:** Extract what you can, note language limitations
