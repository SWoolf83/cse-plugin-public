---
name: weekly
description: Use when you want a weekly priority calibration session — reviews activity, surfaces pressures, produces a focus file and delegation queue.
when_to_use: Weekly priority calibration session. Reviews recent activity, surfaces external pressures via interview, then runs your persona through priority discovery to produce a weekly focus file and delegation queue.
argument-hint: "[persona-name] — e.g. 'steve' or blank for default"
allowed-tools: Read, Write, Edit, Bash, Agent, AskUserQuestion, cascade_brief
---

# Weekly Priority Calibration — Temporal Intent Container

A structured weekly session that combines activity data with your persona's judgment to set the week's focus. The output is a temporal intent container — a weekly context file that gets injected into persona sessions, spec discovery, and delegation workflows so Claude knows what matters *right now*, not just how you think.

## What This Produces

A weekly context file at `.cascade/context/weekly/{YYYY}-w{WW}.md` that encodes:
- What shifted externally since last week (the things the codebase can't show)
- This week's 3-5 focus areas with success criteria
- Delegation queue for team members (especially Joyn engineers)
- Items explicitly deferred and why
- Carry-forward from last week

This file is ephemeral by design — it's the temporal complement to your durable persona. The persona says *how* you decide; the weekly file says *what matters now*.

---

## Critical Rule: Cross-Org Separation of Concerns

When external organizations (Joyn Health, TFW IP Law, etc.) appear in weekly priorities, they are **customers driving demand** on the Cascade HQ product — NOT competing workstreams. The weekly file must always frame them this way:

- **Correct:** "Joyn demand is driving Cascade spec engine development this week"
- **Wrong:** "Stop Cascade work and go do Joyn work"
- **Correct:** "Build the delegation tools that Joyn needs"
- **Wrong:** "Joyn is the priority, Cascade features are deferred"

The work product is always Cascade code, Cascade specs, Cascade tools. Customer orgs shape WHICH Cascade features get priority, not whether Cascade work happens. Every weekly file must include a "Separation of concerns" callout when external orgs are mentioned.

---

## Phase 0 — Bootstrap

1. Parse `$ARGUMENTS` for a persona name. Default to the user's first name (from `cascade whoami` or email) if blank. If no persona file exists for the name, tell the user and stop.

2. Load the persona:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{name}.md
   ```
   Fallback:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{name}.md
   ```
   Store as `PERSONA_PROMPT`.

3. Get date context:
   ```
   Bash(date +%Y-w%V)  → WEEK_ID (e.g. 2026-w22)
   Bash(date +%Y-%m-%d) → TODAY
   Bash(date -v-monday +%Y-%m-%d) → WEEK_START (Monday)
   Bash(date -v-friday +%Y-%m-%d) → WEEK_END (Friday)
   ```

4. Check for last week's context file:
   ```
   Read .cascade/context/weekly/{LAST_WEEK_ID}.md
   ```
   If it exists, store as `LAST_WEEK`. This enables "what changed?" comparisons.

5. Synthesize "where the world moved against the plan" via the SHARED brief core.

   > **Why this calls the shared core:** `/cse:weekly` and `/cse:chief` share ONE
   > synthesis core — the `cascade_brief` `compose` ranker — and differ only in
   > CADENCE: `/cse:weekly` is the periodic calibration ritual, `/cse:chief` is the
   > standing chief-of-staff conversation. This is the "build the core once, two
   > cadences" decision in action. The weekly no longer does bespoke per-skill
   > signal-gathering for "what pressures the plan" — it asks the same ranker that
   > scores knowledge-backlog signals against the org's active assumptions and
   > active roadmap (assumption-pressure scoring, clearance-composed to your REAL
   > role), and returns AT MOST 3 decision cards or an honest "all caught up."

   Call the core with the weekly cadence:
   ```
   cascade_brief(action: "compose", cadence: "weekly")
   → { success, all_caught_up, cards: [{ id, title, what, why_it_pressures,
        decision, pressured_assumption_id, pressured_package_id }], counts }
   ```
   Store the returned cards as `PRESSURE_CARDS` (≤3). These are the PRIMARY
   synthesized "what shifted against the plan" signals — they feed directly into
   `ACTIVITY_SUMMARY` and seed Phase 1's "What shifted?" question.

   **Honest-empty:** If `all_caught_up: true` (no cards), do NOT fabricate shifts.
   Note "No new pressure on the plan since last week" and lean on the
   persona/external-context phases (Phase 1 human interview + Phase 2 persona
   calibration) to set the week, rather than inventing context shifts.

   **Lightweight local refresher (complement — cheap & human-friendly):** still pull
   the last week's git log so the user gets a quick "here's what happened" memory jog
   alongside the synthesized pressure cards (the core synthesis is `cascade_brief`,
   this is just a familiar visual complement):
   ```
   Bash(git log --since="7 days ago" --oneline --no-merges | head -30)
   ```

6. Build `ACTIVITY_SUMMARY` — a structured block. The synthesized pressure cards
   from the shared core are the lead; the git refresher is the complement:
   ```
   ## Activity Since Last Week

   **Pressure on the plan (cascade_brief @ weekly cadence):**
   {For each card in PRESSURE_CARDS:}
   - {title} — {why_it_pressures} → {decision}
   {or, if all_caught_up: "No new pressure on the plan since last week."}

   **Commits:** {count} commits across {branches}
   **Key changes:** {top 5 commit themes}
   ```

7. Display status:
   ```
   ══════════════════════════════════════════════════
   Weekly Priority Calibration — {WEEK_ID}
   Persona:     {name}
   Week:        {WEEK_START} → {WEEK_END}
   Last week:   {exists/first session}
   Commits:     {count} in the last 7 days
   Pressure:    {PRESSURE_CARDS count} cards on the plan (or "all caught up")
   ══════════════════════════════════════════════════
   ```

---

## Phase 1 — External Context Gathering (With the Real Human)

This phase talks to the REAL human, not the persona. The goal is to surface the things that are invisible in the codebase — external pressures, shifting business context, conversations that happened outside of code.

**TONE:** Quick, conversational, not a standup. Think "catching up with a co-founder over coffee" not "filling out a JIRA sprint form."

Present the activity summary first so the user has a refresher of what happened, then ask 3-4 focused questions:

### Question 1: What shifted?

Show the activity summary — lead with the synthesized `PRESSURE_CARDS` from the
shared brief core (the "where the world moved against your plan" signals), so this
question is grounded in what the ranker already surfaced. If `all_caught_up`, say so
plainly ("nothing pressured the plan since last week per the brief") and let the
human supply the shift from outside the substrate. Then ask via AskUserQuestion:
- header: "Context shift"
- question: "Looking at the last week, what changed externally that the codebase doesn't show? (Customer conversations, business pressure, new information, changed timelines)"
- options:
  - "Nothing major — priorities are stable"
  - "Customer/partner conversations changed something"
  - "Timeline or deadline shifted"
  - "New opportunity or risk emerged"
- multiSelect: true

Follow up in plain text to get specifics based on their selection.

### Question 2: What's weighing on you?

Ask via AskUserQuestion:
- header: "Top of mind"
- question: "What's the ONE thing that, if it got done this week, would make you feel like the week was a success?"
- options:
  - "{inferred from recent activity — most active area}"
  - "{inferred from last week's deferred items if available}"
  - "{inferred from persona's current priorities}"
  - "Something else entirely"

### Question 3: Delegation state (if persona mentions team/delegation)

Ask via AskUserQuestion:
- header: "Delegation"
- question: "Any work that should be delegated to engineers this week? What's blocking delegation right now?"
- options:
  - "Yes — I have specs ready to hand off"
  - "Yes — but I need to spec it first"
  - "Not this week — focused on solo work"
  - "Blocked — waiting on something before I can delegate"

### Question 4: What's NOT this week?

Ask via AskUserQuestion:
- header: "Deferring"
- question: "What are you explicitly choosing NOT to focus on this week, even though it might feel urgent?"
- options:
  - "{inferred from recent specs or packages not started}"
  - "{inferred from last week's focus that might carry over}"
  - "Nothing — everything active stays active"
  - "Let me explain what I'm parking"

**RULES:**
- Minimum 3 questions, maximum 5
- Always ask open-ended follow-ups when the user picks something interesting
- Reference the actual activity data — this should feel informed, not generic
- Capture the user's exact phrasing for external context — their words matter
- **At least one question must be a challenge, not an intake.** Take it from the
  questioner's list in Phase 2 and put it to the HUMAN, as AskUserQuestion with
  2-4 concrete options drawn from their real work:
  - "Is this urgent, or just loud?"
  - "What are you giving up by focusing here?"
  - "What blocks if this slips?"
  - "Could someone else do this? What's the actual blocker?"

  Options, not an open prompt — the point is to make the challenge cheap to
  answer, not to demand an essay. Always include an honest out
  ("Not sure — push me on it" / "I don't know yet"), and when the user takes it,
  record the answer as an open question rather than resolving it for them.

**Why this rule exists.** Phase 2 below runs a genuine adversarial interview —
"why this over that", opportunity cost, urgency vs. loudness — and aims all of it
at a persona, an LLM answering as the user. The human, meanwhile, got intake.
That is backwards: the persona cannot update its beliefs and the human can. A
persona has no failure mode, so it cannot correct anything
(`skills/onboard-charter/OKR-RUBRIC.md`). Keep Phase 2, but the hardest question
of the week goes to the person who can act on it.

Store all responses as `EXTERNAL_CONTEXT`.

---

## Phase 2 — Priority Discovery (Two-AI Session)

Now run the two-AI priority discussion. YOU are the questioner. The PERSONA answers using the user's decision-making DNA + the external context gathered in Phase 1.

**THE QUESTIONER'S JOB** (these same moves also belong in Phase 1, aimed at the
human — see the challenge rule there; this list is the source for both)**:**
- Challenge the persona's priorities: "Why this over that?"
- Probe for hidden dependencies: "What blocks if this slips?"
- Surface opportunity cost: "What are you giving up by focusing here?"
- Test for urgency vs. importance: "Is this urgent or just loud?"
- Push on delegation: "Could someone else do this? What's the actual blocker?"

