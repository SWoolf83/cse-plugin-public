---
name: reeval
description: Use when you ask to check a work package for drift — re-evaluates its linked 'informs' knowledge against its spec and surfaces drift.
when_to_use: Active Knowledge RE-EVALUATE (third stage of the loop). Pulls a package's connected 'informs' knowledge via the INJECT path (clearance-filtered by your real role), judges each item against the package's own spec assumptions + must-haves + intent, records a drift signal for every contradiction (ALL severities), then surfaces only medium+ for an in-session accept/dismiss. Interactive-only — invoked when you ask ("check this package for drift"); never on cron/daemon. Distinct from /cse:drift (STRATEGY drift: documented direction vs decision patterns).
argument-hint: "[<package-id> | <nothing to pick from active work>]"
allowed-tools: Bash(node *cascade.js *), Read, AskUserQuestion, cascade_list_packages, cascade_get_context, cascade_drift, cascade_pull_package, cascade_get_specs, cascade_create_package, cascade_link_knowledge
---

# /cse:reeval — Active Knowledge (RE-EVALUATE)

A deployed decision is only honest if it is kept honest against a world that kept
changing. PROPOSE linked knowledge to work; INJECT delivered that knowledge to
whoever worked the package. **RE-EVALUATE** closes the circle: when a package's
connected knowledge now **contradicts the package's own assumptions**, record a
drift signal and bring the consequential ones to a human.

> **This is interactive-only.** `/cse:reeval` runs when the user asks for it. There
> is no scheduled / cron / daemon trigger (decision `fb17e876`). See `DESIGN.md`.

> **Not to be confused with `/cse:drift`**, which detects *strategy* drift
> (documented org direction vs. actual decision patterns). This skill detects
> *package-vs-connected-knowledge* drift on a single work package.

This is **provider-neutral**: nothing in the judgment path hardcodes a model or
provider. The agent judgment is "does this knowledge contradict this assumption,
and how badly" — see `DESIGN.md` for why v1 is agent-judgment (embeddings deferred).

---

## Phase 0 — Resolve the target package

Parse `$ARGUMENTS`:
- A **package id** → use it directly.
- **Empty** → list active work and let the user pick:
  ```
  cascade_list_packages { status: "executing", limit: 30 }
  cascade_list_packages { status: "completed",  limit: 30 }
  ```
  Re-evaluation is most valuable on **executing** or recently **completed** work —
  a deployed decision whose world may have moved. Present candidates (title +
  one-line) and ask which to re-evaluate.

---

## Phase 1 — Pull the connected knowledge via the INJECT path (clearance-filtered)

**Do NOT re-implement clearance.** Reuse the existing inject path verbatim:

```
cascade_get_context { package_id: "<the package id>" }
```

This returns the package's connected `informs` knowledge nodes already
**clearance-filtered by your REAL org role** (the same `clearance.ts` /
`use_policies` resolution Scout and INJECT use). The response shape:

```json
{ "mode": "inject", "package_id": "…", "role": "engineer", "clearance": "L1",
  "count": N, "excluded_count": M,
  "knowledge": [ { "id": "<knowledge_node_id>", "title": "…",
                   "what_it_is": "…", "why_it_matters": "…",
                   "key_points": ["…"], "provenance": …,
                   "rationale": "…", "clearance_tier": "L1" } ] }
```

**Only the items in `knowledge[]` may be judged.** Anything above your clearance
was already excluded by the inject path (`excluded_count`) and **must never be
considered** — do not try to fetch it. If `count` is 0, there is no linked
knowledge: tell the user to run `/cse:link` first, and stop.

> If a card's body is too thin to judge a contradiction, you MAY fetch that one
> knowledge package's fuller body (`cascade_pull_package { package_id: <knowledge_node_id> }`)
> — but you are still bounded by what inject surfaced: never judge a node that was
> NOT in `knowledge[]`.

---

## Phase 2 — Load the package's own assumptions

Load what the knowledge is judged *against* — the package's spec
`assumptions[]` + `must_haves` + intent/description:

1. Pull the package: `cascade_pull_package { package_id: "<the package id>" }` —
   read its `description`, `type_data.must_haves`, and any linked spec.
2. If the package has a linked spec, load it: `cascade_get_specs { … }` and read
   its `assumptions[]` (`text` + `confidence`) and `mustHaves`.
3. **Fallback:** a package with no spec falls back to its `description` / intent —
   judge the knowledge against those instead.

Assemble the list of **assumptions** (each spec assumption is one; treat
must-haves and the intent as additional assumptions the work rests on).

---

## Phase 3 — Judge each knowledge item for contradiction

For **each** knowledge card in `knowledge[]`, compare it against **each**
assumption. For every genuine contradiction, emit:

- `knowledge_node_id` — the card's `id` (provenance: traces back to the source).
- `assumption_affected` — the *specific* assumption text it contradicts.
- `severity` — `low` | `med` | `high`:
  - **high** — contradicts a critical must-have / a load-bearing assumption; the
    work may now be wrong.
  - **med** — contradicts a standard assumption; worth a human's attention.
  - **low** — a minor / stylistic tension; record it, but don't nag.
- `summary` — one line: what the knowledge says vs. what the package assumed.
- `rationale` — why this is a contradiction (cites the card's what-it-is /
  why-it-matters).

A knowledge item that does **not** contradict any assumption yields **no** signal.
Be conservative: only flag genuine contradictions, not mere relatedness.

---

## Phase 4 — Record ALL severities (dedup-aware)

