---
name: harvest
description: Capture a real, already-working AI workflow into a portable vertical spec — the front door to spinning up a new vertical.
when_to_use: "Someone has a workflow that ALREADY works — they got a real result by talking to Claude, largely outside Cascade — but couldn't reproduce it cleanly next time. Run this ON THEIR machine, in the session that did (or can see) the work. It reconstructs the workflow from evidence Claude can already observe, interviews the human only to fill gaps and capture the goal in their own words, and emits one portable harvest spec (JSON + readable markdown) they can send back. That spec is the intake for building a vertical pack + its skills. First step of the vertical-onboarding bundle. Triggers on 'harvest my workflow', 'capture how we did this', 'turn this into a repeatable process', 'onboard a new vertical', '/cse:harvest'."
argument-hint: "[vertical-slug] — e.g. 'documentary' or blank to infer"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# /cse:harvest — the Workflow Harvester

A structured interview that turns a **workflow that already happened** into a
**portable, structured spec** another builder can turn into a Cascade vertical
pack + skills. It exists because the most valuable workflows today live in one
heroic conversation and evaporate when the session ends — the practitioner got
a real result but would be back at square one starting the next project.

```
recon (Claude reconstructs)  →  interview (human fills gaps + states the goal)  →  synthesize  →  portable spec
Claude's own evidence            human's words only for goal/intent               one artifact    .cascade/harvest/{slug}.{json,md}
```

## THE HARD RULES (never violate)

> **This runs where the work happened — not where Cascade lives.** Assume the
> practitioner has NO Cascade context. Do not require a scan, an org, a decision
> log, or any `.cascade/context/`. The evidence is their own files and this
> session's memory of the work. If Cascade *is* available, enrich — never depend.
>
> **Claude reconstructs; the human corrects.** The practitioner already did the
> work with Claude watching. Do NOT make them narrate from scratch. Draft the
> workflow from what you can observe FIRST, then present it for confir/correct.
>
> **Human words only for the GOAL and "what great looks like."** Capture the
> outcome, the audience, and the quality bar verbatim. Never invent or embellish
> the intent. The observed *steps* can be your reconstruction; the *purpose* is theirs.
>
> **Do NOT run an MCP post-mortem.** What was missing in the tooling is a
> SEPARATE intake we already collect. Here, ask at most ONE light question about
> friction, and only to locate where a capability *would* help — not to diagnose
> what a server got wrong. Keep the conversation about the workflow.
>
> **Weight the phases.** Different verticals concentrate effort in different
> places (a documentary spends its hours on cropping and pacing stills BEFORE the
> pro editor ever opens; another might be all post). The spec is only useful if it
> records WHERE the time and back-and-forth actually went — that's what tells the
> pack builder which steps deserve tooling.

## Phase 0 — Bootstrap

1. Parse `$ARGUMENTS` for a vertical slug (e.g. `documentary`, `music`). If blank,
   infer one at the end from the reconstructed work and confirm it with the human.
2. Establish the working directory: ask "which folder holds the project you want
   to harvest?" if not obvious. This is where the evidence lives.
3. Note whether Cascade is reachable (best-effort, non-blocking):
   `Bash(node bin/cascade.js whoami 2>/dev/null || echo "no-cascade")`. If present,
   you may offer to push the spec as a package at the end; if not, the portable
   file IS the deliverable.

## Phase 1 — Recon (Claude reconstructs, zero questions yet)

Reconstruct the workflow from what you can already see. Draw on, in order:

- **This session's own memory** — if you (or a prior session the human can paste)
  performed the work, you witnessed the steps. Use that first.
- **The project's artifacts** — `Glob`/`Read` the working directory: input assets
  and their formats, intermediate outputs, any scripts or notes, and especially
  any **handoff file** the flow produced (e.g. the artifact that points a
  downstream pro tool at every asset — an import list, an EDL, a manifest). That
  handoff file often encodes the entire pipeline implicitly; read it closely.
- **Naming & folder conventions** — how things are organized reveals the process.

Draft a **workflow reconstruction**: an ordered list of phases, each with what
happens, its inputs and outputs, the tools used, and your best guess at where the
effort concentrated. Mark anything you're unsure of — those become the questions.
Do NOT ask the human anything yet.

