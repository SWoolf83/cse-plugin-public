---
name: self-eval
description: Use when you want a self-eval — per-skill/model cost+quality analysis, provenance-gated findings, draft tuning packages. Never auto-ships.
when_to_use: Self-Improving Engine analyst loop — manual-first, Fable-as-analyst. Pulls attributed per-skill/per-model metrics (token_usage.skill rollups + package telemetry), emits a Self-Eval Spec (SES) whose every claim is a queryable metric reference (never an asserted number), runs the shared deterministic evaluator + provenance gate (packages/shared/src/self-eval), upserts ONE versioned self-eval dossier artifact (findings ranked by computed impact, per-model divergence vs a configurable bar, predicted-vs-actual regression check on shipped tunings with LOUD regression flags + auto-drafted reverts), and emits fingerprint-deduped DRAFT tuning packages above the impact threshold. The loop has NO merge or release capability — accept → held branch → golden-suite scorecard → manual human merge → manual /cse:release. Triggers on "self eval", "skill economics", "which model should run this phase", "did that tuning regress", "tune the skills from usage data".
argument-hint: "[run (default) | --window <days, default 30> | --subject <id, default skill-portfolio> | --seed-case-study (mandated on the FIRST run)]"
allowed-tools: Bash(date *), Bash(pwd), Bash(ls *), Bash(cat *), Bash(mkdir *), Bash(node *), Bash(npx *), Bash(curl *), Bash(git *), Read, Write, Agent, cascade_list_packages, cascade_create_package, cascade_update_package, cascade_create_artifact, cascade_update_artifact, cascade_get_artifact, cascade_get_org_context, cascade_log_decision
---

# /cse:self-eval — The Self-Improving Engine Analyst Loop

Turn Cascade's own usage exhaust — per-skill token spend, per-model splits,
verification pass rates, session telemetry — into a **provenance-gated,
versioned self-eval dossier** plus **draft tuning packages** on the steering
queue. The model is the analyst, never the accountant:

> **model proposes (SES: which metrics matter, as queryable references) →
> code computes (shared deterministic evaluator, every number tagged with
> provenance) → gate proves it (orphan numbers rejected) → dossier versions it
> → drafts queue it (status=draft, fingerprint-deduped) → a HUMAN ships it.**

This is the same discipline as `/cse:economics` (EMS → evaluator → gate),
pointed at ourselves. The substrate lives in `packages/shared/src/self-eval/`
(`ses-schema.ts`, `evaluator.ts`, `validation-gate.ts`, `cli.ts`) — built in
wave 1 of `spec-self-improving-engine`.

## THE CONTRACT (non-negotiable — repeat it in every draft package body)

```
accept (human) → standard executor on an ISOLATED HELD BRANCH
             → golden-suite scorecard (scripts/self-eval-replay.mjs +
               cse/skills/self-eval/golden-suite/ — TWO metrics: token cost
               AND quality; a quality regression BLOCKS merge even when
               tokens dropped)
             → MANUAL human merge
             → MANUAL /cse:release from a MAIN checkout
```

The loop and its drafts have **NO merge or release capability** — nothing
auto-ships, ever. This skill must never run `git merge`, `git push`, switch
branches on a shared checkout, or invoke `/cse:release`. Do not add any code
path that merges or releases. (The golden-suite replay harness ships in wave
3; the paths above are the scorecard mechanism the contract names.)

## Hard constraints (v1 — non-negotiable)

1. **No orphan numbers.** Every number in the dossier's findings, divergence,
   rollup, and tuning sections comes from the evaluator and carries
   `{ computed: true, inputsHash }` provenance. If the gate fails, **fix the
   SES and recompute — never hand-edit a number** into the SES, the computed
   result, or the dossier.
2. **Honest-empty.** If skill attribution is missing (migration 302 unapplied
   or `cascade meter sync` never run), say so and STOP with instructions
   (Phase 0). Never fabricate, estimate, or "recall" a metric. Partial data →
   record what was recoverable and flag the gap explicitly.
3. **Manual-first.** Invoked only as `/cse:self-eval`. No cron, no daemon, no
   scheduling wiring. Future cadence = a config change onto the existing
   scheduled-skill-runs infra (the Model Radar `--scheduled` lane +
   `scripts/scheduled-runner.mjs`) — explicitly NOT built now.
