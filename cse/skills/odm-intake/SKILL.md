---
name: odm-intake
description: Retrospectively map an existing org's data topology from interview + probes, then score whether the org recognizes it as "that's us".
when_to_use: "You want to map an EXISTING org's real data stores (databases, object/media, unmanaged spreadsheets, backups) WITHOUT a workspace scan — because no scan exists for real orgs. This is the retrospective recognition-test harness: it interviews the human, runs proactive probes, builds a DataTopologyPlan whose discovered stores are all status:'existing' (described, never rejected), then emits a recognition scorecard (per-store verdict, tier fit, gaps, that's-us score) the human confirms. Triggers on 'map our data', 'run the recognition test', 'what does our data terrain look like', 'onboard our org's data model', '/cse:odm-intake'."
argument-hint: "[org-slug] — e.g. 'cascade-hq' or 'tfw-films'"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# /cse:odm-intake — the Retrospective Recognition Harness

A **thin orchestration** over the ODM core package (`@cascade/data-model`). It
does NOT reimplement discovery or scoring logic — it conducts the conversation,
assembles the inputs, and calls the core functions:

```
interview + proactive probes   →   buildRetrospectivePlanFromInterview   →   DataTopologyPlan (status:'existing' stores)
    (this skill: the human)          (@cascade/data-model/retrospective)         one plan, guard-exempt, migrationPaths attached
                                                    │
                                                    ▼
        human ground-truth        →   buildRecognitionScorecard  +  writeRecognitionReport   →   recognition-report.{org}.json
        ("is this you?")              (@cascade/data-model/recognition)                             the durable, comparable artifact
```

This skill IS the recognition-test harness referenced by
`.cascade/data-model/recognition/recognition-test-protocol.md`. Run it per org;
each run produces one plan + one scorecard so runs compare row-for-row.

## THE HARD RULES (never violate)

> **No workspace scan.** Real orgs have no scan (decision b61dc83e). Discovery
> is interview + proactive probes ONLY. Never fabricate a store the human did
> not name — an unknown becomes an OpenQuestion, not an invented store.

> **Describe reality, don't reject it** (decision bec94080). Every store the org
> already runs is `status:'existing'` — DESCRIBED truthfully, even when it sits
> on an engine the rubric would never recommend. The core marks it exempt
> (`assertGuards` judges only `status:'recommended'` stores) and attaches a
> reversible `migrationPath`. Your job is to capture what IS, then note the calm
> next step — never to tell the human they are "wrong".

> **The human is the judge of "that's us".** This skill drafts the scorecard
> (`humanConfirmed:false`). Only the authoritative human flips a verdict or
> confirms the run.

## Step 1 — Interview (the stores the org actually has)

Ask the human to walk their data reality. Use `AskUserQuestion` for the
structured parts, plain conversation for the rest. For EACH store capture:

- **label** — what they call it (a plain name; becomes the user-facing name at
  the `invisible` tier).
- **description** — one line.
- **location** — `local` | `cloud` | `hybrid`.
- **dataShape** — `relational` | `graph` | `document` | `object-media` | `unmanaged`.
- **stageRoles** — one or more of `ingest` | `working` | `output` | `archive`.
- **engine** (optional) — the actual engine, e.g. `supabase-postgres`,
  `object-storage-managed`, `sqlite-git`, a bare Google Drive folder, a
  hand-kept spreadsheet. Record it even if it is "wrong" — that is the point.
- **complianceClass** (optional) — `none` | `pii` | `financial` | `phi-hipaa` |
  `other-regulated`; defaults to the org's class.

Also capture the org's **sophisticationTier** (`invisible` | `guided` |
`technical`) and its overall **complianceClass**.

## Step 2 — Proactive probes (stores a person forgets)

Ask the always-worth-asking probes and record any UNANSWERED ones as
open-questions (they flow into the plan verbatim):

- Payments / billing — is there card or PII data, and where does it live?
- Object / media — where do large files actually sit (often outside the DB)?
- Analytics / event data — where does it land, who can query it?
- Backups — what is backed up, where, and is it tested?
- Shadow stores — any side spreadsheet, Airtable, notebook, personal DB a scan
  would never see?

## Step 3 — Build the plan (call the core)

Assemble the interview into an `InterviewInput` JSON and call the core builder.
Write the input to a scratch file and run a small node script from the repo root
(the `@cascade/data-model` workspace resolves there):

```bash
node --input-type=module -e '
import { buildRetrospectivePlanFromInterview } from "@cascade/data-model";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const input = JSON.parse(readFileSync(process.env.ODM_INPUT, "utf8"));
const plan = await buildRetrospectivePlanFromInterview(input);
mkdirSync(".cascade/data-model/plans", { recursive: true });
writeFileSync(`.cascade/data-model/plans/${input.orgId}.json`, JSON.stringify(plan, null, 2));
console.log("stores:", plan.stores.map(s => `${s.label} [${s.status}]`).join(", "));
console.log("open questions:", plan.openQuestions.length);
'
```

The returned plan is schema-valid; every interview store is `status:'existing'`
with a `migrationPath`. Show the human the store list + open questions.

## Step 4 — Recognition scorecard (the "that's us" judgment)

Collect the human's **ground truth** — the real store list they affirm, plus any
`surprisingButRight` flags and free-form gaps — as a `RecognitionGroundTruth`
JSON, then emit the scorecard:

```bash
node --input-type=module -e '
import { buildRecognitionScorecard, writeRecognitionReport } from "@cascade/data-model";
import { readFileSync } from "node:fs";
const plan = JSON.parse(readFileSync(process.env.ODM_PLAN, "utf8"));
const ground = JSON.parse(readFileSync(process.env.ODM_GROUND, "utf8"));
const card = buildRecognitionScorecard(plan, ground);
const file = await writeRecognitionReport(card, { dir: ".cascade/data-model/recognition" });
console.log("that's-us score:", card.thatsUsScore, "| tier fit:", card.tierFit);
console.log("wrote", file);
'
```

Walk the human through each verdict (`recognized` | `wrong` | `missing` |
`surprising-but-right`), the `tier_fit`, and the `gaps_found`. Let them correct
any verdict. When they sign off, set `humanConfirmed: true` in the JSON and note
what the run surfaced.

## Output

- `.cascade/data-model/plans/{org}.json` — the discovered DataTopologyPlan.
- `.cascade/data-model/recognition/recognition-report.{org}.json` — the durable,
  comparable recognition scorecard.

Keep the skill thin: all discovery and scoring logic lives in
`@cascade/data-model`. If something needs new logic, change the core package (and
its tests), not this skill.
