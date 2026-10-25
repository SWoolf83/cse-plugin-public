# Active Knowledge — Design Note (PROPOSE + INJECT)

Spec: `spec-active-knowledge-loop-2026-06-16` · package `68c7d2aa` ·
white paper (pkg `437900a6`) §5 documents this loop as roadmap; this note records
what v1 actually builds.

## The thesis

Knowledge nodes (research/intelligence packages minted by `/cse:ingest` and Scout)
are **dead-ends** until they point at the work they affect. Active Knowledge makes
them live by treating the **relationship as the primitive**: a typed edge from a
knowledge node to a work package, plus a delivery path that hands that knowledge to
whoever works the package. This is the heart of the everything-is-a-package
convergence — knowledge re-contextualizes deployed work, on the same substrate.

The full loop has three stages. **v1 builds the first two:**

1. **PROPOSE** — an agent proposes `informs` edges (knowledge → work), each with a
   rationale + confidence; a human confirms; confirmed edges are written. (`/cse:link`)
2. **INJECT** — an agent working a package receives its connected knowledge as
   clearance-filtered context at execution time. (`cascade_get_context { package_id }`)
3. **RE-EVALUATE / drift** — new knowledge contradicting a package's assumptions
   raises a drift flag / question / proposed change. **Deferred** — separate spec.

## The `informs` edge (substrate)

`informs` is a first-class `edge_type` on `public.package_edges` (migration 256),
**non-hierarchical**:

- The cycle-guard trigger (migration 252, `package_edges_cycle_guard`) only walks
  `edge_type IN ('contains','membership')` and RETURNs early for everything else.
  So `informs` is **never cycle-checked** — a cycle formed purely of `informs`
  edges is permitted by design (knowledge can mutually inform). The migration makes
  **no** change to the cycle logic; it only extends the `edge_type` CHECK.
- The same trigger's **org-integrity** guard runs for **every** edge_type (incl.
  `service_role`) *before* the cycle early-return, so an `informs` edge whose two
  endpoints are in different orgs is still rejected. No change needed.
- **Direction:** `parent_id` = the knowledge node (the thing that *informs*);
  `child_id` = the work package (the thing that *is informed*). The inject lookup
  is therefore "incoming edges of the work package" (`child_id = pkg, edge_type =
  'informs'`), backed by a partial index (`idx_package_edges_informs_child`).
- **Edge metadata:** migration 256 adds an additive `metadata JSONB` column on
  `package_edges`. For an `informs` edge it holds `{ rationale, confidence }` — the
  agent-proposed, human-confirmed *why*.

### NOT the legacy table

`cascade_manage_dependencies` writes a **legacy task-dependencies table** that has
its own `'informs'` value. Active Knowledge deliberately writes the **substrate**
(`package_edges`) via the dedicated `cascade_link_knowledge` tool. **Reconciling /
migrating the legacy task-dependencies table onto `package_edges` is a deferred
fast-follow** — the two are not unified in v1.

## The inject path (clearance)

`cascade_get_context { package_id }` is the INJECT delivery path (a new mode on the
existing JIT context tool, additive — `subject`/`id`/`bundle` behavior unchanged):

1. Read the package's **incoming `informs` edges**.
2. Load the connected knowledge nodes (RLS-scoped to the caller's org).
3. Resolve each node's **effective sensitivity**: the `use_policies` governance
   sidecar (migration 196) wins, then `type_data.sensitivity`, then `'internal'`.
4. **Clearance-filter** structurally: keep a node only if its tier ≤ the caller's
   clearance. The filter is a pure function (`filterInjectedKnowledge`), so the
   security property is unit-tested without a DB.
5. Return curator-card context (`what_it_is` / `why_it_matters` / `key_points` /
   `provenance`) + the edge rationale + confidence.

### Clearance model — shared, fail-closed, server-derived

- **One implementation.** The sensitivity→tier→role helpers (`sensitivityToTier`,
  `resolvePackageSensitivity`, `clearanceForRole`, `tierRank`, …) were extracted
  from `scout.ts` into a shared `clearance.ts`; Scout re-exports them, so there is
  exactly **one** copy and both Scout's compose and the inject path agree.
- **Tiers** (mirrors Scout / migration 255): `public→L1`, `internal→L2`,
  `confidential|restricted→L3`. Default role map: `executive=L3`,
  `engineering_lead=L2`, `engineer=L1`.
- **Fail-closed both ways:** an unknown/missing sensitivity maps to **L3** (most
  restricted — never leaked to a low clearance); an unknown/absent role maps to
  **L1** (least privilege).
- **Server-derived, no elevation.** The caller's role is resolved **server-side
  from `org_memberships`** (authoritative), not from a caller parameter. There is
  **no** parameter that can raise clearance. Result: on identical linked data, an
  executive caller receives a public + a confidential node, while an engineer
  receives only the public one. `service_role` (daemon, already bypasses RLS) is
  treated as fully cleared.

## Provenance

Each injected card retains the node's provenance (`provenance` / `source` / `url`
from `type_data`, tolerant of the field names `/cse:ingest` and Scout write) plus
the `informs` edge's rationale — so a working agent can see *what* the knowledge
is, *why* it matters, *where* it came from, and *why it was linked here*.

## Deferred (explicit non-goals of v1)

- **RE-EVALUATE / drift** — the 3rd loop stage (new knowledge contradicting a
  package's assumptions → drift flag/question/proposed change). Separate spec.
- **Embedding pre-filter** for PROPOSE matching — v1 is agent-judgment over active
  packages; embeddings narrow the candidate set later.
- **`derived_from` edge type** (work → source provenance) — only `informs` in v1.
- **Legacy task-dependencies reconciliation** — unify that table onto
  `package_edges` later.
- **Daemon-triggered auto-proposal** on every new Scout finding — v1 PROPOSE is
  invoked (`/cse:link`), not a cron trigger.
- **Web/PWA UI** for viewing or creating `informs` edges — MCP + skill only in v1.
