---
name: deferrals
description: "Find work you deferred then forgot — reads back every spec deferral, ranks by age and component liveness, triages a short list."
when_to_use: "Planning what to work on next; suspecting good work got dropped; after shipping a lean version; periodic debt review; onboarding someone who needs to know what was consciously left undone."
argument-hint: "[optional: --top N to change how many are triaged]"
allowed-tools: Read, Glob, Grep, Bash(node scripts/deferral-registry.mjs*), Bash(node scripts/component-map.mjs*), Bash(node *cascade.js *), Write, Edit, AskUserQuestion
---

# Deferral Registry — read back what you meant to come back to

## The problem

Every CSE spec records its scope boundaries, including the things chosen *not* to
do this pass. Measured on Cascade 2026-07-25: **220 specs, 650 genuine deferrals,
and not one had ever been read back.** The capture worked perfectly. The sweep did
not exist.

Steve's framing, which is the whole reason this exists:

> "We compromise to get some sort of MVP feature out and then we intend to have a
> fast follow-on but we forget about it. With AI coding agents I feel like a lot of
> the technical debt that we'd be looking at going forward is this exact thing."

A deferral is not an accident. It is deliberate, reasoned, and written down at the
moment the reasoning is freshest — *"this would overcomplicate the current spec, we
want it next."* That is the highest-quality debt signal a codebase can produce, and
throwing it away is worse than never capturing it.

## Two populations — never merge them

| | Meaning |
|---|---|
| **Deferred** | "We want this, later." Intended work. **This is the list.** |
| Excluded | "NOT included", "out of scope." A declared non-goal. Nobody dropped a ball. |
| Unclear | Neither prefix. Context only. |

On Cascade the split was 650 / 691 / 172. Presenting all 1,513 as one list would be
noise, and noise is why nobody read them.

## Phase 1 — Generate

Run the component map FIRST if it is stale — the ranking depends on it:

```bash
node scripts/component-map.mjs --quiet
node scripts/deferral-registry.mjs --top 12
```

Writes `docs/DEFERRALS.md`, `docs/deferrals.json`, `docs/deferral-answers.json`.

## Phase 2 — Understand the ranking

**Age alone is the wrong sort.** It puts a two-year-old deferral about deleted code
above last week's deferral about the thing you ship daily.

Ranking is **age × the liveness of the component it touches**, plus a bump for being
restated across multiple specs (a deferral you wrote down three times is one you keep
wishing for). A deferral pointing at a component the map marks `abandon` or `dropped`
**scores zero** — that is not debt, it is history.

Report the top slice with its evidence: age, component, component state.

## Phase 3 — Triage

Walk the top N with `AskUserQuestion`, batched. Three verdicts:

- **Revive** — still wanted. Offer to capture it as a Cascade idea or package
  immediately, or it just gets re-forgotten:
  ```bash
  node bin/cascade.js idea --subject "<short>" --description "<deferral text + origin spec + age>" \
    --tags "nugget,deferral-revival" --priority normal
  ```
- **Still deferred** — genuinely not yet. Records the verdict and re-surfaces later.
- **Obsolete** — the world moved. Stop surfacing it.

Rules:
- **Cap the session.** 12 is plenty. A triage abandoned halfway is worse than a short
  one finished.
- **Lead with evidence**, not the raw text — "120 days, touches `harness` which is
  ACTIVE" is what makes the answer fast.
- **Group near-duplicates.** The generator dedups by fingerprint, but related items
  should be asked together.
- **"I don't remember" is valid.** Record it rather than forcing a verdict.

## Phase 4 — Persist

Write verdicts into `docs/deferral-answers.json`, keyed by fingerprint:

```json
{ "answers": { "<fingerprint>": { "verdict": "revive|deferred|obsolete", "note": "...", "at": "<ISO>" } } }
```

Settled deferrals are suppressed next run, so **the list shortens every pass instead
of staying the same size forever.** That is the property that makes this sustainable.

## Honest limits

- **A deferral's text may not name its component**, so the join misses some. Those
  rank on age alone and are flagged "no component matched".
- **The registry cannot tell you whether a deferral was quietly done anyway.** It
  reports intent, not completion. If a revive turns out to be already-shipped, mark
  it obsolete — that is a correct outcome, not a failure.
- **Excluded items are never ranked.** If something was wrongly filed as a non-goal
  when it was really a deferral, it will not surface here. Fix the source spec.

## Triggers

"what did we defer", "what did we drop", "deferral registry", "what should we pick
back up", "find the fast follow-ons we forgot", "technical debt review", "what got
left out".
