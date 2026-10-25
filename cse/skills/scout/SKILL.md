---
name: scout
description: Use when you want a clearance-aware, profile-driven knowledge feed from FREE YouTube into your curator queue — seed profile and harvest.
when_to_use: Scout v1 — a clearance-aware, profile-driven knowledge feed from FREE YouTube into your curator queue. Seeds/refreshes your portable scout profile via a Cascade-HQ interview + hand-curated sources, composes it with org context filtered by your role's clearance, harvests each subscribed source's keyless YouTube RSS, runs the /cse:ingest extraction, scores items against the composed profile, and lands worthwhile ones in the curator queue with full source/channel/video provenance.
argument-hint: "[seed | refresh | run | --lens <preset|custom phrase>] (combine, e.g. run --lens architecture)"
allowed-tools: Bash(python3 *), Bash(node *cascade.js *), WebSearch, WebFetch, Read, Write, Agent, cascade_scout, cascade_ingest_curator_item, cascade_get_org_context, cascade_create_package, cascade_update_package, cascade_manage_dependencies, cascade_log_decision
---

# /cse:scout — Source Intelligence

Scout turns a set of thinkers/sources into a personalized, clearance-aware feed:

> **feed-input = individual_profile ⊕ org_context_filtered_by(role → clearance)**

So a junior engineer is **structurally** barred from the L3 competitive signal an
executive sees — leak-resistance is in the data model (see `DESIGN.md`), not a
policy you can forget to apply. v1 is **fully free**: YouTube channel RSS needs no
API key. It reuses the `/cse:ingest` adapter + extraction; Scout is the
*subscribed, recurring, clearance-gated* front-end to that pipeline.

This is **provider-neutral**: the profile is seeded by a **Cascade HQ** interview.
There is no hardcoded model/provider name anywhere in the derivation path.

Modes (parse `$ARGUMENTS`):
- `seed` — first-time profile build (interview + curate sources).
- `refresh` — re-run the interview / adjust subscribed sources.
- `run` — harvest + score + land (skip seeding).
- *empty* — do the full flow: seed-if-needed → compose → run.

---

## Directable Scout — the `--lens` argument

Scout is **directable**: aim a run at a **lens** and get materially different,
keepable results from the same world. The lens is parsed from `$ARGUMENTS` as
`--lens <value>` (it composes with the modes above, e.g. `run --lens architecture`).

Parse `--lens` into exactly one of three states:

1. **Preset** — `<value>` is one of the built-in preset names
   (`architecture | code | strategy | product | competitive`). Resolve it from the
   data file (single source of truth):

   ```
   Read cse/skills/scout/lens-presets.json   # ${CLAUDE_PLUGIN_ROOT}/skills/scout/lens-presets.json when installed
   ```

   Take the matching preset's `tag_affinities` (drives source selection, Phase 2)
   and `extraction_angle` (drives extraction emphasis, Phase 3).

2. **Custom** — `<value>` is any other freeform phrase (e.g. `--lens "voice agent latency"`).
   The agent **interprets it on the fly** into the same two things a preset carries:
   - `tag_affinities`: pick the closest tags from the live registry vocabulary
     (get it from `cascade_scout { action: "list_sources" }` — each source returns
     its `tags`; choose the tags semantically nearest the phrase).
   - `extraction_angle`: write a one-paragraph emphasis instruction in the spirit of
     the preset angles ("read this source for <the lens>; emphasize …").

3. **Absent** — **no `--lens`**. Run the **existing unlensed flow exactly as
   documented below, unchanged**: no source-tag filtering, no extraction angle, no
   scout_run package. The lens additions in Phases 2/3/5 apply ONLY when a lens is set.

A lens biases three things — **source selection** (Phase 2), **extraction emphasis**
(Phase 3), and **output tagging + run grouping** (Phase 3/5). See `DESIGN.md` →
*Directable Scout* for the model.

### Worked example — same source, two lenses

Take one transcript, e.g. a talk on "building a coding agent harness":

