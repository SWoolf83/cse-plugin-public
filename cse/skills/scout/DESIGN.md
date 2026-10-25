# Scout — Design Note

Scout is a clearance-aware, profile-driven knowledge feed. It is **not** a new
subsystem — it composes three primitives Cascade already has (the portable
AI-profile, org context + roles, and the `/cse:ingest` adapter/extraction) into a
feed that lands in the curator queue.

The driving model:

```
feed-input = individual_profile ⊕ org_context_filtered_by(role → clearance)
```

A junior engineer is **structurally** barred from the L3 competitive signal an
executive sees. Leak-resistance is **architectural, not policy** — the items above
a user's clearance are never assembled into their feed-input in the first place.

---

## 1. Three-layer composition

| Layer | Who owns it | Where it lives | Travels org→org? |
|-------|-------------|----------------|------------------|
| **Individual profile** | the user | `ai_preferences.scout` (USER-keyed, org-independent) | **Yes** — it's the user's asset |
| **Org context** | the org | the **existing substrate** — `intelligence`/`strategic_research`/`market_analysis`/`legal_intelligence` packages (migration 171). NOT a Scout table. | No — org-side |
| **Role → clearance** | the org admin | `organizations.settings.scout.role_clearance` | No — org-side |

> **Convergence note:** Scout does NOT create a parallel org-context table. `compose()`
> reads the org's existing intelligence package nodes and **derives** each node's
> clearance tier from its **authoritative `sensitivity`** — the `use_policies`
> governance sidecar (migration 196; what the UsePolicyBadge UI sets), falling back
> to a `type_data.sensitivity` intent value, else the system default `internal`.
> Mapping: public→L1, internal→L2, confidential/restricted→L3 (bogus→L3 fail-closed).
> Clearance is an attribute over existing knowledge, per everything-is-a-package.

`compose()` (in `harnesses/mcp-servers/cascade-api/src/tools/scout.ts`) is a pure,
unit-tested function:

```
composeFeedInput(profile, orgContext, role, roleClearance)
  → { individual_profile, org_context (filtered), clearance, role, excluded_count }
```

It keeps ONLY org items with `tier ≤ clearance(role)`. The individual half is
identical regardless of org/role; the org half is what differs by clearance — so
the **same source set yields a different feed ordering/inclusion for a junior vs an
executive**.

### Why the clearance filter lives in compose(), not RLS (v1)

RLS scopes intelligence packages to org members — that's the trust boundary, and
admins must be able to read/curate every node. The clearance FILTER (tier derived
from `sensitivity`, then `tier ≤ clearance(role)`) is applied in `compose()` so the
model is testable in isolation. Defense-in-depth: a non-L3 caller is also
pre-filtered at the DB fetch by allowed `sensitivity` values (an L3 caller sees all,
including untagged nodes, which fail-closed to L3 in the in-memory re-filter).

---

## 2. Clearance tiers

| Tier | Meaning | Example |
|------|---------|---------|
| **L1** | public / learning | "five levels of AI coding" roundup |
| **L2** | team | internal roadmap themes |
| **L3** | strategic / competitive | competitor moves, positioning, M&A signal |

Ordering is `L1 < L2 < L3`. Each org node's tier is **derived** from its existing
`sensitivity` (public→L1, internal→L2, confidential/restricted→L3, missing→L3).
Default role → max-clearance map (seeded by migration 255, editable per org):

```
executive        → L3
engineering_lead → L2
engineer         → L1
```

**Fail-closed:** an unknown/absent role resolves to **L1** (least privilege), never
elevated. Proven by the unit test:
`harnesses/mcp-servers/cascade-api/tests/scout-clearance.test.mjs` — the junior
composition contains ZERO L3 items, the exec composition includes them, on
identical data.

The map is edited admin-only via the SECURITY DEFINER RPC
`scout_set_role_clearance(p_org_id, p_role_clearance)`, which guards on caller
org-membership + admin role (executive / engineering_lead) — it bypasses RLS, so
the guard is mandatory.

---

## 3. Portability / export-import

The individual profile is the **user's own asset**. It is keyed by USER (not
per-user-per-org) so the same person reads the same Scout profile in every org.

- `cascade_scout {action:"export_profile"}` → a self-contained, org-independent JSON
  (`{kind:"cascade.scout.profile", schema_version, profile}`).
- `cascade_scout {action:"import_profile", profile_json:<that JSON>}` → restores
  `subscribed_source_ids` + `signal_preferences` **losslessly**.

Roles/clearance are **never** in the exported profile — they're org-side — so
importing into a new org just re-binds the same preferences to that org's
clearance map.

---

## 4. Forward-extensibility (no migration to grow)

