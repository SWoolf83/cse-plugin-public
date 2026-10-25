---
name: harness-radar
description: Use when you want harness radar — AI coding-agent intel, benchmark fluency, and leaderboard-backed meta-ratings as versioned dossiers.
when_to_use: Harness Radar — the coding-HARNESS sibling of Model Radar. Extends the Scout/ingest pipeline into an AI-coding-agent intelligence lens. Harvests the harness-radar source registry (maker blogs/release pages + practitioner/review YouTube channels + a structured-eval leaderboard rung — SWE-bench / Terminal-Bench / Aider polyglot / SWE-bench Pro), extracts stance-tagged evidence (maker_claim / independent_eval / practitioner_take) with harness_refs/model_refs/benchmark_refs, upserts ONE versioned dossier artifact per canonical harness slug (and shares benchmark dossiers with Model Radar), wires informs + supersedes edges on the package substrate, and re-synthesizes dirty dossiers (strengths/risks/field-findings/divergence/fit-for-our-stack + a meta-rating capability vector across 6 harness-specific axes; benchmark measures/credibility/gameability/cited-by/score-context) in the same Max Plan session. Triggers on "harness radar", "which open-source coding agent should I use", "how does Claude Code compare to OpenHands / Codex / Cursor", "what does SWE-bench actually measure for agents", the harness-vs-model confound.
argument-hint: "[run (default) | --source <registry id — sources or leaderboards> | --days <recent-window, default 21> | --slug <harness-or-benchmark slug to focus re-synthesis> | --leaderboards (structured-eval rung only) | --no-leaderboards (skip it; rung is ON by default)]"
allowed-tools: Bash(python3 *), Bash(node *cascade.js *), Bash(curl *), WebSearch, WebFetch, Read, Write, Agent, cascade_list_packages, cascade_create_package, cascade_update_package, cascade_create_artifact, cascade_update_artifact, cascade_get_artifact, cascade_link_knowledge, cascade_ingest_curator_item, cascade_get_org_context, cascade_log_decision
---

# /cse:harness-radar — AI Coding Harness Intelligence

Harness Radar turns the firehose of coding-agent information — maker release
posts, independent evals, practitioner breakdowns, and structured-eval
leaderboards — into a **stance-aware dossier layer** on the package substrate,
focused on the **harness** (the agent/scaffold around a model) rather than the
model itself:

> **evidence (stance-tagged knowledge packages) —informs→ dossiers (versioned
> artifact nodes, one per canonical slug) —supersedes→ predecessor harnesses**

A **harness** is an AI coding agent / scaffold — the loop around a model that
plans, edits files, runs tools, and iterates (e.g. OpenHands, Aider, pi,
SWE-agent, Cline, Goose, Claude Code, OpenAI Codex, Cursor). Two dossier kinds
share one artifact primitive:

