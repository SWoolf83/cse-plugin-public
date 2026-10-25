---
name: weekly-review
description: Reconcile a week of real work against your OKRs and roadmap — reads git + the ledger, maps work to objectives, and writes the result back.
when_to_use: "The RECONCILIATION ritual — the counterpart to /cse:weekly (which sets the week ahead). Point it at a time window (default: last 7 days) and it (1) CATCHES UP by reading BOTH git and the package ledger, because the ledger under-captures real engineering and git is the actual proof-of-work; (2) FITS that work against your active objectives and roadmap verticals, proposing links; (3) SURFACES emergent work with no OKR home as candidate new objectives — this is how new strategy gets noticed; (4) LEARNS from your corrections, recording each 'no, that belongs there' as a durable reclassification prior so it routes the same pattern correctly next time; (5) WRITES the approved result back — links packages, refreshes progress, sets honest overrides, drafts new objectives, advances roadmap items. Nothing auto-applies: it proposes, you judge, then it writes. Runs weekly or more often. Triggers on 'weekly review', 'reconcile the week', 'what did we ship and where does it ladder', 'catch up on last week and update the OKRs', 'week in review'."
argument-hint: "[period — e.g. '7d' (default), '14d', or 'YYYY-MM-DD..YYYY-MM-DD'] [--write to skip straight to execution after approval]"
allowed-tools: Bash, Read, Write, Edit, Agent, AskUserQuestion, cascade_generate_period_report, cascade_get_unified_projects, cascade_manage_objective, cascade_okr_reclassify, cascade_get_org_context
---

# /cse:weekly-review — Reconcile the work against the plan

The **reconciliation ritual**. `/cse:weekly` sets the week *ahead*; this closes the loop on the week *behind* — it looks at the work that actually happened and makes your OKRs and roadmap tell the truth about it.

The whole point, in one line:

> **Stop trying to make work *push* into OKRs. Reconcile work *against* OKRs — in conversation with the human — and write the result down.**

This is not a cron and not a hook. "Did this week's work move objective X?" is a *judgment*, so this is a **conversation**: the agent does the digging, the human does the judging, and the OKR/roadmap objects become the source of record the two of them maintain together.

---

## Operating philosophy (read first — this shapes every call)

- **OKRs are a tool for focus, not dogma.** The goal is a high-level view the human can *have a discussion on* — "are we moving the needle?" — not a compliance ledger. Never invent movement to make a number look good. An honest 0% is more valuable than a vanity 40%.
- **Git is the real proof-of-work; the package ledger under-captures it.** In practice a large fraction of shipped engineering (releases, fixes, infra) never becomes a package — it lives only in commits. **Always read both.** If you only read the ledger, you will miss most of the week.
- **Linking work ≠ moving the score.** When an objective has key results, progress follows the KR *values*, not the linked-package count. Completed packages can sit under a 0% objective forever because the KR is a milestone nobody advanced. Say this out loud, and treat KR-value updates / progress overrides as the explicit judgment step — never a silent side effect.
- **Team-aware, not team-bound.** Today it may be one or two people. When others are in the org, attribute their work and let their personas/system prompts shape framing — but never let ceremony for a larger team slow down a two-person reconciliation. Right-size to who's actually here.
- **Propose, then write.** Every mutation below is shown as a proposal and confirmed before it runs. Everything written is reversible (unlink, clear_override, archive).

---

## Phase 0 — Bootstrap the window

1. Parse `$ARGUMENTS` for the period. Default `7d`.
   ```
   Bash(date +%Y-%m-%d)                     → TODAY (to_date)
   Bash(date -v-7d +%Y-%m-%d)               → FROM (7d default; adjust for 14d / explicit range)
   ```
   For an explicit `YYYY-MM-DD..YYYY-MM-DD`, split on `..`.

2. Note whether `--write` was passed (skip the "hold or write?" gate at the end and go straight to execution once the human approves the mapping).

---

## Phase 1 — Catch up (BOTH sources, always)

Run these together — they are independent:

1. **The package ledger rollup:**
   ```
   cascade_generate_period_report(from_date: FROM, to_date: TODAY, rollup_only: true)
   → { rollup: { packages_completed, tasks_completed, decisions_made, ... }, team_attribution }
   ```
   Then pull the named completed packages (the linkable units):
   ```
   cascade_generate_period_report(from_date: FROM, to_date: TODAY, include_sections: ["packages"])
   → packages[] with { id, title, package_type, result_summary }
   ```

2. **Git — the ground truth.** Read the actual shipped work; this is where most of the proof lives.
   ```
   Bash(git log --all --since="<FROM>" --oneline | wc -l)                          → COMMIT_COUNT
   Bash(git log main --since="<FROM>" --no-merges --pretty=format:"%s")            → shipped subjects
   Bash(git log main --since="<FROM>" --pretty=format:"%s" | grep -oE '^[a-z]+\([^)]+\)' | sed -E 's/^[a-z]+\(//; s/\)//' | sort | uniq -c | sort -rn)   → work grouped by scope
   ```
   For a large/noisy window, delegate the clustering to a subagent:
   > `Agent(description: "Cluster week's commits", prompt: "Group these commit subjects into coherent themes of shipped work; return {theme, commits[], one-line what-shipped}. <paste subjects>")`

3. **The current OKR/roadmap state to reconcile against:**
   ```
   cascade_get_unified_projects(status: "active", limit: 50)
   → objectives with { id, title, progressPct, packageCount, hasKRs }
   ```
   Note the average progress and, especially, objectives with `hasKRs: true` but `packageCount: 0` — those are the ones the week's work is probably meant to fill.

