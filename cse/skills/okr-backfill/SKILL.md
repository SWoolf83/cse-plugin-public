---
name: okr-backfill
description: Use when you want an OKR backfill — cluster existing work into initiatives and draft objectives + KRs to the /objectives steering queue.
when_to_use: "Interview-assisted FULL-COVERAGE OKR backfill. Gathers the org's top-level work groupings (bundles/projects), clusters them into 5-15 outcome-oriented candidate initiatives in-session (every grouping lands in exactly one cluster or an explicit unclustered list — nothing silently dropped), walks the user through confirming clusters and outcome framing, then drafts one outcome-framed objective + 2-4 measurable KRs per confirmed cluster, one initiative proposal per cluster, and evidence links onto existing live KRs — ALL persisted as status='draft' rows in the okr_proposals steering queue on /objectives. NEVER mutates live objectives/key_results/kr_evidence_links; the steering-queue accept path is the only route to live entities. Triggers on 'okr backfill', 'backfill objectives', 'cluster my projects into initiatives', 'turn my projects into OKRs'."
argument-hint: "[run (default) | --dry-run (print the proposal JSON, persist nothing)]"
allowed-tools: Bash(node *), Read, Write, AskUserQuestion, cascade_get_unified_projects, cascade_list_packages, cascade_get_org_context
---

# /cse:okr-backfill — Interview-Assisted OKR Backfill to the Steering Queue

Turn an org's existing pile of top-level work groupings into a reviewable OKR
structure: candidate **initiatives** (clusters of bundles), one outcome-framed
**objective + 2-4 measurable KRs** per confirmed cluster, and **evidence
links** mapping existing work onto live KRs — all landed as **draft proposals**
in the steering queue that the human accepts/edits/rejects on **/objectives**.

