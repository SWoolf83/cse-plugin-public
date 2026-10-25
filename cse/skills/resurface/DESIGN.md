# Surfacing v1 (`/cse:resurface`) — design note

The **sustainable-experience phase** of the Scout arc (pkg `a5011c2d`). Scout +
`/cse:ingest` keep filling the org's knowledge backlog; the active loop (`/cse:link`,
`/cse:reeval`) acts on linked items. What was missing is the **revisit**: a way to
re-engage the backlog on demand as a small, themed, freshness-ranked conversation
instead of an ever-growing firehose — and to write engagement back so it's a
**two-way loop**, not a re-print.

## The freshness model (pure, server-side, no LLM)

Freshness is computed by a **pure, unit-tested** function in
`harnesses/mcp-servers/cascade-api/src/tools/resurface.ts`. It pre-ranks the WHOLE
backlog cheaply (token-economical, per the lean-loading priority) so the agent only
spends tokens on the capped shortlist.

```
freshness(item) = recencyDecay(created_at)
                − engagementPenalty(status) · recencyDecay   (seen/snoozed/acted sink)
                − overlapPenalty(item, recently-surfaced)      (repeats sink)
```

- **`recencyDecay`** — exponential decay, half-life `RECENCY_HALF_LIFE_DAYS` (30d).
  Newer → ≈1; ~a month old → ≈0.5; missing/invalid timestamp → 0 (never out-ranks a
  real recent item).
- **engagement penalty** — `ENGAGEMENT_PENALTY[status]` scaled by recency: `new` 0,
  `seen` 0.4, `acted` 0.6, `snoozed` 0.7. A seen/acted item sinks below an unseen
  peer of the same age.
- **`overlapPenalty`** — counts shared dimensions (same `source`, same `author`,
  shared `tags`) against the **recently-surfaced** set (`OVERLAP_PENALTY_PER_DIM`
  each, capped at `OVERLAP_PENALTY_MAX`). This is the cheap "repeats sink"
  heuristic; cross-source *semantic* repetition is the pgvector v2 upgrade.

`rankBacklog` is the full pipeline: **filter** (drop `dismissed`, hide snoozed via
`isSnoozedHidden`) → **score** → **rank desc** → **cap at `DEFAULT_BUDGET`**.

### Agent novelty — shortlist only

The tool does **no per-item LLM call**. The agent (the skill) confirms novelty
**only on the returned, budget-capped shortlist** — a quick read over ≤ budget
items — annotating repeats ("⟳ same idea as X you saw") rather than dropping them.
Token cost is bounded to the shortlist size by construction.

## Engagement states + the two-way loop

Engagement rides `packages.type_data.engagement` — **NO migration** — via a
read-merge-write **shallow-merge** that preserves sibling `type_data` keys
(the `gate_runs` / `drift_signals` / `scout_run` pattern; org-guarded exactly like
`drift.ts`). The sub-object:

```
engagement = {
  status: "new" | "seen" | "snoozed" | "dismissed" | "acted",
  surfaced_count: number,        // bumped when status='seen'
  last_surfaced_at: ISO | null,  // bumped when status='seen'  (feeds overlap recency)
  snooze_until: ISO | null       // set when status='snoozed'; HIDES the item until due
}
```

- **new** — never penalized; rises by recency alone.
- **seen** — sinks; `surfaced_count`/`last_surfaced_at` advance every time it's shown.
- **snoozed** — hidden from the shortlist until `snooze_until`; then reappears.
- **dismissed** — excluded from every future shortlist entirely.
- **acted** — you promoted it (idea package / `/cse:spec`); sinks.

The loop: run → engage → re-run reflects prior engagement (dismissed gone, snoozed
hidden until due, seen ranked lower). The firehose becomes a backlog you can clear.

## The budget seam (`e4ecd28f`)

`DEFAULT_BUDGET` (7) is a single named constant — the one tunable seam. v1 hardcodes
it; making it tunable via a surfacing-preferences package is deferred. `list` accepts
an optional `budget` override for power use, but the default is the contract.

## Backlog scoping

A package counts as knowledge backlog when its `package_type` is in
`KNOWLEDGE_TYPES` (`research`, `intelligence`) **or** it carries a `KNOWLEDGE_TAGS`
tag (`knowledge-package`, `external-ingest`, `scout`). Cards read what/why/source/
author from `type_data` (the `/cse:ingest` + Scout output shape) via
`extractCardFields`.

## Org guard

`engage` resolves the target package with an explicit `org_id` match **before any
write** (`loadGuarded`), mirroring `drift.ts` / `link-knowledge.ts`. This holds even
under `service_role` (which bypasses RLS): a cross-org / non-member id fails closed.

## Deferred (NOT in v1)

- **pgvector / embeddings / semantic dedup + search** — the real cross-source
  novelty substrate (`a5011c2d` / `e4ecd28f`). v1's overlap heuristic is the
  good-enough pre-rank; semantic "same idea, different words" is v2.
- **Web / voice re-engagement surface** — a deferred *client* of this same data;
  engagement state + freshness already live on the substrate.
- **Scheduled / auto surfacing** — interactive-only (decision `fb17e876`); no
  daemon/cron path exists.
- **Tunable budget via surfacing-preferences** — `DEFAULT_BUDGET` is the seam; the
  preferences package is later.
- **Per-user engagement state** — v1 is single-user org-level on `type_data`; a
  keyed sub-object or a dedicated engagement table is the scale path.