4. **Build the catch-up snapshot** — a short table contrasting *what the ledger thinks happened* vs *what git proves happened* vs *where objectives stand*. Lead with the honest diagnosis (e.g. "shipped a release + N features; objectives moved ~0% because nothing is linked").

---

## Phase 2 — The fit (propose the mapping)

Map each coherent cluster of real work to its objective home. Produce a **reconciliation table**, not a wall of text:

| Shipped work (from git + ledger) | Proposed objective / KR home | Now at | Proposed action |
|---|---|---|---|
| {cluster} | {objective title} | {pct} | link `<pkg>` (role) → refresh |

Rules:
- Prefer linking a **real package** when one exists; when the work is git-only with no package, say so — note it needs a package created first (a follow-up, not a silent skip).
- One cluster may legitimately serve multiple objectives (`objective_packages` is many-to-many). Don't over-link; pick the primary home + at most one or two contributes.
- Mark the **flagship match** — the objective whose sentence the week's headline work literally fulfills — explicitly. That's the one whose flat progress is most telling.

---

## Phase 3 — Surface new patterns (candidate objectives)

This is where new strategy gets *noticed*. List clusters of real, shipped work that have **no objective to belong to**. For each, say what it is and why it might be strategic — then let the human decide. This is exactly how "Vertical Packs" and "TFW Films" got caught: they were the biggest emergent themes and had no OKR home.

Do **not** create objectives unilaterally. Present them as candidates and ask.

---

## Phase 4 — The human judges (the learning step)

Present the reconciliation table + the candidate objectives and ask for corrections in plain language. Use AskUserQuestion for the big forks (which candidates to promote; altitude check), and free text for "no, X belongs under Y instead."

**Every correction is a lesson, not just an edit.** When the human re-homes machine-proposed work, record it so the next run routes the same signal correctly without being told again:
```
cascade_okr_reclassify(
  action: "reclassify",
  correction: "<the human's words>",
  to_theme / key_result_id: <destination>,
  package_ids / link_ids: <the selector>,
  apply: true
)
```
`apply` defaults false (dry). Only set `apply: true` after the human confirms. This queues a suggester prior the human accepts on `/objectives`; from then on the routing improves on its own.

---

## Phase 5 — Write it back (proposed → confirmed → executed)

On approval (auto-proceed if `--write`), execute the mutations. All reversible.

1. **Create promoted new objectives** (only the ones the human blessed):
   ```
   cascade_manage_objective(action: "create", title, description, objective_type: "okr", timeframe_start, timeframe_end)
   cascade_manage_objective(action: "add_kr", objective_id, kr_title, target_value, current_value, unit, kr_type, metric_family)
   ```
   Write outcome-shaped KRs. Early milestone KRs are `target 1 / current 0` — they *should* read 0% until the outcome is real.

2. **Link the work:**
   ```
   cascade_manage_objective(action: "link_package", objective_id, package_id, role, [key_result_id])
   ```

3. **Refresh progress** on every touched objective:
   ```
   cascade_manage_objective(action: "refresh_progress", objective_id)
   ```

4. **Handle the KR-vs-package truth honestly.** If `refresh_progress` returns `computedPct: 0` despite completed packages, that is correct (KRs dominate and aren't met). Do **not** paper over it. Where real substrate genuinely shipped toward the outcome, offer a **defensible progress override with reasoning** — and tell the human the number and how to change it:
   ```
   cascade_manage_objective(action: "set_override", objective_id, override_pct, override_reason: "<what shipped> ; <what outcome is still pending> ; adjust freely")
   ```
   Prefer overrides only where you can defend the number out loud. When in doubt, leave the honest computed value and say why.

5. **Advance the roadmap.** For each vertical the week clearly moved (`roadmap_verticals`: pwa, daemon, menu-bar, mobile, cli, cse-harness), propose item status changes and now/next/later horizon shifts. (Roadmap writes go through the roadmap actions layer; when a direct tool isn't available, emit the proposed changes as a checklist for the human to apply on `/roadmaps`.)

---

## Phase 6 — Close the loop

1. Log the reconciliation as a decision:
   ```
   Bash(node bin/cascade.js log-decision --title "Weekly reconciliation: {FROM}..{TODAY}" --chosen "{what was linked + new objectives promoted}" --reasoning "{one-line: what shipped and where it laddered}" --tags "weekly-review,reconciliation,okr" --category "strategic" --significance "standard")
   ```

2. Report a tight summary: objectives touched, packages linked, new objectives created, overrides set (with numbers), roadmap items proposed, and reclassification priors queued.

3. Point the human at `/objectives` and `/roadmaps` to see it move, and remind them: **re-run anytime — weekly is the floor, not the ceiling.**

---

## Relationship to the other OKR skills

| Skill | Role |
|---|---|
| `/cse:weekly` | Sets the week **ahead** — priorities, focus, delegation. |
| `/cse:weekly-review` | **This.** Reconciles the week **behind** — real work → OKRs/roadmap. |
| `/cse:okr-intake` | The one-time **onboarding** lane — reads the whole orphan-package corpus at once. |
| `/cse:chief` | The standing strategy conversation — where the world moved against the plan. |

`/cse:weekly-review` is the recurring heartbeat between the big one-time `okr-intake` and the forward-looking `weekly`. It keeps the source of record true, one window at a time.