**5-7 questions. Each question follows the same loop as cse:persona:**

1. **Generate your question** with questionText, options (2-4), and phase tag.

2. **Display the question:**
   ```
   ┌─ Priority Q{N} ──────────────────────────────
   │ {questionText}
   │
   │ Options:
   │   1. {option1}
   │   2. {option2}
   │   3. {option3}
   └──────────────────────────────────────────────
   ```

3. **Spawn the persona agent:**
   ```
   Agent(
     description: "Weekly: {name} — Q{N}",
     prompt: <PERSONA WEEKLY PROMPT — see below>
   )
   ```

4. **Display the answer:**
   ```
   ┌─ {Name} responds ────────────────────────────
   │ Answer:     {answer}
   │ Reasoning:  {reasoning}
   │ Confidence: {confidence}
   └──────────────────────────────────────────────
   ```

5. **Append to transcript.**

6. **After 5-7 questions**, proceed to synthesis.

### PERSONA WEEKLY PROMPT

Build this for each Agent call:

```
{PERSONA_PROMPT — full persona markdown}

---

{ACTIVITY_SUMMARY — commits, packages, decisions from Phase 0}

---

## External Context (From This Week's Calibration)

{EXTERNAL_CONTEXT — the user's answers from Phase 1, with their exact words}

---

## Last Week's Priorities

{LAST_WEEK content if available, or "First weekly session — no prior week to compare."}

---

## Priority Conversation So Far

{For each prior Q&A in this session:}
**Q{N}:** {question}
**Your answer:** {answer} ({reasoning})

---

## Current Question (Q{N})

{questionText}

Options:
1. {option1}
2. {option2}
3. {option3}

---

## Response Format

Answer this priority question in character. You're deciding what matters THIS WEEK — not generally, but for the next 5 business days given everything you know about the user's philosophy, current constraints, and the external context they just provided.

**Answer:** [Pick an option or give a custom answer]
**Reasoning:** [1-3 sentences. Reference external context, recent activity, or persona priorities]
**Confidence:** [high / medium / low]
```