For **every** contradiction found (low included), record it:

```
cascade_drift {
  action: "record",
  package_id: "<the package id>",
  knowledge_node_id: "<card id>",
  severity: "low" | "med" | "high",
  assumption_affected: "<the assumption text>",
  summary: "<one line>",
  rationale: "<why>"
}
```

The tool **dedups** automatically: a second run that finds the same
`(package, knowledge_node, assumption)` tuple with an existing **open** signal is
skipped (`deduped: true`) — re-running `/cse:reeval` on unchanged data produces no
duplicate open signals. Each `record` response includes `surfaced: true|false`
(whether it meets the medium+ surface threshold).

**Severity tempering:** ALL severities land on the record; only medium+ are
surfaced in the next phase. Low signals stay on the package, un-nagged — the
record without the interruption.

---

## Phase 5 — Surface medium+ for a human decision

Collect the recorded signals where `surfaced: true` (severity **medium or high**).
For each, present it and gate on the human via **AskUserQuestion**:

> Drift on **<package title>**
> Knowledge: **<card title>** (<provenance>)
> Contradicts assumption: *<assumption_affected>*
> <summary> — <severity>
>
> Accept this drift (the assumption may be wrong / needs revisiting), or dismiss
> it (not a real contradiction)?

Options: **Accept** / **Dismiss** (one question per surfaced signal, or batch them).

Low-severity signals are **not** presented — they are on the record for a reviewer
who wants the full picture, but they do not interrupt.

---

## Phase 6 — Act on each decision

**Dismiss** is the simple path; **accept** is now *actionable* — accepting a
contradiction turns it into the next artifact instead of merely flipping a status.

### 6a. Dismiss

```
cascade_drift { action: "set_status", package_id: "<pkg>", signal_id: "<id>", status: "dismissed" }
```

### 6b. Accept → choose what it produces (act-on-accept)

For each **accepted** med+ signal, ask the human (via **AskUserQuestion**) what the
accept should produce:

> You accepted this drift. What should it produce?
> - **Change-proposal package** *(default)* — spawn a triage-first `idea` package
>   so a human can decide whether to build the fix (it can flow to `/cse:spec` or
>   `/cse:delegate`).
> - **Question** — write a lighter `drift_question` on the work package's thread to
>   raise the doubt without spawning work.
> - **Acknowledge only** — record the accept; create nothing else.

Then run the chosen branch. (Interactive-only — never on a cron/daemon.)

#### Branch: PACKAGE (default)

1. **Draft** from the signal (the agent writes these):
   - `title` — e.g. `Drift: <assumption_affected> may no longer hold`
   - `description` — the contradicted assumption + the knowledge rationale (cite the
     card) + a concrete **suggested change**.
2. **Create the triage-first idea** (`cascade_create_package` starts every package
   in **draft** — triage-first, NOT auto-committed):
   ```
   cascade_create_package {
     package_type: "idea",
     title: "<drafted title>",
     description: "<assumption + knowledge rationale + suggested change>",
     type_data: {
       sourced_from_drift: "<signal_id>",
       work_package_id: "<the re-evaluated package id>",
       assumption_affected: "<assumption text>",
       knowledge_node_id: "<the contradicting card id>",
       suggested_change: "<one-line change>"
     }
   }
   ```
   Keep the returned **new idea package id**.
3. **Link knowledge → change** (reuse the active-knowledge edge tool — it always
   writes an `informs` edge from the source knowledge node to the target package;
   here the target is the new idea):
   ```
   cascade_link_knowledge {
     knowledge_id: "<the contradicting card id>",
     package_id: "<the new idea package id>",
     rationale: "<why this knowledge motivates the change>"
   }
   ```
4. **Stamp the signal** with the work↔change link + provenance:
   ```
   cascade_drift {
     action: "accept", package_id: "<pkg>", signal_id: "<id>",
     accept_action: "package", spawned_package_id: "<the new idea package id>"
   }
   ```

#### Branch: QUESTION

1. **Draft** a single, sharp question from the contradiction.
2. **Stamp + raise** (the tool writes a `drift_question` thread event on the WORK
   package — no new package, no route):
   ```
   cascade_drift {
     action: "accept", package_id: "<pkg>", signal_id: "<id>",
     accept_action: "question", question: "<the drafted question>"
   }
   ```

#### Branch: ACKNOWLEDGE

```
cascade_drift { action: "accept", package_id: "<pkg>", signal_id: "<id>", accept_action: "acknowledge" }
```

> **Double-spawn safe:** `accept` is idempotent — re-accepting an
> already-accepted signal returns its recorded outcome and creates nothing. If a
> response comes back `already_accepted: true`, do NOT re-create the package/edge.

### 6c. Report

- N contradictions found (by severity), all recorded.
- The medium+ ones surfaced, and for each: **dismissed**, or **accepted →**
  package (with the spawned idea id) / question / acknowledge.
- For each spawned idea: it is **draft** (triage-first) — point the human to
  `/cse:spec` or `/cse:delegate` to take it forward.
- A pointer: `cascade_drift { action: "list", package_id: "<pkg>" }` shows the full
  drift record — each accepted signal carries its `action` + `spawned_package_id` |
  `question` + `accepted_at` (full drift→artifact provenance).

> See `DESIGN.md` for the act-on-accept model and the remaining deferred
> fast-follows (auto-spec/delegate, standalone act-on-old-signal, the
> spec_questions route, embeddings, web UI, cron).
