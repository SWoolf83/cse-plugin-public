---
name: okr-intake
description: Use when onboarding an org's orphan packages into OKRs — interview, long-form run, ~12 plan decisions, a guesses brief.
when_to_use: "The standing ONBOARDING lane every repo/org goes through once, and re-runs cheaply forever after. FOUR PHASES: (1) a CSE-style upfront interview that SEEDS classification — multiple choice plus clarification, asked dynamically, and PERSISTED so every re-run starts better; (2) a long-form, walk-away-able engine run (quarantine → corpus → free organize_area seeding → match → cluster → plan → lint → self-check) that never throws and degrades honestly; (3) a PLAN-LEVEL approval conversation of ~12 decisions, ceiling 20, NEVER per row — one decision fans out to every member link, because a 970-item review queue is an ignored backlog by construction; (4) a completion brief with an explicit 'places I guessed on your behalf' section. This is the PACKAGE lane — the only OKR skill that reaches the ~970 orphan packages. Auto-apply is OFF by default: the pass runs dry first, shows what WOULD be written, and only then offers the lever. It NEVER creates objectives or key results — humans accept on /objectives. Triggers on 'okr intake', 'onboard this repo into OKRs', 'what work is not laddering to an objective', 'classify our orphan packages', 'reconcile the alignment score'."
argument-hint: "[run (default) | gather | plan | apply | undo <run-id>]"
allowed-tools: Bash(node *), Read, Write, AskUserQuestion, cascade_get_org_context, cascade_get_unified_projects
---

# /cse:okr-intake — Orphan-Package Intake & Reconciliation

The **onboarding lane**. Point it at an org whose work has piled up outside its
OKRs, and it reads the whole package corpus, quarantines what is not ours,
classifies what is, clusters it, and hands back **one bounded plan** plus a
brief that says out loud where it guessed.

The north star, verbatim from discovery:

> The goal is not to impress the human with a long review list — it is to
> **make great guesses, flag what we were unsure about**, and make it feel like
> this company has been working in this system forever and has always been
> great at putting together OKRs.

Cascade HQ is run #1. Every future repo/org goes through the same four phases,
and because the interview is persisted, run #2 on the same org is faster and
better than run #1.

## How this differs from its neighbours (they do not overlap)

| Skill | Operates on | Reaches orphan packages? |
|---|---|---|
| `/cse:okr-backfill` | top-level **bundles** — clusters them into initiatives | no |
| `/cse:okr-seams` | **architecture topics** — seam pressure → Team (`level='seam'`) objectives | no |
| `/cse:reverse-okr` | **spec scope-boundaries** — deferred `Deferred: X` items | no |
| **`/cse:okr-intake`** | **PACKAGES** — the whole corpus, one row at a time | **yes — this is the only one** |

If the user's question is "why is our alignment score so low" or "what work
isn't laddering to anything", it is this skill. If it is "turn my projects into
initiatives", hand off to `/cse:okr-backfill`.

**OKR tier vocabulary.** The ladder's display names are **Strategic Pillar**
(`level='org'`), **Product-Vertical** (`level='surface'`), and **Team**
(`level='seam'`). Use those names in user-facing prose; keep the `org`/`surface`/`seam`
slugs unchanged in code and queries. Note "initiative" here means WORK laddering
under a Key Result (`bundle_kind='initiative'`), never a top-level OKR tier.

## THE HARD RULES (never violate)

1. **This skill NEVER creates objectives, key results, or initiatives.**
   Entity creation stays on the unchanged `objectiveActions.acceptProposal`
   path, which requires `auth.getUser()`. A skill and a CLI runner have no
   browser session, so **they cannot drive accept — at all**. This skill
   produces a PLAN and PROPOSALS; a human accepts them on **/objectives**.
   Never imply otherwise in your report.
2. **Auto-apply is OFF by default** (`AUTO_APPLY_ENABLED_BY_DEFAULT` in
   `apply.ts`). Always run the **dry pass first**, present what WOULD be
   applied, and only then offer the lever. The match author's finding is the
   reason: the thresholds are **judgement, not measurement**, and a wrong
   auto-applied link *silently inflates the very alignment score this lane
   exists to make honest*.
3. **Never more than ~12 decisions (ceiling 20), and never one per row.** One
   plan decision fans out to every member link. If you find yourself about to
   present 50 items to accept, you have broken the design — the engine already
   folds single-member roots away before the gate sees them.
4. **You own no rules.** Every classification, threshold and cluster judgement
   lives in `cascade-web/src/lib/okr-intake/`. Do not re-derive them in the
   conversation, and do not "fix up" the engine's output by hand.

## The engine (you DRIVE it — you do not reimplement it)

