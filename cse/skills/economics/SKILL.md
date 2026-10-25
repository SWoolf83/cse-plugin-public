---
name: economics
description: Use when you want a deterministic, auditable economic analysis — feature-ROI ranking and go/no-go (NPV/IRR/payback), provenance-gated.
when_to_use: Deterministic, auditable economic analysis (feature-ROI ranking + go/no-go). The LLM emits an Economic Model Spec (EMS); a single shared stateless evaluator computes NPV/IRR/payback + scenarios + a sensitivity tornado; a traceability gate enforces provenance; the cited, defensible result is handed to /cse:publish.
argument-hint: "FRAMEWORK \"feature(s) or decision to analyze\""
allowed-tools: Task, WebSearch, WebFetch, Read, Write, Bash(date *), Bash(pwd), Bash(echo *), Bash(node *), Bash(npx *), Bash(cat *), Bash(ls *)
---

# Cascade Economic Analysis

Run a deterministic, auditable economic analysis. The LLM does NOT do the math — it emits a structured **Economic Model Spec (EMS)**; a single shared **stateless evaluator** in `@cascade/shared` computes every number; a **traceability gate** proves every number has provenance; the result is published via `cascade-publish`.

## Available Frameworks

| Command | Framework | Status |
|---------|-----------|--------|
| `feature-roi` | Feature ROI Analysis (ranking; go/no-go = 1 candidate) | available |
| `build-vs-buy` | Build vs Buy Analysis | planned next |

Usage: `/cse:economics feature-roi "rank: in-app live recompute vs scenario toggles vs Monte Carlo"`

## Core principle — model proposes, code computes

- The agents in this skill GROUND assumptions (cost, benefit, comparables, risk). They never compute outputs.
- The deterministic math (NPV, IRR, payback, base/upside/downside scenarios, one-way sensitivity tornado) is done ONLY by the shared evaluator: `packages/shared/src/economics` (`@cascade/shared`).
- The evaluator is a **stateless pure function** (`evaluate(ems) -> ComputedModel`): no I/O, no DB, no randomness. It is imported as a plain module so a future cascade-agent port reuses it unchanged.
- Provenance, not LLM-distrust: an **analyst-judgment** range with rationale + confidence is a first-class, valid source. The gate only fails numbers with NO traceable provenance.

---

## Instructions

You are an economic-analysis orchestrator. Follow these phases exactly. Do NOT compute any output number yourself — always call the shared evaluator.

---

### Phase 1 — Parse & Setup

1. The arguments are: `$ARGUMENTS`.
2. If empty, show the Available Frameworks table and stop: "Usage: /cse:economics FRAMEWORK \"target\"".
3. Parse the first word as the framework id, the rest as the target/decision (strip quotes).
4. Get context:
   ```
   Bash(date +%Y-%m-%d)
   Bash(pwd)
   ```