---

## Phase 3 — Weekly Synthesis

Synthesize everything into the weekly context file. This is the temporal intent container.

```markdown
# Week {WW} — {WEEK_START} to {WEEK_END}

> {One-sentence thesis for the week — what's the through-line?}

## Context Shifts

{What changed externally since last week. Use the user's exact words
from Phase 1. If nothing changed, say "Priorities stable from last week."}

- {shift 1 — what changed and why it matters}
- {shift 2}

## This Week's Focus

{3-5 prioritized focus areas. Each has a success criterion.}

### 1. {Focus Area} ★
{Why this is #1 this week. What success looks like.}
- **Success:** {concrete, testable outcome}
- **Blocked by:** {dependency, or "nothing"}

### 2. {Focus Area}
{Why this matters this week.}
- **Success:** {concrete outcome}

### 3. {Focus Area}
{Why this matters this week.}
- **Success:** {concrete outcome}

## Delegation Queue

{Work that should be delegated to engineers, especially at Joyn.
Each item has enough context to become a spec or task.}

| Task | Delegate To | Status | Notes |
|------|------------|--------|-------|
| {task} | {person/role} | {ready/needs-spec/blocked} | {context} |

## Explicitly Deferred

{Things that are NOT this week, even if they feel urgent.
Naming what you're not doing is as important as naming what you are.}

- **{deferred item}** — {why not this week}
- **{deferred item}** — {why not this week}

## Carry-Forward

{Items from last week that rolled over. If first session, omit this section.}

- {item} — {why it rolled and whether priority changed}

## Weekly OKRs

{3-5 measurable outcomes. "If these are done by Friday, the week was a success."}

- [ ] {OKR 1}
- [ ] {OKR 2}
- [ ] {OKR 3}

---

*Calibrated {TODAY} via /cse:weekly with {persona} persona*
*Prior week: {LAST_WEEK_ID or "none"}*
```

