---
name: learn
description: Use when you want to learn something — a branded HTML lesson calibrated to your learner profile, one versioned artifact per topic.
when_to_use: /cse:learn — personalized learning lessons on the package substrate. Loads (or first-run interviews) your portable learner profile from ai_preferences.interaction_preferences.learning, asks at most 1-2 topic calibration questions, generates a fully self-contained branded HTML lesson (dark minimalist "engineering note" aesthetic) grounded in real org/codebase facts, and upserts it as exactly ONE versioned lesson artifact per (org, topic_slug) — deepening or regenerating appends a new version to the SAME node, never a duplicate. Supports learning tracks (ordered contains edges) and personal variants. Triggers on "teach me", "I want to learn", "explain X to me properly", "make me a lesson on", "/cse:learn <topic>".
argument-hint: "[topic — e.g. 'postgres RLS' | --deepen <topic_slug> | --track <track_slug> | --personal | --profile (re-run the profile interview)]"
allowed-tools: Read, Write, Bash(node *cascade.js *), Bash(curl *), Bash(cat *), AskUserQuestion, Agent, cascade_sync_ai_preferences, cascade_get_brand_config, cascade_get_org_context, cascade_list_packages, cascade_create_artifact, cascade_update_artifact, cascade_get_artifact, cascade_create_package, cascade_update_package, cascade_manage_dependencies, cascade_log_decision
---

# /cse:learn — Personalized Lessons on the Package Substrate

Turn "teach me X" into a **branded, versioned, queryable lesson artifact**. Three
ideas compose:

1. **A portable learner profile** — who you are, how deep you like to go, what
   you already know — stored in your account-scoped AI preferences, so every
   lesson (in any org, on any machine) starts calibrated instead of generic.
2. **The model-radar upsert idiom** — exactly ONE lesson artifact per
   `(org, topic_slug)`. Deepening, correcting, or regenerating a lesson appends
   a new `artifact_version` to the SAME node; a lesson's history is its version
   history. Never a second package for the same topic.
3. **The publish branding precedent** — lessons render from
   `cse/skills/learn/template.html` (`${CLAUDE_PLUGIN_ROOT}/skills/learn/template.html`
   when installed): a self-contained dark "engineering note" page driven by the
   org's brand config. Zero external network dependencies, so it renders
   perfectly inside the artifact viewer's sandboxed iframe.

