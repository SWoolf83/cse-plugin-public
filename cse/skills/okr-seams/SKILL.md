---
name: okr-seams
description: Use when you want seam OKRs — develop a seam, run persona auto/confirm passes, discuss a big goal, or roundup into org objectives.
when_to_use: "Seam-OKR development loop over the architecture topics. OPENER: a seam-pressure ranking table (liveness × drift × scaling severity) over EVERY topic — ranking orders attention, never excludes. DEVELOP (default): walk ONE seam — machine maturity numbers, the if-we-scaled outlook, open steering-queue drafts, live seam OKRs — refine conversationally, then promote through the steering-queue accept path (promoteSeamDraft) into a live level='seam' objective. The strategic companion may be read live as privileged interview context but its text is NEVER persisted anywhere. ROUNDUP: cluster all live seam objectives across topics, run the upstream-assignment Q&A per cluster (existing org objectives + 'Create new'), and queue kind='seam_upstream' drafts (writeUpstreamProposals); missing-upstream findings are explicit output. STRATEGY-LOOP MODES: AUTO — a charter-seeded persona develops EVERY seam into the steering queue (nothing promoted; accept path stays human-only). CONFIRM — same, plus one confirm question per seam. GOAL — gap-analyze a stated near-term goal against live objectives/seams → horizon-tagged drafts + seam re-eval flags. CONSOLIDATE — end-of-pass clustering of open findings into OKR-mapped spec-bundle PROPOSALS (priority score + runtime estimate); each APPROVED cluster becomes one DRAFT package — nothing live, nothing launched. All modes capture misalignments as draft finding packages. Triggers on 'seam okrs', 'develop okrs for <topic>', 'okr roundup', 'component okrs', 'seam pressure', 'okr auto pass', 'okr goal <text>'."
argument-hint: "[topic-slug (develop one seam) | roundup | auto (persona, all seams) | confirm (persona + confirm per seam) | goal \"<near-term goal>\" | consolidate]"
allowed-tools: Bash(node *), Read, Write, AskUserQuestion, Agent, cascade_get_org_context
---

# /cse:okr-seams — Seam-Pressure OKR Development & Roundup

Turn architecture-topic seam pressure into OKRs the org actually steers by.
Six modes over the same machinery:

### Tier vocabulary (display names ↔ internal slugs)

The OKR ladder is data-driven (the `okr_levels` table); slugs are STABLE, only
the human-facing display names changed to standard OKR language:

| Display name (what users see) | Internal slug (unchanged — use in code/queries) | Rank |
|---|---|---|
| **Strategic Pillar** | `level='org'` | 0 (highest) |
| **Product-Vertical** | `level='surface'` | 1 |
| **Team** | `level='seam'` | 2 |

When you write user-facing prose, say "Team objective" / "Strategic Pillar",
NOT "Seam" / "Company". When you write code, queries, `kind='seam_objective'`,
`topic_slug`, or reference the machinery, KEEP the `seam`/`surface`/`org` slugs
exactly — they are the composite FK to `okr_levels` and must not change.

**Align, don't rigidly cascade.** Cross-level linking (a Team objective
laddering up into a Strategic Pillar, a Product-Vertical rolling into a Pillar)
is **opt-in and outcome-preserving** — never mandatory top-down decomposition.
A Team objective may exist without a parent; ROUNDUP surfaces where NO upstream
covers it as an explicit finding, but the human chooses whether to link. The
model is a lattice of alignment, not a forced tree of cascaded sub-goals.

- **DEVELOP** (default; `/cse:okr-seams [topic-slug]` preselects) — walk ONE
  seam at a time: ground in the topic's machine maturity numbers and scaling
  outlook, refine the queued draft conversationally, promote it through the
  steering-queue accept path into a live `level='seam'` objective.
- **ROUNDUP** (`/cse:okr-seams roundup`) — read ALL live seam objectives
  across topics, cluster convergent themes, and queue upstream-assignment
  proposals laddering them into org objectives — surfacing every place where
  NO org objective covers what the seams are pushing on.
- **AUTO** (`/cse:okr-seams auto`) — the DEVELOP flow across EVERY seam in
  ranked order, with a charter-seeded persona answering every question, then
  a persona-answered ROUNDUP. Everything lands in the steering queue;
  NOTHING is promoted. Closes with the narrative brief.
