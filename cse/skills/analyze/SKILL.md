---
name: analyze
description: Use when you face a real multi-branch decision (acquisition, build-vs-hold, pricing, market entry) — runs the CADE interrogation loop.
when_to_use: CADE v1 — the Cascade Analysis & Decision Engine interrogation loop. Runs a structured decision analysis as a CONVERSATION, not a report; every round of questioning moves a named assumption, every number lives in an Economic Model Spec computed by the shared deterministic evaluator, and the output is a versioned notebook artifact (renderer 'notebook') with per-branch economic cells, named structural scenarios (e.g. 'no_buyer'), controllability-tagged levers, and a cross-branch comparison + recommendation cell. Proven in the HomeNP dry-run (artifact 54403f04-9499-4cef-8be4-08c86ced5d32) — the canonical worked example.
argument-hint: "\"the decision to analyze\""
allowed-tools: Task, WebSearch, WebFetch, Read, Write, Bash(date *), Bash(pwd), Bash(echo *), Bash(node *), Bash(npx *), Bash(cat *), Bash(ls *)
---

# Cascade Analyze — the CADE v1 interrogation loop

Run a real decision analysis the way the HomeNP dry-run proved it works: **frame one decision, enumerate its branches, build a source-marked assumption ledger, interrogate the human in numbered rounds, model every branch as an auditable EMS, upgrade judgment to citations with research, attack the result as a hostile investment committee, then compare branches side-by-side and recommend** — all persisted as ONE versioned notebook artifact that evolves version-by-version as answers land.

**Canonical worked example:** artifact `54403f04-9499-4cef-8be4-08c86ced5d32` ("HomeNP: Flip vs. Feeder vs. Hospice Build — CADE dry-run"). Read it (cascade_get_artifact) when you want to see what good output looks like: v1 frame → v3 red-teamed models → v4 research-sourced.

**The contract for every number:**
```
Read packages/shared/src/economics/ems-schema.ts
```
The LLM never computes NPV/IRR/payback — it authors an Economic Model Spec (EMS); the shared stateless evaluator computes everything (same engine as /cse:economics). Named scenarios are first-class: any scenario name is valid, but every EMS must carry **exactly one scenario named `base`**. Assumptions may carry `controllability: 'controllable' | 'influenceable' | 'external'` — tag them, the notebook renders a levers summary from it.

## Core principles (non-negotiable)

- **One decision.** Not a topic, not a market — a decision someone must make. If the ask is a topic, narrow it in Phase 0 before anything else.
- **Interrogation over generation.** The value is in the QUESTIONS. Each round's questions are numbered, each maps to a named assumption it would move, and partial answers / honest unknowns are recorded as such — never silently filled in.
- **Model proposes, code computes.** All math via the shared evaluator. No hand-derived numbers anywhere in the notebook.
- **Every leaf has a source.** analyst-judgment (with rationale + confidence) is first-class and valid — but it is MARKED, and the research pass tries to upgrade it. Legal/regulatory facts are **do-not-guess** nodes: model them as ranges with an explicit flag, never as asserted facts.
- **Risks are probability-weighted, never zero.** A legal/structural risk the human says is "handled" still enters every model as a range with a low bound of 0 — the model refuses to carry it at zero (HomeNP: the clawback leak).
- **The notebook is the artifact.** One `renderer: 'notebook'` artifact, updated with a new VERSION per round (cascade_update_artifact) — never a new artifact per round.

---

## Phase 0 — Decision framing

1. Get context: `Bash(date +%Y-%m-%d)`, `Bash(pwd)`.
2. Establish, by asking if not given:
   - **The decision** (one sentence, with the alternatives visible in it).
   - **The decision-maker** (who signs; whose money/mandate).
   - **The horizon** (when is this decided; over what period is value measured).
   - **The evaluation frame** — discount rate/hurdle and what "wins" means. PE-adjust where relevant (HomeNP used NPV at a 20% hurdle + speed of capital return + mandate fit + investor optics, not a naked 12% NPV).
3. Create the notebook artifact now (version 1 = frame only):
   `cascade_create_artifact({ title, renderer: 'notebook', content })` with a markdown cell stating decision / decision-maker / horizon / frame, marked `Status: v1 — frame`.

## Phase 1 — Branch enumeration

1. Enumerate the real alternatives (typically 2–5 branches, `A1`, `A2`, …). For each: one-line thesis + what has to be true for it to win.
2. **Always include:**
   - The **repeated/compounded variant** of any one-shot branch — if a flip works once, the decision-maker will run it again; model the machine, not just the transaction (HomeNP: A1R, whose tornado exposed pipeline depth as THE unknown).
   - The **hold-by-default failure mode** — what actually happens if the preferred branch's counterparty/trigger never materializes (HomeNP: 'no buyer' collapses A1 into A2). This becomes a **named scenario** (e.g. `no_buyer`) inside the branch's EMS, not a footnote.
3. Add the branch map to the notebook (markdown cell).

## Phase 2 — Source-marked assumption ledger