- `--lens architecture` (angle: *architectural implications*) extracts: the
  harness's component boundaries (planner / executor / verifier), where state lives,
  the retry/verification loop as a structural pattern, and scaling/failure modes —
  i.e. **how we'd structure** an equivalent system.
- `--lens strategy` (angle: *strategic implications*) extracts from the **same**
  transcript instead: the bet that spec-quality is the bottleneck, the timing
  signal ("harnesses are commoditizing"), and what it implies for **what we
  prioritize and why now** — positioning, not internals.

Same world in, different keepable findings out. That is the point of a lens.

---

## Phase 0 — Load / seed the portable profile

Read the running user's **portable** scout profile (USER-keyed, org-independent —
the same profile travels with them across orgs):

```
cascade_scout { action: "read_profile" }
```

If it's empty (no `subscribed_source_ids`) **or** the user asked to `seed`/`refresh`,
run a short **Cascade HQ interview** to derive `signal_preferences`:

> "I'm Cascade HQ. To tune your Scout feed: which topics do you want to track
> (e.g. agent harnesses, eval methods, voice UX)? Any must-watch thinkers or
> channels? Anything to actively de-prioritize?"

Translate the answers into a `signal_preferences` object — `{ topics:[…],
keywords:[…], avoid:[…], weights:{…} }`. Do **not** attribute the interview to any
model/provider; it is Cascade HQ. Persist:

```
cascade_scout {
  action: "write_profile",
  signal_preferences: { … }
}
```

### Curate sources into the org registry

For each thinker/channel the user names, resolve the **YouTube channel id** (the
`UC…` id — find it via the channel's About page or `WebSearch` if only a handle is
known) and register it. The rss_url is derived automatically (free + keyless):

```
cascade_scout {
  action: "add_source",
  source_name: "Nate B. Jones",
  channel_id: "UC…",
  signal_score: 0.8,
  tags: ["spec-driven","ai-coding"]
}
```

Then subscribe the user's portable profile to the source ids they want to follow:

```
cascade_scout { action: "list_sources" }            # get ids
cascade_scout { action: "write_profile", subscribed_source_ids: ["<id>", …] }
```

> **Portability:** the profile is the user's own asset. `cascade_scout {action:"export_profile"}`
> returns a self-contained JSON they can carry to another org; `{action:"import_profile",
> profile_json:<that JSON>}` restores it losslessly. Roles/clearance are NOT in the
> profile — they live org-side, so the same profile behaves correctly in any org.

## Phase 1 — Compose the clearance-aware feed-input

```
cascade_scout { action: "compose" }
```

This returns `{ individual_profile, org_context, clearance, role, excluded_count }`
where `org_context` contains **only** items with `tier ≤ clearance(running_user.role)`.
The composition is what makes the SAME source set score differently for a junior
vs an executive. Use `as_role` only for previewing another role's feed (admins).

Keep this composed object in hand — it is the scoring rubric for Phase 3.

## Phase 2 — Harvest each subscribed source (free YouTube RSS)

### Lensed source selection (only when `--lens` is set)

Before harvesting, **bias which sources you pull** toward the lens:

1. Get each subscribed source's tags from `cascade_scout { action: "list_sources" }`
   (intersected with the user's `subscribed_source_ids`).
2. Keep sources whose `tags` intersect the lens's `tag_affinities` (preset) or the
   agent-interpreted tags (custom lens).
3. **Explicit all-sources fallback:** if NO subscribed source matches the lens
   affinities, harvest **ALL** subscribed sources — a lensed run is **never empty**.
   (The lens still angles extraction in Phase 3, so the run is still lens-shaped.)

> **No-lens path is unchanged:** when `--lens` is absent, skip this selection
> entirely and harvest every subscribed source exactly as before.

For each **selected** source (all subscribed sources when no lens / on fallback), run the
deterministic, keyless adapter that ships with this skill, passing the source's
`last_pulled` as the watermark so you only see **new** items:

```bash
python3 "<skill-dir>/youtube_rss.py" "<channel_id>" --since "<last_pulled or omit>" --limit 15
```

`<skill-dir>` = `cse/skills/scout/` in the repo, `${CLAUDE_PLUGIN_ROOT}/skills/scout/`
when installed. It prints one JSON object: `{ ok, source, count, items:[{video_id,
title, published, url, author}] }`. On `ok:false`, react to the stable `error.code`
(don't retry blindly):
- `RATE_LIMITED` → back off, try the next source.
- `CHANNEL_NOT_FOUND` → the channel id is wrong; flag it for the user, skip.
- `NETWORK_ERROR` / `FETCH_FAILED` → likely a flagged/cloud IP; this must run
  locally (residential IP), the same constraint as `/cse:ingest`. Report and skip.

Residential-IP reliable; cloud-IP harvest is out of scope for v1.

## Phase 3 — Extract + score + land in the curator queue

### Lensed: open the run package FIRST (only when `--lens` is set)

If a lens is set, create **exactly ONE** `scout_run` package up front — its own id
becomes the `scout_run_id` that every finding in this run is tagged with:

```
cascade_create_package {
  package_type: "research",
  title: "Scout run — <lens> — <date>",
  tags: ["scout-run", "<lens>"],
  type_data: { kind: "scout_run", lens: "<lens>", summary: "", member_ids: [] }
}
```

Hold the returned package id as `<scout_run_id>`. (`<lens>` is the preset name, or a
short slug of the custom phrase.) **No-lens runs do NOT create a run package.**

### Per-item extract / score / land

For each **new** item across the selected sources:

1. **Extract** via the existing ingest pipeline — pass the video URL to the
   curator/ingest path. The simplest reliable route is the MCP tool, which pulls
   the transcript and runs the curator extraction in one call:

   ```
   cascade_ingest_curator_item {
     source_type: "youtube",
     url: "<item.url>",
     source_author: "<item.author>"
   }
   ```

   **Lensed extraction emphasis (only when `--lens` is set):** inject the lens's
   `extraction_angle` into the extraction step so the SAME source yields
   lens-specific implications — angle the curator-item summary/implications you
   record toward it (architecture → architectural implications; code →
   implementation/technique; product → UX/feature implications;
   strategy/competitive → positioning/market). When you
   hand a standout item to `/cse:ingest` for the deeper pass, prepend the
   `extraction_angle` to its instruction. With no lens, extract as today.

   (For a deeper, roadmap-grade pass on a standout item, hand it to `/cse:ingest`
   instead — same adapter, fuller extraction.)

2. **Score vs the composed profile** (Phase 1). Rank/threshold each item by how
   well it matches `individual_profile.signal_preferences` *and* the
   clearance-filtered `org_context` (e.g. an item touching a visible L2 roadmap
   theme scores higher; topics in `avoid` score lower). Because the org-context
   half differs by clearance, the **ordering/inclusion differs for a junior vs an
   executive on the same harvested items** — that is the point.

3. **Land with provenance.** The curator item carries source/channel/video
   provenance. Record the originating registry source id alongside it (in the
   item's metadata / your run notes) so a curator item promoted to a package
   (`/cse:curator` → package) retains a link back to its `scout_sources` entry.
   Skip items below your score threshold.

4. **KEEP / THEME the finding into the run (only when `--lens` is set).** For each
   worthwhile item you land, create a knowledge package for the finding and bind it
   to the run:

   ```
   cascade_create_package {
     package_type: "research",
     title: "<finding title>",
     tags: ["<lens>", "scout_run_id:<scout_run_id>"],
     type_data: { kind: "scout_finding", lens: "<lens>", scout_run_id: "<scout_run_id>",
                  source_id: "<registry source id>", url: "<item.url>",
                  card: { oneline, what, why, theme } }   # the short briefing — see below
   }
   ```

   **Always emit `type_data.card`** on a finding package — the bite-sized briefing the
   Scout cards + ScoutDetailSheet render (instead of clamping the long description).
   Reuse the curator extraction you already ran (its `oneline` / `what_it_is` /
   `why_it_matters`) and pick a `theme`. It must satisfy the SAME contract the code validates:

   - `oneline` — a punchy headline, **≤ 140 chars**
   - `what` — what it is, **≤ 280 chars**
   - `why` — why it matters to Cascade specifically, **≤ 280 chars**
   - `theme` — exactly ONE of the FIXED set: **`architecture`, `code`, `strategy`, `product`, `competitive`, `operations`, `other`** (use `other` if none fits)

   > The theme list + length caps are owned by `cascade-web/src/lib/scout/card.ts`
   > (`THEMES`, `parseCard`) — that file is the source of truth; an out-of-set theme is
   > coerced to `other` on read. Keep this block in sync with it.

   Then **append** the finding's id to the run package's `member_ids` (read-modify-write
   the run package's `type_data`):

   ```
   cascade_update_package {
     package_id: "<scout_run_id>",
     type_data: { kind: "scout_run", lens: "<lens>",
                  summary: "<running one-paragraph run summary>",
                  member_ids: [ …existing…, "<finding id>" ] }
   }
   ```

   So every finding carries **both** the `lens` and `scout_run_id` (as a tag and in
   `type_data`), and the run package's `member_ids` lists every finding. No-lens runs
   skip this entirely — findings land only in the curator queue as before.

   > **Re-engagement contract (for the surfacing phase, pkg a5011c2d).** The
   > AUTHORITATIVE grouping of a run is the run package's `member_ids` plus each
   > finding's `type_data.scout_run_id` — query THOSE, not the `scout_run_id:<id>`
   > tag (that tag is a coarse marker, and its colon-composite form won't match a
   > bare `scout_run_id` filter). Lens filtering uses the `<lens>` tag / `type_data.lens`.

## Phase 4 — Advance the watermark

After a source's items are processed, advance its watermark so the next run only
sees newer videos:

```
cascade_scout { action: "mark_pulled", source_id: "<id>" }   # defaults to now()
```

## Phase 5 — Report + record

Summarize: per source — items found, new, landed, top-scoring titles. Then log one
decision capturing the harvest (category `process`, tags `scout`,`external-ingest`):

```bash
node bin/cascade.js log-decision --title "Scout run: <date>" \
  --chosen "Harvested N sources, landed M curator items" \
  --reasoning "<which topics/sources produced signal>" \
  --tags "scout,external-ingest" --category "process" --significance "minor"
```

**Lensed: finalize the run package (only when `--lens` is set).** Write a final
one-paragraph `summary` into the run package's `type_data` (what this lens surfaced
across its findings) via `cascade_update_package`, leaving `member_ids` intact:

```
cascade_update_package {
  package_id: "<scout_run_id>",
  type_data: { kind: "scout_run", lens: "<lens>",
               summary: "<final run summary>", member_ids: [ …all finding ids… ] }
}
```

> **The run package is the revisit / voice entry point.** Opening it shows the lens,
> the run summary, and links to every member finding — enough to re-engage **without
> re-running Scout** (incl. via voice, which can open the package by id). A future
> themed view (**pkg a5011c2d**) will list runs and filter them by lens; this run
> node is the first-class artifact that view consumes.

Landed curator items are already tracked; promoting any to a package happens via
`/cse:curator` (which preserves the source link). No separate `/cse:capture` needed.

---

## What v1 is NOT (deferred — separate specs)

- No scheduled/daemon harvest — v1 is manual `/cse:scout`.
- No source-resilience ladder (alt transcript services, yt-dlp, audio+ASR).
- No X/Twitter lane, no non-YouTube adapters — those plug into the same
  `compose → harvest → extract → score → land` seam later.
- No personalized dashboard surface — v1 lands in the curator queue.
- No self-improving signal_score feedback loop.
- **Directable Scout is interactive-only** — no scheduled/cron lensed runs
  (decision `fb17e876`). The themed re-engagement VIEW (pkg a5011c2d), freshness /
  novelty-decay, pgvector search, voice-agent revisit, and lens-based re-scoring /
  PROPOSE bias are all deferred — see `DESIGN.md`.

See `DESIGN.md` for the three-layer composition, clearance tiers, portability, and
the Directable Scout (lens) model.
