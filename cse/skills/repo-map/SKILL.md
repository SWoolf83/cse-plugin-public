---
name: repo-map
description: "Generate a repo's component map — what it is made of, what is alive vs parked vs dropped, and where work stalled."
when_to_use: "Onboarding a new repo or org; before setting initiatives; when 'what are we even working on' is hard to answer; when retroactive ingestion feels like it's surfacing noise; when you suspect work was dropped and forgotten."
argument-hint: "[optional repo path — defaults to current directory]"
allowed-tools: Read, Glob, Grep, Bash(node scripts/component-map.mjs*), Bash(git *), Bash(node *cascade.js *), Write, Edit, AskUserQuestion
---

# Repo Map — the README you never wrote, generated

Produce a **component map**: what a repository is actually made of, which parts are
alive, which are parked, which were dropped — and the short list of things only a
human can settle.

## Why this exists

Three failures this is built against, each learned the hard way:

1. **A hand-written README rots.** It is true the day it is written and wrong the
   next time someone adds a folder. This map is *derived*, so it is true by
   construction and regenerable on demand.

2. **The product decomposition is not the directory structure.** A single "web app"
   directory routinely hides a dozen distinct products with different owners,
   cadences and priorities. Initiatives must point at *those*, not at the repo.

3. **"Is it alive" is two questions, not one.** Existence (structural) × recency
   (temporal). A one-axis probe will call something HOT on commit volume when it has
   been idle three weeks, and call something GONE when it is alive on a held branch.
   **Shelved is not dead. Held is not dead. Finished is not dead.**

## The principle

> **Knock out everything structurally decidable. Then ask a human a short list.**

Most of a repo answers itself: the thing exists or it does not, it was touched
recently or it was not. Only a narrow residue is genuinely undecidable — and that
residue is where the value is, because it is exactly where work got dropped.

Never make the human adjudicate hundreds of rows. Batch the residue, attach the
evidence, ask once, and **persist the answers** so the next run asks less.

---

## Phase 1 — Generate

```bash
node scripts/component-map.mjs --repo <path>
```

Writes three artifacts (defaults under `docs/`):

| File | Purpose |
|---|---|
| `COMPONENT-MAP.md` | The human-readable map — **commit this** |
| `component-map.json` | Machine-readable, for agents and downstream tooling |
| `component-map-questions.json` | The batched residue for a human |

The generator walks git history in **one pass** (cost is independent of component
count, so it stays fast on a large unfamiliar repo), discovers tier-1 deployable
units and tier-2 product subsystems, and computes liveness on both axes.

If the repo has no `scripts/component-map.mjs`, copy it in from the Cascade repo —
it is dependency-free and self-contained by design, so it drops into any git repo.

## Phase 2 — Read the map back

Show the user:

- **Tier 1** — deployable units (web app, data layer, daemon, CLI, plugin, mobile…)
- **Tier 2** — product subsystems, which is the level ownership actually lives at
- **Held work** — branches carrying commits that never landed. Invisible to anyone
  reading the default branch, and a common place for real work to be forgotten.
- The **HOT ↔ DORMANT** spread, which is the shape of where attention has gone

Call out the cross-product explicitly: **history volume × current liveness**. High
history + dormant is either a finished thing or your largest piece of quiet debt,
and the map deliberately cannot tell you which. That is the human's job.

## Phase 3 — Triage the residue (the part that matters)

Read `component-map-questions.json`. Walk the questions with `AskUserQuestion`,
**batched by kind**, highest-evidence first:

- **`stalled`** — real investment, then silence. *"Finished, parked, or dropped?"*
  This is the drop-the-ball detector. With AI-assisted development it is very easy
  to lose track of a thread: a lean version ships, the four polish items that would
  have made it prime-time get deferred, and nobody looks again. These questions find
  those.
- **`held`** — a branch with commits that never landed. *"Merge, keep holding, or
  abandon?"*
- **`ownership`** — dormant units with no clear owner.

Rules for this phase:

- **Never ask about something structurally obvious.** If the code answers it, do not
  spend the human's attention.
- **Ask in batches**, not one at a time. Attach the evidence to each option so the
  answer is fast.
- **Cap the session.** If there are more than ~10 questions, take the highest-evidence
  ones and say plainly how many were deferred. A triage session the user abandons
  halfway is worse than a short one they finish.
- **"I don't remember" is a valid answer** — record it as `unknown` rather than
  forcing a verdict. An honest gap beats a fabricated decision.

## Phase 4 — Persist the answers

Write each verdict into `docs/component-map-answers.json`:

```json
{
  "answers": {
    "<subject>": { "verdict": "finished|parked|dropped|merge|hold|abandon|unknown",
                   "note": "<why, in the user's words>",
                   "at": "<ISO date>" }
  }
}
```

Answers **override** the derived state and **suppress the question** next time. This
is what makes the loop converge: the human's cost falls on every regeneration instead
of staying flat. Regenerate after answering so the map reflects the new verdicts.

## Phase 5 — Turn it into intent

The map is an axis, not an end. With it you can:

- **Scope initiatives to components.** "Improve mobile PWA UX" resolves to named
  subsystems with real liveness evidence. Each row is ownable — by a person or an
  agent — which is what makes work delegable.
- **Revive what was parked.** Every `parked` verdict is a candidate initiative the
  user had already decided mattered and then lost track of.
- **Ground agent conversations.** A chief-of-staff or strategist agent reasoning
  without this map treats every part of the repo as equally relevant, which is never
  true. Feed it `component-map.json`.

Offer to capture parked items as Cascade ideas or packages:

```bash
node bin/cascade.js idea --subject "<component>: resume parked work" \
  --description "<evidence + the user's stated reason>" --tags "nugget,parked,component-map"
```

## Honest limits — state these, do not paper over them

- **Commit recency is a proxy for attention, not for importance.** A stable
  foundational component may be untouched precisely because it works.
- **A vendored or generated directory can look enormous** without being product.
- **Tier-2 discovery keys on the largest app unit.** A repo with several equally
  large apps will need more than one pass.
- **The map cannot tell finished from abandoned.** That is the entire reason
  Phase 3 exists.

---

## Triggers

"map this repo", "what is this codebase made of", "component map", "what are we
actually working on", "what did we drop", "what's stalled", "generate the README",
onboarding an unfamiliar repo, scoping initiatives to parts of a monorepo.
