---
name: intent
description: Use when you want to build a personalized decision persona from an interview — captures your intent and priorities for /cse:persona.
when_to_use: Build a personalized decision persona from an interactive interview. Extracts your intent, philosophy, economic reasoning, and priorities into a reusable persona that /cse:persona can run autonomously on your behalf.
argument-hint: "[name] — e.g. 'steve' or blank for default"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion, Agent
---

# Intent Container — Personal Decision Persona Builder

An interactive interview that extracts your decision-making DNA into a structured persona file. The output is a persona that `/cse:persona` can use to answer CSE discovery questions the way YOU would — not as a generic archetype, but as a mirror of your actual judgment.

## What This Produces

A persona file at `${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{name}.md` that encodes:
- Your economic philosophy and constraints
- Your technical biases and why you hold them
- Your decision-making patterns (from Cascade's decision log)
- Your current priorities and non-negotiables
- Your risk tolerance and time horizons
- Your working relationship with AI

This persona is a living document — re-run this skill periodically to recalibrate as priorities shift.

---

## Phase 0 — Bootstrap

1. Parse `$ARGUMENTS` for a persona name. Default to the user's first name (from `cascade whoami` or email) if blank.
2. Check if an existing intent persona exists for this name:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{name}.md
   ```
   If it exists, note it — the interview will validate and update rather than start from scratch.

3. Load existing signals about this user from Cascade:
   ```
   Bash(node bin/cascade.js sync --force 2>/dev/null || echo "sync-unavailable")
   ```
   Read if available:
   - `.cascade/context/system/org-context.json` — org name, role
   - `.cascade/context/decisions/INDEX.md` — decision history
   - `.cascade/context/scans/codebase-latest.json` — tech stack
   - `.cascade/context/system/active-assumptions.json` — what the org believes

4. If decision log is available, analyze the last 20 decisions for patterns:
   - Read 5-10 recent decision files from `.cascade/context/decisions/`
   - Note: what does this person consistently prioritize? What do they defer? What economic reasoning appears repeatedly?

5. Display status:
   ```
   ══════════════════════════════════════════════════
   Intent Container — Building {Name}'s Decision Persona
   Existing persona: {exists/new}
   Decision history: {count} decisions available
   Org: {org name}
   Stack: {from scan or "unknown"}
   ══════════════════════════════════════════════════
   ```

---

## Phase 1 — The Interview

This is a real conversation with the human. Use AskUserQuestion for structured questions, but ALSO ask open-ended follow-ups based on their answers. The goal is to extract genuine decision-making DNA, not fill out a form.

**TONE:**
- This is a confidant conversation, not an interrogation
- Reference what you know from their decision history — "I noticed you consistently choose X, is that a deliberate philosophy?"
- Probe the WHY behind preferences, not just the WHAT
- If they give a short answer, dig deeper: "What's behind that?"
- Surface contradictions gently: "Earlier you said X but your decisions show Y — what's the real rule?"

**INTERVIEW STRUCTURE (7 dimensions, ~10-15 questions total):**

### Dimension 1: Company Context & Economic Reality
Understand the stage, constraints, and what "success" means right now.

Ask about:
- Company stage and what that means for decisions (startup scrappiness vs. enterprise rigor)
- Budget reality — what's the actual constraint? Time? Money? Both?
- What's the economic thesis? How does the company make money (or plan to)?

### Dimension 2: Technical Philosophy
Not what stack they use (we know that from the scan) — WHY they chose it and what that reveals about how they think.

Ask about:
- When they look at a new feature, what's the first question they ask?
- What's their relationship with technical debt? (Tolerate it? Fear it? Use it strategically?)
- What's an architectural decision they made that they're proud of? What made it right?
- What's one they regret?

### Dimension 3: Decision-Making Patterns
How do they actually make decisions when it matters?

Reference their decision log if available:
- "You've made {N} decisions in Cascade. Looking at the recent ones, I see patterns like {X}. Is that deliberate?"
- What inputs matter most to them? Data? Intuition? Precedent? Speed?
- When do they decide fast vs. slow? What triggers caution?
- How do they handle uncertainty — act and correct, or wait for clarity?

### Dimension 4: Current Priorities
What matters RIGHT NOW — not generally, but this quarter.

Ask about:
- Top 3 priorities for the next 30 days
- What's the ONE thing that would move the needle most?
- What are they explicitly NOT focusing on and why?

### Dimension 5: Non-Negotiables
The things that don't flex regardless of pressure.

Ask about:
- Technical non-negotiables (quality bars, security, performance)
- Product non-negotiables (user experience standards, brand)
- Business non-negotiables (ethics, pricing, partnerships)

### Dimension 6: Risk Tolerance & Time Horizons
How do they balance present and future?

Ask about:
- When do they invest in "doing it right" vs. "getting it done"?
- How far ahead do they architect? 1 sprint? 1 quarter? 1 year?
- What's an acceptable failure rate for AI-generated work?

### Dimension 7: Working Relationship with AI
How do they want to work with the persona?

Ask about:
- What decisions should the persona make autonomously vs. flag?
- What would make them trust the persona's output without reviewing every line?
- What would make them NOT trust it?
- When should the persona push back on the CSE questioner vs. go with the flow?

**RULES:**
- Use AskUserQuestion for structured questions with options (2-4 options per question)
- ALSO ask open-ended follow-ups in plain text when their answer reveals something interesting
- Minimum 8 questions, maximum 15
- Reference their actual decision history and codebase context — this should feel personal, not generic
- Capture their exact phrasing when they say something distinctive — their voice matters for the persona

**TRANSCRIPT:**
Maintain an internal transcript of all Q&A pairs with the user's exact words.

---

## Phase 2 — Synthesis

After the interview, synthesize everything into a persona file. This is the critical step — the persona must sound like THEM, not like a generic profile.

**Structure the persona file following the same format as existing personas:**

```markdown
# {Name}

## Identity

{2-3 sentences capturing who this person is in their own words — their role,
their company, their relationship to the work. Use their actual phrasing
where possible. This should feel like a self-description, not a bio.}

## Philosophy

{5-7 bullet points, each starting with a bold principle followed by
elaboration. These should be THEIR principles derived from the interview,
not generic wisdom. Reference specific things they said.}

## Economic Reality

{3-5 bullet points about the current constraints, budget philosophy,
and how economic reasoning shapes technical decisions. This section
is unique to intent personas — generic personas don't have it.}

## Current Priorities (as of {date})

{3-5 bullet points about what matters right now. These will be
recalibrated on the next interview run.}

## How You Make Decisions

{5-7 numbered items describing their actual decision process,
derived from the interview and decision log analysis. Include
their relationship with uncertainty, speed vs. thoroughness,
and what triggers caution.}

## Non-Negotiables

{3-5 bullet points — the things that don't flex.}

## Your Biases (Transparent)

{5-7 bullet points acknowledging their known biases and preferences.
These inform the persona's decisions without being dogmatic.}

## How You Answer Discovery Questions

{6-8 bullet points instructing the persona on HOW to answer in
this person's voice. Include: when to be decisive vs. cautious,
what to reference, what to push back on, when to flag for the
real human, and how to handle scope creep.}

## Working with AI

{3-5 bullet points about their expectations for AI autonomy,
what builds trust, and where they want the persona to be
more conservative.}
```

---

## Phase 3 — Validation & Storage

1. Display the generated persona to the user inline. Let them read it.

2. Ask via AskUserQuestion:
   - header: "Persona check"
   - question: "This is your decision persona. Does it capture how you actually think and decide?"
   - options: ["Yes, save it", "Close but needs adjustments", "No, let me redo parts of the interview"]

3. ON "Yes, save it":
   - Write to `${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{name}.md`
   - Copy to `${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{name}.md`
   - Report: "Your intent persona is saved. Use it with: /cse:persona {name} [description]"

4. ON "Close but needs adjustments":
   - Ask what to change
   - Edit the persona inline
   - Re-present for approval

5. ON "No, let me redo parts":
   - Ask which dimensions to re-interview
   - Run those sections again
   - Re-synthesize

---

## Phase 4 — Knowledge Capture

After saving, capture the session:

1. If online, log a decision:
   ```
   Bash(node bin/cascade.js log-decision --title "Intent persona created: {name}" --chosen "Built personalized decision persona from interview" --reasoning "{1-sentence summary of key philosophy extracted}" --tags "persona,intent,meta" --category "product" --significance "significant")
   ```

2. Save a nugget for the intent container concept:
   ```
   Bash(node bin/cascade.js idea --subject "Intent persona: {name}" --description "Personalized decision persona built from interview. Key traits: {top 3 traits}. Re-run /cse:intent periodically to recalibrate." --intent "custom" --priority "normal" --tags "nugget,persona,intent" --context "Built via cse:intent interview")
   ```

---

## Recalibration Protocol

When this skill is re-run for an existing persona:
- Load the existing persona file
- Show the user what's currently captured
- Focus the interview on what's CHANGED: "Last time you said X — still true?"
- Update the Current Priorities section (these shift fastest)
- Validate that Philosophy and Non-Negotiables still hold
- Diff the old and new persona and highlight what changed
