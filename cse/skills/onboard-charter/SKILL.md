---
name: onboard-charter
description: "Charter-first onboarding — the interview that creates the org's ONE intent store. Successor to /cse:onboard-goals; fixes CHARTER_MISSING."
when_to_use: "The FIRST OKR-lane conversation for any org/repo, and the remedy every charter-dependent engine names: lattice drafting and archaeology v2 refuse to run without a saved charter (requireCharter throws CHARTER_MISSING pointing here). Three movements: (1) machine recon — `node bin/cascade.js charter-onboard --recon` detects the repo's surfaces (web, electron, cli-plugin, daemon, native, substrate, menu-bar) with evidence, and emits 5-10 deterministic strategy hypotheses phrased for cheap confirm/deny; (2) a HUMAN interview — hypotheses confirmed/denied/revised, then mission, near/long horizon goals, non-goals, per-surface intent, trade-offs, cadence, day zero, all via AskUserQuestion, one stage at a time; (3) an apply-gated write — saveCharter (versioned artifact, one node per org) plus organizations.okr_cadence/okr_day_zero. Dry-run by default; NOTHING is written without an explicit apply. Triggers on 'onboard charter', 'set up the charter', 'charter interview', 'what is this org actually trying to do', 'CHARTER_MISSING', and as the handoff before OKR lattice drafting."
argument-hint: "[run (default) | --recon (print surfaces + hypotheses only) | --dry-run (full preview, zero writes)]"
allowed-tools: Bash(node *), Read, Write, AskUserQuestion, cascade_get_org_context, cascade_search_decisions, cascade_get_recent_activity
---

# /cse:onboard-charter — the charter interview

One conversation that creates the org's **charter** — THE one intent store
(`cascade-web/src/lib/charter/`) that okr-intake, okr-seams, triage, lattice
drafting, and archaeology v2 all read. Before the charter existed, the org's
intent lived in three disconnected places none of the engines actually read.
This skill fills the store the charter module defined.

```
recon (machine)  →  hypotheses (confirm/deny)  →  interview (human)  →  apply  →  lattice handoff
zero writes         zero writes                   zero writes           2 writes    /objectives
```

## THE HARD RULES (never violate)

> **Human answers only.** The mission, horizon goals, non-goals, surface
> intents, and trade-offs are the human's words, captured verbatim. NEVER
> invent, embellish, or "improve" mission text. If an answer is thin, ask a
> follow-up — do not pad it.
>
> **Day zero is Steve's call.** Offer today's date as an option; never assume
> it. `null` (unset) is a legitimate answer.
>
> **Only two writes exist**, both behind `--apply`: the charter itself
> (via the real `saveCharter` — a new VERSION on the org's single charter
> node, never a second node) and `organizations.okr_cadence` +
> `okr_day_zero` (mig 350). This skill writes NO objectives, NO key results.
>
> **Read `OKR-RUBRIC.md` (sibling file) before Phase 3.** This skill writes no
> objectives, but the horizon goals captured here become them, so the level
> errors are introduced HERE and merely materialize downstream. Apply the six
> checks out loud during the interview and again at the Phase 5 handoff.
> Direction of authorship is non-negotiable: OKRs are SET by a human or a
> delegated persona, never derived from repo activity — inference may propose,
> never decide (decision `db3a359e`).

## Phase 1 — Recon (machine, zero writes)

```bash
node bin/cascade.js charter-onboard --recon          # human-readable
node bin/cascade.js charter-onboard --recon --json   # machine-readable
```

This detects the repo's surfaces from topology (package.json workspaces +
dependencies, daemon dirs, Expo/xcodeproj trees, substrate packages, tray
hints), each with concrete evidence lines, and generates **5-10 deterministic
hypotheses** — no LLM in the engine; YOU are the conversational layer.

Optionally enrich the hypothesis confirm/deny with org context:
`cascade_search_decisions` / `cascade_get_recent_activity` give you real
decision titles to test the hypotheses against.

