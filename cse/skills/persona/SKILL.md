---
name: persona
description: Use when you want CSE discovery run with an AI persona answering — two isolated contexts produce a spec + session report autonomously.
when_to_use: Run CSE discovery with an AI persona answering questions. Two isolated AI contexts — a questioner and an opinionated persona — produce a spec and human-readable session report, all within your Max Plan session.
argument-hint: "[persona] [description] [--fresh|--weekly] — e.g. pragmatist Build a notification panel"
allowed-tools: Read, Write, Edit, Bash, Agent, AskUserQuestion
---

# Cascade Persona Spec — AI-Paired Discovery

Two isolated AI instances collaborate on spec discovery: YOU are the questioner (CSE discovery engine), and a PERSONA answers from an opinionated perspective grounded in your project's reality. The result is a structured spec + human-readable session report.

## Available Personas

| Name | File | Disposition |
|------|------|-------------|
| `pragmatist` | `personas/the-pragmatist.md` | Ships fast, YAGNI, proven patterns, minimal abstraction |
| `architect` | `personas/the-architect.md` | Designs for change, clean interfaces, separation of concerns |
| `steve` | `personas/steve.md` | The founder's own persona — data ownership, specification-first, partner-with-frontier-AI |

---

## Phase 0 — Parse Arguments & Bootstrap

1. Parse `$ARGUMENTS`:
   - First word = persona name (case-insensitive). Match against available personas above.
   - Remaining words = feature description.
   - If no persona name matches any shipped file, default to `pragmatist`, treat the entire argument as the description, and SAY that you did.
   - If no description provided, tell the user: `Usage: /cse:persona [persona] [description]` and stop.
   - Check for flags: `--fresh` (suppress weekly context injection) or `--weekly` (force weekly context injection).
   - Strip flags from the description before generating the spec slug.

2. Load the persona definition:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/the-{persona}.md
   ```
   If that file does not exist, try the un-prefixed form — personal personas ship
   without the `the-` prefix:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{persona}.md
   ```
   **If neither resolves, say which persona you could not find and stop.** Do not
   silently fall back to `pragmatist`: answering as the wrong persona produces a
   spec the user believes was shaped by a viewpoint that never ran.
   Store the full persona content as `PERSONA_PROMPT`.

3. Identity check:
   ```
   Bash(node bin/cascade.js whoami 2>&1)
   ```

4. Date and directory:
   ```
   Bash(date +%Y-%m-%d)
   Bash(pwd)
   ```

5. Generate `SPEC_SLUG` from the description: lowercase, hyphens, max 40 chars.

6. Refresh context:
   ```
   Bash(node bin/cascade.js sync --force 2>/dev/null || echo "sync-unavailable")
   ```

7. Load context files (skip gracefully if missing):
   - `.cascade/context/system/org-context.json`
   - `.cascade/context/system/active-assumptions.json`
   - `.cascade/context/scans/codebase-latest.json`
   - `.cascade/context/patterns/patterns.json`
   - `.cascade/context/decisions/` — any recent files
   - `.cascade/context/weekly/` — latest weekly priority file (from `/cse:weekly`). Injection is **conditional** based on session intent:

     **Default behavior (no flag):** Auto-detect from the description. Inject weekly context for tactical/scoped work (specific features, bug fixes, implementation tasks). Skip for strategic/exploratory work — descriptions containing words like "strategy", "vision", "explore", "brainstorm", "long-term", "architecture review", or "what if" suppress injection automatically.

     **`--weekly` flag:** Force-inject the weekly context regardless of description.
     **`--fresh` flag:** Suppress weekly context injection regardless of description.

     When injected, add a "Current Week Priorities" section to PROJECT_REALITY. When suppressed, omit it entirely so the persona operates without temporal bias.

8. Detect vertical from description:
   - **Legal:** patent, trademark, legal, docket, filing, jurisdiction, compliance, IP
   - **Executive:** strategy, delegate, stakeholder, budget, OKR, board, fundraise
   - **Engineering:** everything else

9. Build `PROJECT_REALITY` — a structured block injected into every persona call:

   ```
   ## Project Reality (Hard Constraints — Non-Negotiable)

   **Tech Stack:** [from codebase scan — framework, language, database, runtime]
   **Patterns:** [from patterns.json — first 10 recurring patterns]
   **Conventions:** [from scan — established conventions]
   **Recent Decisions:** [from decisions/ — last 5 relevant]
   **Active Assumptions:** [from assumptions — flagged items]
   **Vertical:** [engineering/legal/executive]

   CONSTRAINT: You MUST work within this stack. Do not suggest replacing
   frameworks, databases, or core infrastructure. Your opinions shape HOW
   features are built within these constraints, not WHAT the constraints are.
   ```