Parse `$ARGUMENTS`: a bare topic string starts the normal flow; `--deepen
<topic_slug>` skips to Phase 3's HIT path (new version, same node); `--track
<track_slug>` attaches the lesson to a learning track; `--personal` marks the
lesson (or variant) personal; `--profile` forces the Phase 0 interview even if
a profile exists.

**No migrations. No cascade-api server changes.** Everything here uses existing
tools and existing tables (`ai_preferences`, `packages`, `package_edges`).

---

## Phase 0 — Learner profile (load or first-run interview)

The profile lives at the JSONB path **`interaction_preferences.learning`** on
the user's existing `ai_preferences` row (`scope='user'` — portable across orgs
and devices, exactly like `/cse:alias` aliases; **no migration needed**, it is
just a new key inside the existing `interaction_preferences` JSONB column).
Org-level defaults are possible later via the existing `scope='org'` row —
user values win over org defaults when both exist.

**1. Load:**

```
cascade_sync_ai_preferences { mode: "read_prefs" }
```

Returns the user row's full `interaction_preferences` (`{}` when no row
exists). Read the `learning` key. Expected shape (full schema with
per-field descriptions: `cse/skills/learn/learner-profile-schema.json`):

```json
{
  "depth_default": "overview | working-knowledge | deep-dive",
  "background": ["e.g. 'full-stack TS', 'founder', 'ex-data-eng'"],
  "formats": ["prose", "code-first", "diagrams", "analogies", "exercises"],
  "comfort_notes": "free text — how they want unknowns/jargon handled",
  "topics_known": { "<topic_slug>": "none | familiar | proficient | expert" }
}
```

**2. If present** → summarize it back in one line ("Profile loaded: deep-dive
default, code-first, knows postgres well") and move to Phase 1.

**3. If absent (or `--profile`)** → run the **first-run profile interview**:
4-6 dimension questions modeled on the `/cse:intent` interview (AskUserQuestion
for structured picks, open follow-ups when an answer reveals something). This
is a one-time cost — subsequent `/cse:learn` calls skip it entirely.

- **Dimension 1 — Background / role:** what they do day-to-day, technical
  depth, domains they live in. Feeds `background[]`.
- **Dimension 2 — Preferred depth:** default lesson depth — quick overview,
  working knowledge, or deep-dive with internals. Feeds `depth_default`.
- **Dimension 3 — Formats:** how they learn best — prose, code-first examples,
  diagrams, analogies, exercises. Multi-select. Feeds `formats[]`.
- **Dimension 4 — Comfort with the current topic's domain:** for the topic
  they just asked about, are they starting cold or building on adjacent
  knowledge? Seeds `topics_known` with the first entry.
- **Dimension 5 — Handling unknowns:** when the lesson hits something they
  likely don't know, should it stop and explain, footnote it, or assume and
  move fast? Feeds `comfort_notes`.
- **Dimension 6 (optional) — Known territory:** anything they already know
  well that lessons should never re-explain. More `topics_known` entries.

**4. Persist the profile back** (the merge is sibling-preserving and happens
server-side — pass ONLY the `learning` section; every other
`interaction_preferences` key is left untouched, and the user row is created
when missing):

```
cascade_sync_ai_preferences {
  mode: "merge_prefs",
  section: "learning",
  value: { ...the profile... }
}
```

User scope only — `merge_prefs` refuses `scope: "org"`.

**5. Update-as-you-go:** whenever a later phase learns something durable about
the learner (a topic they turned out to know, a format they asked for), merge
it in the same way (`mode: "merge_prefs"`, `section: "learning"`) at the end
of the run — deep merge means you can pass just the changed keys.

---

## Phase 1 — Calibration (at most 1-2 questions)

On every request AFTER the profile exists, ask **AT MOST 1-2 topic-specific
questions** — the profile already answered the general ones, so never re-ask
depth defaults, formats, or background. Good calibration questions:

- **Scope:** "Just `<the named tech>`, or alternatives/trade-offs too?"
  (just-this-tech vs alternatives-too)
- **Depth for THIS topic** — only when the profile's `depth_default` plausibly
  doesn't fit (e.g. they asked for "a quick primer" but default is deep-dive),
  or `topics_known[<slug>]` says they're already proficient (then the lesson
  should target the frontier, not the basics).

Skip calibration entirely when `$ARGUMENTS` + profile already pin both answers.
Derive the canonical **`topic_slug`** now: lowercase-hyphenated, stable across
phrasings ("Postgres RLS", "row level security in postgres" → `postgres-rls`).
Check `topics_known` for the slug — it sets the lesson's starting altitude.

---

## Phase 2 — Generation

**1. Brand:** call `cascade_get_brand_config`; on failure/absence, `Read
.cascade/brand.json`; final fallback = the template's built-in dark defaults.
Map brand values onto the template's CSS variables (`--accent`, `--dark`,
`--text`, `--bg`, `--font-body`) — for the dark lesson aesthetic, use the brand
`accent`/`primary` color and font family, but keep the dark background palette
(the brand `background` is usually white; the lesson page is intentionally dark).

**2. Ground the content in real facts.** Pull org context
(`cascade_get_org_context`, `.cascade/context/` — run `node bin/cascade.js sync`
if stale) and, when the topic touches this codebase, cite actual files, actual
migrations, actual decisions. A lesson on "Postgres RLS" for Cascade HQ should
reference this repo's RLS scars, not textbook boilerplate. **No filler** — every
section earns its place; stat tiles show real numbers or don't exist.

**3. Author the lesson** from `cse/skills/learn/template.html`: fill the
`{{PLACEHOLDER}}` slots (kicker, two-tone title, meta line, stat tiles,
section cards with callouts/code blocks, footer). The output must be **fully
self-contained** — inline CSS only, system fonts, zero external URLs — because
the artifact viewer renders it in a sandboxed iframe (`srcDoc` with
`sandbox="allow-scripts"`, NO `allow-same-origin`: opaque origin, no
localStorage, no same-origin fetch; small inline-JS interactivity like
collapsible sections is fine).

**4. Respect the profile:** depth from Phase 1, formats from `formats[]`
(code-first learners get runnable snippets up top; analogy learners get the
mental model first), unknowns handled per `comfort_notes`, known territory
per `topics_known` skipped or compressed to one line.

---

## Phase 3 — Persistence (the model-radar upsert — MANDATORY dedup)

**Exactly ONE lesson artifact per `(org, topic_slug)`.** Regeneration and
deepening append a version to the SAME package — never mint a second one.

**1. Find:** search existing lessons by slug BEFORE creating — never skip this.
Either scan `cascade_list_packages { status: "completed", limit: 100 }` for
`type_data.artifact_type === "lesson" && type_data.topic_slug === "<slug>"`,
or (deterministic, unbounded — service-role convention, key + URL from
`cascade-web/.env.local`, prod read-back only) raw PostgREST:

```bash
curl -s "$SUPABASE_URL/rest/v1/packages?org_id=eq.<org>&kind=eq.artifact&is_deleted=eq.false&type_data->>artifact_type=eq.lesson&type_data->>topic_slug=eq.<slug>&select=id,title,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**2. On HIT** → append a NEW VERSION to the SAME node:

```
cascade_update_artifact { artifact_id: "<lesson id>", content: "<new full HTML>" }
cascade_update_package  { package_id: "<lesson id>", type_data: { level: "<level>", last_generated_at: "<ISO now>" } }
```

`cascade_update_artifact` appends the next `artifact_version` and the DB
trigger advances the current pointer — the lesson's evolution (deepen, expand,
correct) IS its version history, one node forever.

**3. On MISS** → create, then stamp identity metadata:

```
cascade_create_artifact {
  title:    "Lesson: <human topic title>",
  content:  "<the full self-contained HTML>",
  renderer: "html",
  tags:     ["learning", "lesson"]
}
```

`cascade_create_artifact` does not take a workspace: the lesson lands in the
org's default-resolved workspace. That is fine — the Library read is
**org-scoped by design** (no workspace filter; see the SCOPING note in
`cascade-web/src/lib/library/queries.ts`), so the lesson is visible at
`/library` regardless of which workspace the user has active.

Then merge the lesson identity onto the package (`cascade_update_package`
shallow-merges `type_data`, so the artifact's `renderer` key is preserved):

```
cascade_update_package {
  package_id: "<new artifact id>",
  type_data: {
    artifact_type: "lesson",
    topic_slug: "<slug>",
    level: "overview | working-knowledge | deep-dive",
    audience: "<one line: who this was calibrated for>",
    visibility: "org"            // or "personal"
  }
}
```

**4. Track attachment (only when asked / `--track`):** find-or-create the
track package by the same upsert idiom — `type_data { artifact_type:
"learning_track", track_slug: "<track_slug>" }`. A track MUST be a
**kind:artifact package** (the Library's `fetchLibrary` filters
`kind = 'artifact'`): create it with `cascade_create_artifact` (a short
markdown body describing the track is fine; tags
`["learning", "learning_track"]`), then `cascade_update_package` to stamp the
type_data identity. Then wire the lesson into the track with a
`contains` edge carrying an `ordinal` (next integer after the track's current
max — `ordinal` is a real `package_edges` column, migration 252, NOT metadata).
`cascade_manage_dependencies` does NOT support `edge_type: "contains"`
(it only does blocks/related/informs task dependencies), so use the documented
PostgREST insert (check-before-insert for idempotency):

```bash
# 1. Already linked? (expect [] before inserting)
curl -s "$SUPABASE_URL/rest/v1/package_edges?parent_id=eq.<track-id>&child_id=eq.<lesson-id>&edge_type=eq.contains&select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# 2. Insert (only when step 1 returned [])
curl -s -X POST "$SUPABASE_URL/rest/v1/package_edges" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"org_id":"<org>","parent_id":"<track-id>","child_id":"<lesson-id>","edge_type":"contains","ordinal":<n>}'
```

**5. Personal variants (`--personal`):** when a learner wants their own take on
a topic that already has a canonical org lesson, create a SEPARATE lesson
package with `type_data.visibility: "personal"` **and `owner_user_id` set to
the learner's user id — REQUIRED, not optional**: the Library's display filter
keys ownership on `type_data.owner_user_id` (falling back to `created_by`),
because `created_by` can name the wrong user in service-role / env-fallback
MCP lanes (`CASCADE_USER_ID`). Omitting it can show the personal lesson to the
wrong user and hide it from its owner. Then link it back with a
`derived_from` edge to the
canonical lesson — **parent_id = the canonical lesson, child_id = the personal
variant** (same direction as migration 264's decision-lens edges; use the same
PostgREST check-before-insert as step 4 with `"edge_type":"derived_from"` and
no ordinal — `cascade_manage_dependencies` does not support this edge type).
**v1 privacy caveat — be explicit with
the user:** `visibility: "personal"` is display-level filtering only; artifact
RLS remains org-readable, so org members who query directly can still read it.

---

## Phase 4 — Report

- Link the lesson: `/artifacts/{id}` (and the library surface at `/library`).
- Report what was calibrated (depth, scope, known-territory skipped) and
  whether this was a NEW lesson or version N of an existing one.
- **Offer iteration:** "deepen" / "expand with exercises" / "correct section X"
  — each runs Phase 2 against the SAME node and appends a new version (Phase 3
  HIT path). The topic node accumulates; it never forks.
- If the run taught us something durable about the learner, merge it into the
  profile (Phase 0 step 5) and say so.
- Log one decision when a lesson establishes org-canonical teaching material
  (category `process`, significance `minor`).

---

## Querying lessons

Any agent can find and read lessons with **ZERO cascade-api server changes** —
the identity lives in `type_data` and standard filters reach it.

**Via MCP (bounded orgs):**

```
cascade_list_packages { status: "completed", limit: 100 }
# then filter client-side: type_data.artifact_type === "lesson"
#   → all lessons; add type_data.topic_slug === "<slug>" for one topic
cascade_get_artifact { artifact_id: "<id>" }   # current version's HTML content
```

**Via raw PostgREST (deterministic, unbounded — service-role read-back convention):**

```bash
# All lessons in an org
curl -s "$SUPABASE_URL/rest/v1/packages?org_id=eq.<org>&kind=eq.artifact&is_deleted=eq.false&type_data->>artifact_type=eq.lesson&select=id,title,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# One topic
curl -s "$SUPABASE_URL/rest/v1/packages?org_id=eq.<org>&type_data->>artifact_type=eq.lesson&type_data->>topic_slug=eq.<slug>&select=id,title,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# All learning tracks
curl -s "$SUPABASE_URL/rest/v1/packages?org_id=eq.<org>&type_data->>artifact_type=eq.learning_track&select=id,title,type_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# A track's lessons, in order (contains edges, ordered by ordinal)
curl -s "$SUPABASE_URL/rest/v1/package_edges?parent_id=eq.<track-id>&edge_type=eq.contains&select=child_id,ordinal&order=ordinal.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Personal variants of a canonical lesson (derived_from edges; parent = canonical, child = variant)
curl -s "$SUPABASE_URL/rest/v1/package_edges?parent_id=eq.<canonical-lesson-id>&edge_type=eq.derived_from&select=child_id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

## Future work (design pointers — none of this blocks v1)

- **org_events emission points:** `lesson_created` (Phase 3 MISS path),
  `lesson_deepened` (Phase 3 HIT path — a new version landed), `lesson_viewed`
  (artifact-viewer side). The event spine is **design-only** today — see
  `.planning/EVENT-SPINE-DESIGN.md`; when the `org_events` table lands, these
  three emissions make lessons feed the momentum/activity surfaces for free.
- **AI-video lessons:** the same profile + topic calibration can drive
  `cascade_play_video` / the `FloatingLearningPlayer` — a lesson node gains a
  video artifact version or a sibling `derived_from` video node.
- **Dashboard embedding:** lessons are ordinary HTML artifacts, so
  `ArtifactPreviewWidget` can pin "current lesson" as a dashboard tile with no
  new renderer work — a learning track becomes a dashboard-resident curriculum.