---

## Phase 4 — Validation & Storage

1. Display the weekly context file to the user inline.

2. Ask via AskUserQuestion:
   - header: "Weekly check"
   - question: "Does this capture your priorities for the week?"
   - options: ["Yes, save it", "Close but needs adjustments", "Let me redo parts"]

3. ON "Yes, save it":
   ```
   Bash(mkdir -p .cascade/context/weekly)
   Write .cascade/context/weekly/{WEEK_ID}.md
   ```

4. ON "Close but needs adjustments":
   - Ask what to change
   - Edit inline
   - Re-present for approval

5. ON "Let me redo parts":
   - Ask which sections
   - Re-run relevant Phase 1 or 2 questions
   - Re-synthesize

6. Check if persona's "Current Priorities" section needs updating:
   - If the weekly session surfaced a priority shift that contradicts the persona's stored priorities, ask:
     - header: "Persona update"
     - question: "Your weekly priorities shifted from what's in your persona. Update the persona's Current Priorities section?"
     - options: ["Yes, update persona", "No, this is a temporary shift"]
   - If yes, edit the persona file's Current Priorities section with the new priorities and today's date.

---

## Phase 5 — Knowledge Capture

1. If online, log a decision:
   ```
   Bash(node bin/cascade.js log-decision --title "Weekly priorities: {WEEK_ID}" --chosen "{top 3 focus areas}" --reasoning "{1-sentence summary of what shifted}" --tags "weekly,priorities,temporal-intent" --category "strategic" --significance "standard")
   ```

2. Report completion:
   ```
   Weekly priorities saved: .cascade/context/weekly/{WEEK_ID}.md

   This week's focus:
   1. {focus 1}
   2. {focus 2}
   3. {focus 3}

   Delegation queue: {count} items
   Deferred: {count} items
   OKRs: {count} items

   Re-run /cse:weekly anytime priorities shift mid-week.
   ```

---

## How This Gets Used Downstream

The weekly context file is designed to be **selectively** injected into other workflows. It's a lens you can put on or take off — not a permanent filter.

### Injection Rules

| Skill | Default | Override |
|-------|---------|----------|
| `cse:spec` | **Inject** — tactical work benefits from priority awareness | `--fresh` to suppress |
| `cascade-delegate` | **Inject** — delegation needs current priority context | `--fresh` to suppress |
| `cse:persona` | **Auto-detect** from description (tactical → inject, strategic → skip) | `--weekly` to force, `--fresh` to suppress |
| `cascade-strategy` | **Skip** — strategic thinking shouldn't be constrained by this week's priorities | `--weekly` to force |
| `cascade-brainstorm` | **Skip** — exploratory by nature | `--weekly` to force |

**Auto-detect heuristics** (for `cse:persona`): descriptions containing "strategy", "vision", "explore", "brainstorm", "long-term", "architecture review", or "what if" suppress weekly injection. Everything else injects by default.

### Why selective injection matters

The weekly file is a temporal bias — it says "this is what matters right now." That's exactly right for scoping a feature or prioritizing a delegation queue. But it's exactly wrong for a strategy session or a new-vertical exploration, where the persona should think without time pressure. The `--fresh` flag gives the user an escape hatch when they want to go big picture.

### Downstream consumers

- **cse:spec** — Weekly context informs priority and scoping decisions.
- **cascade-delegate** — Delegation queue section can be directly converted to packages.
- **End-of-week review** — Compare OKRs against actual output for calibration.

Companion: **`/cse:weekly-review`** — the reconciliation ritual that reads the week's actual git activity *and* completed packages, fits them against your OKRs and roadmap, surfaces emergent work as candidate objectives, learns from your corrections, and writes the result back. `/cse:weekly` sets the week ahead; `/cse:weekly-review` closes the loop on the week behind and feeds the delta forward.

---

## Recalibration Protocol

If run mid-week (same WEEK_ID already exists):
- Load the existing weekly file
- Show what was set at the start of the week
- Focus on what CHANGED: "Monday you said X was #1 — still true?"
- Produce an updated file (overwrites the existing one)
- Note the mid-week recalibration in the file footer

---

## Container Taxonomy

This skill produces the third type of context container in Cascade:

| Container | Skill | Durability | What it captures |
|-----------|-------|------------|-----------------|
| **Knowledge** | cse:spec | Permanent | External, unopinionated facts about the project |
| **Intent** | cse:intent | Durable | Personal decision-making DNA — how you think |
| **Temporal** | cse:weekly | Ephemeral (weekly) | Current priorities — what matters right now |

The three containers together give Claude a complete picture: what's true about the project (knowledge), how you make decisions (intent), and what you're focused on this week (temporal).