- **`harness_dossier`** — one per canonical harness slug (e.g. `openhands`,
  `aider`, `pi`, `claude-code`, `codex-cli`). Family views ("how do the
  OpenHands editions compare?") are **query-time rollups** over `family_slug` —
  no family object is ever stored.
- **`benchmark_dossier`** — one per benchmark slug (e.g. `swe-bench-verified`,
  `terminal-bench`, `aider-polyglot`). This is the **eval-fluency** requirement:
  what the benchmark measures, what makes it credible or gameable, and who cites
  it. **Benchmark dossiers are SHARED with Model Radar** — one canonical node per
  slug. When Harness Radar touches a benchmark it stamps `type_data.radar_scope`
  to include `"harness"` so the `/harnesses` view can scope to harness-relevant
  benchmarks without duplicating a node Model Radar already owns.

**THE CENTRAL TRUTH OF THIS DOMAIN — the harness effect.** The *same model*
scores very differently across harnesses (measured HV/MV ratios up to ~7.8×;
15–48-point swings on SWE-bench across scaffolds). A raw benchmark number is
nearly meaningless without knowing **which harness** and **which model** and
**what scaffold config** produced it. Every score this skill records therefore
carries `harness_slug` (the subject), `model_slug` (the underlying model, when
known), and `config` (the scaffold configuration). Never record a harness score
as if the harness alone earned it.

**Section contract source of truth:** `cse/skills/harness-radar/dossier-schema.json`
(`${CLAUDE_PLUGIN_ROOT}/skills/harness-radar/dossier-schema.json` when installed).
Every claim carries `statement` / `stance` / `confidence` (`low|medium|high`) /
`sources`. The three stances are `maker_claim`, `independent_eval`,
`practitioner_take` — preserving *disagreement between them* (the `divergence`
section) is the point; never average it away.

**Numeric contract source of truth:** `cse/skills/harness-radar/score-schema.json`
(`${CLAUDE_PLUGIN_ROOT}/skills/harness-radar/score-schema.json` when installed) —
`score_snapshot` (ONE observed number for ONE harness+model combo from ONE source
on ONE date), the six-axis HARNESS capability taxonomy behind `capability_vector`,
`divergence_flag` (numbers-vs-discourse honesty markers), and the per-run
`source_health_report`. Snapshots accumulate **append-only** on dossier package
`type_data.score_snapshots`; the latest `capability_vector` persists **structured**
at the harness dossier's `type_data.capability_vector`, separate from the prose
artifact body.

This reuses its neighbors rather than duplicating them:
- **`/cse:scout`** owns the keyless YouTube RSS idiom (`cse/skills/scout/youtube_rss.py`).
- **`/cse:ingest`** owns the transcript ladder, the URL-readability adapter, the
  extraction-subagent pattern, and the knowledge-package persistence + dedup shape.
- **`/cse:link`** owns the `informs`-edge convention on `package_edges`.
- **`/cse:model-radar`** is the sibling lens; the two share the benchmark spine.

## The six HARNESS capability axes (fixed taxonomy)

These rate the **scaffold**, not the model. Score-schema.json `core_axis_id`
enum order = canonical display order:

1. `agentic_capability` ("Agentic Capability") — autonomous multi-step task
   completion on real coding work; fed by SWE-bench Verified / Terminal-Bench /
   Aider polyglot resolved-rates **achieved with this harness**.
2. `context_management` ("Context Management") — repo-scale context handling:
   repo maps, code search/retrieval, compaction, memory across long horizons.
3. `tool_integration` ("Tools & Extensibility") — MCP support, shell/browser/
   editor tools, hooks, subagents, custom tools and plugins.
4. `model_flexibility` ("Model Flexibility") — model-agnosticism / provider
   breadth: BYO-model, multi-provider, local models, or locked to one vendor.
5. `control_safety` ("Control & Safety") — permissioning, sandboxing, human-in-
   the-loop approval, diff review, guardrails against destructive actions.
6. `ecosystem_maturity` ("Ecosystem & Maturity") — adoption, docs, release
   cadence/stability, surface coverage (CLI/IDE/cloud), community/support. "Is
   it alive?" is a real signal — several once-prominent OSS harnesses are now
   archived/dormant.

Cost/token efficiency is intentionally **NOT** a core axis (it is dominated by
the chosen model, not the harness). Score it as an **emergent axis**
(`token_efficiency`) only when Aider-style per-task cost data or throughput data
is available.

## Hard constraints (v1 — non-negotiable)

1. **Max-Plan-only, agent-side.** ALL extraction and synthesis happens in THIS
   interactive session on the user's Max Plan credentials. Never call an LLM API
   key, never add LLM calls to cascade-web server code, never route synthesis
   through the daemon/SDK executor.
2. **No cron / daemon / scheduled path in base mode.** v1 is invoked manually as
   `/cse:harness-radar`. The UI shows `last_synthesized_at` — stale is visible,
   never wrong. (A `--scheduled` headless contract exists below for the
   scheduled-runs lane, gated by the same fail-closed off switches Model Radar
   uses — but no schedule row is seeded for this skill by default.)
3. **Idempotent runs.** Evidence dedups on normalized URL / video id (ingest
   Phase 1D rules); dossiers dedup on canonical slug — re-synthesis appends a new
   `artifact_version` to the SAME node, **never** a duplicate node; edge writes
   are check-before-insert; score snapshots dedup on their
   `{source_slug, benchmark_slug, harness_slug, model_slug, metric, as_of}`
   tuple and are append-only (Phase 4B); leaderboard evidence dedups on
   `(source_slug, as_of day)` — a same-day re-run refreshes, never duplicates.

Parse `$ARGUMENTS`: `run`/empty = full pipeline (the leaderboard rung is **ON by
default**); `--source <id>` restricts the harvest to one registry source — the id
may name a `sources[]` entry OR a `leaderboards[]` entry; `--days <n>` sets the
recent window (default **21** — harness releases move a touch slower than model
releases); `--slug <slug>` skips harvest and re-synthesizes one existing dossier
from its already-linked evidence; `--leaderboards` restricts the run to the
structured-eval rung; `--no-leaderboards` skips Phase 2C for a discourse-only run.

---

## Phase 1 — Read the source registry

Read `cse/skills/harness-radar/sources.json`
(`${CLAUDE_PLUGIN_ROOT}/skills/harness-radar/sources.json` when installed). It is
**user-editable data, not code**. Each source carries:

- `kind`: `maker_page` (has `url`, `maker`, optional `harness_slugs`) or
  `youtube_channel` (has `channel_id`, `rss_url` in the keyless
  `https://www.youtube.com/feeds/videos.xml?channel_id=…` form).
- `stance_hint`: a **DEFAULT** stance for evidence from this source
  (`maker_claim | independent_eval | practitioner_take`). Extraction may override
  it per evidence item.

The top-level **`leaderboards[]`** array registers the NUMERIC score sources for
Phase 2C (`id` becomes `score_snapshot.source_slug`; each entry carries
`enabled`, `benchmark_slugs`/`metrics` mapping hints, and `parse_hints`).

If `--source <id>` was given, keep only that source. Report the roster you are
about to harvest — discourse sources and leaderboard rungs.

## Phase 2 — Harvest (recent-window bounded)

Only items published within the last `--days` days (default 21) are candidates.
Skip anything older and say so in the run summary.

### 2A — YouTube channels (keyless RSS + the ingest transcript ladder)

For each `youtube_channel` source, list recent videos with the scout adapter:

```bash
python3 "<scout-skill-dir>/youtube_rss.py" "<channel_id>" --since "<now - days>" --limit 15
```

`<scout-skill-dir>` = `cse/skills/scout/` in the repo,
`${CLAUDE_PLUGIN_ROOT}/skills/scout/` when installed. React to the stable
`error.code` exactly as `/cse:scout` documents (`RATE_LIMITED` → back off + next
source; `CHANNEL_NOT_FOUND` → flag + skip; `NETWORK_ERROR`/`FETCH_FAILED` →
report + skip; `HTTP_ERROR` → **retry ONCE after ~3s** before skipping).

**Filter to harness-relevant items** by title (named harnesses/agents, "coding
agent", "Cursor/Cline/Claude Code/Codex/OpenHands", benchmark terms) before
pulling transcripts — these channels also publish off-topic videos.

**Transcript ladder** (per selected video), the same ladder `/cse:ingest` uses:

1. **Local adapter:** `python3 "<ingest-skill-dir>/youtube_transcript.py" "<url>" --text-only`.
2. **On failure:** `cascade_ingest_curator_item { source_type:"youtube", url, source_author }`
   (server-side ladder incl. Supadata when `SUPADATA_API_KEY` is set). Also lands
   a curator-queue item.
3. **Still nothing** → record skipped-with-reason and move on.

### 2B — Maker pages (the ingest URL-readability adapter)

For each `maker_page` source:

1. `WebFetch` the index page (blog / releases / changelog) and identify
   **harness-relevant posts within the window** (release announcements, agent
   capability posts, benchmark posts — not hiring/policy posts).
2. For each selected post URL, pull the clean body via the ingest **URL adapter
   with its fallback ladder** (direct `WebFetch` → on empty/blocked/thin, re-fetch
   through **`https://r.jina.ai/<original-url>`**, keeping the ORIGINAL url in
   provenance → still nothing usable, skip-with-reason).
3. Assemble the ingest `{ text, provenance }` contract:
   `provenance = { kind:"url", url:<NORMALIZED>, title, author?, site:<maker>, published_date }`.

Normalize every URL with the ingest Phase 1D rules (lowercase host, strip `www.`,
force https, strip fragment + `utm_*`/`fbclid`/`gclid` + trailing slash).

### 2C — Leaderboard harvest (structured-eval rung)

ON by default in a full `run`; skipped by `--no-leaderboards`. Iterate every
`sources.json` `leaderboards[]` entry with `enabled: true` (or the single
`--source` target). Each is an **INDEPENDENT best-effort rung**: a source that
cannot be fetched or parsed is marked **FAILED with a reason and the run
CONTINUES**. Track per-source status for the Phase 7 `source_health_report`.

Per source:

1. **Fetch:** `WebFetch` the registry `url`, guided by `parse_hints`. On
   empty/JS-blocked output, re-fetch through **`https://r.jina.ai/<url>`** (keep
   the ORIGINAL url as the snapshot `source_url`).
2. **Parse best-effort into score snapshots** conforming to score-schema.json
   `score_snapshot` — ALL 8 required fields:
   `{benchmark_slug, harness_slug, metric, value, unit, as_of, source_url, source_slug}`.
   **THE HARNESS MAPPING (do not skip):** leaderboard rows are harness+model
   combos. Map the **system/scaffold** to `harness_slug` (e.g. "OpenHands +
   CodeAct" → `openhands`), the **underlying model** to `model_slug` (e.g.
   "Opus 4.6" → `claude-opus-4-6`), and record the scaffold in `config` (e.g.
   "CodeAct v3", "bash-only", "diff"). For fixed-harness leaderboards like Aider
   polyglot, EVERY row's `harness_slug` is `aider` and `model_slug` is the listed
   model. `as_of` = the leaderboard's stated date, or today's date when the page
   shows current standings.
3. **Scope, don't transcribe:** top ~15 systems per source plus any
   existing-dossier harness slugs — never exhaustively transcribe a big board.
4. **Persist ONE evidence knowledge package per source per run** (ingest Phase-4
   shape — reuse the Phase 3B conventions):

```
cascade_create_package
  title:        "Harness intel: <source name> — leaderboard snapshot <YYYY-MM-DD>"
  package_type: "research"
  executor_type:"human"
  tags:         ["knowledge-package","external-ingest","harness-radar","leaderboard", …harness/benchmark slugs]
  description:  <summary + one line of provenance>
  type_data:    { knowledge_kind:"external_ingest",
                  stance: "independent_eval",              # MANDATORY for leaderboard evidence
                  score_snapshots: […the parsed snapshots…],
                  harness_refs: […slugs the snapshots touch…],
                  model_refs: […underlying-model slugs, when known…],
                  benchmark_refs: […slugs the snapshots touch…],
                  card:{ oneline, what, why, theme },
                  source: { kind:"url", url:"<normalized url>", site:"<source name>",
                            published_date:"<as_of>" } }
```

   **Dedup rule for leaderboard evidence:** ONE package per `(source_slug, as_of
   day)`. A re-run the same day **refreshes** the existing package via
   `cascade_update_package` rather than duplicating.

5. Snapshots ALSO append to every touched dossier's `type_data.score_snapshots`
   — Phase 4B.
6. These evidence packages participate in Phase 5A `informs` edges: an edge to
   EVERY harness dossier AND benchmark dossier their snapshots touch.

## Phase 3 — Extract stance-tagged evidence + persist knowledge packages

### 3A — Extraction (fan out a subagent, ingest Phase-2 pattern)

For each harvested `{ text, provenance }`, hand the text to a subagent via the
`Agent` tool and require the canonical schema in
`cse/skills/ingest/extraction-schema.json` — **including the harness-radar fields**:

- `stance` — `maker_claim | independent_eval | practitioner_take`. Start from
  the source's `stance_hint` but **override per item**.
- `harness_refs[]` — canonical harness slugs mentioned substantively
  (lowercase-hyphenated, e.g. `openhands`, `aider`, `pi`, `claude-code`,
  `codex-cli`, `swe-agent`, `cline`, `goose`).
- `model_refs[]` — underlying-model slugs when the evidence ties a harness to a
  model (e.g. `claude-fable-5`, `gpt-5`).
- `benchmark_refs[]` — benchmark slugs cited (e.g. `swe-bench-verified`,
  `terminal-bench`, `aider-polyglot`).

Prime the subagent with what Cascade IS plus the radar angle: demand **specific
numbers, benchmark scores WITH their underlying model and scaffold config, named
failure modes**; reject generic-ified output. Slug every harness/model/benchmark
mention **canonically** so dedup works across sources. When a source reports a
score, capture the harness+model+config triple, never a bare number.

### 3B — Dedup, then persist (the ingest persistence path)

Run ingest **Phase 1D** dedup first (`cascade_list_packages` scan comparing
`type_data.source.video_id` / `type_data.source.url`) — on a hit, **refresh** via
`cascade_update_package`; on no hit, create the knowledge package:

```
cascade_create_package
  title:        "Harness intel: <author|maker> — <short title>"
  package_type: "research"
  executor_type:"human"
  tags:         ["knowledge-package","external-ingest","harness-radar","<source-kind>", …harness/benchmark slugs]
  description:  <summary + one line of provenance>
  type_data:    { knowledge_kind:"external_ingest",
                  stance: "<maker_claim|independent_eval|practitioner_take>",   # MANDATORY here
                  harness_refs: […], model_refs: […], benchmark_refs: […],
                  card:{ oneline, what, why, theme },
                  source: <the Phase-2 provenance verbatim>,
                  frameworks, key_points, notable_quotes, competitive_signals,
                  cascade_implications, contradictions_or_risks }
```

**`type_data.stance` MUST be set** on every harness-radar evidence package — the
PWA stance-contrast drill-down groups on it.

**Curator-queue landing:** items pulled through `cascade_ingest_curator_item`
already landed in the queue. For items pulled via the local adapters, also call
`cascade_ingest_curator_item { source_type, url, source_author }` so the firehose
queue sees the same evidence (it dedups server-side on the URL).

## Phase 4 — Dossier upsert (find-or-create by canonical slug — MANDATORY dedup)

Collect every `harness_ref` and `benchmark_ref` across this run's evidence. For
each slug, find-or-create **exactly ONE** dossier artifact node
(`packages.kind='artifact'`, artifact types `harness_dossier` / `benchmark_dossier`).

**1. Search existing dossiers by slug BEFORE creating — never skip this.**
Primary lookup: `cascade_list_packages { status:"completed", limit:100 }` scanning
for `type_data.artifact_type` + the slug field. If the org's package list may
exceed the 100-row cap, use the deterministic PostgREST lookup (service-role
convention — key + URL from `cascade-web/.env.local`, prod read-back only, never
in app code):

```bash
curl -s "$SUPABASE_URL/rest/v1/packages?org_id=eq.<org>&kind=eq.artifact&is_deleted=eq.false&type_data->>artifact_type=eq.harness_dossier&type_data->>harness_slug=eq.<slug>&select=id,title,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

(benchmark dossiers: `artifact_type=eq.benchmark_dossier` + `type_data->>benchmark_slug`.)

**IMPORTANT — benchmark dossiers are SHARED with Model Radar.** When you match an
existing `benchmark_dossier` (whether Model Radar or a prior Harness Radar run
created it), REUSE it — do not create a second node. Whether you match or create,
stamp `type_data.radar_scope` to INCLUDE `"harness"` (merge into the existing
array; never drop a `"model"` scope another radar set):

```
cascade_update_package { package_id:"<benchmark dossier id>",
  type_data:{ radar_scope:[ …existing scopes…, "harness" ] } }   # deduped union
```

**2. On a hit** → reuse that `package_id`. Re-synthesis (Phase 6) appends a new
`artifact_version` to the SAME node.

**3. On no hit** → create the node, then stamp its identity metadata:

```
cascade_create_artifact
  title:    "Harness dossier: <harness_slug>"        # or "Benchmark dossier: <benchmark_slug>"
  content:  <initial synthesis, Phase-6 format — or a stub noting evidence pending>
  renderer: "markdown"
  tags:     ["harness-radar","dossier","harness_dossier"]   # or "benchmark_dossier"
```

then merge the dossier metadata onto the package (`cascade_update_package`
shallow-merges `type_data`, preserving the artifact's `renderer` key — metadata
contract mirrors `cascade-web/src/lib/harness-radar/types.ts`):

```
cascade_update_package {
  package_id: "<artifact id>",
  type_data: {                       # harness_dossier:
    artifact_type: "harness_dossier",
    harness_slug: "<slug>", family_slug: "<family?>", maker: "<maker>",
    open_source: <true|false>, license: "<license?>", repo_url: "<url?>",
    homepage_url: "<url?>", surfaces: [<"cli"|"ide"|"cloud"|…>],
    first_release: "<YYYY-MM-DD|unknown>", last_synthesized_at: "<ISO now>"
  }                                  # benchmark_dossier: artifact_type,
}                                    # benchmark_slug, popularity, radar_scope:["harness",…], last_synthesized_at
```

Mark every dossier that received **new** evidence this run (created OR matched)
as **dirty** — Phase 6 re-synthesizes exactly the dirty set. **Exception:** a
dossier CREATED this run with its full synthesis already in the create call is
NOT dirty.

**`open_source` + `first_release` conventions:** `open_source` is a boolean —
the core Harness Radar distinction (open-source harnesses are the ones users can
actually run inside Cascade). `first_release` = `YYYY-MM-DD` when the evidence
states it, else the literal `"unknown"` — never fabricate.

## Phase 4B — Score-snapshot persistence (append-only)

For every dossier — harness AND benchmark — touched by this run's snapshots:

**1. Read** the current `type_data.score_snapshots` (deterministic PostgREST
service-role read, or `cascade_list_packages` when the org fits the cap):

```bash
curl -s "$SUPABASE_URL/rest/v1/packages?id=eq.<dossier-id>&select=id,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**2. APPEND** the new snapshots and write back the FULL merged array (JSONB
arrays replace wholesale — sending only the new entries would drop the series):

```
cascade_update_package { package_id:"<dossier id>",
  type_data:{ score_snapshots:[ …ALL existing entries…, …new entries… ] } }
```

**3. DEDUPE:** skip a snapshot when an existing entry has an identical
`{source_slug, benchmark_slug, harness_slug, model_slug, metric, as_of}` tuple.
**NEVER overwrite or delete prior entries** — an append-only lab notebook. The
accumulated series is the future harness recommender's stock data.

**4.** Dossiers receiving **new** (non-deduped) snapshots are marked **dirty**.

## Phase 5 — Edges (the substrate wiring)

### 5A — `informs`: evidence → dossier

For each evidence package, create an `informs` edge to every dossier its
`harness_refs`/`benchmark_refs` touch, via `cascade_link_knowledge` (writes
`public.package_edges`, org-guarded, **idempotent** on parent+child+type):

```
cascade_link_knowledge {
  knowledge_id: "<evidence package id>",   // edge PARENT (informs)
  package_id:   "<dossier package id>",    // edge CHILD  (is informed)
  rationale:    "<one line: what this evidence claims about <slug>>",
  confidence:   <0..1 relevance>
}
```

**Benchmark citations get BOTH edges:** evidence that reports a harness's score
on a benchmark links to the **harness dossier** AND that benchmark's **benchmark
dossier**.

### 5B — `supersedes`: successor harness → predecessor

When this run's evidence establishes that a harness **replaces/renames** a
predecessor (e.g. `openhands` superseding `opendevin`, or a fork replacing an
archived original) and both dossiers exist, create a `supersedes` edge —
**successor = `parent_id`, predecessor = `child_id`** (migration 283; the edge is
non-hierarchical, never cycle-checked, but the org-integrity guard still requires
both endpoints in one org). No MCP tool writes this edge type, so use the
direct-PostgREST service-role convention — **check-before-insert**:

```bash
curl -s "$SUPABASE_URL/rest/v1/package_edges?parent_id=eq.<successor-id>&child_id=eq.<predecessor-id>&edge_type=eq.supersedes&select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
curl -s -X POST "$SUPABASE_URL/rest/v1/package_edges" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"org_id":"<org>","parent_id":"<successor-id>","child_id":"<predecessor-id>","edge_type":"supersedes","metadata":{"reason":"<one line>","sources":["<url>"]}}'
```

Then set the predecessor's `type_data.superseded_by:"<successor harness_slug>"`
and mark it dirty so the next synthesized body reflects it.

## Phase 6 — Re-synthesize dirty dossiers (new artifact_version)

For every **dirty** dossier (and any `--slug` target), re-synthesize the FULL
dossier content **in this session** against ALL of its linked evidence (walk its
incoming `informs` edges — not just this run's items), conforming to
`dossier-schema.json`:

- **harness_dossier:** `strengths`, `risks`, `post_release_findings` (field
  findings — what emerged from real-world use after launch, where the dossier
  diverges from the launch-day pitch), `divergence` (contested questions with
  `sides[]`), and `fit_for_our_stack` (`summary` = adopt/trial/watch/skip for OUR
  stack + `considerations`), grounded in org context: read `.cascade/context/`
  (run `node bin/cascade.js sync` first if stale) and call
  `cascade_get_org_context`. For Cascade HQ, "fit for our stack" turns on: **does
  it run on Max Plan OAuth or force an API key** (the burned-trust billing line);
  **MCP support** (can it use the `cascade-api` server); **can it drive the `cse`
  plugin's skills**; the interactive-terminal + PWA workflow; the Supabase/Next.js
  codebase.
- **benchmark_dossier:** `measures` (what it tests — and for harness benchmarks,
  be explicit about the scaffold/agent-vs-model confound), `credibility_critique`
  (contamination, saturation, weak/wrong tests, harness sensitivity — e.g. the
  SWE-bench Verified contamination audits), `gameability` (how it can be / has
  been gamed), `cited_by`, `popularity`.

### Meta-rating synthesis (harness dossiers — the researcher voice)

Every dirty **harness** dossier additionally gains a `meta_rating`. The voice:
**an indiscriminate researcher writing a research paper across the industry's
coding-agent benchmarks and deducing what they mean** — not a leaderboard
reciter, and always harness-aware (a number belongs to a harness+model+config,
never a bare harness).

- Read the FULL accumulated `type_data.score_snapshots` series + ALL linked
  discourse evidence.
- `capability_vector`: score **ALL SIX core axes** — `agentic_capability`,
  `context_management`, `tool_integration`, `model_flexibility`, `control_safety`,
  `ecosystem_maturity` — each `axis_score` an integer 0-100 relative to the
  current frontier of harnesses (90-100 frontier-leading, 70-89 strong, 40-69
  mid, <40 weak/unproven), `confidence` `low|medium|high`, and a `rationale`
  CITING a specific score snapshot (benchmark + number + underlying model + date)
  or evidence package — never a vibe. Optional **emergent axes** ONLY when 2+
  independent evidence items support a dimension the core 6 miss (`token_efficiency`
  when Aider $/task or throughput data exists; `multimodal`; `cloud_autonomy`).
- `agentic_capability` leans on SWE-bench / Terminal-Bench / SWE-bench-Pro
  snapshots for THIS harness; `ecosystem_maturity` leans on release cadence,
  archived/dormant status, and surface coverage; `model_flexibility` on provider
  breadth and Max-Plan/subscription support. When a leaderboard number exists only
  for one underlying model, say so — do not generalize a harness's ceiling from a
  single model pairing.
- Thin evidence on ANY axis: score it anyway at low confidence and say so in
  `insufficient_evidence` — a vector missing a core axis is invalid.
- `narrative`: the researcher-voice meta-analysis — what the benchmark record and
  the discourse, taken together, say this harness actually is.
- `divergence_notes[]`: explicit `divergence_flag` entries wherever numbers and
  discourse disagree (e.g. tops SWE-bench Verified while practitioners report
  real-repo thrashing / high token burn) — flag it, never average it away.

**DUAL-PERSIST (mandatory):** (1) the `meta_rating` goes into the artifact body —
markdown rendering + the fenced `json` block; (2) the `capability_vector` ALSO
persists structured on the package row:

```
cascade_update_package { package_id:"<harness dossier id>",
  type_data:{ capability_vector:{ core:[…all 6 axis_scores…], emergent:[…],
              synthesized_at:"<ISO now>", insufficient_evidence:"…" } } }
```

### Score-context synthesis (benchmark dossiers)

Every dirty **benchmark** dossier with a stored snapshot series additionally
gains a `score_context`:

- `standings`: the current top **harnesses** — latest value per
  `{harness_slug, model_slug}`, derived from the stored series, each entry
  carrying `as_of` + `source_slug` (+ `config` when known).
- `dynamics`: what the series shows — movement, saturation, new entrants, and the
  scaffold-vs-model confound — grounded in the stored numbers.

Write the synthesis as the artifact body — **markdown rendering of the
schema-shaped content** with a fenced `json` block of the exact
`dossier-schema.json` object at the end, so both humans (artifact viewer) and
parsers (lib/harness-radar) read the same node.

Persist:

```
cascade_update_artifact { artifact_id: "<dossier id>", content: "<new full body>" }
cascade_update_package  { package_id: "<dossier id>", type_data: { last_synthesized_at: "<ISO now>" } }
```

Verify round-trip with `cascade_get_artifact` on at least one dossier per run.

## Phase 7 — Run summary + record

Report, concretely:

- **Sources harvested** (per registry id: items found / in-window / pulled).
- **Evidence** created vs dedup-refreshed vs skipped (with reasons).
- **Dossiers** created / updated, each with its new `versionNo`.
- **Edges** created: informs (evidence→harness, evidence→benchmark) and supersedes.
- **SOURCE HEALTH REPORT** (score-schema.json `source_health_report` shape):
  EVERY leaderboard source attempted, each with `status` + `snapshot_count` + the
  error reason on failure. Report it even when everything passed.
- **Snapshots** appended vs deduped (per Phase 4B).
- **Anything skipped and why.**

Log one decision (category `process`, significance `minor`):

```bash
node bin/cascade.js log-decision --title "Harness Radar run: <date>" \
  --chosen "Harvested N sources → M evidence packages, K dossiers re-synthesized (…slugs…)" \
  --reasoning "<which sources produced signal; notable divergences / harness-effect findings>" \
  --tags "harness-radar,external-ingest" --category "process" --significance "minor"
```

The work is tracked via the packages themselves — no separate `/cse:capture` needed.

---

## Scheduled (headless) invocation — `--scheduled`

When `$ARGUMENTS` contains `--scheduled`, the skill is running UNATTENDED in the
scheduled-runs lane (same contract as Model Radar): a headless runner spawns
`claude -p "/cse:harness-radar --scheduled" --output-format json --dangerously-skip-permissions`
under launchd and parses this session's final message. Attended behavior above is
UNCHANGED. (Note: unlike `cse:model-radar`, no schedule row is seeded for this
skill by default — an operator must add one deliberately, and the org kill switch
+ per-schedule `enabled` fail-closed guards from migration 288 still gate it.)

**1. Non-interactive.** Never call AskUserQuestion or wait for input. Resolve
every choice with the documented defaults (`run` full pipeline, leaderboard rung
ON, `--days` 21).

**2. Standard pass, conservative defaults.** Run the normal full pipeline with
every idempotency/dedup rule applied.

**3. HEALTH REPORT (the runner contract).** The FINAL message MUST end with a
fenced ` ```json ` block containing exactly ONE object:

```json
{
  "skill": "cse:harness-radar",
  "status": "ok",
  "started_at": "<ISO8601>",
  "finished_at": "<ISO8601>",
  "items_processed": 9,
  "notes": "<one-line summary of what happened / what failed>"
}
```

- These six keys are **REQUIRED**; extra keys allowed.
- `status`: `"ok"` clean | `"degraded"` some sources failed/skipped | `"error"` aborted.
- `items_processed`: sources harvested + dossiers touched.
- **Emit it even on failure**, and it must be the **LAST** fenced block.

**4. Exit semantics.** One session, no restarts/notifications; degrade rather
than abort whenever partial progress is possible.

**5. Cost discipline.** Max Plan rail only — the runner strips
`ANTHROPIC_API_KEY`. Keep the pass bounded to the default window + top-~15
leaderboard scope.

---

## What this skill still is NOT (deferred — separate specs)

- No usage-profile recommendation engine ("use OpenHands for this task on Max
  Plan") — the recommender comes later. The append-only snapshot series + typed
  `capability_vector`s are its stock data, accumulating now precisely so it can
  read them without an LLM call.
- No "run the harness under a locked scaffold ourselves" harness-normalized eval
  harness — the highest-value future move (the research shows only ~7 OSS
  harnesses publish substantiated scores). For now the skill records what sources
  report and always keeps the harness+model+config triple.
- No new adapters (podcast/X/PDF) — they plug into the same ingest Phase-1 seam.
- The PWA `/harnesses` view + dashboard strip render what this skill writes; the
  skill never needs the UI to exist.