## Phase 2 — The interview (confirm, correct, and capture intent)

Now bring the human in. Lead with your reconstruction so they react to something
concrete instead of facing a blank page. Use `AskUserQuestion` for structured
choices; ask open follow-ups in plain text when an answer reveals something.
Minimum 6 questions, maximum ~12. Cover:

1. **The goal (human's words, verbatim).** "What are you ultimately making, for
   whom, and what does a *great* one look like?" Do not paraphrase into the spec.
2. **Confirm the workflow.** Walk your reconstructed phases; let them fix the
   order, merge/split steps, and correct anything you guessed wrong.
3. **Where the hours went.** "Which step ate the most time or back-and-forth?"
   This sets `effort_weight` and surfaces the repeat pain worth automating. (For a
   photo documentary this is usually cropping/cleanup and scrubbing/pacing.)
4. **Never-again steps.** "What did you do by hand that you'd never want to repeat?"
   These are the strongest candidate skills.
5. **Assets & conventions.** Formats, folder layout, naming rules, what gets
   produced at each step and where it lives.
6. **The handoff boundary.** "What state must things be in before [the downstream
   pro tool] takes over? What's 'done' for the part we're capturing?"
7. **(Light, optional — ONE question max.)** "Was there a moment you wished Claude
   could *see or drive* something directly?" Record it as a capability the pack
   *could* provide — do not turn this into a tooling autopsy.

Maintain a transcript of the exact wording for anything distinctive.

## Phase 3 — Synthesize the harvest spec

Produce ONE structured spec. Write both a machine JSON and a readable markdown
mirror to `.cascade/harvest/{slug}.json` and `.cascade/harvest/{slug}.md`
(create the dir). The JSON schema — the contract downstream builders consume:

```json
{
  "vertical": { "slug": "", "displayName": "", "oneLineGoal": "" },
  "goal": { "producing": "", "audience": "", "greatLooksLike": "", "verbatim": true },
  "workflow": [
    {
      "phase": "",
      "whatHappens": "",
      "inputs": [], "outputs": [],
      "tools": [],
      "effortWeight": "low|medium|high",
      "pain": "",
      "automatable": true
    }
  ],
  "assets": { "formats": [], "folderLayout": "", "namingConventions": "" },
  "handoff": { "downstreamTool": "", "definitionOfDone": "", "handoffArtifact": "" },
  "candidateSkills": [ { "name": "", "solves": "", "fromPhase": "" } ],
  "capabilityNeeds": [ { "capability": "", "wouldHelp": "" } ],
  "openQuestions": []
}
```

Rules for synthesis:
- `candidateSkills` come from the high-`effortWeight` + `never-again` steps, not
  from every phase. Package the pain, not the pipeline.
- `goal.*` fields are the human's verbatim words; keep `verbatim: true` honest.
- `capabilityNeeds` stays about capabilities (e.g. "look at the same frame the
  editor is on and mark it") — not about what any server failed to do.

## Phase 4 — Confirm, then hand off

1. Show the markdown spec inline. Ask via `AskUserQuestion`: "Does this capture
   how it actually went?" → [Yes, save it] / [Close — let me fix parts] / [Redo a
   section]. On fixes, edit inline and re-present.
2. On save, the two files ARE the portable deliverable — tell the practitioner they
   can send `.cascade/harvest/{slug}.md` (and the `.json`) back to whoever is
   building the vertical.
3. If Cascade is reachable and they're in the shared org, offer to push it:
   `Bash(node bin/cascade.js idea --subject "Harvest: {displayName} workflow" --description "{oneLineGoal}. {N} phases, {M} candidate skills. See harvest spec." --intent custom --priority normal --tags "nugget,harvest,vertical,{slug}" --context "Captured via /cse:harvest")`
   so the workflow lands in the shared org for the pack builder to pick up.
4. Name the next step plainly: this spec is the intake for **building the vertical
   pack + its skills** — the `candidateSkills[]` become the reproducible steps, the
   `handoff` defines where the pack stops and the pro tool begins.

## Re-runs

Re-running for an existing slug loads the prior spec and re-interviews only what
changed — the workflow matures as it's used, so the spec should too. Diff the old
and new and highlight what moved (especially `effortWeight` shifts, which tell the
pack builder where tooling paid off and where new pain appeared).