4. **Idempotent runs.** The dossier upserts by canonical slug — re-runs append
   a new `artifact_version` to the SAME node, never a duplicate node. Draft
   emission dedups on a finding fingerprint — a re-run over unchanged data
   produces **ZERO** duplicate packages.
5. **Max-Plan, agent-side.** All analysis happens in THIS interactive session.
   The service-role key is used for deterministic prod READ-back only (the
   model-radar PostgREST convention) — never in app code, never for writes
   outside the documented package/artifact tools.

Parse `$ARGUMENTS`: `run`/empty = full loop over the default window;
`--window <days>` sets the metric window (default **30**, half-open
`[now-days, now)`); `--subject <id>` names what is being evaluated (default
`skill-portfolio` — the whole CSE skill fleet); `--seed-case-study` forces the
Phase 7 seed analysis (it is MANDATORY on the first run regardless — see
Phase 7).

## Finding taxonomy — two flavors, distinguished in EVERY finding

Every finding carries `taxonomy` (enforced by `ses-schema.ts`):

- **`content-overlay`** — cross-model divergence on the SAME skill: the same
  SKILL.md drives materially different token/pass-rate outcomes per model
  (e.g. Fable needs half the tokens Sonnet does on `/cse:spec` discovery).
  The tuning shape is a per-model **content overlay** of the skill text.
- **`phase-routing`** — per-model divergence on execution PHASES: routing
  decisions inside a run, not wording (e.g. fix-convergence iteration counts,
  codegen-vs-debug splits — a fast model for codegen/mechanical work with
  strong-reasoner **escalation after N non-converging verification
  iterations**). The tuning shape is a routing rule.

**NEITHER variant content NOR a phase-routing escalation rule is built or
drafted until the computed evidence clears the divergence bar** (Phase 5).
Suspicion is not evidence; the bar is.

---

## Phase 0 — Preconditions (honest-empty gate)

1. `Bash(date +%Y-%m-%dT%H:%M:%SZ)` and `Bash(pwd)`. This skill runs from the
   **Cascade repo root** (it invokes `packages/shared/src/self-eval/cli.ts`
   and `bin/cascade.js`). If cwd is not the repo root, locate it or stop.
2. Create the run dir — the durable audit trail for this run:
   `mkdir -p .cascade/self-eval/run-<YYYY-MM-DD>` (call it `<RUN>` below).
3. Resolve the service-role read credentials: `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` from `cascade-web/.env.local`, and the org id
   (`CASCADE_ORG_ID` from root `.env`, or `cascade_get_org_context`).
4. **Attribution probe** — is the per-skill lane live?

```bash
curl -s "$SUPABASE_URL/rest/v1/token_usage?org_id=eq.<org>&skill=not.is.null&select=skill&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

   - **HTTP 400 / `42703` undefined column `skill`** → migration 302
     (`cascade-web/supabase/migrations/302_meter_skill_attribution.sql`) is
     NOT applied. **STOP.** Report exactly: "Per-skill attribution requires
     migration 302 on prod. Apply it (`npx supabase db push` from
     `cascade-web/`, or the pooler/Management-API lane), then run
     `npm run build && node bin/cascade.js meter sync --backfill` to
     retro-attribute history, then re-run `/cse:self-eval`." Do not proceed,
     do not substitute guessed numbers.
   - **`[]` (column exists, zero attributed rows)** → the parser has never
     tagged a span. **STOP** with: "Attribution is empty — run
     `node bin/cascade.js meter sync --backfill` (requires `npm run build`
     first) and re-run." Same honesty rule.
   - **A row comes back** → proceed.

## Phase 1 — Pull the attributed metrics (the query lane)

All reads are the deterministic PostgREST service-role convention (same as
model-radar Phase 4). Save every raw response under `<RUN>/raw/`.

### 1A — Usage rows (token_usage, window-bounded, paginated)

```bash
curl -s "$SUPABASE_URL/rest/v1/token_usage?org_id=eq.<org>&skill=not.is.null&ts=gte.<from>&ts=lt.<to>&select=session_id,model,skill,ts,input_tokens,cache_creation_input_tokens,cache_read_input_tokens,output_tokens&order=ts.asc,session_id.asc&limit=1000&offset=0" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Page by `offset += 1000` until a short page. Also fetch the rate card once:

```bash
curl -s "$SUPABASE_URL/rest/v1/model_pricing?select=model,input_per_mtok,cache_write_per_mtok,cache_read_per_mtok,output_per_mtok" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### 1B — Quality rows (verification pass-rates, best-effort)

Pull must-have verification results in the window:

```bash
curl -s "$SUPABASE_URL/rest/v1/spec_verifications?org_id=eq.<org>&result=in.(pass,fail,partial)&created_at=gte.<from>&created_at=lt.<to>&select=spec_artifact_id,result,verified_at,created_at,retry_session_id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Plus package telemetry for context (not evaluator input unless mappable):
`engineering_sessions` (`status`, `started_at`, `completed_at`,
`token_usage` JSONB) and `work_items_v2` durations.

### 1C — Deterministic transform → `<RUN>/rows.json`

Write a small Node transform (a mechanical mapping, not analysis — commit it
to nothing, it lives in `<RUN>/`) that emits the evaluator's `MetricRows`
shape (`ses-schema.ts`: `{ usage: UsageRow[], quality: QualityRow[] }`):

- `usage[]`: one entry per token_usage row —
  `tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens`;
  `cost_usd` = the four buckets priced against the `model_pricing` rate card
  (`/1e6`, dated model variants normalized to their rate-card slug); **omit
  `cost_usd`** for models absent from the card (it is optional — never guess
  a rate). `session_id`, `model`, `skill`, `ts` pass through.
- `quality[]`: one entry per spec_verifications row —
  `passed = (result === 'pass')` (fail AND partial are `false`),
  `ts = verified_at ?? created_at`, `skill = 'cse:spec'` (the pipeline that
  produced the must-have), `session_id = retry_session_id ?? spec_artifact_id`
  (a stable grouping key), `model` = the executing session's model when
  recoverable from the linked `engineering_sessions` row's
  `spec_data`/`result_data`/`token_usage`; when NOT recoverable, **drop the
  row and count it** — the dossier's data-gaps section reports
  "N verification rows unattributable to a model". Never invent a model id.

If `quality` ends up empty, that is fine — `pass_rate` metrics are simply
unavailable this run; say so in the dossier rather than proxying quality
from something else.

## Phase 2 — Emit the SES (model proposes)

Orient first — eyeball the raw rows (a quick `node -e` group-by over
`<RUN>/rows.json` is fine; it computes nothing that gets published) — then
propose claims. Write `<RUN>/ses.json` conforming
to `SelfEvalSpecSchema` (`packages/shared/src/self-eval/ses-schema.ts`):

- `sesVersion: "1.0"`; `subject: { id: "<--subject>", name, description }`.
- `config`: `{ divergenceBarPct, impactThresholdPct }` — the org's configured
  thresholds. Defaults: **divergenceBarPct 30**, **impactThresholdPct 15**.
  Honor overrides recorded in the previous dossier's `type_data.config`
  (Phase 4 lookup) — config is sticky across runs unless the user changes it.
- `findings[]`: each `{ id, title, taxonomy, rationale, impact }` where
  `impact` is a **before/after pair of MetricRefs**
  (`{ skill?, model?, metric, window? }`, metric ∈ `tokens_total |
  tokens_per_run | runs | cost_usd_total | cost_usd_per_run | pass_rate`).
  **Findings NEVER carry literal numbers** — the schema is `.strict()` and
  will reject a smuggled numeric field; the gate will catch anything else.
- `divergenceProbes[]`: one probe per skill worth a cross-model look
  (`{ id, skill?, metric, window? }`) — at minimum every skill with 2+ models
  in the window's rows.
- `shippedTunings[]`: the self-repair inputs — every tuning shipped by a
  PRIOR run of this loop (read them from the previous dossier version's
  `shipped_tunings` registry, Phase 6). Each carries `shippedAt` and
  `predicted: { deltaPct, provenance: { computed: true, inputsHash } }` —
  the provenance is the PRIOR run's `inputsHash`, copied verbatim from the
  prior dossier. **A bare prediction with no provenance is structurally
  invalid** and validation will fail it. First run: `[]`.