5. Load the framework registry:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/economics/frameworks.json
   ```
6. Match the framework id against each `frameworks[].id` and `aliases` (case-insensitive). If it matches a `planned_frameworks` entry, say it's planned-next and stop. If no match, show the table and stop.
7. Store the matched framework's `name`, `output_sections`, and `agents`.
8. Slug: `cascade-economics-{framework_id}-{target_slug}-{date}` (lowercase, hyphens, max 40 chars).
9. Resolve org name for co-branding (used by cascade-publish): read `~/.cascade/auth.json`, decode the JWT middle segment with `Bash(echo '{segment}' | base64 -d 2>/dev/null)`, look for `org_name`.
10. Load data sources for grounding:
    ```
    Read ${CLAUDE_PLUGIN_ROOT}/skills/research/data-sources.json
    ```
    Select the most relevant cost sources — for feature-roi always include **bls** (OEWS dev wages, occupation 15-1252), **fred** (wage inflation), and **litellm** (model pricing for any token/agent build cost). Check keys:
    ```
    Bash(echo "FRED:${FRED_API_KEY:+set} BLS:${BLS_API_KEY:+set}")
    ```
    litellm needs no key (static JSON). Build a compact Data Sources Brief for the cost/benefit agents.

---

### Phase 2 — Parallel Research (Ground the Assumptions)

Launch the matched framework's agents **simultaneously** (all in one message, all `subagent_type: general-purpose`). For each agent:
1. Take the agent's `prompt`, replace `{target}` with the target string.
2. Prepend: "You are a {agent.role}. Today's date is {date}. You are GROUNDING assumptions for a deterministic economic model — you do NOT compute NPV or any output; you only source the leaf inputs."
3. Append the Data Sources Brief (cost/benefit agents) and: "For EVERY figure, return a typed source — data-source-citation {sourceId, ref, retrievedAt}, org-internal-metric {metric, query, asOf}, or analyst-judgment {rationale, confidence}. Express every BENEFIT as a {low, base, high} range with confidence, never a point. Include source URLs as numbered references."

Wait for all agents. Their outputs are the raw material for the EMS — not the EMS itself.

**Cost-labeling rule (enforce):** any LLM/token build-or-run cost is labeled **standard-rate-equivalent** (LiteLLM API list price), never Cascade's actual Max-Plan $0.

---

### Phase 3 — Model Construction (Emit the EMS)

Synthesize the agent outputs into a single **Economic Model Spec** as schema-forced JSON. The schema is the contract:
```
Read packages/shared/src/economics/ems-schema.ts
```

Construct an EMS object with:
- `emsVersion: "1.0"`, `framework`, `candidate` (or one EMS per candidate when ranking several).
- `assumptions[]`: every leaf. Scalars (costs/rates) carry `value` + `unit` + `source`. Benefits carry a `{low, base, high}` `range` + `confidence` + `unit` + `source`. **Every leaf MUST have a `source`.** Analyst-judgment leaves MUST have a `rationale`.
- `formulas[]`: computed cells, each referencing assumption/formula keys in `inputs` and an arithmetic `expr`. Include the per-period cash-flow cells. (Framework-specific: for **feature-roi**, period 0 is typically the upfront build cost as a negative. Do NOT apply this shape to build-vs-buy — see the note below.)
- `scenarios[]`: `base`, `upside`, `downside`, each remapping benefit leaves to `low`/`high` bounds (downside risks → low, upside → high) via `overrides`.
- `finance`: `discountRate`, `horizonPeriods`, and `cashFlowKeys` (ordered formula keys, index 0 = period 0).

**Framework note — build-vs-buy (delta stream).** Decided on the NPV of the *difference*, not headline price. Model ONE EMS over an incremental delta stream (NOT the feature-roi period-0 shape above):
- Per-period cash flow = **buy cost avoided − build cost incurred**. NPV>0 → **build** wins; NPV<0 → **buy** wins.
- Author swingable drivers as **signed benefit-kind ranged leaves** so they ride the tornado: buy-side costs (vendor subscription, lock-in premium, switching, exit) enter the delta **positively** (build-favoring); build-side costs (dev, maintenance) **negatively**.
- Build side MUST carry an **explicitly author-set ongoing-maintenance leaf** (~15-20%/yr of build cost) — never omit, never silently default (that flatters build) — plus an opportunity-cost note for diverted engineering.
- Buy side carries: switching (period 0), a recurring **lock-in / captive-pricing premium** (swingable range — the key "vendor raises rates" tornado driver), and a **surfaced, undiscounted terminal exit cost** (data egress / re-platforming) named even if outside the horizon — the exit-liability asymmetry is the moat math.
- Surface **do-nothing / status-quo** qualitatively in the Recommendation (not in the delta math; a true third arm is deferred — would need engine changes).

**Validation loop (schema-forcing).** Neither Claude Code nor cascade-agent guarantees native schema-forced output, so validate explicitly and RETRY:
1. Write the EMS to `{cwd}/{slug}.ems.json`.
2. Validate against the Zod schema via the economics CLI (a real, tested entry point inside `@cascade/shared`; runs with tsx so it works regardless of the package's module type — do NOT inline `node -e "import …ts"`, which fails on CJS↔ESM named-export interop under Node 20+):
   ```
   Bash(npx tsx packages/shared/src/economics/cli.ts validate {cwd}/{slug}.ems.json)
   ```
3. If invalid, read the issues, FIX the EMS JSON, rewrite, and re-validate. Repeat (max 3 attempts). Do not proceed until the EMS validates.

---

### Phase 4 — Deterministic Compute (Shared Stateless Evaluator)

Run the shared evaluator — the ONLY thing that computes numbers — via the economics CLI:
```
Bash(npx tsx packages/shared/src/economics/cli.ts compute {cwd}/{slug}.ems.json {cwd}/{slug}.computed.json)
```
This writes `{slug}.computed.json` (the ComputedModel) and prints the scenario NPVs + tornado. Do NOT transcribe or re-derive any of these numbers by hand — read them from the file. (The CLI lives inside `@cascade/shared` so its sibling imports resolve cleanly under tsx; it is the same evaluator the Vitest suite exercises.)

---

### Phase 5 — Traceability Gate

Run the post-compute gate. It fails ONLY orphan numbers (no declared leaf of any source type, no computed-cell provenance). Analyst-judgment-backed numbers pass:
```
Bash(npx tsx packages/shared/src/economics/cli.ts gate {cwd}/{slug}.computed.json)
```
(Tip: `npx tsx packages/shared/src/economics/cli.ts all {cwd}/{slug}.ems.json {cwd}/{slug}.computed.json` runs validate → compute → gate in one call.)
If it fails: the orphan list tells you which numbers lack provenance. This almost always means a formula references a key with no backing assumption — go back to Phase 3, add the missing leaf assumption (with a source) or fix the formula inputs, re-validate, re-compute, re-gate. The gate enforces provenance, NOT LLM-distrust — never strip an analyst-judgment number to satisfy it.

---

### Phase 6 — In-Session Live Recompute (Interactive)

Because the evaluator is an instant pure function, you can recompute live in-session with NO persistence and NO UI. When the user asks a "what if" (e.g. "bump adoption 20%", "what if build cost is 1.5x"):
1. Clone the in-memory EMS, apply the change to the relevant leaf (a range bound, a scalar value, or a scenario override).
2. Re-run the evaluator on the modified EMS (same Phase-4 `cli.ts compute` command, writing to a scratch path like `/tmp/econ-scratch.json`).
3. Print the delta: `adoption +20% → base NPV {old} → {new} (Δ {diff})`.
4. Do NOT write files or touch the DB for these explorations — they are ephemeral. Persist only the chosen final EMS.

---

### Phase 7 — Artifact (Reuse cascade-publish)

Do NOT introduce a parallel render stack — there is no `template.html` in this skill. Compose the analysis as Markdown using the framework's `output_sections`, pulling every number from `{slug}.computed.json` (never re-derived), and hand it to **cascade-publish**:
1. Write the Markdown analysis to `{cwd}/{slug}.md` with the framework's `output_sections` as `##` headers. Include:
   - The computed NPV/IRR/payback per scenario (from the ComputedModel).
   - The tornado as a sorted table (driver, NPV-low, NPV-high, swing).
   - A **Provenance & Traceability Ledger** section: list each leaf assumption, its value/range, and its source (data-source-citation / org-internal-metric / analyst-judgment with rationale + confidence). Label any token-derived build cost **standard-rate-equivalent**.
   - The ranking / recommendation.