This is the skill-side sibling of the in-app inference pipeline
(`cascade-web/src/lib/objectives/krInference.ts`). The clustering and drafting
happen **in this session** (you, the model, on the user's Max Plan) instead of
a server-side API call — but the payload contracts, the coverage invariant,
and the drafts-only rule are **identical**.

**What "initiative" means here (Definition A).** An initiative is the **WORK
that ladders under a Key Result** — `bundle_kind='initiative'`, one
`InitiativeProposalPayload` per cluster (`kind:"initiative"`). It is NOT a
top-level OKR tier. The OKR tiers themselves are **Strategic Pillar**
(`level='org'`), **Product-Vertical** (`level='surface'`), and **Team**
(`level='seam'`) — slugs unchanged; only display names use the standard OKR
vocabulary. So a cluster produces: one **objective** (at some tier), its **KRs**,
and one **initiative** (the delivery work under those KRs) — never an
"initiative tier" above the objectives.

## THE HARD RULE (never violate)

**This skill NEVER mutates live `objectives`, `key_results`, or
`kr_evidence_links` rows.** Every persisted write is an `okr_proposals` row
with `status='draft'`. The steering-queue accept path on /objectives — a human
clicking accept — is the ONLY route to live entities. Do not use
`cascade_manage_objective` (create/add_kr/link_package/...) anywhere in this
flow; it writes live entities and is not part of this skill.

The bundled script enforces this mechanically: it only inserts into
`okr_proposals` and forces `status='draft'` regardless of input.

**Every objective and key result you draft must pass the six checks in
`../onboard-charter/OKR-RUBRIC.md`. Read it before drafting.** Drafting into a
queue does not lower the bar — it raises it, because a human is about to accept
these on your recommendation. The two that fail most often here: **check 1**
(a measurable statement titled as an objective is a key result — objectives are
qualitative) and **check 6** (a key result with no explicit baseline cannot be
scored; `baseline = target` is a division by zero and `baseline = 0` on a metric
that did not start at zero credits work that already existed). If a baseline
appears in your title text, it belongs in `baseline_value`.

## THE FULL-COVERAGE INVARIANT (must-have)

Every active top-level grouping fetched in GATHER appears in **exactly one
cluster** or in an **explicit `unclustered` list with a stated reason**.
Nothing is silently dropped, nothing is duplicated. Before moving past
CLUSTER, recount: `sum(cluster sizes) + len(unclustered) == total groupings`,
and every id appears exactly once. If the recount fails, fix the clustering
before showing it to the user.

## Payload contracts (exact — the accept path materializes these shapes)

Proposals are `okr_proposals` rows: `{ org_id, kind, payload, status:'draft',
rationale?, confidence?, created_by }` (migration `292_kr_evidence_edges.sql`).
The `payload` per `kind`:

```jsonc
// kind: "objective"  (ObjectiveProposalPayload)
{
  "title": "Outcome-framed objective title",
  "description": "1-2 sentences",              // optional
  "timeframeStart": "YYYY-MM-DD",              // optional
  "timeframeEnd": "YYYY-MM-DD",                // optional
  "keyResults": [                               // 1-4 entries (aim for 2-4)
    {
      "title": "Measurable KR",
      "targetValue": 100,                       // optional, numeric
      "unit": "%",                              // optional
      "measureSource": "linked_packages_completed", // or "manual"
      "startDate": "YYYY-MM-DD",                // optional
      "targetDate": "YYYY-MM-DD",               // optional
      "evidence": [                             // optional; each entry exactly
        { "bundleId": "uuid" }                  //   ONE of packageId | bundleId
      ]                                         //   (+ optional confidence, rationale)
    }
  ],
  "clusterBundleIds": ["uuid", "..."]
}

// kind: "initiative"  (InitiativeProposalPayload)
{
  "title": "Initiative name",
  "existingBundleId": "uuid",                   // optional — MUST be a memberBundleId
  "memberBundleIds": ["uuid", "..."],
  "rationale": "why these belong together"      // optional
}

// kind: "evidence_link"  (EvidenceLinkProposalPayload — targets EXISTING live KRs)
{
  "keyResultId": "uuid",
  "packageId": "uuid",                          // exactly ONE of packageId | bundleId
  "bundleId": "uuid",
  "confidence": 0.8,                            // optional, 0-1
  "rationale": "one sentence",                  // optional
  "workTitle": "title of the linked work",      // ALWAYS include — the steering queue renders it
  "keyResultTitle": "title of the KR"           // ALWAYS include — the steering queue renders it
}
```

## The bundled script (gather + persistence rung)

`scripts/write-proposals.mjs` next to this SKILL.md — resolve it as
`${CLAUDE_PLUGIN_ROOT}/skills/okr-backfill/scripts/write-proposals.mjs` when
installed (repo checkout: `cse/skills/okr-backfill/scripts/write-proposals.mjs`).
Zero npm dependencies (plain fetch against PostgREST); same credential chain
as `bin/cascade.js` — `~/.cascade/auth.json` user tokens (RLS-enforced) first,
else `SUPABASE_SERVICE_ROLE_KEY` + `CASCADE_ORG_ID` from `.env` /
`~/.cascade/.env`.

```bash
node <script> gather          # clustering context JSON to stdout
node <script> write <file|->  # validate + insert draft proposals in ONE batch
```

Exit codes: `0` ok · `1` credentials (tell the user to `cascade login`) ·
`2` validation failed, nothing written · `3` migration 292 missing ·
`4` database error.

---

## Flow

### Phase 1 — GATHER

Primary rung — run the bundled script (this also fail-fasts the exact
credential chain PERSIST will need):

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okr-backfill/scripts/write-proposals.mjs gather
```

Returns `{ orgId, steeringQueueAvailable, bundles: [{ id, title, status,
packageCount, packageIds, samplePackageTitles }], keyResults: [{ id, title,
unit, targetValue, measureSource, objectiveTitle, ... }], recentPackages,
existingEvidenceLinks }` — top-level non-archived bundles capped at 150, live
KRs at 100, mirroring `krInference.ts`.

- If `steeringQueueAvailable` is false, warn NOW: migration 292 is not applied,
  persistence will fail — offer `--dry-run` (produce the JSON, save it locally,
  persist nothing) or stop.
- Fallback rung (script credential chain unavailable): use the cascade-api MCP —
  `cascade_get_unified_projects` (unified objectives/bundles/tracker rows with
  titles, status, package counts) plus `cascade_list_packages` for recent
  packages. These do NOT return bundle→member package ids or live KR ids, so a
  fallback run clusters on titles/status only and **skips the evidence-link
  phase**; persistence still requires the script, so treat a fallback run as
  `--dry-run` and say so. (There is no MCP verb for `okr_proposals` — deferred
  by design.)
- Optionally add `cascade_get_org_context` for the org's stated priorities to
  sharpen outcome framing.
- Zero bundles → report "nothing to backfill" and stop.

### Phase 2 — CLUSTER (in-session, you are the model)

Cluster the groupings yourself — no API call. Apply the same rubric as
`krInference.ts`:

- Group the bundles into **5-15 candidate INITIATIVES**: multi-point,
  outcome-oriented groupings suited for delegation to an owner.
- Each cluster shares a coherent outcome or theme — not superficial keyword
  overlap. Use titles, status, package counts, and `samplePackageTitles`.
- A bundle that genuinely fits no initiative goes in `unclustered` with a
  short reason. Do not force matches.
- **FULL-COVERAGE INVARIANT**: every bundle id appears exactly once — in one
  cluster or in `unclustered` with a reason. Recount before proceeding
  (`sum(cluster sizes) + unclustered == total`). Fewer than ~6 bundles total?
  Fewer clusters than 5 is fine — coverage matters, the 5-15 band is for
  sizable portfolios.

### Phase 3 — INTERVIEW (concise — don't interrogate)

1. Present the clusters compactly: theme, member bundle titles, rationale,
   plus the unclustered list with reasons.
2. **One batch AskUserQuestion** to confirm the clear clusters wholesale
   ("Confirm these N clusters as initiatives?" with an option to flag ones to
   adjust).
3. **Per-cluster AskUserQuestion ONLY for ambiguous clusters** (you're unsure,
   or the user flagged it): offer merge / rename / split / move-to-unclustered
   options. Max one question per ambiguous cluster.
4. **Outcome framing** per confirmed cluster: where the outcome isn't already
   obvious from the theme, ask "what outcome does this initiative serve?" —
   fold multiple clear-cut clusters into a single question with per-cluster
   proposed framings the user can bulk-accept. Never more than one framing
   question per cluster.

Unclustered items stay unclustered unless the user moves them — record their
reasons for the report.

### Phase 4 — DRAFT (in-session)

Per confirmed cluster:

1. **One objective proposal** (`kind: "objective"`): outcome-framed title (a
   qualitative outcome, not a task list — use the user's framing from the
   interview), 1-2 sentence description, **2-4 measurable KRs**:
   - `measureSource: "linked_packages_completed"` for KRs whose progress IS
     the completion of the cluster's work — give each of these an `evidence`
     array pointing at the cluster's bundles: `[{ "bundleId": ... }, ...]`.
   - `measureSource: "manual"` for business-metric KRs a human will update.
   - `targetValue` numeric with a short `unit`; dates ISO `YYYY-MM-DD`; omit
     anything you can't ground.
   - `clusterBundleIds` = the cluster's member bundle ids.
2. **One initiative proposal** (`kind: "initiative"`): `title` = cluster
   theme, `memberBundleIds` = member ids, `rationale` = cluster rationale.
   Set `existingBundleId` only when one member bundle clearly IS the
   initiative (dominant anchor, or the sole member).

Then, if GATHER returned live `keyResults`: **evidence-link proposals**
(`kind: "evidence_link"`) mapping existing bundles/packages onto those live
KRs — only where the work genuinely serves the KR (completion is evidence of
progress), exactly one target per link, prefer bundle-level links, skip pairs
already in `existingEvidenceLinks`, confidence 0-1 + one-line rationale. Zero
links is a fine answer.

Set each proposal row's top-level `rationale` (and `confidence` for evidence
links) alongside the payload.

### Phase 5 — PERSIST (one batch, drafts only)

Write all proposals to a temp JSON file — `{ "proposals": [ { "kind": ...,
"payload": ..., "rationale": ..., "confidence": ... } ] }` — show the user a
one-line count summary ("about to queue X objectives + Y initiatives + Z
evidence links as drafts"), then:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okr-backfill/scripts/write-proposals.mjs write /path/to/proposals.json
```

- The script validates every row against the contracts above BEFORE any
  network call and inserts in **one batch** — invalid input or a failed
  insert writes **nothing** (no partial state).
- Exit 3 → relay verbatim: "Steering queue storage not available — run
  migration 292 first", and offer to save the proposals JSON so nothing is
  lost.
- `--dry-run` mode: skip the write, save the JSON where the user can see it,
  and print what WOULD be queued.
- On success the script prints `{ inserted, byKind, proposalIds }` — use it
  for the report.

### Phase 6 — REPORT

Coverage summary, always in this shape:

> **X groupings → Y initiatives → Z draft objectives (+ N evidence links).**
> Unclustered: [bundle title — reason, ...] (or "none").
> Review at **/objectives → Steering queue** to accept, edit, or reject —
> nothing goes live until you accept it there.

If any clusters were dropped or merged during the interview, say so. If the
evidence-link phase was skipped (no live KRs / fallback gather), say that too.
