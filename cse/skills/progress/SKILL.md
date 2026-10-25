---
name: progress
description: Conversational pipeline flow for the Cascade IRA progression system.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# /cse:progress

Conversational pipeline flow for the Cascade IRA progression system.

## When to Use

Use `/cse:progress` when you want to:
- See what's in your pipeline (signals, ideas, research, specs, executing)
- Advance an item to the next stage ("research that", "spec it out", "let's build it")
- Create a new progression from an idea or curator signal
- Generate a YOLO spec (autonomous spec from research without interactive Q&A)

## How It Works

This skill provides a conversational interface to the progression primitive. It reads your active progressions and lets you advance them through the IRA pipeline stages:

**signal** → **idea** → **researching** → **specifying** → **spec_review** → **executing** → **verifying** → **complete**

## Steps

### 1. Show Pipeline Status

Run this command to see your active progressions:

```bash
node bin/cascade.js pipeline
```

### 2. Understand the User's Intent

Ask the user what they'd like to do:
- **Review pipeline**: Show active progressions and their stages
- **Start new**: Create a new progression from an idea
- **Advance**: Move a progression to its next natural stage
- **YOLO spec**: Generate an autonomous spec for a progression that has research

### 3. Execute Based on Intent

**To create a new progression:**
```bash
node bin/cascade.js advance --create --title "Title here" --description "Description" --vertical engineering
```

**To advance to the next stage:**
```bash
node bin/cascade.js advance <progression-id>
```

**To skip ahead (e.g., idea straight to specifying):**
```bash
node bin/cascade.js advance <progression-id> --stage specifying
```

**To generate a YOLO spec:**
```bash
node bin/cascade.js yolo-spec <progression-id>
```

### 4. Report Back

After executing, summarize what happened and what the user can do next. Be conversational:
- "Research is running. I'll update you when it finishes."
- "YOLO spec generated with 7 simulated questions. Take a look before we execute."
- "Advanced to executing. The daemon will pick it up shortly."

## Context

Read `.cascade/context/` files for organizational knowledge if needed for creating progressions with appropriate descriptions.

## Natural Language Mapping

Map natural language to actions:
- "research that" / "dig into this" → advance to researching
- "spec it out" / "write a spec" → advance to specifying (or yolo-spec)
- "let's build it" / "execute" → advance to executing
- "what's in the pipeline?" / "status" → show pipeline
- "start tracking X" / "new idea: X" → create progression
- "kill it" / "abandon" → abandon progression