10. Display status:
    ```
    ══════════════════════════════════════════════════
    Cascade Persona Spec
    Persona:   The {Persona Name}
    Feature:   {description}
    Vertical:  {vertical}
    Context:   {available/unavailable}
    Scan:      {fresh/stale/none}
    ══════════════════════════════════════════════════
    ```

---

## Phase 1 — Discovery Loop

You are now the CSE discovery engine. Generate questions following these behavioral rules:

**TONE:**
- Have opinions. Push back. Challenge vagueness.
- "Good" means what? "Simple" means how? "Users" means who?
- Make abstract concrete: "Walk me through using this."
- You are co-designing with the persona.

**ANTI-PATTERNS (silently enforced):**
1. No yes/no questions — open-ended with 2-4 concrete options
2. No tech-first before understanding need — domain first
3. No obvious questions — ask about tradeoffs where both sides have costs
4. No redundant-with-context questions — build ON what the scan already tells you
5. No premature solutions — the problem first, solutions come in the spec
6. No checklist walking — each question builds on the last answer
7. No corporate speak — plain language
8. No interrogating without building — reference what the persona just said

**CONVERSATION PHASES (natural flow, no explicit transitions):**

DREAM EXTRACTION (2-3 questions):
- Broad, open questions about what the feature should accomplish
- Let the persona's philosophy shape the vision
- Follow their energy and priorities

GRADUAL NARROWING (3-5 questions):
- Questions get specific, building on prior answers
- Probe vague terms from the persona's answers
- Surface unstated assumptions
- Find edges: "What happens when X?"

CLARITY GATE (1 question):
- When you have enough signal for intent, mustHaves, artifacts, scopeBoundaries
- Mirror understanding back and ask: "Does this capture it?"

**THE LOOP — repeat for each question:**

1. **Generate your question.** Write it as structured data:
   - `questionText`: the question (clear, specific)
   - `options`: 2-4 concrete choices (the persona can also give custom answers)
   - `phase`: dream_extraction | narrowing | clarity_gate

2. **Display the question to the user** so they can follow along:
   ```
   ┌─ Question {N} ({phase}) ─────────────────────
   │ {questionText}
   │
   │ Options:
   │   1. {option1}
   │   2. {option2}
   │   3. {option3}
   └──────────────────────────────────────────────
   ```

3. **Spawn the persona agent** to answer:

   ```
   Agent(
     description: "Persona: {name} — Q{N}",
     prompt: <see PERSONA AGENT PROMPT below>
   )
   ```

4. **Parse the persona's response.** Extract:
   - `answer`: the decision
   - `reasoning`: why
   - `confidence`: high / medium / low
   - `flagForHuman`: yes/no + reason

5. **Display the answer to the user:**
   ```
   ┌─ {Persona Name} responds ────────────────────
   │ Answer:     {answer}
   │ Reasoning:  {reasoning}
   │ Confidence: {confidence}
   │ Flag:       {flagForHuman or "—"}
   └──────────────────────────────────────────────
   ```

6. **Append to transcript array:**
   ```json
   {
     "questionNumber": N,
     "phase": "dream_extraction|narrowing|clarity_gate",
     "question": "...",
     "options": [...],
     "answer": "...",
     "reasoning": "...",
     "confidence": "high|medium|low",
     "flagForHuman": "reason or null"
   }
   ```

7. **Decide next step:**
   - If clarity gate passed → proceed to Phase 2
   - If < 5 substantive questions asked → continue asking
   - If > 10 questions → force clarity gate on next turn
   - If persona rejected clarity gate → ask targeted follow-up

**MINIMUM: 5 questions. MAXIMUM: 12 questions.**

---

### PERSONA AGENT PROMPT

Build this prompt for each Agent call. The persona MUST receive fresh context every call because Agent contexts are isolated.

```
{PERSONA_PROMPT contents — the full persona markdown file}

---

{PROJECT_REALITY block — built in Phase 0}

---

## Conversation So Far

{For each prior Q&A entry in the transcript:}
**Q{N}:** {question}
**Your answer:** {answer} ({reasoning})

---

## Current Question (Q{N})

{questionText}

Options:
1. {option1}
2. {option2}
3. {option3}
{4. {option4} — if present}

---

## Response Format

Answer this discovery question in character. Be decisive.

**Answer:** [Pick an option by number and label, OR give a custom answer]
**Reasoning:** [1-3 sentences. Reference the project's actual stack/patterns when relevant]
**Confidence:** [high / medium / low]
**Flag for human:** [No — or: Yes, because {specific reason a human should validate this}]
```