- **CONFIRM-PER-SEAM** (`/cse:okr-seams confirm`) — AUTO plus exactly one
  confirm question per seam before its refinement lands in the queue.
- **GOAL-DISCUSSION** (`/cse:okr-seams goal "<near-term goal>"`) — analyze a
  stated big-picture goal against live objectives and seam OKRs, produce a
  gap list, queue horizon-tagged drafts, and flag seams for re-evaluation.
- **CONSOLIDATE** (`/cse:okr-seams consolidate`; also auto-runs at the end
  of every AUTO/CONFIRM pass) — cluster open findings into OKR-mapped
  spec-bundle proposals (score + runtime estimate); approval per cluster
  queues ONE draft package each — nothing goes live, nothing launches.

Every mode captures misalignments as draft finding packages — see FINDINGS
CAPTURE.

This is the skill-side driver for the seam-OKR pipeline in
`cascade-web/src/lib/okr-seams/` (`ranking.ts`, `generate.ts`, `actions.ts`,
`queries.ts`) plus the drafting CLI `scripts/draft-seam-okrs.mjs`. The
clustering and interview happen **in this session** (you, the model, on the
user's Max Plan); every persisted write goes through the library's contracts.

## THE HARD RULES (never violate)

1. **Steering-queue discipline.** This skill NEVER inserts into live
   `objectives`, `key_results`, or `objective_contributions` directly. The
   accept path — `promoteSeamDraft` for seam drafts, `acceptUpstreamProposal`
   for roundup proposals (both thin wrappers over
   `objectiveActions.acceptProposal`) — is the ONLY route to live entities.
   Everything this skill writes is an `okr_proposals` row with
   `status='draft'`.

   **Every objective and key result drafted here must pass the six checks in
   `../onboard-charter/OKR-RUBRIC.md` — read it before drafting, in every
   mode including AUTO and CONFIRM.** Persona-authored objectives are
   delegated intent and fully legitimate (a steward with `owner_type='agent'`
   is exactly that), but delegation transfers the authoring standard along
   with the authority — it does not waive it. Watch **check 6** especially:
   seam key results are frequently decreasing metrics ("reduce query volume",
   "close the staleness window"), and a decreasing metric with `baseline 0`
   computes an enormous percentage and clamps to a false 100%, so a key result
   that has achieved nothing reads as complete.

2. **Companion text is NEVER persisted.** You MAY read a topic's strategic
   companion live as PRIVILEGED interview context for the operator (the
   clearance-gated read in `cascade-web/src/lib/architecture/queries.ts` —
   `fetchArchitectureTopic` fetches base + `architecture_companion` rows and
   RLS returns zero companion rows to lower-clearance members). But companion
   content must never appear in drafts, proposals, objectives, rationales, or
   ANY stored text. Structural reason: the drafting core
   (`generate.ts#assembleSeamTopicInputs`) is built to be INCAPABLE of reading
   companions — its query hardcodes the base artifact type and its input type
   has no companion field — so drafts derive from base content only. Anything
   you persist must keep that same provenance, or an open-clearance reader of
   the steering queue leaks restricted strategy.

3. **NEVER cite live OKR rows as exemplars** in generated or edited draft
   text (OKR data is transitional — see `generate.ts`'s
   no-live-okr-exemplar rule: the drafting core never queries
   objectives/key_results at all). Ground refinements in the topic's base
   sections and machine state, not in what other objectives look like.

## The machinery (real names — cite these, don't re-implement)

| Piece | What it does |
| --- | --- |
| `cascade-web/src/lib/okr-seams/ranking.ts` — `rankSeamTopics` / `scoreSeamTopic` | Pure, deterministic seam-pressure score: `livenessFactor × driftFactor × scalingSeverity` (hard-limit / SPOF / numeric-threshold heuristics over the if-we-scaled text). Orders EVERY topic; excludes nothing. |
| `cascade-web/src/lib/okr-seams/generate.ts` — `generateSeamOkrDraftsForOrg`, `markSeamDraftsStale` | Haiku drafting lane. Per topic (ranked order): stale pass on superseded content versions, then idempotent regeneration. Writes ONLY `okr_proposals` `kind='seam_objective'` `status='draft'`. |
| `cascade-web/src/lib/okr-seams/actions.ts` — `promoteSeamDraft(proposalId, edits?)`, `acceptUpstreamProposal(proposalId, edits?)`, `writeUpstreamProposals(supabase, orgId, proposals[])` | The accept path (delegates to `acceptProposal`: atomic claim → materialize → rollback) and the roundup lane's only write. |
| `cascade-web/src/lib/okr-seams/queries.ts` — `getTopicSeamOkrs(supabase, orgId, slug)`, `getSeamRollup(supabase, orgId)` | Read layer: one topic's live seam objectives + open drafts + upstream links; the org-wide rollup in both join directions. Read-only, degrades to empty pre-migration-339. |
| `scripts/draft-seam-okrs.mjs` | The cold-start / re-runnable drafting pass CLI (`--org <id\|slug>` \| `--all-orgs`, `--dry-run`, `--max-topics N`). Re-running with unchanged topics makes zero model calls. |

Strategy-loop additions (auto/confirm/goal modes):

| Piece | What it does |
| --- | --- |
| `cse/skills/okr-seams/PERSONA-RUBRIC.md` | The persona seed + standing rules — ingested VERBATIM into every persona call. Charter ingestion, confidence protocol, example-only rule, no-cross-org, scale-optionality check, adaptivity, and the two checklists. |
| `scripts/seed-north-star-charter.mjs` | Versioned upsert of THE north-star charter artifact (`--org <id\|slug\|name>`, `--dry-run`). One node per org; re-runs append versions. Grep-guards external org names. |
| `cascade-web/src/lib/okr-seams/findings.ts` — `createFinding`, `listOpenFindings`, `specPullHandoff` | The findings lane: misalignments become DRAFT work-candidate packages (`type_data.package_type='okr_seam_finding'`). Draft-only by construction; never enqueues execution. |
| `cascade-web/src/lib/okr-seams/horizon.ts` — `writeSeamReevalFlag`, `clearSeamReevalFlag` | Seam re-evaluation flags on `packages.type_data.seam_reeval`; the seam-pressure ranking multiplies a `reevalFactor` so flagged seams rank UP. (Built by a parallel task with exactly this API.) |
| `scripts/generate-okr-brief.mjs` | The closing narrative brief (wave 4): renders the five-section brief and persists artifact + PDF. |
| `cascade-web/src/lib/okr-seams/consolidate.ts` — `buildSpecBundleProposals` (read-only plan), `clusterFindings` / `scoreCluster` / `estimateRuntime` (pure), `persistApprovedProposal` (the only write, human-approval-gated) | The consolidation lane: open findings → OKR-mapped spec-bundle proposals; approved clusters land as ONE draft package each (`type_data.package_type='spec_bundle_proposal'`). |

**Running the library from this session:** `scripts/draft-seam-okrs.mjs` is
directly runnable (it registers a resolve hook that maps the `@/` alias and
strips TS natively on Node ≥ 23.6, and loads credentials from
`cascade-web/.env.local` / `.env`). For reads (`getTopicSeamOkrs`,
`getSeamRollup`) and `writeUpstreamProposals`, write a small throwaway runner
`.mjs` that copies the resolve-hook + env preamble from
`scripts/draft-seam-okrs.mjs` and calls the library with a service-role
client — never re-implement the queries or the write validation inline.
`promoteSeamDraft` / `acceptUpstreamProposal` run in the app's AUTHED server
lane (`acceptProposal` asserts the signed-in user); see DEVELOP step 5 for
what that means in practice.

---

## Flow

### Phase 0 — MODE

Route on the first argument:

- `roundup` → ROUNDUP (Phase 3).
- `auto` → AUTO (Phase 3A).
- `confirm` → CONFIRM-PER-SEAM (Phase 3B).
- `goal <text>` → GOAL-DISCUSSION (Phase 3C) with `<text>` (the rest of the
  arguments, quotes stripped) as the stated near-term goal; empty text →
  ask for the goal first.
- `consolidate` → CONSOLIDATION (Phase 3D).
- A topic-slug argument → DEVELOP with that seam preselected.
- Otherwise DEVELOP, seam chosen off the opener table.

### Phase 1 — OPENER: the seam-pressure ranking table (both modes)

Run the ranked plan without writing anything:

```bash
node scripts/draft-seam-okrs.mjs --org <org-id-or-slug> --dry-run
```

Then load the OKR side with a runner calling `getSeamRollup` (and
`getTopicSeamOkrs` per topic for open-draft counts). Present ONE table,
highest pressure first — **every topic appears; ranking orders attention, it
never excludes seams**:

| Topic | Score | Liveness | Drift | Scaling severity | Live seam OKRs | Open drafts |
| --- | --- | --- | --- | --- | --- | --- |

Zero topics → report "no architecture topics — seed them first" and stop.

### Phase 2 — DEVELOP (default): one seam at a time

1. **Pick the seam.** Preselected by argument, else AskUserQuestion over the
   top of the table (options = top-ranked topics; always allow typing any
   slug — nothing is excluded).

2. **Present the seam's ground truth**, compactly:
   - **Machine maturity numbers** — the topic's `maturity` base section.
   - **Scaling outlook** — the `if-we-scaled` (10-100x) section, with the
     ranking breakdown (which hard-limit / SPOF / threshold lines scored).
   - **Open seam drafts** from the steering queue (`getTopicSeamOkrs(...).drafts`
     — title, KRs, evidence quotes, rankingScore, confidence).
   - **Live seam OKRs** (`.seamObjectives` with KR progress) and existing
     upstream links (`.upstream`).

3. **Optional privileged context.** If the operator wants the strategic
   angle, read the companion live (`fetchArchitectureTopic` — clearance-gated;
   `companionStatus: 'restricted'` means this operator doesn't get it, say so
   and move on). Use it ONLY to inform the conversation. **Hard rule 2
   applies: no companion text in anything persisted.**

4. **Develop conversationally.** Refine title, description, KRs, and targets
   against the maturity baselines ("the maturity section says 4 orgs / 1.4k
   packages — is 'hold p95 under 500ms at 10x packages' the right target?").
   Use AskUserQuestion for real forks (which KR to drop, which target band);
   free conversation for wording. If the topic has NO open draft, run the
   drafting pass first (`node scripts/draft-seam-okrs.mjs --org <org>` —
   idempotent; topics with current-version drafts cost nothing) rather than
   hand-writing a draft row.

5. **Promote on acceptance.** The refined result goes live ONLY via
   `promoteSeamDraft(proposalId, edits?)` — `edits` is the edit-before-accept
   override carrying every interview refinement
   (`Partial<SeamObjectiveProposalPayload>`). It yields a live objective with
   `level='seam'` + `topic_slug` and its `key_results`. Never insert into
   `objectives`/`key_results` directly. Because the accept path runs in the
   authed app lane, in practice: drive the accept where that lane is
   available, or leave the draft queued, spell out the agreed edits to the
   user, and point them at the accept control on /objectives or the topic
   page's Objectives panel — discipline over convenience. If the user
   declines, the draft simply stays queued (or note their reason).

6. **Loop or move on.** Offer the next-ranked seam, or exit to CLOSE.

### Phase 3 — ROUNDUP: ladder seams into org objectives

1. **Read everything live.** `getSeamRollup(supabase, orgId)` → all live
   `level='seam'` objectives grouped by `topic_slug`, all live org objectives,
   and the existing `objective_contributions` edges in both directions.
   Zero live seam objectives → report "nothing to roll up — develop seams
   first" and stop.

2. **Cluster convergent themes in-session** (you, the model): seam objectives
   across topics that push on the same outcome (e.g. three topics all
   pressing on multi-org scale). Every unlinked seam objective lands in
   exactly one cluster or is called out as standalone — nothing silently
   dropped. Skip edges that already exist.

3. **Upstream-assignment Q&A, one AskUserQuestion per cluster** — the SAME
   multiple-choice pattern as kickoff declarations:
   - Options = existing live org objectives (**title + timeframe** each),
     PLUS **'Create new org objective'**.
   - When no existing objective fits the cluster well, the LEADING option is
     **'Create new org objective (Recommended)'** — with your proposed title.
   - Record per cluster: `mode: 'link_existing'` + `orgObjectiveId`, or
     `mode: 'create_new'` + proposed `title`/`description`.

4. **Missing-upstream detection is EXPLICIT output.** For each cluster where
   nothing fit, report it plainly: *"No org objective covers **X** — supported
   by seams A, B."* These are the roundup's most valuable findings; never bury
   them inside the proposal JSON.

5. **Queue the proposals — the roundup lane's ONLY write.** Show a one-line
   count summary, then call `writeUpstreamProposals(supabase, orgId,
   proposals[])` (runner lane). It writes `kind='seam_upstream'`
   `status='draft'` rows and skips invalid entries so one bad proposal never
   sinks the batch. Accepting on /objectives (`acceptUpstreamProposal`) is
   what wires the `objective_contributions` links — creating the org
   objective first when `mode='create_new'`.

### Phase 3A — AUTO: persona-answered development across ALL seams

The DEVELOP flow over every seam, then ROUNDUP — with a charter-seeded
persona answering every question. Hard rules 1-3 apply unchanged, plus:

> **AUTO HARD RULE — the accept path is human-only.** In auto (and confirm)
> mode `promoteSeamDraft` / `acceptUpstreamProposal` are NEVER called. Auto
> mode fills the steering queue; it never empties it. Nothing goes live.

1. **Preflight — read the charter, CHARTER-FIRST.** The read goes through
   `loadSeamCharterContext(supabase, orgId)` in
   `cascade-web/src/lib/okr-seams/charterContext.ts` (invoke it with a runner —
   same resolve-hook + env preamble as `scripts/draft-seam-okrs.mjs`). It
   reads THE charter (`cascade-web/src/lib/charter` — `loadCharter`; node
   identity `type_data.artifact_type='charter'`, `topic_slug='charter'`) and
   returns persona-ready markdown; when no charter node exists it FALLS BACK
   to the legacy north-star artifact
   (`type_data.artifact_type='north_star_charter'`,
   `topic_slug='north-star-charter'`, newest version's `content_inline`), so
   a pre-onboarding org still works. `source` on the result says which store
   answered.

2. **Charter absent → the charter-needed path.** NEVER proceed
   persona-answered without a charter; never improvise a north star. Offer to
   run the charter interview inline — a short interview capturing: today's
   user base, the ~1-month goal, long-term intent, trade-offs (including
   scale-optionality), and adaptivity expectations. Write the interview
   result as charter markdown to the UNTRACKED path
   `.cascade/charter-draft.md` (NEVER edit the git-tracked seed script
   itself), then persist via the script's `--content-file` flag: check with
   `node scripts/seed-north-star-charter.mjs --org <org> --content-file
   .cascade/charter-draft.md --dry-run` (prints the body, writes nothing),
   then run without `--dry-run`. It versioned-upserts ONE node per org
   (re-runs append versions) and refuses any body naming an external
   organization. Then continue.

3. **Build the persona.** Persona prompt = `PERSONA-RUBRIC.md` content
   (verbatim) + the charter artifact body + optionally the user's cascade
   intent persona if one exists (`/cse:intent` output at
   `${CLAUDE_PLUGIN_ROOT}/skills/persona/personas/{name}.md`). Big model,
   session-side — the user's Max Plan session — never server-side.

4. **The loop — EVERY topic, ranked order.** Ranking orders attention, never
   excludes: iterate ALL seams from the opener table, highest pressure first.
   For each seam run the DEVELOP flow's decision points (steps 2-4), but
   every question that would go to AskUserQuestion goes instead to an
   ISOLATED persona Agent call (the `cse/skills/persona` two-context
   pattern): fresh context each call = persona prompt + conversation-so-far
   + current question + options; response format **Answer / Reasoning /
   Confidence (high|medium|low) / Flag-for-human**. Display each Q&A to the
   user as it happens. A persona answering everything `high` is
   malfunctioning (rubric §2).

5. **Persistence — write refinements back onto the draft.** Refined drafts
   STAY in the steering queue (`okr_proposals` `status='draft'`). Write the
   persona's refinements onto the draft row's `payload` (runner lane,
   service-role update) — the same fields `promoteSeamDraft`'s `edits`
   would carry (`Partial<SeamObjectiveProposalPayload>`: title, description,
   keyResults, evidence) — plus:
   - `payload.persona_confidence = 'high'|'medium'|'low'` — the MINIMUM
     confidence across the answers that shaped this draft (conservative).
     ALWAYS written — `high` included, never omitted. The string enum is THE
     one confidence encoding everywhere (this payload field, PERSONA-RUBRIC
     §2, and finding `provenance.persona_confidence` alike); never write the
     old 0.9/0.6/0.3 numbers (readers normalize legacy numeric payloads, but
     no new ones are ever written).
   - `payload.persona_flags = [{question, answer, confidence, reason}]` for
     every medium/low or flagged-for-human answer.
   - `payload.horizon = 'near_term'|'long_term'` — the persona proposes one
     per objective per the rubric.

6. **Per-objective rubric checks.** For every proposed objective/KR set run
   the PERSONA-RUBRIC checklists: the scale-optionality check (foreclosed?
   → rework or flag), the example-only rule, and no-cross-org — before its
   payload is written.

7. **Roundup, persona-answered.** After all seams, run Phase 3 ROUNDUP with
   the same persona answering the upstream-assignment Q&A per cluster,
   landing `kind='seam_upstream'` drafts via `writeUpstreamProposals` — each
   payload also carrying `persona_confidence` / `persona_flags` / `horizon`
   where applicable.

8. **Closing — the narrative brief.** Run
   `node scripts/generate-okr-brief.mjs` (wave 4 builds it): renders the
   five-section brief — including "places I guessed on your behalf" from the
   persisted flags — and persists artifact + PDF. Then run CONSOLIDATION
   (Phase 3D) over the pass's open findings, then CLOSE.

   > **CARVE-OUT — consolidation approval is HUMAN-ONLY, in every mode.**
   > The persona answers development and roundup questions; it NEVER answers
   > CONSOLIDATION approval questions. Phase 3D's per-cluster
   > queue/skip/merge question is ALWAYS an AskUserQuestion to the human —
   > in AUTO, in CONFIRM, everywhere. A persona-approved bundle proposal is
   > a hard-rule violation (it would be an agent writing work packages on
   > nothing but its own say-so).

### Phase 3B — CONFIRM-PER-SEAM (`confirm`)

Identical to AUTO except: after the persona develops each seam's draft, ONE
AskUserQuestion per seam presents the persona's refined result (title + KRs
+ horizon + confidence) with options:

- **Accept refinement into queue** — write the payload as in AUTO step 5
  (still a `status='draft'` queue row; NOT promotion).
- **Skip this seam** — leave the draft untouched.
- **Drop to full Q&A for this seam** — run DEVELOP conversationally for this
  seam, then continue the pass.

Same closing brief, then the same end-of-pass CONSOLIDATION (Phase 3D).

### Phase 3C — GOAL-DISCUSSION (`goal "<stated near-term goal>"`)

Steve states a big-picture near-term goal; the flow analyzes it against the
live lattice:

a. **Read context.** Live org objectives split by horizon (the
   `objectives.horizon` column — values `near_term` | `long_term` | NULL),
   live seam OKRs (`getSeamRollup`), and open steering-queue drafts.

b. **Gap analysis.** Analyze the stated goal against long-term objectives,
   existing near-term objectives, and live seam OKRs; produce an explicit
   **GAP LIST** — what the goal needs that nothing currently covers. Present
   it plainly before writing anything.

c. **Queue horizon-tagged drafts.** Propose initiative/objective drafts to
   the steering queue (`okr_proposals`, `status='draft'`, `payload.horizon`
   set): org-level proposals use `kind='objective'`
   (`ObjectiveProposalPayload` in `okrTypes.ts`); seam-scoped ones use
   `kind='seam_objective'`. Steering-queue discipline (hard rule 1) applies
   — accepting on /objectives is the only route to live entities.

d. **Flag re-prioritized seams.** For seams the goal re-prioritizes, write
   re-evaluation flags via the horizon lib:
   `writeSeamReevalFlag(supabase, orgId, topicSlug, { reason, flaggedBy,
   sourceThreadId? })` from `cascade-web/src/lib/okr-seams/horizon.ts` —
   stored as `packages.type_data.seam_reeval` `{flagged, reason, flagged_at,
   flagged_by}`. The seam-pressure ranking multiplies a `reevalFactor` so
   flagged seams rank UP on the next opener table; `clearSeamReevalFlag`
   clears after re-development. (The horizon lib is built by a parallel task
   with exactly this API.)

e. **Every misalignment surfaced is a FINDING** — see FINDINGS CAPTURE.

### Phase 3D — CONSOLIDATION (`consolidate`)

The end-of-pass consolidation agent: cluster the org's OPEN findings into
OKR-mapped **spec-bundle proposals** with a runtime estimate and a priority
score. Runs automatically at the END of every AUTO/CONFIRM pass (after the
closing brief) and standalone via `/cse:okr-seams consolidate`.

> **CONSOLIDATION HARD RULE — nothing is created live without human
> approval.** The build step performs ZERO writes. Each APPROVED cluster
> becomes exactly ONE more DRAFT package. Never a live bundle, never a spec,
> never an objective, never an `execution_queue` row. And launching a CSE run
> from an approved bundle proposal remains a SEPARATE human action.

Library: `cascade-web/src/lib/okr-seams/consolidate.ts`. **Representation
(investigated, documented in the module header):** an approved proposal is a
DRAFT package mirroring the findings convention — `kind='work'`,
`package_type='task'`, `status='draft'`,
`type_data.package_type='spec_bundle_proposal'` + `type_data.spec_bundle`.
A new `okr_proposals` kind was rejected because `acceptProposal` hard-fails
unknown kinds (`Unknown proposal kind`) — it cannot ignore them safely; the
draft-package convention is proven by findings, renders on **/work** as
backlog, and nothing auto-materializes it.

1. **Build the plan (runner lane, ZERO writes).**
   `buildSpecBundleProposals(supabase, orgId)` reads open findings
   (`listOpenFindings`) + live-objective horizons (`getObjectivesByHorizon`),
   clusters deterministically (`clusterFindings`: motivating OKR served
   first, then theme affinity via topic_slug / title-token overlap), scores
   each cluster (`scoreCluster`), and attaches the runtime heuristic
   (`estimateRuntime`). Returns proposals highest-priority first. Zero open
   findings → report "no open findings to consolidate" and stop.

2. **Present each cluster** compactly:
   - **Members** — each finding's title + importance + topic slug.
   - **OKR served** — the shared objective / KR / proposal reference.
   - **Estimate** — waves / tasks / tokens / minutes, ALWAYS labeled as a
     heuristic estimate (the `note` field says so; repeat it).
   - **Score + formula rationale** — the `score.rationale` string, derived
     from `importanceWeight(max member: critical=3 high=2 normal=1) ×
     okrImpact(live objective/KR=3, draft proposal or unresolved
     objective=2, unlinked=1) × horizonFit(near_term=1.5, else 1)`.
   - **The near-term check** — does the cluster serve a `near_term` live
     objective? (`nearTerm` / `horizon` on the proposal; if
     `horizonDegraded` is true say the horizon column is absent pre-343 and
     the check is unknowable.)

3. **One AskUserQuestion per cluster — to the HUMAN, always.** Consolidation
   approval questions are NEVER routed to the persona, in any mode
   (including the AUTO/CONFIRM end-of-pass run — see the Phase 3A step 8
   carve-out). Options exactly:
   - **Queue this bundle proposal** — approve it.
   - **Skip** — drop it; the member findings stay open on /work untouched.
   - **Merge with another cluster** — combine its members into a named
     surviving cluster, recompute with the PURE functions in-session
     (`scoreCluster` + `estimateRuntime` on the merged member set), then
     re-ask for the merged cluster.

4. **Persist ONLY approved clusters.** `persistApprovedProposal(supabase,
   orgId, proposal)` (runner lane) writes the ONE draft package carrying
   `spec_bundle.member_package_ids`, `okr_served`, `topic_slugs`, the
   `estimate`, the `score` (value + breakdown + formula + rationale), and
   `horizon`. It renders on **/work** beside the findings it consolidates.
   Skipped clusters write NOTHING.

5. **Closing summary** — count queued vs skipped (and merges), then state
   plainly: *launching a CSE run from an approved bundle proposal is a
   separate human action* — list the spec-pull handoff per member finding
   (`/cse:spec-pull <finding-package-id>`, from `specPullHandoff`).

---

## FINDINGS CAPTURE (all modes — develop / auto / confirm / roundup / goal-discussion / consolidate)

Every misalignment, debt item, or fix candidate surfaced during the flow is
created IMMEDIATELY — at the moment it surfaces, not batched to CLOSE — as a
DRAFT work-candidate package via `createFinding` in
`cascade-web/src/lib/okr-seams/findings.ts` (runner lane, same resolve-hook
preamble as `scripts/draft-seam-okrs.mjs`). NEVER as an idea/nugget, never
auto-executed — findings sit at `status='draft'` until a human picks them up.

Exact signature — `createFinding(supabase, orgId, input)` where `input` is:

```jsonc
{
  "title": "required",
  "description": "optional",
  "importance": "critical" | "high" | "normal",
  "topicSlug": "required — the seam topic",
  "motivatingOkr": { "objective_id": "?", "kr_id": "?", "proposal_id": "?" },
                                    // at least ONE of the three
  "provenance": {                   // created_by_flow is stamped by the lib
    "source_mode": "develop" | "auto" | "roundup" | "goal_discussion" | "consolidate",
    "session_ref": "optional thread/session pointer",
    "charter_version": "optional",
    "persona_confidence": "medium"  // optional — 'high'|'medium'|'low', THE
  },                                //  one enum encoding (legacy numeric
                                    //  0.9/0.6/0.3 rows normalize on read;
                                    //  never write numbers)
  "workspaceId": null, "createdBy": null, "detail": "optional"
}
```

**Dedup is AUTOMATIC — create is an upsert-by-key.** `createFinding` computes
a deterministic `finding_key` (org + `topicSlug` + normalized title —
lowercased, trimmed, whitespace-collapsed) and checks for an OPEN draft with
the same key first. On a hit it does NOT insert: it upgrades the existing
draft's importance when the incoming one ranks higher, bumps
`provenance.last_seen_at`, and returns the existing package id with
`deduped: true`. So re-running an auto pass (or re-surfacing the same
misalignment in any mode) never duplicates findings — call `createFinding`
freely at the moment each finding surfaces; do not build your own dedup.

Returns `{ packageId, finding, deduped? }` or `{ error }` — surface errors,
never swallow them. The row lands as `kind='work'`, `package_type='task'`,
`status='draft'`, `type_data.package_type='okr_seam_finding'` +
`type_data.finding_key`. Findings
render on **/work** (Findings band, importance-ranked) with a Spec-it
handoff: `/cse:spec-pull <package-id>` (`specPullHandoff`).

---

### Phase 4 — CLOSE (all modes)

Summarize, always splitting **what landed in the queue** vs **what went
live**:

> Developed: [seam objectives promoted live, with topic slugs] (or "none").
> Queued: [N seam drafts refined-but-pending, M upstream proposals].
> Missing upstream: [each finding, verbatim] (or "none").
> Findings: [count created, top importance level] (or "none") — on **/work**.
> Bundle proposals: [N queued vs M skipped, + merges] (consolidation runs
> only) — DRAFT packages on **/work**; launching a CSE run from one stays a
> separate human action.
> Review at **/objectives** (steering queue + seam grouping) and each topic
> page's **Objectives panel** — queued drafts go live only on accept there.

For auto/confirm passes, also point at the narrative brief (artifact + PDF
from `generate-okr-brief.mjs`) — it carries the five sections including
"places I guessed on your behalf".

---

## Data-contract appendix (payload shapes — migration 339)

Both kinds are `okr_proposals` rows `{ org_id, kind, payload, status:'draft',
rationale?, confidence? }`; types in
`cascade-web/src/lib/objectives/okrTypes.ts`.

```jsonc
// kind: "seam_objective"  (SeamObjectiveProposalPayload)
// Written by generate.ts; accept → live objective level='seam' + KRs.
{
  "topic_slug": "voice-brain",                  // REQUIRED — the topic scope
  "title": "Outcome-framed seam objective",
  "description": "1-3 sentences",
  "keyResults": [ { "title": "...", "targetValue": 100, "unit": "%",
                    "baseline": 40, "measureSource": "manual" } ],   // 1-5
  "evidence": [ { "quote": "verbatim base-content substring",
                  "source": "maturity" } ],     // maturity | scaling_outlook | liveness | drift
  "rankingScore": 6.75,
  "sourceContentVersion": "uuid"                // freshness anchor (stale pass)
}

// kind: "seam_upstream"  (SeamUpstreamProposalPayload)
// Written by writeUpstreamProposals; accept → objective_contributions edges.
{
  "clusterTheme": "Multi-org scale readiness",
  "seamObjectiveIds": ["uuid", "..."],          // REQUIRED, non-empty, live seam objectives
  "mode": "link_existing",                      // or "create_new"
  "orgObjectiveId": "uuid",                     // REQUIRED when link_existing
  "title": "New org objective title",           // REQUIRED when create_new
  "description": "optional",
  "rationale": "why these ladder up"            // copied onto each contribution row
}
```

Freshness: when a topic's code drifts materially, `markSeamDraftsStale` flips
its OPEN drafts to `status='stale'` and the next drafting run regenerates them
— accepted/rejected rows are history and are never touched.
