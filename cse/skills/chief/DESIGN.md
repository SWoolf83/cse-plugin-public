# Chief-of-Staff mode (`/cse:chief`) — design note

A **session-invoked standing strategy conversation.** You sit down with a
chief-of-staff who has been watching the backlog, the roadmap, and your live
assumptions; it tells you — in three cards or fewer — where the world moved against
your plan since you last talked, helps you decide, and remembers the conversation so
the next session resumes where this one left off.

This note captures the six decisions behind the design.

## 1. The reframe — pressure-on-live-assumptions, not a recency feed

The central bet. A naïve "what's new" surface is a recency feed: it shows you the most
recent thing, which is almost never the most *important* thing. A **brief** answers a
different, sharper question:

> **Where did the world move *against your plan*?**

So `cascade_brief action=compose` does not rank by recency. It ranks candidate signals
(the org knowledge backlog: scout / curator / ingest packages) by how hard they
**press on the things you're actually counting on** — your `decision_assumptions`
(status `active`) and your active roadmap packages (`approved` / `executing`). A new
competitor capability that contradicts a live assumption out-ranks a fresher item that
touches nothing you're betting on. Recency is only a **tie-breaker** (a small,
half-life-decayed bonus), never the signal.

Two consequences fall out of this framing:

- **Honest-empty is a feature, not a failure.** If nothing pressed on a live
  assumption or active roadmap work, the right answer is "you're caught up" — not three
  manufactured cards. `all_caught_up` is a first-class return. A brief that's honest
  when there's nothing to say is one you'll trust when it does speak.
- **At most three cards.** `MAX_CARDS = 3`. A chief-of-staff who hands you a list of
  twelve has abdicated the job. The scarcity *is* the synthesis.

## 2. Build the core once — `cascade_brief` is shared by /cse:chief AND /cse:weekly

`cascade_brief` is the **shared synthesis core** behind *two* surfaces: `/cse:chief`
(this on-demand standing thread) and `/cse:weekly` (the scheduled calibration ritual).
Two cadences, **one core.** We did not fork the assumption-pressure logic per skill.

This mirrors the established convention in the codebase: the pure scoring logic lives
once (`cascade-web/src/lib/briefing/assumptionPressure.ts` is the source of truth) and
the MCP tool carries a **verbatim behavior-parity port** of it (the same pattern as
`scout/ranking.ts ↔ resurface.ts`). Change the cascade-web copy first, then mirror.
The skills are thin orchestration personas over the one core — which is why adding a
third cadence later is cheap.

## 3. Hybrid versioned continuity — artifact node + .cascade markdown mirror

What turns a briefing into a *conversation* is memory across sessions. We persist the
thread **two ways**, deliberately redundant:

- **The artifact node** — a `kind:artifact` "chief-of-staff thread" on the artifact
  spine. Each session appends a **new version** carrying a THREAD STATE block (what we
  discussed / decisions made / open threads / next-time pointer). This is the durable,
  shareable, version-historied home, and it lives in the substrate where the rest of
  the system can see it.
- **The `.cascade/chief-of-staff-brief-<date>.md` mirror** — the same THREAD STATE,
  written locally **every session, unconditionally.**

The mirror is not just belt-and-suspenders. The artifact MCP tools
(`create/get/update_artifact`) only become callable once the MCP package is **built**
and the `cse` plugin is **released** into a Claude Code session. Until that's live, the
artifact write can't run — so the EXIT step **attempts** the artifact write but
**never fails the session** if it's unavailable, and the markdown mirror **always**
happens. The mirror is the **interim / offline continuity store**, and the full
artifact write is a fast-follow. ENTRY reads *both* (most-recent wins) so resume works
either way. This keeps the feature shippable now without waiting on the release.

## 4. The config layer — conversation/MCP-mutable cadence, scope, trigger

The brief is steerable from the conversation. `cascade_brief get_config / set_config`
read and mutate `briefing_preferences`, so the user can say "make competitor-scout
daily" or "check architecture/memory/evals weekly" or "recalibrate the weekly to focus
less on X" and the change **persists across sessions**. The config carries three knobs:

- **`cadence`** — named cadence → frequency (`{ competitor_scout: 'daily',
  architecture_memory_evals: 'weekly' }`).
- **`scope`** — what the brief looks at (themes / lenses / source filters).
- **`trigger_mode`** — `manual` | `offer` | `auto` — how a future catch-up hook would
  nudge.

`set_config` shallow-merges (so a request only touches the keys it names), and
**org-scoped** writes are **admin-guarded** (executive / engineering_lead) and fail
closed even under `service_role` — the same guard pattern as `cascade_drift` /
`cascade_resurface`. Default scope is `user` (your personal config).

## 5. The deferred boundary — session-invoked only, no auto-execution (and why)

This is the most important constraint to state loudly. **The MVP is session-invoked
only.** Cadences are **config-only**: they are stored in `briefing_preferences` and
honored the next time you run `/cse:chief`, but **nothing auto-executes them.** No
daemon, no cron fires a brief or a scout cadence.

Why deliberately stop here: composing a brief and running scout cadences costs model
tokens. An auto-firing daemon that runs them on a schedule is exactly the shape of a
**surprise-billing** incident (the codebase has a scar here — silent daemon API-key
billing). The config layer is built and *ready* so that turning on auto-execution later
is a small, deliberate, well-guarded step — but until that guard exists, the brief only
runs when a human asks. `trigger_mode: 'auto'` is a stored intent, not a live behavior.
Auto-execution is the explicit fast-follow.

## 6. ~80% reuse — orchestration over existing primitives + one new ranker

`/cse:chief` is mostly **assembly**, not new machinery. It is a **persona** + **one
configurable trigger** orchestrating primitives that already exist:

- `cascade_resurface` — backlog re-engagement + the engage write-back (seen/acted).
- `cascade_scout` — fresh harvest when the backlog needs new input.
- `cascade_drift` / `/cse:reeval` — strategy-drift and informed-work drift checks.
- the **artifact spine** — `create/get/update_artifact` for the versioned thread.
- `get_recent_activity` / `cascade_list_packages` — finding the prior thread + roadmap.
- the action catalog — `create_package`, `link_knowledge`, `log_decision` — the verbs
  the conversation reaches for.

The only genuinely **new** logic is the **assumption-pressure ranker** inside
`cascade_brief` (§1) — the pure scoring that turns "what's in the backlog" into "what
pressed on your plan." Everything else is a chief-of-staff persona wiring known parts
together. That's the leverage: a high-value standing surface built almost entirely from
primitives already in the substrate.

## Deferred (NOT in this MVP)

- **Auto-execution of cadences** — the daemon/cron path that would fire briefs and
  scout runs on the stored cadence. Gated behind a surprise-billing guard (§5).
- **`trigger_mode: 'auto'` as live behavior** — stored and validated; the nudge hook
  that would honor it is later.
- **Org-scoped brief defaults at scale** — admin write is built; the richer org-policy
  surface (per-role scope, shared cadences) is later.
- **Semantic candidate dedup** — the brief reuses the resurface backlog scoping; the
  pgvector "same idea, different words" upgrade is shared future work with resurface.
- **A web / voice chief-of-staff surface** — a deferred *client* of this same
  `cascade_brief` core + thread artifact; the data already lives on the substrate.