## Phase 2 — Hypotheses (confirm / deny / revise)

Present each hypothesis with AskUserQuestion (options: Confirm / Deny /
Revise). A "revise" answer requires the human's correction in their own words
— record it verbatim in the verdict note. These verdicts seed the interview
(a denied "web is primary" hypothesis changes which surface you ask about
first) and are preserved in the draft for the completion brief.

## Phase 3 — The interview (AskUserQuestion, one stage at a time)

The engine's pure state machine (`src/charter-onboard/interview.ts`) defines
the order; walk it stage by stage:

1. **recon_summary** — confirm the surface list (drop wrong, add missing)
2. **hypotheses** — the verdicts from Phase 2
3. **mission** — why does this org exist? (free text, verbatim)
4. **horizon_goals** — near-term push + long-term intent.
   **This is the rubric's highest-leverage stage.** A good near-horizon answer
   already contains key results in prose — dates, counts, named people, a
   falsification test. Capture the human's words verbatim (the hard rule still
   binds), but while they talk, silently run the **number test**: every figure
   they say is a future KR with a baseline. If a goal has no number and no date
   anywhere in it, ask one follow-up — "how would you know that happened?" —
   rather than accepting an unmeasurable aspiration. Do NOT author key results
   here; just make sure the raw material for them exists.
5. **non_goals** — what the org is explicitly NOT doing
6. **surface_intent** — one question PER confirmed surface
7. **trade_offs** — what is deliberately given up, and for what
8. **cadence** — quarterly | six_week | monthly | custom
9. **day_zero** — ISO date or null (Steve's call)

Accumulate the answers into a `CharterDraft` JSON and write it to
`.cascade/charter-draft.json` for the human to see before anything is applied.

## Phase 4 — Preview, then apply

```bash
node bin/cascade.js charter-onboard --dry-run --draft .cascade/charter-draft.json   # zero writes
node bin/cascade.js charter-onboard --apply  --draft .cascade/charter-draft.json    # the ONLY writing step
```

Dry-run prints exactly what WOULD be written. Apply loads the REAL
`saveCharter` from `cascade-web/src/lib/charter/store.ts` (TS source via
`node:module` registerHooks — needs a repo checkout, Node >= 22.18) and then
updates `organizations.okr_cadence` + `okr_day_zero`. The engine refuses any
draft still containing dry-run placeholder text.

## Phase 5 — The lattice handoff

With the charter saved, offer the next step: **OKR lattice drafting** (the
`okr-lattice` module — the charter-first reset's drafting engine). Note
plainly: lattice drafting **refuses to run without a saved charter** —
`requireCharter` throws `CHARTER_MISSING` with this skill as the remedy — so
this interview is the gate everything downstream waits on. If the user
declines, the charter still stands on its own: every re-run of okr-intake,
okr-seams, and triage now reads it.

**Lattice drafting is a PROPOSAL generator, and say so plainly when you offer
it.** It writes only to `okr_proposals`; a human accept on `/objectives` is the
only path to a live objective, and that gate is deliberate rather than
incidental. Before presenting any draft for acceptance, run it through
`OKR-RUBRIC.md` — the drafter emits from charter text and will happily produce a
measurable statement titled as an objective (check 1) or a key result with no
baseline (check 6). Fix the level and fill the baselines BEFORE the human sees
them; a bad draft accepted is far more expensive than a bad draft corrected.

**A cheaper alternative worth offering when the tier is small.** If the org needs
only a handful of objectives, authoring them directly in conversation from the
charter's own horizon goals is faster and better than drafting-then-reconciling.
On 2026-08-02 that took about ten minutes for a four-KR objective transcribed
verbatim from the charter, and every number traced to a sentence the human had
already said. Offer the drafter for breadth, not as a ceremony.

## Re-runs

The charter is versioned — re-running this skill APPENDS a new version to the
same node (omitted fields carry forward; a save that only revises the mission
never wipes the surfaces). Re-interview only the stages the user wants to
change.
