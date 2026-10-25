# RE-EVALUATE — Design Note (the third active-knowledge stage)

Spec: `spec-reeval-drift-stage-2026-06-16` · package `bb7095f4` ·
builds on the Active Knowledge loop (spec `spec-active-knowledge-loop-2026-06-16`,
pkg `68c7d2aa`); white paper (pkg `437900a6`) §5 documents this stage as roadmap.
This note records what v1 actually builds.

## The thesis

PROPOSE made knowledge live by linking it to work (`informs` edges). INJECT
delivered that knowledge, clearance-filtered, to whoever worked the package.
**RE-EVALUATE** keeps the deployed work honest: when the *connected* knowledge now
**contradicts the package's own assumptions**, that contradiction is the signal —
a deployed decision is being kept honest against a world that kept changing.

The full loop, all three stages now shipped:

1. **PROPOSE** — agent proposes `informs` edges (knowledge → work); human confirms;
   confirmed edges written to `package_edges`. (`/cse:link`)
2. **INJECT** — agent working a package receives its connected knowledge as
   clearance-filtered context. (`cascade_get_context { package_id }`)
3. **RE-EVALUATE** — agent judges the connected knowledge against the package's
   assumptions, records drift signals, surfaces medium+ for a human decision.
   (`/cse:reeval` + `cascade_drift`) — **this note.**

## Detection flow

```
/cse:reeval <package>
  → cascade_get_context { package_id }      # INJECT path, clearance-filtered (REUSED)
  → load package assumptions[] + must_haves + intent (linked spec, else description)
  → agent judges each injected knowledge card × each assumption for contradiction
  → cascade_drift record  (ALL severities; dedup an existing OPEN tuple)
  → surface severity >= SURFACE_THRESHOLD (medium) via AskUserQuestion
  → cascade_drift set_status  (open → accepted | dismissed)
```

The **judgment** is the only model-dependent step, and it is provider-neutral —
nothing hardcodes a model. Everything else is deterministic substrate work.

## The `drift_signals[]` shape (no migration)

Drift signals live on **`packages.type_data.drift_signals[]`** — the SAME
append-array pattern as `gate_runs[]` / `test_runs[]` (both confirmed present), so
**no migration, no new table, no new column**. The write is a read-merge-write
**SHALLOW-merge**: spread the existing `type_data` and overwrite ONLY
`drift_signals`, leaving sibling keys (`gate_runs`, `test_runs`, `must_haves`, …)
untouched. Each signal:

```jsonc
{
  "id": "<uuid>",                       // generated
  "knowledge_node_id": "<uuid>",        // the contradicting 'informs' source (provenance)
  "severity": "low" | "med" | "high",
  "assumption_affected": "<text>",      // the specific assumption contradicted
  "summary": "<one line>",
  "status": "open" | "accepted" | "dismissed",   // default 'open'
  "detected_at": "<iso>",
  "rationale": "<why — optional>"
}
```

**Provenance:** `knowledge_node_id` + `assumption_affected` + `summary` let a
reviewer trace *why* a signal was raised back to the source knowledge and the
contradicted assumption.

## Org guard (holds under service_role)

`cascade_drift` mirrors `cascade_link_knowledge`: it resolves the target package
**filtered by `auth.orgId`** and verifies the row's `org_id` matches **before any
write**. RLS already scopes packages in user mode, but the explicit check holds
even under `service_role` (which bypasses RLS) — a cross-org / non-member id fails
closed, nothing is written.

## Severity tempering — the preferences seam

ALL severities are **recorded**; only `>= SURFACE_THRESHOLD` are **surfaced** to a
human for an accept/dismiss decision. `SURFACE_THRESHOLD` is a **single named
constant** (`drift.ts`), hardcoded to `med` for v1. This is the attention-budget
seam the future surfacing-preferences package (`e4ecd28f`) will make tunable —
record everything (cheap, complete record), interrupt sparingly (medium+ only).
Low signals are on the package record, un-nagged.

## Dedup (no duplicate nags on re-run)

Re-running `/cse:reeval` on unchanged data must not pile up duplicate open signals.
The dedup tuple is **(package, knowledge_node, assumption_affected)**: `record`
skips when an **OPEN** signal already exists for that tuple. A **dismissed** tuple
is *not* a dup — if the same contradiction resurfaces (e.g. now more severe), a
fresh signal can be raised. (Dedup is the pure helper `findOpenDuplicate`, unit-
tested without a DB.)

## Clearance reuse (no second implementation)

RE-EVALUATE **never** judges knowledge above the caller's clearance: it only sees
what the INJECT path returns, which is already filtered by the caller's REAL role
via the shared `clearance.ts` (`sensitivityToTier` / `resolvePackageSensitivity` /
`clearanceForRole` over `use_policies`). There is **no** second clearance
implementation here — an engineer (L1) re-evaluating a package with a confidential
(L3) connected node simply never receives that node, so it is never considered.

## Act-on-accept — making an accepted signal actionable

Spec: `spec-act-on-accept-drift-2026-06-16` · package `8dc4ccd0`. RE-EVALUATE v1
recorded + decided; **act-on-accept** completes the loop's payoff: when a human
**accepts** a med+ signal, the contradiction becomes the next *tracked, decidable*
artifact instead of merely flipping a status.

**The accept is now a per-accept CHOICE** (in `/cse:reeval` Phase 6, via
`AskUserQuestion`), driving one of three outcomes:

1. **`package` (default)** — spawn a **triage-first `idea` change-proposal**
   package. `idea` (not `task`/`spec_request`) is deliberate: a human still decides
   whether to build it; the idea can then flow to `/cse:spec` or `/cse:delegate`.
   The package is **draft** (every `cascade_create_package` starts there). Its
   `type_data` carries the full provenance:
   ```jsonc
   {
     "sourced_from_drift": "<signal_id>",
     "work_package_id": "<the re-evaluated package>",
     "assumption_affected": "<the contradicted assumption>",
     "knowledge_node_id": "<the contradicting 'informs' source>",
     "suggested_change": "<one-line change>"
   }
   ```
2. **`question`** — a lighter `drift_question` **thread event** on the WORK
   package's thread (raise the doubt without spawning work). No new package, no
   new route.
3. **`acknowledge`** — the signal is accepted; nothing else is created.

### The link/stamp provenance model (no migration, no new edge tooling)

Outcomes ride **existing** mechanisms — no table, no column:

- **work ↔ change** link = the drift signal's **`spawned_package_id` stamp**
  (a typed `relates_to`/`depends_on` substrate edge is deferred — avoids new edge
  tooling for v1).
- **knowledge → change** link = a reused **`informs` edge** (`cascade_link_knowledge`,
  knowledge node → the new idea). The active-knowledge edge primitive carries it.
- the **question** variant = a reused **`thread_events`** row (`event_type:
  "drift_question"`) on the work package — the same insert path
  `archive-package` / the workflow gate surfacing use. No new table.

The accepted signal is stamped (via the same shallow-merge `persistSignals`,
org-guarded by the same `loadGuarded`):
```jsonc
{ "status": "accepted",
  "action": "package" | "question" | "acknowledge",
  "spawned_package_id": "<for action=package>",
  "question": "<for action=question>",
  "accepted_at": "<iso>" }
```
So every accepted signal is **fully traceable drift → artifact**: `action` +
(`spawned_package_id` | `question`) + `accepted_at`. `cascade_drift list` reads it
all back.

### Separation of concerns (skill orchestrates; tool only stamps)

`cascade_drift accept` does **NOT** create the package or the `informs` edge — the
`/cse:reeval` skill orchestrates `cascade_create_package` (idea, draft) +
`cascade_link_knowledge`, then calls `accept` with the resulting
`spawned_package_id`. The tool only **stamps** the signal and (for `question`)
writes the thread event. This keeps reuse honest: create + link already exist; the
tool adds exactly the stamp + the question event.

### Double-spawn guard

`accept` is **idempotent**. If the target signal is already `status: 'accepted'`,
the tool returns its **recorded outcome** (`already_accepted: true`) and performs
**no** side effects — no second package, edge, thread event, or write. A re-run /
double-click never duplicates the artifact. (The stamp/guard logic is pure helpers
— `applyAcceptStamp` / `recordedOutcome` — unit-tested without a DB.) `accept` is
org-guarded by the same `loadGuarded`, so a cross-org accept fails closed before
any write, exactly like `record` / `set_status`.

## Interactive-only

No cron / daemon / scheduled trigger (decision `fb17e876`). `/cse:reeval` — and
therefore act-on-accept — runs when the user asks. The drift surface is the
attention budget; a background process that silently raised drift (or silently
spawned change packages) would defeat the human-in-the-loop accept/dismiss
contract.

## Deferred fast-follows

- **Auto-spec / auto-delegate:** the spawned `idea` is triage-first (draft) — a
  human routes it to `/cse:spec` or `/cse:delegate`. Auto-routing is deferred.
- **Standalone act-on-old-signal:** acting on an OLD open signal outside a
  `/cse:reeval` run (a standalone accept) is deferred — v1 acts within the run.
- **spec_questions / voice pending-questions route:** the `question` variant uses a
  `drift_question` thread event on the work package; routing it to the
  spec_questions / voice pending-questions surface is deferred.
- **Typed work↔change substrate edge:** v1 uses the signal's `spawned_package_id`
  stamp as the work↔change link; a typed `relates_to`/`depends_on` `package_edges`
  edge is deferred (no new edge tooling for v1).
- **Embedding-based detection:** v1 is agent-judgment over the injected knowledge;
  an embedding pre-filter for contradiction candidates is deferred.
- **Scheduled run:** interactive-only for now; a future opt-in scheduled sweep
  would compose with the preferences seam.
- **Web / PWA surface:** drift signals (and act-on-accept) are MCP + skill only in
  v1; a PWA view that lists and triages `drift_signals[]` + their outcomes is
  deferred.
- **Tunable surface threshold:** hardcoded `medium` now; the preferences package
  (`e4ecd28f`) makes `SURFACE_THRESHOLD` per-user/per-org tunable.

## Known limitations (v1)

- **Concurrent write race (accepted).** `record` / `set_status` do a read-merge-write
  over `packages.type_data` with no optimistic-concurrency guard, so two near-simultaneous
  writers (e.g. a second `/cse:reeval` or a concurrent `gate_runs`/`test_runs` append) can
  last-writer-win and drop a signal. This is the SAME pattern the existing `gate_runs[]` /
  `test_runs[]` arrays use; it is acceptable here because `/cse:reeval` is interactive-only
  (single-user, on-demand — no daemon/cron) and is backstopped by re-run + dedup. If drift
  ever moves to a concurrent/scheduled writer, switch to a guarded `jsonb_set` / `updated_at`
  compare-and-set.
