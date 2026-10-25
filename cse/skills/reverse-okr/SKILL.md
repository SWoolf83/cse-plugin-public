---
name: reverse-okr
description: Mine orphaned deferred scope-boundaries across specs into human-gated okr_proposals that ladder specs back to KRs (reverse-OKR).
when_to_use: Triggers on "reverse OKR", "mine deferred specs", "what have we deferred", "turn deferred scope into objectives".
argument-hint: "[--dry-run] [--threshold N] [--similarity N]"
allowed-tools: Bash(node *), Bash(cascade *), Read
---

# Reverse-OKR — deferred-scope-boundary miner

A thin wrapper over the `cascade reverse-okr` CLI verb. It gives specs a
principled ORIGIN: instead of orphaned specs that never ladder to an objective,
it harvests the strict `Deferred: X — separate spec` items every spec records in
`spec_body.scopeBoundaries[]`, clusters them into candidate initiatives, and
drafts them into the `/objectives` steering queue for a human to accept.

**Nothing live is mutated.** The miner writes ONLY `okr_proposals` draft rows
(`kind='reverse_okr'`, `status='draft'`). Objectives, key results, and evidence
links are materialized ONLY when a human accepts a draft on `/objectives` — the
accept path also writes the spec-origin `kr_evidence_links` edge that surfaces
the `→spec` leg under the KR in the `/work` OKR lens.

All gap classification (in-stack / net-new / limit-reached) is DEFERRED to a
later version — every driver node lands as `classification='unclassified'`.

**Tier vocabulary.** When an accepted draft materializes an objective, the OKR
tiers use the standard display names — **Strategic Pillar** (`level='org'`),
**Product-Vertical** (`level='surface'`), **Team** (`level='seam'`) — with the
`org`/`surface`/`seam` slugs unchanged. "Initiative" here is the deferred WORK
laddering under a KR (`bundle_kind='initiative'`), not a tier of its own.

## Behavior

### Step 1 — Preview (default to dry-run first)

Run a dry-run so the user sees what would be queued before anything is written:

```bash
node bin/cascade.js reverse-okr --dry-run
```

Report the printed summary: how many deferred items were harvested, how many
clusters formed, how many drafts would be built (clusters at/above the size
threshold), and which clusters were dropped as below-threshold (nothing is
silently lost).

Optional flags:
- `--threshold N` — minimum cluster size to become a draft (default 3)
- `--similarity N` — cosine-similarity floor for embedding clustering (default 0.75)
- `--json` — machine-readable summary

### Step 2 — Persist the drafts (on confirmation)

Once the user is happy with the preview, run it for real to write the drafts:

```bash
node bin/cascade.js reverse-okr
```

This inserts one `okr_proposals` draft per at-or-above-threshold cluster,
idempotently (a second run adds no duplicates — dedup is on a stable
cluster/source signature). Report the counts (persisted new vs. skipped
already-queued) and the draft titles.

### Step 3 — Point the user to the steering queue

Tell the user the drafts are waiting on `/objectives` (the OKR steering queue).
Accepting a `reverse_okr` draft there materializes the objective + KRs AND writes
the spec-origin evidence edge, after which the laddered spec(s) render under the
KR in the `/work` OKR lens (`?lens=okr`).

## Notes

- Requires a service-role/authenticated session (`cascade login` or
  `SUPABASE_SERVICE_ROLE_KEY` + `CASCADE_ORG_ID`) — it reads `spec_artifacts`
  and writes `okr_proposals` for the current org.
- Requires migration `303_reverse_okr_spec_evidence.sql` to be applied before an
  accepted draft can write its spec-origin edge. The miner itself (drafts only)
  works pre-303, but tell the user if the accept step will need the migration.
- Requires `npm run build` so `dist/reverse-okr/command.js` exists.