`ai_preferences.scout` carries a `schema_version` and is JSONB, so new profile
fields (e.g. additional signal weights, per-source overrides, non-YouTube source
refs) are added **without a migration** — bump `schema_version` and teach the
reader to upgrade older shapes (the MCP tool already normalizes missing fields).

Likewise, **adding or creating org roles requires NO change to individual
profiles** — a new role is just a new entry in the org's `role_clearance` map.
This is the crucial decoupling: the portable profile must never constrain future
role creation.

---

## 5. Source adapter seam

v1 ships ONE adapter: `youtube_rss.py` (stdlib-only, free, keyless channel RSS).
The harvest contract — "given a source, return new items `{video_id/title/
published/url}` since `last_pulled`" — is the seam podcast / article / X-thread /
GitHub / arXiv adapters plug into later. Extraction and scoring (`/cse:ingest` +
the composed profile) are adapter-agnostic and unchanged when new adapters land.

---

## 6. Directable Scout — the lens

Scout is **directable**: a run can be aimed at a **lens** so the same world yields
materially different, keepable results. A lens is **not** a new subsystem — it is
three biases layered over the existing `compose → harvest → extract → score → land`
pipeline, plus a run-grouping node. **No migration, no MCP-server change** — the
lens and run grouping ride knowledge-package tags + `type_data` and a single
`scout_run` package created with the existing `cascade_create_package` /
`cascade_update_package` tools. Interactive-only (decision `fb17e876`).

### Lens model: presets + custom

| Form | Source of truth | tag_affinities | extraction_angle |
|------|-----------------|----------------|------------------|
| **Preset** (`architecture`, `code`, `strategy`, `product`, `competitive`) | `cse/skills/scout/lens-presets.json` (data file — extend by editing data, no skill rewrite) | declared per preset, referencing the seeded `scout_sources` tag vocabulary (`ai-strategy`, `agentic-coding`, `prompt-engineering`, `ai-models`, `ai-engineering`, `news`, …) | declared per preset |
| **Custom** (any freeform phrase) | the agent, in-session | agent picks the closest tags from the live `list_sources` vocabulary | agent writes a one-paragraph angle in the spirit of the preset angles |
| **Absent** (no `--lens`) | — | — | — — the **unlensed flow runs exactly as before** |

The preset file is the single source of truth for preset behavior, so the noun set
is governed as data, not code — the same everything-is-a-package instinct as the
clearance tiers being an attribute over existing knowledge.

### The three biases

1. **Source selection (with fallback).** A lensed run prefers subscribed registry
   sources whose `tags` intersect the lens's `tag_affinities` (preset) or the
   agent-interpreted tags (custom). **Explicit all-sources fallback:** if no
   subscribed source matches, the run harvests ALL subscribed sources, so a lensed
   run is **never empty** — it is still lens-shaped because extraction is still
   angled. With no lens, no filtering happens.
2. **Extraction emphasis.** The lens's `extraction_angle` is injected into the
   `/cse:ingest` extraction so the SAME source yields lens-specific implications
   (architecture → architectural implications; code → implementation/technique;
   strategy/competitive → positioning/market). With no lens, extraction is as today.
3. **Output tagging + run grouping.** Every produced finding carries the `lens` and
   `scout_run_id` (both as a tag and in `type_data`), binding it to the run.

### The scout_run keep / theme model

A lensed run creates **exactly ONE** `scout_run` package
(`package_type:'research'`, tags `['scout-run', <lens>]`,
`type_data { kind:'scout_run', lens, summary, member_ids:[] }`). **Its own package
id IS the `run_id`** — so a run is a first-class node, not a side table. Each
worthwhile finding is its own knowledge package tagged `{ lens, scout_run_id }` and
appended to the run package's `member_ids`. The run package's `summary` is written
at the end of the run.

This makes a run a **self-contained, revisitable artifact**: opening the run package
shows the lens, the run summary, and links to every member finding — enough to
**re-engage without re-running Scout**, including via **voice** (the voice agent can
open the run package by id). It is the entry point the surfacing/re-engagement phase
(**pkg a5011c2d**) builds on: the future themed view lists runs and filters by lens,
consuming exactly this node — stage is an attribute on the package, not a clone.

No-lens runs create **no** run package and add **no** lens tags — they land in the
curator queue precisely as v1 did. The lens is purely additive.

### Deferred (separate specs)

- **Themed re-engagement view / UI** to browse and revisit runs — pkg a5011c2d.
- **Freshness / novelty-decay** — avoid resurfacing the same viewpoint ("Nate said
  it again") across runs.
- **pgvector / semantic search** around the package primitive.
- **Voice-agent integration** to revisit a run (the `scout_run` package is the entry
  point it will use).
- **Lens-based re-scoring** of the feed and **lens-biasing the downstream
  PROPOSE / `informs`** step.
- **Scheduled / cron lensed runs** — Directable Scout is interactive-only
  (decision `fb17e876`).
