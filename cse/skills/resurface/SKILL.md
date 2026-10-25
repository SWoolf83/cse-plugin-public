---
name: resurface
description: Use when you want to re-engage your Scout/knowledge backlog — a themed, freshness-ranked re-engagement session with snooze/dismiss/act.
when_to_use: Surfacing v1 — re-engage the knowledge backlog (the /cse:ingest + Scout knowledge packages) as a themed, freshness-ranked conversation instead of a stale firehose. On demand, surface knowledge packages grouped by theme as curator cards (what it is / why it matters / why-now), capped by a budget, ranked so what's NEW or DIFFERENT rises and what you've seen/dismissed or that merely repeats a recent viewpoint sinks. Engage (open/snooze/dismiss/act) writes state back so it's a two-way loop — dismissed items disappear, snoozed hide until due, seen sink. Interactive-only; never on cron/daemon. See DESIGN.md.
argument-hint: "[<theme>: a scout-run id, a lens, or a tag — or nothing for the whole backlog]"
allowed-tools: AskUserQuestion, Read, cascade_resurface, cascade_create_package, cascade_link_knowledge, cascade_get_specs, cascade_list_packages
---

# /cse:resurface — Surfacing v1 (re-engage the knowledge backlog)

A research firehose that you never revisit is just noise that cost money. Scout and
`/cse:ingest` keep landing knowledge packages; the active loop (`/cse:link`,
`/cse:reeval`) acts on the ones you've linked to work. **Surfacing** is the missing
revisit step: on demand, bring the backlog back as a small, freshness-ranked,
themed shortlist of curator cards — and let you act on each one, writing your
engagement back so the same items don't keep nagging.

> **This is interactive-only.** `/cse:resurface` runs when you ask for it. There is
> no scheduled / cron / daemon trigger (decision `fb17e876`). The web/voice
> re-engagement surface is a deferred client of this *same* data. See `DESIGN.md`.

> **The novelty judgment is cheap by design.** A pure heuristic (recency + your
> engagement + source/author/tag overlap) pre-ranks the WHOLE backlog server-side
> with **no LLM call**. You — the agent — confirm novelty **only on the returned
> budget-capped shortlist**, so token cost is bounded to the shortlist size. The
> deeper pgvector semantic dedup is the v2 upgrade (`e4ecd28f`).

---

## Phase 0 — Resolve the theme (optional)

If the user passed an argument, treat it as a **theme filter**:

- looks like a uuid → `scout_run_id`
- a known lens preset or short phrase → `lens`
- otherwise → `tag`

If nothing was passed, surface the **whole backlog** (no theme filter). When you're
unsure which dimension an argument is, just pass it as `tag` first; if the shortlist
comes back empty, retry as `lens`, then `scout_run_id`.

---

## Phase 1 — Pull the freshness-ranked shortlist

Call the tool — it does the freshness ranking, dismissal-exclusion,
snooze-hiding and the budget cap for you:

```
cascade_resurface({ action: "list", scout_run_id?, lens?, tag? })
```

What you get back:

- `items[]` — already **freshness-ranked desc** and **capped at the budget**
  (`default_budget`, the `e4ecd28f` tunable seam). Dismissed items are gone;
  snoozed items are hidden until their `snooze_until`.
- Each item: `id`, `title`, `what`, `why`, `source`, `author`, `tags`,
  `scout_run_id`, `lens`, `freshness`, and the current `engagement`
  (`status`, `surfaced_count`, `last_surfaced_at`, `snooze_until`).
- `backlog_count` (how many candidates the theme matched) and `theme`.

If `items` is empty, say so plainly (e.g. "nothing fresh in this theme — try a
different lens, or you've engaged everything recently") and stop.

---

## Phase 2 — Confirm novelty ON THE SHORTLIST ONLY

Now do the one judgment the heuristic can't: read the shortlist's `what`/`why` and
spot items that **repeat a viewpoint** of another item on the shortlist (or of
something the user has clearly already seen). This is a quick read over **≤ budget
items** — never the whole backlog, never a per-item tool call.

For any near-duplicate, **annotate the card** rather than dropping it:
"⟳ same idea as *<other title>* you saw" — and let the heuristic's down-weight (it
already sank repeats) stand. Don't re-rank; just annotate.

---

## Phase 3 — Present the curator cards, grouped by theme

Group the shortlist by `lens` (or `scout_run_id` when no lens), and render each item
as a **curator card**:

```
▸ <title>                                         (freshness <score>)
  what it is   — <what>
  why it matters — <why>
  why now      — <recency / your engagement, e.g. "new this week" or
                 "you snoozed this 3 weeks ago, now due">
  source       — <source> · <author>   tags: <tags>
  [⟳ repeats: <annotation if any>]
```

Then offer the **engage actions** per card (use `AskUserQuestion` for a batch, or
walk them one at a time):

| Action      | What it does                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------- |
| **open**    | Go deeper now → hand to **`/cse:link`** (link this knowledge to live work) or **`/cse:reeval`** (re-check work this knowledge informs). |
| **snooze**  | Hide it until a date you pick → `cascade_resurface engage status='snoozed' snooze_until=<ISO>`. |
| **dismiss** | Drop it for good → `status='dismissed'` (excluded from every future shortlist).                |
| **act**     | It's worth doing → **promote** to an `idea` package (`cascade_create_package`) or hand straight to **`/cse:spec`**; then mark `status='acted'`. |

---

## Phase 4 — Write engagement back (the two-way loop)

This is what makes it a loop rather than a re-print. **Every** card you actually
present, mark **seen**; whatever the user chooses, record it:

```
# you showed it → bumps surfaced_count + last_surfaced_at
cascade_resurface({ action: "engage", package_id, status: "seen" })

# the user's choice
cascade_resurface({ action: "engage", package_id, status: "snoozed", snooze_until: "<ISO>" })
cascade_resurface({ action: "engage", package_id, status: "dismissed" })
cascade_resurface({ action: "engage", package_id, status: "acted" })   # after promote / /cse:spec
```

`engage` org-guards the package and **shallow-merges** `type_data.engagement`,
preserving sibling keys (gate_runs / drift_signals / scout_run) — no migration.

On a **re-run** the loop shows: dismissed items absent, snoozed items absent until
their `snooze_until` passes, and seen/acted items ranked lower. That's the whole
point — the firehose becomes a backlog you can actually clear.

---

## Routing summary

- **open** → `/cse:link` (propose knowledge→work edges) or `/cse:reeval` (drift-check informed work)
- **act**  → `cascade_create_package` (an `idea` package) or `/cse:spec` (spec it now)
- **snooze / dismiss / seen** → `cascade_resurface engage`

Always end by stating what you marked (e.g. "marked 5 seen, 1 snoozed to Jul 1,
2 dismissed, 1 promoted to an idea package").
