---
name: resume
description: Recall and resume previous progressions by topic or partial description.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# /cse:resume

Conversational "what was that thing?" flow for recalling and resuming progressions.

## When to use

- User says "what was that thing?" or describes something vaguely
- User wants to pick up where they left off on a previous idea/spec/research
- User references a progression by topic, person, or partial description
- User asks to execute, resume, or check status of previous work

## Natural language mapping

| User says                                    | Action                          |
|----------------------------------------------|---------------------------------|
| "what was that thing about..."               | recall                          |
| "what were we working on for [person]?"      | recall                          |
| "where did that [topic] thing end up?"       | recall                          |
| "run it" / "execute it"                      | execute                         |
| "not ready yet" / "what's missing?"          | show gaps                       |
| "fire it off on the studio" / "dispatch it"  | execute --remote                |
| "generate a spec for that"                   | yolo-spec or /cse:spec      |
| "start research on that"                     | advance to researching          |

## Instructions

### Step 1: Search

When invoked with `/cse:resume [terms]`, run:

```bash
node bin/cascade.js recall [terms]
```

If no terms are provided, ask the user: "What are you looking for? Describe the idea, topic, or person involved."

### Step 2: Present results

Read the output from `cascade recall` and present results conversationally:

- **Single match:** "I found '{title}' -- {gapSummary}. Want to {options}?"
- **Multiple matches:** "I found {count} progressions matching that. The closest is '{title}' -- {gapSummary}. The others are: {list}. Which one?"
- **No matches:** "I couldn't find anything matching that. Try different terms, or run `cascade pipeline` to see all active progressions."

### Step 3: Act on selection

Based on the readiness of the selected progression, offer the appropriate next step:

#### ready_to_execute (spec approved)
- "This spec is approved and ready to execute. Options:"
  - **Execute locally now:** `node bin/cascade.js execute <id>`
  - **Dispatch to daemon:** `node bin/cascade.js execute <id> --remote`

#### needs_review (spec in draft)
- "The spec is in draft status -- it should be reviewed before execution. Options:"
  - **Run brief CSE confirmation:** Load the spec with `/cse:spec` for a quick review pass
  - **Execute anyway (gaps noted):** `node bin/cascade.js execute <id>`

#### needs_spec (research complete, no spec)
- "Research is done but there's no spec yet. Options:"
  - **Generate YOLO spec:** `node bin/cascade.js yolo-spec <id>` (autonomous spec generation)
  - **Run full CSE discovery:** `/cse:spec` with the progression context loaded

#### needs_research (idea only, no research)
- "This is still at the idea stage -- it needs research before speccing. Options:"
  - **Kick off research:** `node bin/cascade.js advance <id>` (advances to researching, creates cowork_task)
  - **Skip research, YOLO spec from idea:** `node bin/cascade.js yolo-spec <id>`

#### idea_only (early stage)
- "This is in early stages. Options:"
  - **Start research:** `node bin/cascade.js advance <id>`
  - **Skip straight to speccing:** `node bin/cascade.js yolo-spec <id>`

### Step 4: Execute

Run the chosen command and report the result back to the user.

## Context

This skill uses the progression recall system which searches:
1. Progressions directly (via pgvector semantic search)
2. Spec artifacts (cross-table fallback, resolves to parent progression)
3. Inquiries/ideas (cross-table fallback)
4. Explorations/research (cross-table fallback)

Results include readiness assessment, gap summaries, and linked entity details.