2. Hand off to cascade-publish for the branded HTML/PDF (technical variant), passing the org name from Phase 1.

---

### Phase 8 — Dual-Path Persistence

Compute is stateless, so persistence is the ONLY storage step. Persist on two paths:

**Always (local artifact):** the files written above —
- `{slug}.ems.json` (the validated EMS),
- `{slug}.computed.json` (the ComputedModel),
- `{slug}.md` (+ the cascade-publish HTML/PDF).

**Org-DB persistence (NOT YET WIRED — local artifact is the system of record):** the intended durable home is an `economic_analysis` package with the EMS in `type_data` JSONB (so the corpus becomes JSONB-queryable — "rank all features by NPV", "which assumptions recur"). As of 2026-06-01 there is **no terminal command** to create one: the CLI only creates spec-typed packages (`spec save --package`), there is no MCP `create_package` tool, and the only real creator is the cascade-web server action `createPackage` (not terminal-callable). So:
1. The local `{slug}.ems.json` + `{slug}.computed.json` + `{slug}.md` ARE the system of record.
2. State the gap explicitly to the user:
   `○ economic_analysis package save: deferred — no terminal create-package path yet. Lands with the in-app wave, or a future "cascade economic save" CLI command.`
   Do NOT invoke a `create-package` command — it does not exist and will error.
3. (Follow-up, separate spec) Wire real persistence: either add a `cascade economic save <ems.json>` CLI command that inserts a `package_type='economic_analysis'` row (EMS in `type_data`), or persist via the in-app surface when that wave is built.

---

### Phase 9 — Report

Report concisely:
```
Economic analysis complete — {Framework Name}: {candidate(s)}

  Base NPV:   {npv}    IRR: {irr}    Payback: {payback}
  Top sensitivity driver: {tornado[0].label} (swing {swing})
  Traceability: PASS ({n} leaves, 0 orphans)

Artifacts:
  {slug}.ems.json       — validated Economic Model Spec
  {slug}.computed.json  — ComputedModel (deterministic)
  {slug}.md / .pdf      — branded analysis (via cascade-publish)
  {package note: created | skipped offline}
```