One call does the whole pass:

```ts
runOkrIntake(db, input): Promise<IntakeRunResult>   // run.ts — never throws
```

`IntakeRunResult` carries `{ ok, complete, blocked, skipped, summary, brief[],
corpus, quarantine, taxonomy, routing, match, planResult, plan, lint,
selfCheck, apply, applyOutcome, lever, persisted, dispositions, idempotency,
openQuestions, decisions, phaseOrder, phaseLog, guards, degradations,
unavailable, errors }`.

`applyOutcome` is the apply phase's verdict — `{ outcome, attempted, applied,
alreadyPresent, failed, failure, why }`. **`ok` is `false` whenever
`applyOutcome.failure` is true**, so a run whose evidence-link writes failed
(wholly or PARTIALLY) can never be reported as a success. A *degraded* run
(unavailable storage) is still `ok`.
Also exported: `undoIntakeRun`, `listAppliedLinks`, `assertIntakeRun`.

Two properties make phase 2 walk-away-able, and they are worth repeating to the
user: the pass is **idempotent** (a second run over unchanged input writes zero
rows and reports `skipped: true`) and **append-only** (changed input EXTENDS the
open plan instead of opening a competing one).

## The bundled script

`scripts/run-intake.mjs` next to this SKILL.md — resolve it as
`${CLAUDE_PLUGIN_ROOT}/skills/okr-intake/scripts/run-intake.mjs` when installed
(repo checkout: `cse/skills/okr-intake/scripts/run-intake.mjs`).

```bash
node <script> gather [--save-interview <file|->]       # census + interview state
node <script> plan   [--persist] [--brief] [--out f]  # the engine, DRY by default
node <script> apply  --enable-auto-apply              # THE LEVER (explicit only)
node <script> apply  --list [--run-id <id>]
node <script> apply  --undo <runId>
```

Exit codes: `0` ok (**including** the benign no-write outcomes — a dry pass, and
an idempotent no-op where every edge was already linked) · `1`
usage/credentials · `2` engine unreachable · `3` storage unavailable
(migration 344 is file-only — a degradation, not a failure) · `4` database/run
error, **including** an apply that wrote zero of what it attempted or was
refused before writing · `5` output lint **BLOCKED** the run — nothing
persisted, nothing applied · `6` **PARTIAL APPLY** — some evidence links were
written and at least one write FAILED.

Every run reports its own verdict as `applyOutcome` (`dry_run` · `no_op` ·
`applied` · `partial` · `failed` · `refused` · `unavailable` ·
`not_attempted`) and `exitCode` at the top of the JSON report. `--help` carries
the same table.

Credentials follow the same chain as `bin/cascade.js`: `~/.cascade/auth.json`
user tokens (RLS-enforced) first, else `SUPABASE_SERVICE_ROLE_KEY` +
`CASCADE_ORG_ID`.

### The one limitation you must state honestly

`run.ts` is TypeScript under `cascade-web/src`, and a plugin-dir `.mjs` cannot
import it the way a bundler would. The runner solves this **without forking a
single rule**: `plan` and `apply` load the TS source directly using
`registerHooks()` from the built-in `node:module` (which teaches Node the
extensionless `./apply` specifiers and the `@/*` alias) on top of Node's native
type stripping, and resolve `@supabase/supabase-js` from the repo's own
`node_modules`. Zero npm dependencies, zero duplicated decision logic.

**The cost:** `plan` and `apply` need a **cascade repo checkout on disk** and
**Node ≥ 22.18**. Installed in `~/.claude/plugins/` with no repo nearby they
exit `2` with instructions — they do **not** fall back to a JavaScript
re-implementation, because a second classifier is exactly the drift this spec
exists to eliminate. `gather` has no such limit: it is pure PostgREST I/O with
no rules in it, and always works.

If you hit exit `2`, say so plainly ("the engine needs a repo checkout; here is
the census instead") rather than improvising a classification in conversation.

---

## Flow

### Phase 1 — INTERVIEW (upfront, dynamic, and PERSISTED)

Get as much as possible up front: the better the seed, the better the
classification out of the gate. Big repos deserve a fairly detailed interview —
that is the trade the user is buying.

**Start by reading the ground truth**, so no question is asked whose answer is
already on disk:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okr-intake/scripts/run-intake.mjs gather
```

Returns `{ packages: { total, byStatus, byKind, byPackageType, organizeArea:
{ labelled, unlabelled, byArea } }, keyResults, evidenceLinks,
dispositionStorage, storedPlan, interview, engine }`. Read it before you open
your mouth:

- `interview.answers` non-null ⇒ **this is a RE-RUN**. Do not re-interview from
  scratch. Show the stored answers, ask only what changed, and what `priorRuns`
  says the last pass struggled with.
- `organizeArea.byArea` is the **free** classification lane — those labels are
  read, not inferred, and they cost zero tokens. Use them as the opening
  proposal for the taxonomy rather than inventing categories.
- `dispositionStorage.available: false` ⇒ migration 344 is not applied here.
  Say so NOW: the pass still produces a complete, useful **dry-run brief**, but
  disposition bookkeeping is reported as `unavailable` rather than written.
- `engine.available: false` ⇒ only `gather` will run. Say so before promising a
  plan.

Then ask, **dynamically** — batch `AskUserQuestion` with multiple choice plus a
free-text clarification, skipping anything `gather` already answered:

1. ~~What is this org actually for?~~ **Do NOT ask this** — the org's purpose
   comes from THE charter (`cascade-web/src/lib/charter`; the engine reads it
   and reports it as `charterPurpose`). If the run brief says no charter was
   readable, point the user at `/cse:onboard-charter` instead of collecting a
   purpose here.
2. **Which of these areas are real, and which are noise?** Present
   `organizeArea.byArea` as options; let the user drop, rename, or add.
3. **Whose work is in here that is NOT this org's?** Other orgs, customer work,
   synthetic/demo data. Their names become the quarantine escalation
   vocabulary. *(Cascade HQ's real answer: Joyn Health, Pulse4Pulse.)*
4. **How sure must the machine be before it calls something aligned?**
   `high | medium | low` — the default is `medium`, which means "the machine
   has a key result for this", not "it is linked".
5. **How many decisions do you want to review?** Default target 12, ceiling 20.
   Never offer a number above 20.

Persist immediately — this is what makes re-runs better:

```bash
node <script> gather --save-interview /path/to/answers.json
```

Input is `{ "answers": { ... } }` (or the bare answers object). Allowed keys —
**unknown keys are rejected and nothing is written**: `notes`,
`extraCategoryLabels[]`, `dropCategorySlugs[]`, `quarantineMarkers[]`,
`quarantineExactTitles[]`, `defaultTopicSlug`, `alignedMinBand`,
`decisionTarget`, `decisionCeiling`, `similarityThreshold`, `skipEmbeddings`,
`linkCap`, `maxGreenfieldCategories`, `liveOkrTitles[]`.

> **`orgPurpose` is RETIRED** (charter-first reset). The org's purpose now
> lives in THE charter — `cascade-web/src/lib/charter` (`loadCharter`),
> created by `/cse:onboard-charter` — and the intake engine reads it itself
> (the run result carries `charterPurpose`; the brief's first line names the
> source or the gap). An old `interview.json` still carrying `orgPurpose` is
> accepted and the key silently ignored — never an error.

Stored at `~/.cascade/okr-intake/<orgId>/interview.json` (mode 600), prior
versions kept under `history/`, and every run appended to `runs[]` so the next
interview opens knowing what the last pass did.

### Phase 2 — RUN (long-form; the user should be able to walk away)

```bash
node <script> plan --brief --out /tmp/okr-intake-plan.json
```

**Always pass `--brief` when you are going to read the output yourself.** A
full report is ~1 MB (every apply candidate, every escalation's member ids,
every guess verbatim); `--brief` replaces the bulk with counts and keeps
everything the approval conversation needs. `--out` still writes the full
report to disk, so nothing is lost — and no array is ever dropped without
leaving its length behind.

This is a **DRY pass**: nothing is written unless you add `--persist`, and even
`--persist` writes only the plan artifact and the dispositions — never an
alignment edge. Tell the user it is safe to leave and come back.

The phases execute in one enforced order and are reported as `phaseOrder`:
`read → quarantine → corpus → seed → match → cluster → plan → lint →
self_check → persist → apply → escalate → complete`. Two of those orderings are
load-bearing and worth quoting when the user asks what it actually did:
quarantine runs strictly **before** clustering (so another org's work can never
become one of our objectives), and the free `organize_area` seeding runs
strictly **before** any embedding call (so we never pay for a label we already
had — `guards.embedCalls: 0` is the assertion, not the hope).

Handle the exit code honestly:

- **`5` — lint BLOCKED.** Read `lint.blocking`. The common one is
  `cross_org_reference`: generated OKR text named an organization that is not
  this org. Nothing was persisted and nothing was applied. Show the user the
  excerpts and the `remediation` line verbatim; the fix is usually a quarantine
  answer in phase 1, not an edit to the plan.
- **`6` — PARTIAL APPLY.** Some evidence links landed and at least one write
  failed. Do **not** report this as a finished apply. Read
  `applyOutcome.applied` / `.failed` / `.attempted` and say the numbers out
  loud ("3 of 10 failed"), then offer the two honest options: re-run to write
  the rest, or `apply --undo <runId>` to take the whole run back out. There IS
  state on disk — that is the difference between `6` and `4`.
- **`4` — apply failed outright, or a run error.** With
  `applyOutcome.outcome: 'failed'` nothing landed, so there is nothing to
  undo; with `'refused'` the write never ran because the dedup pre-read failed.
  Report the database message from `errors` and retry.
- **`3` — storage unavailable.** Migration 344 is file-only; report the brief
  and note what could not be recorded. A degradation, **not** a failure.
- **`0` with `applyOutcome: 'dry_run'` or `'no_op'`.** These are successes.
  A dry pass writes nothing by design, and a no-op means every candidate edge
  was already linked — never report either as a failure.
- **`skipped: true`** ⇒ nothing changed since the last pass. Say exactly that
  and stop; do not re-present an identical plan as new work.
- **`complete: false`** ⇒ the self-check gate refused to call the pass done.
  Relay `selfCheck.briefLines` and `selfCheck.remedies` as-is. **Never
  overrule it** — `complete` comes from the gate and nowhere else.

### Phase 3 — APPROVAL (plan-level, ~12 decisions, NEVER per row)

Steve, verbatim: *"It gets a little bit much when there are 50 or 100 things to
accept in an inbox."* A 970-item review queue becomes an ignored backlog **by
construction**, so the plan is bounded before a human ever sees it.

Present `decisions[]` — each carries `question`, `options`, and `fanOut` (how
many packages that single answer authorizes). Rules for this conversation:

- **Lead with the fan-out.** "One answer here covers 53 work items" is the
  whole value proposition; say it.
- **Batch the confident ones.** Group every `confidence: 'high'` decision into
  ONE `AskUserQuestion` ("Approve these N clusters as proposed?").
- **Ask individually only for `low` confidence** or where `reason` mentions a
  competing theme ("It also read as tooling_reliability — a human may want to
  redirect it"). Max one question per such decision.
- **Never exceed the budget.** If `summary.appliedCaps` shows the
  `plan_decisions` cap bit, that is the design working — say what was
  consolidated, not omitted. Nothing is ever dropped.
- `openQuestions[]` is a **separate, smaller** list (quarantine + match
  escalations). Present it after the decisions, and only if non-empty.

Record the user's answers back into the interview (`--save-interview`) so the
next run starts from them.

### Phase 4 — BRIEF (and only then, the lever)

Report from `brief[]` and `placesIGuessed`. The completion brief always has
these parts, in this order:

> **PARTITION** — aligned X + excluded Y + unclassified Z of N considered
> (denominator D, P% unclassified).
> **DECISIONS** — K presented (target ~12, ceiling 20); one decision fans out
> to every member link, never one per row.
> **PLACES I GUESSED ON YOUR BEHALF** — every low/medium-confidence placement,
> with the reason the engine gave. This section is **not optional**; if it is
> empty, say so and add the engine's own warning that a pass which guesses
> nowhere is usually a pass that stopped checking.
> **WHAT COULD NOT BE VERIFIED** — `degradations` and `unavailable`.
> **NEXT** — accept on **/objectives**; nothing is live until a human does.