---

## Phase 2 — Spec Generation

Read the spec template:
```
Read ${CLAUDE_PLUGIN_ROOT}/skills/spec/spec-template.json
```
If not found:
```
Read ${CLAUDE_PLUGIN_ROOT}/skills/spec/spec-template.json
```

Synthesize the discovery transcript into a SpecBody JSON. Follow these rules:

**GOAL-BACKWARD DERIVATION:**
mustHaves (what must be true) → evidence (how to verify) → artifacts (what files) → tasks (what work)

**MUST-HAVE SCALING:**
- Simple (1-2 components): 3-5 must-haves
- Medium (3-5 components): 5-8 must-haves
- Complex (6+ components): 8-12 must-haves

**WAVE PLANNING:**
- Wave 1 has zero dependencies on other waves
- Tasks within a wave are independent
- Max 5 waves
- Task IDs: `spec-{slug}-w{wave}-t{number}`

**ASSUMPTIONS:** Extract from the persona's low-confidence answers and any "flag for human" items.

**SCOPE BOUNDARIES:** Include ideas the persona deferred or explicitly excluded.

Include the full `discoveryTranscript` array as a top-level field in the spec JSON.

---

## Phase 3 — Session Report

Generate a human-readable markdown report. This is the PRIMARY deliverable — the user reads this to understand what the persona decided and why.

Write the report to `.cascade/outputs/persona-{SPEC_SLUG}-{date}.md`:

```markdown
# Persona Session Report

**Feature:** {description}
**Persona:** The {Name}
**Date:** {date}
**Vertical:** {vertical}
**Questions:** {count} | **Flagged for review:** {flagged count}

---

## Executive Summary

{3-5 sentences: what the persona decided to build, the key architectural choices,
and where it deviated from or aligned with the project's existing patterns.
Written in the persona's voice.}

---

## Discovery Transcript

{For each Q&A:}

### Q{N}: {question} [{phase}]

**{Persona}'s Decision:** {answer}

> {reasoning}

Confidence: {confidence} {" ⚠️ FLAGGED: " + flagReason if flagged}

---

## Decision Summary

| # | Decision | Confidence | Flagged |
|---|----------|------------|---------|
{table rows}

---

## Items Flagged for Human Review

{If any flagged items:}
{numbered list with the question, the persona's answer, and why it was flagged}

{If none:}
The persona did not flag any decisions for human review.

---

## Generated Spec

Intent: {spec intent}
Must-haves: {count} ({critical count} critical)
Waves: {wave count} ({task count} tasks)
Artifacts: {artifact count} files

Spec file: `.cascade/specs/spec-{SPEC_SLUG}-{date}.json`
```

---

## Phase 4 — Persistence & Handoff

1. Ensure directories exist:
   ```
   Bash(mkdir -p .cascade/specs .cascade/outputs)
   ```

2. Write the spec JSON:
   ```
   Write .cascade/specs/spec-{SPEC_SLUG}-{date}.json
   ```

3. Write the session report:
   ```
   Write .cascade/outputs/persona-{SPEC_SLUG}-{date}.md
   ```

4. Present results to the user via AskUserQuestion:
   - header: "Persona complete"
   - question: "The {Persona} completed discovery. {flagged count} items flagged for your review. The report is at `.cascade/outputs/persona-{slug}-{date}.md`. What would you like to do?"
   - options:
     - "Review the report" (display the full report inline)
     - "Execute this spec" (triggers CSE executor — see Phase 4.5 below)
     - "Discuss and adjust" (enter conversational mode to modify decisions)
     - "Save as draft" (done — report and spec are saved)

   **After "Review the report":** Display the report inline, then IMMEDIATELY re-offer the action choice:
   - header: "Next step"
   - question: "Report reviewed. What would you like to do with this spec?"
   - options:
     - "Execute this spec" (triggers CSE executor — see Phase 4.5 below)
     - "Discuss and adjust"
     - "Save as draft"

   This re-offer is critical — reviewing the report must NOT exit the pipeline. The user should always have a path back to execution.

5. If online (whoami succeeded), save to Cascade:
   ```
   Bash(node bin/cascade.js spec save .cascade/specs/spec-{SPEC_SLUG}-{date}.json --title "{intent}" --package 2>&1)
   ```

---

## Phase 4.5 — CSE Executor Handoff (CRITICAL)

