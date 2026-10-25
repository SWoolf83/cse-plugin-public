---
name: model-radar
description: Use when you want model radar — new-model-release intel, benchmark fluency, and leaderboard-backed meta-ratings as versioned dossiers.
when_to_use: Model Radar — extend the Scout/ingest pipeline into an LLM-model intelligence lens. Harvests the model-radar source registry (lab release pages + model-review YouTube channels + a structured-eval leaderboard rung — score snapshots, head-to-head/arena data, throughput/pricing), extracts stance-tagged evidence (lab_claim / independent_eval / practitioner_take) with model_refs/benchmark_refs, upserts ONE versioned dossier artifact per canonical model release / benchmark slug, wires informs + supersedes edges on the package substrate, and re-synthesizes dirty dossiers (strengths/risks/post-release findings/divergence/fit-for-our-stack + a meta-rating capability vector across 6 core axes; benchmark measures/credibility/gameability/cited-by/score-context — the eval-fluency requirement) in the same Max Plan session. Triggers on "model radar", new model release intel, "what does SWE-bench actually measure", benchmark fluency, "how does <model> actually score".
argument-hint: "[run (default) | --source <registry id — sources or leaderboards> | --days <recent-window, default 14> | --slug <model-or-benchmark slug to focus re-synthesis> | --leaderboards (structured-eval rung only) | --no-leaderboards (skip it; rung is ON by default)]"
allowed-tools: Bash(python3 *), Bash(node *cascade.js *), Bash(curl *), WebSearch, WebFetch, Read, Write, Agent, cascade_list_packages, cascade_create_package, cascade_update_package, cascade_create_artifact, cascade_update_artifact, cascade_get_artifact, cascade_link_knowledge, cascade_ingest_curator_item, cascade_get_org_context, cascade_log_decision
---

# /cse:model-radar — LLM Model Intelligence

Model Radar turns the firehose of model-quality information — lab release posts,
independent evals, practitioner breakdowns, and structured-eval leaderboards —
into a **stance-aware dossier layer** on the package substrate:

> **evidence (stance-tagged knowledge packages) —informs→ dossiers (versioned
> artifact nodes, one per canonical slug) —supersedes→ predecessor releases**

Two dossier kinds share one artifact primitive:

- **`model_dossier`** — one per canonical model **release** slug (e.g.
  `claude-fable-5`, `gpt-5`, `gemini-2.5-pro`). Family views ("how is the claude
  line trending?") are **query-time rollups** over `family_slug` — no family
  object is ever stored.
- **`benchmark_dossier`** — one per benchmark slug (e.g. `swe-bench`, `mmlu`,
  `arc-agi`). This is the **eval-fluency** requirement: what the benchmark
  measures, what makes it credible or gameable, and who cites it — so we hold
  expert-level discourse instead of being gatekept by eval name-dropping.

**Section contract source of truth:** `cse/skills/model-radar/dossier-schema.json`
(`${CLAUDE_PLUGIN_ROOT}/skills/model-radar/dossier-schema.json` when installed).
Every claim in a dossier carries `statement` / `stance` / `confidence`
(`low|medium|high`) / `sources`. The three stances are `lab_claim`,
`independent_eval`, `practitioner_take` — preserving *disagreement between them*
(the `divergence` section) is the point; never average it away.

**Numeric contract source of truth:** `cse/skills/model-radar/score-schema.json`
(`${CLAUDE_PLUGIN_ROOT}/skills/model-radar/score-schema.json` when installed) —
`score_snapshot` (ONE observed number from ONE source on ONE date, the atomic
unit of numeric evidence), the six-axis capability taxonomy behind
`capability_vector`, `divergence_flag` (numbers-vs-discourse honesty markers),
and the per-run `source_health_report`. Snapshots accumulate **append-only** on
dossier package `type_data.score_snapshots`; the latest `capability_vector`
persists **structured** at the model dossier's `type_data.capability_vector`,
separate from the prose artifact body.

This reuses its neighbors rather than duplicating them:
- **`/cse:scout`** owns the keyless YouTube RSS idiom (`cse/skills/scout/youtube_rss.py`).
- **`/cse:ingest`** owns the transcript ladder, the URL-readability adapter, the
  extraction-subagent pattern, and the knowledge-package persistence + dedup shape.
- **`/cse:link`** owns the `informs`-edge convention on `package_edges`.

## Hard constraints (v1 — non-negotiable)

1. **Max-Plan-only, agent-side.** ALL extraction and synthesis happens in THIS
   interactive session on the user's Max Plan credentials. Never call an LLM API
   key, never add LLM calls to cascade-web server code, never route synthesis
   through the daemon/SDK executor. (Burned-trust incident; org assumption
   `e8dbd640` is monitored by this feature, not violated by it.)
2. **No cron / daemon / scheduled path.** v1 is invoked manually as
   `/cse:model-radar`. The UI shows `last_synthesized_at` — stale is visible,
   never wrong.
3. **Idempotent runs.** Evidence dedups on normalized URL / video id (ingest
   Phase 1D rules); dossiers dedup on canonical slug — re-synthesis appends a new
   `artifact_version` to the SAME node, **never** a duplicate node; edge writes
   are check-before-insert (informs is idempotent in the MCP tool already);
   score snapshots dedup on their
   `{source_slug, benchmark_slug, model_slug, metric, as_of}` tuple and are
   append-only (Phase 4B); leaderboard evidence dedups on
   `(source_slug, as_of day)` — a same-day re-run refreshes, never duplicates.

Parse `$ARGUMENTS`: `run`/empty = full pipeline (the leaderboard rung is **ON
by default**); `--source <id>` restricts the harvest to one registry source —
the id may name a `sources[]` entry OR a `leaderboards[]` entry (a leaderboard
id runs only the Phase 2C path for that rung); `--days <n>` sets the recent
window (default **14**); `--slug <slug>` skips harvest and re-synthesizes one
existing dossier from its already-linked evidence; `--leaderboards` restricts
the run to the structured-eval rung (Phase 2C → 4B → Phase 6 on the dossiers it
dirties); `--no-leaderboards` skips Phase 2C for a discourse-only run.

---

## Phase 1 — Read the source registry

Read `cse/skills/model-radar/sources.json`
(`${CLAUDE_PLUGIN_ROOT}/skills/model-radar/sources.json` when installed). It is
**user-editable data, not code** — sources are added/removed/retagged by editing
the file directly. Each source carries:

- `kind`: `lab_page` (has `url`, `lab`) or `youtube_channel` (has `channel_id`,
  `rss_url` in the keyless `https://www.youtube.com/feeds/videos.xml?channel_id=…` form).
- `stance_hint`: a **DEFAULT** stance for evidence from this source
  (`lab_claim | independent_eval | practitioner_take`). Extraction may override
  it per evidence item — e.g. a practitioner video reading a lab's benchmark
  table yields a `lab_claim` evidence item.

Schema_version 2 adds a top-level **`leaderboards[]`** array — the NUMERIC
score sources for Phase 2C (`id` becomes `score_snapshot.source_slug`; each
entry carries `enabled`, `benchmark_slugs`/`metrics` mapping hints, and
`parse_hints`). Existing consumers that only read `sources` are unaffected.

If `--source <id>` was given, keep only that source (from whichever array it
lives in). Report the roster you are about to harvest — discourse sources and
leaderboard rungs.

## Phase 2 — Harvest (recent-window bounded)

Keep runs bounded: only items published within the last `--days` days (default
14) are candidates. Skip anything older and say so in the run summary.

### 2A — YouTube channels (keyless RSS + the ingest transcript ladder)

For each `youtube_channel` source, list recent videos with the scout adapter —
free, keyless, deterministic:

```bash
python3 "<scout-skill-dir>/youtube_rss.py" "<channel_id>" --since "<now - days>" --limit 15
```

`<scout-skill-dir>` = `cse/skills/scout/` in the repo,
`${CLAUDE_PLUGIN_ROOT}/skills/scout/` when installed. It prints
`{ ok, source, count, items:[{video_id,title,published,url,author}] }`. On
`ok:false` react to the stable `error.code` exactly as `/cse:scout` documents
(`RATE_LIMITED` → back off + next source; `CHANNEL_NOT_FOUND` → flag + skip;
`NETWORK_ERROR`/`FETCH_FAILED` → flagged/cloud IP, must run locally — report + skip;
`HTTP_ERROR` → YouTube's RSS endpoint is intermittently flaky per-channel —
**retry ONCE after a ~3s pause** before skipping; transient 404/500 on a valid
channel_id is common). A feed that 404s persistently across runs means the
channel_id is stale — verify it against the channel page's `externalId` and fix
`sources.json` rather than retrying forever.

**Filter to model-relevant items** by title (release names, model/benchmark
terms) before pulling transcripts — these channels also publish off-topic videos.

**Transcript ladder** (per selected video), same ladder `/cse:ingest` and the
curator path use:

1. **Local adapter (residential IP):**
   `python3 "<ingest-skill-dir>/youtube_transcript.py" "<url>" --text-only`
   (`cse/skills/ingest/` / `${CLAUDE_PLUGIN_ROOT}/skills/ingest/`).
2. **On failure** (`IP_BLOCKED`, `NO_TRANSCRIPT`, PoToken-emptied captions):
   `cascade_ingest_curator_item { source_type:"youtube", url, source_author }` —
   its server-side ladder includes the **Supadata** rung, which engages when
   `SUPADATA_API_KEY` is set in the platform env (root `.env` / `~/.cascade/.env`
   — NOT Railway, NOT per-org). This call also lands a curator-queue item (see
   Phase 3 landing).
3. **Still nothing** → record the item as skipped-with-reason and move on.

### 2B — Lab release pages (the ingest URL-readability adapter)

For each `lab_page` source:

1. `WebFetch` the index page (e.g. `https://www.anthropic.com/news`) and identify
   **model-release-relevant posts within the window** (release announcements,
   model cards, capability/eval posts — not hiring/policy posts).
2. For each selected post URL, pull the clean body via the ingest **URL adapter
   with its fallback ladder** (ingest Phase 1B, verbatim): direct `WebFetch` with
   the extract-the-readable-body prompt → on empty/blocked/truncated/under ~120
   words, re-fetch through **`https://r.jina.ai/<original-url>`** (keep the
   ORIGINAL url in provenance) → still nothing usable, skip-with-reason (no
   interactive paste loop in a radar sweep; note the URL for a manual `/cse:ingest`).
3. Assemble the ingest `{ text, provenance }` contract:
   `provenance = { kind:"url", url:<NORMALIZED>, title, author?, site:<lab>, published_date }`.

Normalize every URL with the ingest Phase 1D rules (lowercase host, strip `www.`,
force https, strip fragment + `utm_*`/`fbclid`/`gclid` + trailing slash) —
the normalized form is the dedup key and what you persist.

### 2C — Leaderboard harvest (structured-eval rung)

ON by default in a full `run`; skipped by `--no-leaderboards`. Iterate every
`sources.json` `leaderboards[]` entry with `enabled: true` (or the single
`--source` target). Each source is an **INDEPENDENT best-effort rung**: a
source that cannot be fetched or parsed is marked **FAILED with a reason and
the run CONTINUES** — a failing source never aborts the run. Track per-source
status (`fetched | parsed | failed` + snapshot count + error) for the Phase 7
`source_health_report`.

Per source:

1. **Fetch:** `WebFetch` the registry `url`, guided by the source's
   `parse_hints`. On empty/JS-blocked/client-rendered output, re-fetch through
   **`https://r.jina.ai/<url>`** (the same reader fallback as ingest Phase 1B;
   keep the ORIGINAL url as the snapshot `source_url`).
2. **Parse best-effort into score snapshots** conforming to score-schema.json
   `score_snapshot` — ALL 8 required fields:
   `{benchmark_slug, model_slug, metric, value, unit, as_of, source_url, source_slug}`.
   `as_of` = the leaderboard's stated date, or **today's date when the page
   shows current standings**. Canonicalize `model_slug`/`benchmark_slug` per the
   dossier-schema slug rules, mapped through the source's
   `benchmark_slugs`/`metrics` hints; record scaffold/config caveats in
   `harness` whenever the source discloses them.
3. **Scope, don't transcribe:** focus extraction on models relevant to the run —
   frontier models plus anything with an existing dossier. Top ~10 models per
   source plus any existing-dossier slugs is the right scope; never
   exhaustively transcribe a 100-row leaderboard.
4. **Persist ONE evidence knowledge package per source per run** (ingest
   Phase-4 shape — reuse the Phase 3B conventions verbatim):

```
cascade_create_package
  title:        "Model intel: <source name> — leaderboard snapshot <YYYY-MM-DD>"
  package_type: "research"
  executor_type:"human"
  tags:         ["knowledge-package","external-ingest","model-radar","leaderboard", …model/benchmark slugs]
  description:  <summary + one line of provenance>
  type_data:    { knowledge_kind:"external_ingest",
                  stance: "independent_eval",              # MANDATORY for leaderboard evidence
                  score_snapshots: […the parsed snapshots…],
                  model_refs: […slugs the snapshots touch…],
                  benchmark_refs: […slugs the snapshots touch…],
                  card:{ oneline, what, why, theme },
                  source: { kind:"url", url:"<normalized url>", site:"<source name>",
                            published_date:"<as_of>" } }
```

   **Dedup rule for leaderboard evidence:** ONE package per
   `(source_slug, as_of day)` — normalized URL + date. A re-run the same day
   **refreshes** the existing package via `cascade_update_package` rather than
   duplicating.

5. Snapshots ALSO append to every touched dossier's
   `type_data.score_snapshots` — Phase 4B.
6. These evidence packages participate in Phase 5A `informs` edges exactly
   like discourse evidence: an edge to EVERY model dossier AND benchmark
   dossier their snapshots touch.

## Phase 3 — Extract stance-tagged evidence + persist knowledge packages

### 3A — Extraction (fan out a subagent, ingest Phase-2 pattern)

For each harvested `{ text, provenance }`, hand the text to a subagent via the
`Agent` tool and require the canonical schema in
`cse/skills/ingest/extraction-schema.json` — **including the model-radar fields**:

- `stance` — the epistemic stance of this evidence
  (`lab_claim | independent_eval | practitioner_take`). Start from the source's
  `stance_hint` but **override per item** when the content demands it.
- `model_refs[]` — canonical **release** slugs mentioned substantively
  (lowercase-hyphenated, e.g. `claude-fable-5`, `gpt-5`, `gemini-2.5-pro`;
  dossier-schema.json slug rules — dots allowed in version tokens).
- `benchmark_refs[]` — benchmark slugs the source cites (e.g. `swe-bench`,
  `mmlu`, `arc-agi`).

Prime the subagent with what Cascade IS (ingest Phase 2 priming) plus the radar
angle: demand **specific numbers, benchmark scores, named failure modes** from
the source; reject generic-ified output. Auto-transcripts mis-transcribe model
names — tell the agent to infer intended meaning (e.g. "clod for-bell" →
`claude-fable-…`). Slug every model/benchmark mention **canonically** so dedup
works across sources.

### 3B — Dedup, then persist (the ingest persistence path)

Run ingest **Phase 1D** dedup first: `cascade_list_packages` scan comparing
`type_data.source.video_id` (YouTube) / `type_data.source.url` (normalized) —
on a hit, **refresh** the existing package via `cascade_update_package` (shallow
type_data merge) instead of creating a duplicate; on no hit, create the knowledge
package in the ingest Phase-4 shape:

```
cascade_create_package
  title:        "Model intel: <author|lab> — <short title>"
  package_type: "research"
  executor_type:"human"
  tags:         ["knowledge-package","external-ingest","model-radar","<source-kind>", …model/benchmark slugs]
  description:  <summary + one line of provenance>
  type_data:    { knowledge_kind:"external_ingest",
                  stance: "<lab_claim|independent_eval|practitioner_take>",   # MANDATORY here
                  model_refs: […], benchmark_refs: […],
                  card:{ oneline, what, why, theme },      # ingest card contract (≤140/≤280/≤280 + fixed theme set)
                  source: <the Phase-2 provenance verbatim>,  # url, channel/lab, published date — full provenance
                  frameworks, key_points, notable_quotes, competitive_signals,
                  cascade_implications, contradictions_or_risks }
```

**`type_data.stance` MUST be set** on every model-radar evidence package — the
PWA stance-contrast drill-down groups on it. Provenance MUST carry the url, the
channel (YouTube) or lab (release page), and the published date.

**Curator-queue landing:** items pulled through `cascade_ingest_curator_item`
(the Supadata rung) already landed in the curator queue. For items pulled via
the local adapters, also call `cascade_ingest_curator_item { source_type, url,
source_author }` so the firehose queue sees the same evidence — it dedups
server-side on the URL; if it errors on an already-seen URL, that is fine, move on.

## Phase 4 — Dossier upsert (find-or-create by canonical slug — MANDATORY dedup)

Collect every `model_ref` and `benchmark_ref` across this run's evidence. For
each slug, find-or-create **exactly ONE** dossier artifact node
(`packages.kind='artifact'`, artifact types `model_dossier` / `benchmark_dossier`).

**1. Search existing dossiers by slug BEFORE creating — never skip this.**
Primary lookup: `cascade_list_packages { status:"completed", limit:100 }` and
scan for `type_data.artifact_type` + the slug field. If the org's package list
may exceed the 100-row cap, use the deterministic PostgREST lookup instead
(service-role convention — key + URL from `cascade-web/.env.local`, prod read-back
only, never in app code):

```bash
curl -s "$SUPABASE_URL/rest/v1/packages?org_id=eq.<org>&kind=eq.artifact&is_deleted=eq.false&type_data->>artifact_type=eq.model_dossier&type_data->>model_slug=eq.<slug>&select=id,title,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

(benchmark dossiers: `artifact_type=eq.benchmark_dossier` + `type_data->>benchmark_slug`.)

**2. On a hit** → reuse that `package_id`. Re-synthesis (Phase 6) appends a new
`artifact_version` to the SAME node — never a duplicate node.

**3. On no hit** → create the node, then stamp its identity metadata:

```
cascade_create_artifact
  title:    "Model dossier: <model_slug>"        # or "Benchmark dossier: <benchmark_slug>"
  content:  <initial synthesis, Phase-6 format — or a stub noting evidence pending>
  renderer: "markdown"
  tags:     ["model-radar","dossier","model_dossier"]   # or "benchmark_dossier"
```

then merge the dossier metadata onto the package (`cascade_update_package`
shallow-merges `type_data`, so the artifact's `renderer` key is preserved —
metadata contract mirrors `cascade-web/src/lib/model-radar/types.ts`, which
mirrors dossier-schema.json):

```
cascade_update_package {
  package_id: "<artifact id>",
  type_data: {                       # model_dossier:
    artifact_type: "model_dossier",
    model_slug: "<slug>", family_slug: "<family>", lab: "<lab>",
    release_date: "<YYYY-MM-DD>", last_synthesized_at: "<ISO now>"
  }                                  # benchmark_dossier: artifact_type,
}                                    # benchmark_slug, popularity, last_synthesized_at
```

Mark every dossier that received **new** evidence this run (created OR matched)
as **dirty** — Phase 6 re-synthesizes exactly the dirty set. **Exception:** a
dossier CREATED this run with its full synthesis already in the create call is
NOT dirty — creating-with-synthesis clears the dirty bit for this run (an
immediate Phase-6 pass would just write an identical duplicate version).

**`release_date` convention:** use `YYYY-MM-DD` when the evidence states it;
when the harvested evidence never states a release date, write the literal
string `"unknown"` — never fabricate a date. Backfill on a later run whose
evidence carries the real date.

## Phase 4B — Score-snapshot persistence (append-only)

For every dossier — model AND benchmark — touched by this run's snapshots:

**1. Read** the current `type_data.score_snapshots` (deterministic PostgREST
service-role read, same convention as the Phase 4 lookup — or
`cascade_list_packages` when the org's package list fits the cap):

```bash
curl -s "$SUPABASE_URL/rest/v1/packages?id=eq.<dossier-id>&select=id,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**2. APPEND** the new snapshots and write back. `cascade_update_package`
shallow-merges `type_data`, and JSONB arrays replace **wholesale** — so send
the FULL merged array (all existing entries + the new ones); sending only the
new entries would silently drop the series:

```
cascade_update_package { package_id:"<dossier id>",
  type_data:{ score_snapshots:[ …ALL existing entries…, …new entries… ] } }
```

**3. DEDUPE:** skip a snapshot when an existing entry has an identical
`{source_slug, benchmark_slug, model_slug, metric, as_of}` tuple. **NEVER
overwrite or delete prior entries** — this is an append-only lab notebook, not
a mutable cache. The accumulated series is the future recommender's stock
data, readable without any LLM call.

**4.** Dossiers receiving **new** (non-deduped) snapshots are marked **dirty**
— Phase 6 re-synthesizes them (meta-rating for model dossiers, score-context
for benchmark dossiers).

## Phase 5 — Edges (the substrate wiring)

### 5A — `informs`: evidence → dossier

For each evidence package, create an `informs` edge to every dossier its
`model_refs`/`benchmark_refs` touch, via the same MCP tool `/cse:link` uses
(writes `public.package_edges`, org-guarded, **idempotent** on parent+child+type):

```
cascade_link_knowledge {
  knowledge_id: "<evidence package id>",   // edge PARENT (informs)
  package_id:   "<dossier package id>",    // edge CHILD  (is informed)
  rationale:    "<one line: what this evidence claims about <slug>>",
  confidence:   <0..1 relevance>
}
```

**Benchmark citations get BOTH edges:** evidence that cites a benchmark against
a model links to the **model dossier** AND that benchmark's **benchmark dossier**.

### 5B — `supersedes`: successor release → predecessor

When this run's evidence establishes that a new release **replaces** a
predecessor in the SAME `family_slug` (e.g. `gpt-5` superseding `gpt-4o`) and
both dossiers exist, create a `supersedes` edge —
**successor = `parent_id`, predecessor = `child_id`** (migration 283; the edge
is non-hierarchical, never cycle-checked, but the org-integrity guard still
requires both endpoints in one org). No MCP tool writes this edge type today, so
use the direct-PostgREST service-role convention — **check-before-insert** for
idempotency:

```bash
# 1. Already linked? (expect [] before inserting)
curl -s "$SUPABASE_URL/rest/v1/package_edges?parent_id=eq.<successor-id>&child_id=eq.<predecessor-id>&edge_type=eq.supersedes&select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# 2. Insert (only when step 1 returned [])
curl -s -X POST "$SUPABASE_URL/rest/v1/package_edges" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"org_id":"<org>","parent_id":"<successor-id>","child_id":"<predecessor-id>","edge_type":"supersedes","metadata":{"reason":"<one line>","sources":["<url>"]}}'
```

Then set the predecessor's metadata so query-time rollups see it without walking
edges: `cascade_update_package { package_id:"<predecessor-id>", type_data:{
superseded_by:"<successor model_slug>" } }` — and reflect it in the
predecessor's next synthesized content (`superseded_by` field in
dossier-schema.json). Mark the predecessor dirty so that happens this run.