## Phase 3 — Evaluate + gate (code computes, gate proves)

Exact invocations (repo root; `tsx` resolves via the repo's devDependencies):

```bash
npx tsx packages/shared/src/self-eval/cli.ts validate <RUN>/ses.json
npx tsx packages/shared/src/self-eval/cli.ts compute  <RUN>/ses.json <RUN>/rows.json <RUN>/computed.json
npx tsx packages/shared/src/self-eval/cli.ts gate     <RUN>/computed.json
# or the pipeline in one step (validate -> compute -> gate):
npx tsx packages/shared/src/self-eval/cli.ts all      <RUN>/ses.json <RUN>/rows.json <RUN>/computed.json
```

Non-zero exit = SES invalid or gate failure. **The only legal response is to
fix `<RUN>/ses.json` (or the Phase-1C transform, if the rows were malformed)
and re-run** — never edit `<RUN>/computed.json`, never transcribe numbers by
hand. The computed result carries: per-skill rollups with per-model splits,
findings ranked by |deltaPct| with `meetsThreshold` (the draft-emission
gate), divergence probes with `divergencePct = (max−min)/|min|·100` and
`aboveBar`, and predicted-vs-actual `tunings[]` with `regressed` /
`metPrediction` flags. Every number is `{ value, provenance }` — the
`inputsHash` (FNV-1a over canonical JSON of ses+rows) is this run's
provenance anchor; record it everywhere numbers travel.

## Phase 4 — Dossier upsert (find-or-create by canonical slug — MANDATORY dedup)

ONE versioned dossier artifact per subject — canonical slug
`self-eval-<subject-id>` (default `self-eval-skill-portfolio`). Mirror the
model-radar dossier idiom exactly:

**1. Search BEFORE creating — never skip.** Primary:
`cascade_list_packages { status:"completed", limit:100 }`, scan for
`type_data.artifact_type === "self_eval_dossier"` +
`type_data.subject_slug === "<slug>"`. If the org's package list may exceed
the cap, use the deterministic PostgREST lookup:

```bash
curl -s "$SUPABASE_URL/rest/v1/packages?org_id=eq.<org>&kind=eq.artifact&is_deleted=eq.false&type_data->>artifact_type=eq.self_eval_dossier&type_data->>subject_slug=eq.<slug>&select=id,title,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**2. On a hit** → reuse that node. `cascade_update_artifact
{ artifact_id, content }` appends the next `artifact_version` — never a
duplicate node, never mutate an old version. Verify round-trip with
`cascade_get_artifact`.

**3. On no hit** → create it:

```
cascade_create_artifact
  title:    "Self-eval dossier: <subject name>"
  content:  <the full dossier body, format below>
  renderer: "markdown"
  tags:     ["self-eval","self-improving-engine","dossier"]
```

then stamp identity metadata (`cascade_update_package` shallow-merges
`type_data`, preserving the artifact's `renderer` key):

```
cascade_update_package { package_id: "<artifact id>", type_data: {
  artifact_type: "self_eval_dossier",
  subject_slug: "<slug>",
  last_run_at: "<ISO now>",
  inputs_hash: "<this run's inputsHash>",
  config: { divergenceBarPct, impactThresholdPct },
  shipped_tunings: [ ...the registry, Phase 6... ]
} }
```

**Dossier body** — markdown rendering of the computed result with a fenced
`json` block of the exact `<RUN>/computed.json` at the end (humans read the
artifact viewer; parsers and the gate read the JSON — same node, one truth):

1. **Header** — subject, window, run date, `inputsHash`, config echo.
2. **Findings ranked by computed impact** — in evaluator rank order. Each
   finding shows its **motivating metric**: the before/after MetricRef pair
   verbatim from the SES *and* the computed numbers
   (`before`/`after`/`deltaAbs`/`deltaPct`, each with its provenance tag),
   its taxonomy flavor, `meetsThreshold`, and — **segmented per driving
   model** — the per-model rollup slice that motivated it.
3. **Per-model divergence** (Phase 5 section).
4. **Self-repair: shipped tunings, predicted vs actual** (Phase 6 section).
5. **Data gaps** — dropped quality rows, models missing from the rate card,
   anything partially recoverable. Honest > complete.
6. The fenced `json` block of `computed.json`.

## Phase 5 — Per-model divergence section (+ the graduation config block)

For every divergence probe, render per-model values and `divergencePct` vs
the bar. The section MUST open with this config block, filled from the SES
config (declaring policy, not aspiration):

```yaml
divergence_bar_pct: <config.divergenceBarPct>   # configurable; SES config is the source
graduation_target: cse/skills/<skill>/variants/{model}/   # in-plugin per-model overlays
  # variants carry BOTH flavors: content overlays (per-model SKILL.md deltas)
  # AND phase-routing rules (escalation/routing declarations)
ruled_out: ~/.cascade/harnesses (daemon harness-optimization lane) — NOT the
  variant vehicle; variants graduate INTO the plugin, versioned with it
```

Findings whose probe clears the bar are divergence-backed and eligible for
Phase 8 drafting (subject to `meetsThreshold`). Below the bar → recorded in
the dossier as "watched, below bar" — **no variant content is written, no
escalation rule is drafted.** The evidence graduates the work; the analyst
does not.

## Phase 6 — Self-repair pass (predicted-vs-actual + auto-drafted reverts)

The evaluator already computed `tunings[]` from the SES `shippedTunings`.
Render every one in the dossier:

- `metPrediction` → note it, one line.
- Short of prediction but not regressed → note it, keep watching.
- **`regressed: true` → flag LOUDLY**: a top-of-dossier banner line
  (`⚠ REGRESSION: <tuning label> — predicted <x>%, actual <y>%`) AND the
  full entry in the self-repair section. Every regressed tuning gets an
  **auto-drafted REVERT package** in Phase 8 (finding type `revert` in the
  fingerprint), whose body names the original tuning package, the predicted
  delta + its provenance, the actual computed delta + this run's provenance,
  and the concrete revert (for a one-file overlay: the reverse diff).

Maintain the **shipped-tunings registry** on the dossier package's
`type_data.shipped_tunings`: when a draft from this loop ships (a later run
discovers its package `completed`), append
`{ id, label, skill, model?, metric, shippedAt, predicted: { deltaPct,
provenance } }` — the predicted deltaPct copied from the run that drafted it
WITH that run's `inputsHash` provenance. This registry is what Phase 2 reads
back into `shippedTunings` — the loop closes on itself.

## Phase 7 — SEED CASE STUDY (mandated first-run analysis)

**The FIRST run of this skill MUST analyze the Unified Work Surface
Fable-executor session** (also on `--seed-case-study`): spec `3f3f6ab5`,
branch `cascade/unified-work-surface`, executed 2026-07-11 — it exhibited
slow post-build verification **fix-convergence over a 4-round review loop**,
the motivating specimen for the `phase-routing` flavor.

Analyze that session's transcripts/telemetry for phase-routing divergence:

1. `token_usage` rows for the session(s) (filter `session_id` /
   `project_path` around 2026-07-11 with `skill=eq.cse:spec`) — token spend
   per phase, where phase boundaries are recoverable from turn timestamps.
2. The branch's commit graph (`git log cascade/unified-work-surface`) — the
   review-round commits timestamp the fix-convergence iterations.
3. Local transcripts under `~/.claude/projects/` when still present —
   verification-iteration counts, codegen-vs-debug turn splits.

Emit its findings through the SAME SES → evaluator → gate lane (e.g. a
`phase-routing` finding with before/after windows around the review rounds).
**If the data is only partially recoverable — likely, since attribution is
retroactive and transcripts age out — the dossier records exactly what WAS
recoverable and flags the gap. Do not reconstruct numbers from memory of the
session; a gap is a finding-shaped hole, not a license to guess.**

## Phase 8 — Draft emission (the steering-queue output path)

### 8A — Dedup FIRST (zero-duplicate invariant)

Compute each candidate's **fingerprint** =
`<skill>|<content-overlay|phase-routing|revert>|<metric-kind>`
(the driving skill; the finding type — `revert` for Phase-6 reverts; the
MetricRef metric kind). Then list already-open self-eval packages:

```
cascade_list_packages { tags: ["self-eval"], limit: 100 }
```

filtered to open statuses (`draft`, `approved`, `executing`) and match on
`type_data.fingerprint`. **Skip every candidate whose fingerprint matches an
open package** — re-runs over unchanged data must produce ZERO duplicates.
(A `completed` or `archived` match does not block: shipping a tuning and
later re-finding drift on the same skill+type+metric is a NEW, legitimate
draft.)

### 8B — Emit drafts (findings with `meetsThreshold: true`, plus reverts)

Only findings the evaluator marked `meetsThreshold` (|deltaPct| ≥
`config.impactThresholdPct`) — plus every Phase-6 revert — become packages.
`cascade_create_package` starts packages in `draft` status; leave them there
(drafts are the steering queue — a human moves them):

```
cascade_create_package
  title:        "Self-eval tuning: <finding title>"        # or "REVERT: <tuning label>"
  package_type: "feature"                                   # revert drafts: "bug"
  executor_type:"ai_agent"
  tags:         ["self-eval","self-improving-engine","<taxonomy|revert>"]
  description:  <the finding rationale + the computed evidence line:
                 before → after, deltaPct, inputsHash — numbers WITH provenance,
                 copied from computed.json, never re-derived>
  type_data: {
    fingerprint: "<skill>|<type>|<metric>",                # deterministic dedup key
    finding_id: "<SES finding id>",
    taxonomy: "<content-overlay|phase-routing|revert>",
    motivating_metric: { before: <MetricRef>, after: <MetricRef> },
    computed: { before, after, deltaAbs, deltaPct },        # each { value, provenance }
    inputs_hash: "<run inputsHash>",
    dossier_artifact_id: "<Phase-4 node id>",
    proposed_diff: "<unified diff — ONLY for clean one-file findings>"
  }
```

- **Clean one-file findings** (a single SKILL.md / overlay file change)
  attach the concrete change as `type_data.proposed_diff` (a unified diff)
  so review = read the diff + accept.
- **Bigger structural findings** (multi-file, new routing machinery,
  schema-touching) carry **intent only** — no diff — and the body says:
  "Spec this normally via `/cse:spec` on acceptance."
- **EVERY draft body ends with THE CONTRACT block** (verbatim from the top
  of this skill): accept → isolated held branch → golden-suite scorecard
  (token cost AND quality; quality regression blocks merge even when tokens
  dropped) → manual human merge → manual `/cse:release` from a MAIN checkout.
  The draft grants no shortcut around it.

## Phase 9 — Run summary + record

Report concretely: window + row counts (usage/quality, dropped rows), the
`inputsHash`, findings computed (above/below threshold), divergence probes
(above/below bar), tunings checked (met/short/**REGRESSED**), dossier node +
new `versionNo`, drafts created vs fingerprint-skipped (list the skipped
fingerprints — proof of the zero-duplicate invariant), and every data gap.

Log one decision (category `process`, significance `minor`):

```bash
node bin/cascade.js log-decision --title "Self-eval run: <date>" \
  --chosen "<N findings (M drafted, K deduped), P probes above bar, R regressions>" \
  --reasoning "<the headline finding + inputsHash>" \
  --tags "self-eval,self-improving-engine" --category "process" --significance "minor"
```

The work is tracked via the dossier + draft packages themselves — no
separate `/cse:capture` needed.

---

## What this skill is NOT (deferred / forbidden)

- **No scheduling.** Manual-first. Future cadence is a config change onto the
  scheduled-skill-runs lane (Model Radar's `--scheduled` contract +
  `scripts/scheduled-runner.mjs`) — a follow-up, not this skill.
- **No merging, no releasing, no auto-shipping** — see THE CONTRACT. The
  skill's write surface is: the dossier artifact, draft packages, and one
  process decision. Nothing else.
- **No variant authoring below the bar.** `cse/skills/<skill>/variants/{model}/`
  overlays (both flavors) are the graduation target, written only by an
  ACCEPTED draft's executor — never speculatively by this loop, and never
  into `~/.cascade/harnesses` (ruled out as the variant vehicle).
- **No hand math.** The evaluator computes; the gate audits; the analyst
  proposes and narrates.