**This phase fires when the user chooses "Execute this spec" from Phase 4.**

The spec is now the contract. Discovery is over. Spawn a fresh-context executor to prevent discovery context from degrading execution quality.

1. **Build the handoff payload.** Extract ONLY structured fields — no prose, no Q&A, no discovery artifacts:

   ```json
   {
     "specFile": ".cascade/specs/spec-{SPEC_SLUG}-{date}.json",
     "cwd": "{working directory}",
     "date": "{today}",
     "org": "{org name or 'offline'}",
     "vertical": "{engineering|legal|executive}",
     "online": true|false,
     "packageId": "{uuid or null}",
     "constraints": ["max 1-3 strings: only hard blockers from discovery"]
   }
   ```

2. **Present the call to action:**
   ```
   ═══════════════════════════════════════════
   Spec locked: .cascade/specs/spec-{slug}-{date}.json

   Must-haves:  {count} ({critical} critical)
   Waves:       {wave count} ({task count} total tasks)
   Artifacts:   {artifact count} files

   Spawning executor with fresh context...
   ═══════════════════════════════════════════
   ```

3. **Spawn the executor.** This is mandatory — do NOT execute in this context.

   ```
   Task(
     subagent_type: "general-purpose",
     description: "CSE execute spec",
     prompt: <compose from handoff template below>
   )
   ```

   **Create the isolation worktree first (MANDATORY — never execute in the main checkout).**
   A persona run executes real code exactly like a human-driven run, so it gets
   the same isolation. Use the same step as `/cse:spec` Phase 3.5 step 2.5:
   create the worktree and held branch, capture `WORKTREE_ROOT` and `BRANCH`,
   and set the handoff's working directory to `WORKTREE_ROOT`. If `git worktree
   add` fails (e.g. not a git repo), fall back to the main checkout and say so
   in the report.

   **Handoff template** (fill in values from the payload):
   ```
   CSE Executor — read your instructions, then execute.

   HANDOFF:
   - Spec file: {specFile}
   - WORKTREE_ROOT: {WORKTREE_ROOT}   ← your isolated working directory; ALL work happens here
   - Held branch: {BRANCH}            ← commit here; do NOT merge to main (consolidation is separate)
   - Date: {date}
   - Org: {org}
   - Vertical: {vertical}
   - Online: {online}
   - Constraints: {constraints as bullet list, or "None"}

   ISOLATION RULE: WORKTREE_ROOT is your entire workspace. `cd` there first; every Bash
   command runs from there (or use `git -C WORKTREE_ROOT`); every file path you Read/Write/Edit
   is absolute and begins with WORKTREE_ROOT. When you spawn wave subagents, pass them
   WORKTREE_ROOT and this same rule. Never write to or commit in the main checkout.

   INSTRUCTIONS: Read ${CLAUDE_PLUGIN_ROOT}/skills/spec/executor-instructions.md
   then read the spec file, then execute Phases 4, 5, and 6 from the instructions.
   ```

   The handoff prompt must be **under 300 tokens**. All execution logic lives in `executor-instructions.md`, not in this prompt.

4. **After the subagent returns:** Display the final report. If the executor reported a hard stop:
   - Use AskUserQuestion:
     - header: "Blocked"
     - question: Describe the blocker from the executor's report
     - options: ["Try a workaround", "Skip the blocked task", "Stop here"]
   - ON "Try a workaround": spawn a new executor subagent for the remaining work
   - ON "Skip the blocked task": note it as skipped
   - ON "Stop here": report partial results

---

## Extensibility: Alternative Responders

The current implementation uses the Agent tool (same model, isolated context) as the persona responder. This runs entirely on the Max Plan session at zero marginal cost.

To substitute an external model in the future:

1. Replace the Agent call in the discovery loop with an API call (Anthropic SDK, OpenAI, etc.)
2. The prompt contract stays identical — the PERSONA AGENT PROMPT section defines the input/output interface
3. The persona definition files are model-agnostic: pure system prompt + decision framework
4. The transcript format is provider-independent

The abstraction boundary is: **anything that accepts the persona prompt + project reality + Q&A history + question and returns answer + reasoning + confidence + flag** is a valid responder.

Future responder options:
- `agent` (current): Claude via Agent tool, Max Plan, $0
- `anthropic-api`: Claude via API, any model (Opus/Sonnet/Haiku), billed per token
- `openai`: GPT-4/o1 via API, billed per token
- `ollama`: Local model via Ollama, $0, lower quality
- `bedrock`: Claude via AWS Bedrock, for HIPAA/compliance contexts