1. List every assumption any branch's economics rests on. For each node record:
   - current value/range and **source status**: `org-internal-metric` (whose claim, as-of), `data-source-citation`, or `analyst-judgment` (rationale + confidence)
   - **what would upgrade it** (a document, a dataset, a written bid, a diligence item)
   - **do-not-guess flag** for legal/regulatory/compliance facts — these get researched or asked, never invented
   - a `controllability` tag: `controllable` (we set it), `influenceable` (we can move it), `external` (the world sets it)
2. Unaudited numbers stay marked unaudited in every cell that uses them (HomeNP: "$500K profit — UNAUDITED" traveled through all four models).

## Phase 3 — Interrogation rounds

1. Ask the decision-maker a NUMBERED list of open questions (5–8 per round, highest-value first). Each question names the assumption it moves and why it matters ("Payer concentration — moves every branch").
2. Record answers INTO the ledger. Partial answers recorded as partial; unknowns recorded as unknowns (they often become the most valuable finding).
3. Questions that stay unanswered across rounds get ESCALATED in prominence, not dropped (HomeNP: payer concentration "unmoved for two rounds").
4. Persist each round as a markdown cell ("Open interrogation — round N") in a new notebook version.

## Phase 4 — EMS cell authoring (one economic cell per branch)

1. For each branch author a full EMS (schema above): typed sources on every leaf, `{low, base, high}` + confidence on every benefit, formulas for the cash-flow DAG, `finance` with the frame's hurdle rate.
2. **Base scenario required** (exactly one `base`); add `upside`/`downside`, plus **named structural scenarios** for discrete states the low/high bounds can't express (`no_buyer`, `policy_shock`, `key_contract_lost`).
3. Tag `controllability` on assumptions (from the ledger) so the levers summary renders.
4. Validate then compute — the schema-forcing loop from /cse:economics:
   ```
   Bash(npx tsx packages/shared/src/economics/cli.ts validate {cwd}/{slug}.ems.json)
   Bash(npx tsx packages/shared/src/economics/cli.ts compute {cwd}/{slug}.ems.json {cwd}/{slug}.computed.json)
   ```
   Fix and re-validate (max 3 attempts). Read numbers ONLY from the computed output.
5. Update the notebook: one `kind: 'economic'` cell per branch (`title`, `notes` stating the model's shape and its honest simplifications, `ems`). The MCP write lane validates the full schema — a rejected body means fix the EMS, not lower the bar.

## Phase 5 — Research-upgrade pass

1. Take every `analyst-judgment` node worth money and try to upgrade it to `data-source-citation` via WebSearch/WebFetch (parallel research agents for independent nodes — `subagent_type: general-purpose`, same grounding rules as /cse:economics Phase 2).
2. An upgraded node carries `{sourceId, ref, retrievedAt, url}` with the derivation in `ref` (HomeNP: hospice margin = CMS FY2026 day rate × MedPAC length-of-stay × for-profit margin, every factor cited).
3. **Note which nodes RESIST public sourcing** — they are the proprietary-data asks (HomeNP: the census→hospice election rate = the claims-PAID broker node). Name them explicitly in a research-findings markdown cell; they are business-development leads, not failures.
4. Re-run validate/compute for every touched EMS; bump the notebook version ("Status: vN — research-sourced").

## Phase 6 — Red-team pass

1. Attack your own models as a hostile investment committee. Standard attack surface:
   - the deal-structure fig leaf (what liability "quarantine" actually leaks — model it as a probability-weighted range, never zero)
   - the anchor that is strategy money vs financial value (what happens when the premium buyer class walks)
   - the branch whose tornado rests on an unverified driver (say so, by name)
   - the option a branch DESTROYS (a flip that kills the infrastructure play carries that option's value in its cost column)
   - unaudited inputs (what quality-of-earnings could move)
2. Write the attacks INTO the notebook as a numbered red-team markdown cell, and PUSH the material ones back into the models (new assumptions, widened ranges, named scenarios) — a red-team point that changed no number is either resolved or not yet taken seriously.

## Phase 7 — Comparison + recommendation

1. Add a `kind: 'comparison'` cell: `refs` = the economic-cell indexes (2+), `metric: 'npv'`, side-by-side NPV-by-scenario across branches.
2. Write the `recommendation` (markdown): which branch, under what conditions it flips, and the next de-risking action ranked by tornado swing × controllability — prefer de-risking `influenceable` high-swing nodes ("get one written bid" beats "re-model the terminal value").

## Phase 8 — Capture

1. Log defects/insights surfaced by the loop as ideas (`node bin/cascade.js idea … --tags "nugget,cade"`); log the analysis decision if one was made (`node bin/cascade.js log-decision …`).
2. Final notebook version gets a status line ("vN — red-teamed + research-sourced; open nodes: …").
3. Report back: the recommendation, the top 3 open interrogation questions, and the tornado-driven "what to de-risk next".

---

## What this skill is NOT

- Not /cse:economics (single-candidate ROI ranking with a fixed report shape) — /cse:analyze is multi-branch, conversational, and notebook-native. It REUSES the same EMS contract, evaluator, and CLI.
- Not a one-shot report generator. If the human answers zero interrogation rounds, say the analysis is a v1 frame with unmoved assumptions — do not dress it up as diligence.
- Not a template library. Interrogation templates accrete from real analyses; this skill encodes the loop, not a domain checklist.