Only after that, offer the lever — never before, and never as the default:

```bash
node <script> apply --enable-auto-apply          # writes high-band evidence links
node <script> apply --list --run-id <runId>      # what did that run write?
node <script> apply --undo <runId>               # take it all back out
```

`apply` without the explicit flag **refuses** (exit `1`) and prints why. Show
the user `lever.why` and the `wouldApply` set from the dry pass first, get an
explicit yes, and always hand them the `undoWith` command in the same message.

## Notes

- **Cost:** the default pass injects no embedder at all, so the seed lane spends
  zero tokens. `guards.embedCalls` and `guards.labelledTextsEmbedded` report
  whether that held. If a run does reach the embedding lane, say what it cost.
- **PostgREST caps at 1000 rows.** Every read here pages and counts with
  `Prefer: count=exact`. If you ever quote a total, quote `packages.total`, not
  `packages.read`.
- **Never edit `cascade-web/src/lib/okr-intake/*` to make a run come out nicer.**
  If the classification is wrong, the answer is a better interview or a change
  to the engine's rules with its tests — not a hand-tuned plan.
- Migration 344 (`package_intake_dispositions`, the widened `kr_evidence_links`
  provenance CHECK, the KR embedding mirror) is **file-only, not applied to
  prod**. Everything above works without it; only the disposition bookkeeping
  is lost, and it is reported, never silently skipped.