## Phase 6 — Re-synthesize dirty dossiers (new artifact_version)

For every **dirty** dossier (and any `--slug` target), re-synthesize the FULL
dossier content **in this session** against ALL of its linked evidence (walk its
incoming `informs` edges — not just this run's items), conforming to
`dossier-schema.json`:

- **model_dossier:** `strengths`, `risks`, `post_release_findings` (what emerged
  AFTER release day — where the dossier diverges from the launch narrative),
  `divergence` (contested questions with `sides[]`, each side carrying
  `position`/`stances`/`sources` + attribution — preserve the disagreement), and
  `fit_for_our_stack` (`summary` = adopt/trial/watch/skip for OUR stack +
  `considerations`), grounded in org context: read `.cascade/context/` (run
  `node bin/cascade.js sync` first if stale) and call `cascade_get_org_context`.
  For Cascade HQ that means Claude Code / Agent SDK harnesses, Max Plan vs API
  billing, MCP tooling, the Supabase/Next.js codebase, Steve's
  interactive-terminal workflow.
- **benchmark_dossier:** `measures` (what it actually tests, plainly enough to
  judge score transfer), `credibility_critique` (contamination, saturation,
  harness sensitivity), `gameability` (how it can be / has been gamed),
  `cited_by` (who leans on it, in what capacity), `popularity` (`low|medium|high`,
  justified by the entries).

### Meta-rating synthesis (model dossiers — the researcher voice)

Every dirty **model** dossier additionally gains a `meta_rating`
(dossier-schema.json v2). The voice: **an indiscriminate researcher writing a
research paper across the industry's benchmarks and deducing what they mean** —
not a leaderboard reciter.

- Read the FULL accumulated `type_data.score_snapshots` series + ALL linked
  discourse evidence (the same informs-edge walk as above).
- `capability_vector`: score **ALL SIX core axes** — `coding`, `reasoning`,
  `agentic_tool_use`, `writing_communication`, `speed`, `cost_efficiency` —
  each `axis_score` an integer 0-100 relative to the current frontier
  (score-schema.json rubric: 90-100 frontier-leading, 70-89 strong, 40-69
  mid-pack, <40 weak/unproven), `confidence` `low|medium|high`, and a
  `rationale` CITING a specific score snapshot (benchmark + number + date) or
  evidence package — never a vibe. Optional **emergent axes** ONLY when 2+
  independent evidence items support a dimension the core 6 miss (each with
  its required `definition`).
- `speed` + `cost_efficiency` lean on Artificial Analysis-style
  throughput/pricing snapshots when present; when absent, score honestly at
  low confidence and say so in `insufficient_evidence`.
- Thin evidence on ANY axis: score it anyway at low confidence and say so —
  a vector missing a core axis is invalid; dishonest confidence is worse.
- `narrative`: the researcher-voice meta-analysis — what the benchmark record
  and the discourse, taken together, say this model actually is.
- `divergence_notes[]`: explicit `divergence_flag` entries wherever the
  numbers and the discourse disagree (e.g. tops SWE-bench while practitioners
  report real-repo failures) — flag the mismatch, never average it away.

**DUAL-PERSIST (mandatory):** (1) the `meta_rating` goes into the artifact
body — markdown rendering + the fenced `json` block, exactly as v1 already
does for the dossier object; (2) the `capability_vector` ALSO persists
structured on the package row, separate from prose, so downstream agents and
the future recommender read typed JSON, never markdown:

```
cascade_update_package { package_id:"<model dossier id>",
  type_data:{ capability_vector:{ core:[…all 6 axis_scores…], emergent:[…],
              synthesized_at:"<ISO now>", insufficient_evidence:"…" } } }
```

### Score-context synthesis (benchmark dossiers)

Every dirty **benchmark** dossier with a stored snapshot series additionally
gains a `score_context` (dossier-schema.json v2):

- `standings`: the current top models — latest value per model, derived from
  the stored `type_data.score_snapshots` series, each entry carrying `as_of` +
  `source_slug`.
- `dynamics`: what the series shows — movement, saturation, new entrants —
  grounded in the stored numbers, never vibes.

Every claim = `statement` / `stance` / `confidence(low|medium|high)` / `sources`
(source_ref with normalized url + attribution). Write the synthesis as the
artifact body — **markdown rendering of the schema-shaped content** with a
fenced `json` block of the exact `dossier-schema.json` object at the end, so
both humans (artifact viewer) and parsers (lib/model-radar) read the same node.

Persist:

```
cascade_update_artifact { artifact_id: "<dossier id>", content: "<new full body>" }
cascade_update_package  { package_id: "<dossier id>", type_data: { last_synthesized_at: "<ISO now>" } }
```

`cascade_update_artifact` appends the next `artifact_version` and the DB trigger
advances the current pointer — never mutate an old version, never create a
second node. Verify round-trip with `cascade_get_artifact` on at least one
dossier per run.

## Phase 7 — Run summary + record

Report, concretely:

- **Sources harvested** (per registry id: items found / in-window / pulled).
- **Evidence** created vs dedup-refreshed vs skipped (with reasons: no
  transcript, unreadable page, off-topic, out-of-window).
- **Dossiers** created / updated, each with its new `versionNo`.
- **Edges** created: informs (evidence→model, evidence→benchmark) and supersedes.
- **SOURCE HEALTH REPORT** (score-schema.json `source_health_report` shape):
  EVERY leaderboard source attempted this run, each with `status`
  (`fetched | parsed | failed`) + `snapshot_count` + the error reason on
  failure. Report it even when everything passed — a clean bill of health is
  information too.
- **Snapshots** appended vs deduped (per Phase 4B).
- **Anything skipped and why.**

Log one decision (category `process`, significance `minor`):

```bash
node bin/cascade.js log-decision --title "Model Radar run: <date>" \
  --chosen "Harvested N sources → M evidence packages, K dossiers re-synthesized (…slugs…)" \
  --reasoning "<which sources produced signal; notable divergences found>" \
  --tags "model-radar,external-ingest" --category "process" --significance "minor"
```

The work is tracked via the packages themselves — no separate `/cse:capture` needed.

---

## Scheduled (headless) invocation — `--scheduled`

When `$ARGUMENTS` contains `--scheduled`, the skill is running UNATTENDED in the
scheduled-runs lane: a headless runner spawns
`claude -p "/cse:model-radar --scheduled" --output-format json --dangerously-skip-permissions`
under launchd and parses this session's final message. Attended behavior above
is UNCHANGED — this section governs only the headless path.

**1. Non-interactive.** Never call AskUserQuestion or wait for user input.
Resolve every choice with the documented defaults (`run` full pipeline,
leaderboard rung ON, `--days` 14) or best judgment; skip any interactive review
step. Resolve ambiguity conservatively and note it — never ask.

**2. Standard pass, conservative defaults.** Run the normal full pipeline:
Phase 1 (source registry) → Phase 2 (harvest, incl. 2C) → Phase 3 (extract +
persist evidence) → Phase 4/4B (dossier upsert + snapshots) → Phase 5 (edges) →
Phase 6 (re-synthesize dirty dossiers) → Phase 7 (run summary). Every
idempotency/dedup rule (constraint 3) applies exactly as in an attended run.

**3. HEALTH REPORT (the runner contract).** The FINAL message of the session
MUST end with a fenced ` ```json ` code block containing exactly ONE JSON object:

```json
{
  "skill": "cse:model-radar",
  "status": "ok",
  "started_at": "<ISO8601>",
  "finished_at": "<ISO8601>",
  "items_processed": 12,
  "notes": "<one-line summary of what happened / what failed>"
}
```

- These six keys are **REQUIRED**; extra keys are allowed.
- `status`: `"ok"` = clean full pass; `"degraded"` = pass completed but some
  sources failed or were skipped; `"error"` = the pass aborted.
- `items_processed`: sources harvested + dossiers touched this run.
- **Emit it even on failure** — a crash-path final message still ends with the
  block (`status:"error"`, the failure in `notes`, `items_processed` so far).
- It must be the **LAST** fenced block in the final message — the runner's
  extractor takes the last ` ```json ` block, so nothing (including echoed
  dossier JSON) may follow it.

**4. Exit semantics.** Complete the pass in ONE session: no restarts, no
enqueued follow-ups, no notifications — the runner owns notification. When a
data source fails, degrade (`status:"degraded"`) and continue rather than
abort whenever partial progress is possible (the Phase 2C independent-rung rule
generalizes to the whole pass); reserve `"error"` for runs where nothing useful
could proceed.

**5. Cost discipline.** Scheduled runs execute on the **Max Plan rail only** —
the runner strips `ANTHROPIC_API_KEY` before spawning, so constraint 1 holds
unattended. Keep the pass bounded: the default 14-day window, the top-~10
leaderboard scope, and the recent-window filters are the budget — do not widen
them in a scheduled run.

---

## What this skill still is NOT (deferred — separate specs)

Leaderboard scraping — deferred in v1 — is now **IN** (phase 2: the 2C
structured-eval rung, 4B append-only snapshots, and the Phase 6
meta-rating/score-context extensions). Still out:

- ~~No cron/daemon/scheduled harvest~~ — SUPERSEDED by the scheduled-runs
  lane: the headless `--scheduled` contract above is invoked by the local
  launchd runner (`scripts/scheduled-runner.mjs`), which carries the
  deterministic off switch (org kill switch + per-schedule enabled, both
  fail-closed) and the Max-Plan-only guarantee (rail-exclusive env). The
  skill itself still never self-schedules.
- No usage-profile recommendation engine ("use Fable for this now") — the
  recommender comes AFTER periodic runs. The append-only snapshot series +
  typed `capability_vector`s are its stock data, accumulating now precisely so
  it can read them without an LLM call; until then the skill stops at the
  `fit_for_our_stack` section + the PWA Discuss-this affordance.
- No new adapters (podcast/X/PDF) — they plug into the same ingest Phase-1 seam later.
- The PWA `/models` view + dashboard strip render what this skill writes; the
  skill never needs the UI to exist.
