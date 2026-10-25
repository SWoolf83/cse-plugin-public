---
name: verify-handoffs
description: Claim what the session-start menu lists — handoffs, queue items, findings — one, several, or --all, and grade each with cse-verifier.
when_to_use: A fresh session opened with a "▶ CLAIMABLE" menu, or the statusline shows ▸N, and you want to act on it; you want to drain everything the badge counts; you want one specific entry (including a stale, >14d, or regenerating one) run by key; or you need a dangling queue lease released back to the pool.
argument-hint: "[--all | <key> [<key> …] | --older | --release <key> …]"
allowed-tools: Read, Glob, Grep, Bash(git *), Bash(ls *), Bash(node *cascade.js *), Task, AskUserQuestion, Write, mcp__cascade-api__cascade_handoff, mcp__cascade-api__cascade_create_package, mcp__cascade-api__cascade_assign_work_item, mcp__cascade-api__cascade_execution_queue
---

# Verify Handoffs (`/cse:verify-handoffs`)

The SessionStart hook **lists** claimable work and consumes nothing. This skill is the only
thing that acts on that list: it claims what you name, dispatches each claimed item to a
grader that cannot patch what it grades, drives every claim to a terminal state, and returns
**one** report.

It is not handoff-only. The menu is a single list over **every claimable kind** — the one
definition lives in `src/daemon/hooks/claimable.ts` and both the statusline badge (`▸N`) and
the SessionStart menu derive from it. This skill claims from the same list, so what the badge
promises is exactly what this skill can retire.

| kind tag | what the key is | claimed through |
|---|---|---|
| `[handoff]` | the store key `<subject_kind>__<subject_key>-<hash>` | `cascade_handoff { action: "claim" }` |
| `[queue]` | `execution_queue.id` (a uuid) | `cascade_execution_queue { action: "claim" }` — the lease RPC |
| `[finding]` | the finding **package** id (a uuid) | promoted with `cascade_execution_queue { action: "enqueue" }` |

Three rules frame everything below:

- **Selection is always an explicit claim.** Never infer which entry to run from `cwd`. That
  approach was rejected on purpose — the PWA terminal often starts at the system root, so a
  cwd-keyed lookup misses the handoff entirely. `project_path` inside a payload is a `cd` hint
  and a "which repo's HEAD" hint, never a selector.
- **Never auto-run.** With no arguments, print the current menu and stop. Running unclaimed
  work because the session just started is exactly the consume-on-sight bug the injection
  redesign removed.
- **Never leave a claim open.** Every claim you take reaches a terminal state before the report
  is emitted — completed, or released back to the pool. See Phase 3.5; this is the half that
  has never existed.

---

## Phase 0 — Parse the claim

| Argument | Meaning |
|---|---|
| `--all` | Every **batch-eligible** entry (see Phase 1). The common case. |
| `<key> [<key> …]` | Exactly these keys, whatever their kind or state — the only way to run a stale, demoted or regenerating entry. |
| `--older` | **List** the demoted (>14d) handoffs with keys and ages. Runs nothing. |
| `--release <key> [<key> …]` | Release those **queue** items back to `queued` and stop. Runs nothing, grades nothing. |
| *(none)* | Re-render the menu, remind the user of the forms, stop. |

Keys are the `key:` lines under each menu entry. A key you cannot find in the store, the cache
or the queue is an error, not a fuzzy match — say which keys are unknown and list the current
ones. You do **not** need the user to tell you the kind: a store key resolves against
`~/.cascade/handoffs/pending/`, and a uuid resolves against the queue (`action: 'list'`) or,
failing that, the finding rows in the cache.

## Phase 1 — Resolve the claimed set

**Handoffs** — read the store directly; it is local, auth-free and cwd-independent:

```
$CASCADE_HANDOFF_ROOT/pending/<key>.json      (default root: ~/.cascade/handoffs)
```

Each file carries `note_md`, `test_plan`, `project_path`, `related_memory`,
`related_packages`, `enqueued_tests`, `subject_kind`/`subject_key`, `written_at`, and the
durable row `id`. Read the body **before** claiming — the claim response does not return it.

**Queue items and findings** — the menu's copy came from the local cache
`~/.cascade/claimable.json`, written out of band by the detached refresher. The cache is a
*listing* snapshot, never a claim ledger: before claiming a uuid, re-read the live row with

```
mcp__cascade-api__cascade_execution_queue { action: "list", status: "queued", limit: 50 }
```

so you are claiming against the queue as it is now, not as it was up to 30 minutes ago.

**`--all` is exactly the badge.** It covers the **badge-eligible** set and nothing else:
pending handoffs, plus `queued`, non-regenerating queue rows. That is deliberate — after a
clean `--all` the badge reads zero, because the two are the same set by construction. Four
exclusions apply to `--all` and only to `--all`:

- **Stale** — the injection layer compared the handoff's subject against local facts (the
  installed `cse` plugin version, or the repo's git HEAD for a `commit` subject) and the
  subject demonstrably moved on. An `unknown` verdict is **not** stale; abstention beats a
  guess.
- **Demoted** — written more than **14 days** ago. Not archived, not deleted, still pending.
- **Regenerating** — architecture-freshness re-verify orders, marked `↻ regenerates — listed,
  not counted` in the menu. Clearing one only means the next commit re-emits it, so a batch
  that swept them would never finish.
- **Findings** — marked `· listed, not counted`. A finding is not runnable work yet; it
  becomes claimable work when it is enqueued (Phase 3c).

All four are **skipped in batch mode and reported as skipped-with-reason**, and all four
remain individually claimable by key. The reason for the stale exclusion is the migration-346
scar: *an obsolete check that PASSES is more dangerous than one that fails*, because a passing
test encodes a wrong belief and closes the file forever. A stale handoff's self-test may still
go green against a world it no longer describes. Running it needs a human saying its key out
loud.

## Phase 2 — Choose the run order

**You pick the order and you state why.** There is no fixed sequence. Order by whichever of
these the claimed set actually justifies, and say which you used in the report header:

- **Cheap-and-fast first** — a 20-second `--version` check ahead of a full build, so a
  broken environment surfaces before you spend ten minutes on the expensive one.
- **Dependency order** — if one entry's subject is the thing another's test depends on
  (a plugin version verified before the skill that ships in it), run the dependency first.
- **Subject-clustered** — several entries against the same repo or package run together,
  so shared setup happens once and their results are read side by side.

Newest-first is a fallback, not a default. If two orderings are equally defensible, pick one
and move on — the rationale line matters more than the choice.

## Phase 3 — Claim, then dispatch to `cse-verifier`

For each entry, in the order you chose. **Claim as you take it**, not at the end.

### 3a. Handoffs

**1. Claim it.** This closes *both* halves — the local file archives to `consumed/` and the
durable `session_handoffs` row flips to `status='consumed'` with `consumed_at`:

```
mcp__cascade-api__cascade_handoff { action: "claim", key: "<store key from the menu>" }
```

`id` (the row id) works instead of `key`. A handoff left pending after you have acted on it
re-injects into the next session as work already done. If the claim reports it archived
locally but found no durable row id, say so — a half claim is a fact worth reporting, not a
failure to hide.

### 3b. Queue items — take the real lease, never a bare UPDATE

```
mcp__cascade-api__cascade_execution_queue {
  action: "claim",
  item_id: "<the uuid key from the menu>",
  session_token: "<this session's id, or the terminal token>",
  ttl_minutes: 30
}
```

- `session_token` is **required** — the claim is refused without it.
- The tool routes to the `claim_queue_item` RPC (migration 282), which is a single atomic
  conditional `UPDATE … RETURNING`. **Never write `queue_status` directly.** Two sessions
  racing the same row cannot both win: the loser's UPDATE matches zero rows and it gets
  `{ success: false, claimed: false, message: "Item is already validly claimed, terminal, or does not exist." }`.
  Treat that response as a **normal outcome, not an error** — another session holds it; drop
  it from your set, say so in the report, and move on.
- Omitting `item_id` claims the **next** eligible row for the org instead
  (`claim_next_queue_item`), and `claim_trigger: "after_restart"` restricts that next-claim to
  the restart queue. Use the explicit `item_id` form when the user named a key.
- `ttl_minutes` (default 30) is the lease TTL. It is what makes a dead session's item
  **reclaimable rather than lost**: a claim older than the TTL is re-claimable by anyone. It
  is a backstop, never a plan — see Phase 3.5.
- **Keep the `item` the claim returns.** It is the whole row (`target_package_id`,
  `target_bundle_id`, `trigger`, `priority`, `position`). After a `complete` the row is
  terminal, and a release needs those fields to re-enqueue the target.

These RPCs shipped with migration 282, are atomic and lease-safe, and **have never once been
called**. This skill is their first consumer — which is precisely why the queue accumulated 12
unclaimed rows, the oldest from 2026-07-02.

### 3c. Findings

A finding is menu-only: it is a proposal, not yet runnable work. Claiming one means promoting
it, and the promotion is what makes it burn down:

```
mcp__cascade-api__cascade_execution_queue {
  action: "enqueue",
  target_package_id: "<the finding package id — the menu key>",
  trigger: "manual",
  priority: 0
}
```

The new row is `queued`, so the **badge now counts it** and the finding line disappears from
the menu (the claimable list drops any finding already represented by a queue row for the same
target). Then claim and run it as 3b, or leave it queued for a later session — both are
legitimate. Do not enqueue a finding you are not prepared to describe in the report: a
producer without a consumer is how the queue got here.

### 3d. Grade it with the subagent — do not verify it yourself

```
Task(
  subagent_type: "cse-verifier",
  description: "Verify <kind> <label>",
  prompt: <the repo root from project_path (hint only), the full note_md, the ordered
           test_plan steps AS the must-have set, related_memory / related_packages
           pointers, and: return a state per step (pass | fail | unresolved | abstained)
           with literal evidence, plus one verdict of passed | gaps_found | human_needed>
)
```

For a queue item the must-have set is the target package's spec must-haves (or its stated
acceptance) instead of a `test_plan`; everything else is identical.

Use `cse-verifier`, never `general-purpose`, for one structural reason: its tool allowlist has
**no `Edit`/`MultiEdit`**, so the agent grading the work is physically unable to patch what it
is grading. **A verifier that can fix its own findings produces no findings.** For the same
reason, *you* do not fix anything inline during this phase either — a one-line fix you spotted
is a finding, and it goes in the report.

Existence is not behavior: a file being on disk supports "the artifact was created" and
nothing more. `abstained` outranks everything and rolls the whole entry up to `human_needed` —
never round an abstention into a pass because the rest is green.

**If a handoff payload carries `enqueued_tests`,** hand those queue rows to the verifier as
part of its must-have set and claim them exactly as 3b (they are ordinary queue rows) before
running them. They exist precisely to validate the change that forced the restart.

## Phase 3.5 — Every claim reaches a terminal state

A lease you take and never close is worse than never claiming: the row sits `claimed`, the
badge stops counting it, and nobody else can pick it up until the TTL expires. That is not
hypothetical — **only two rows have ever reached `queue_status='done'`** (one 2026-07-17, one
2026-08-02), and a lease taken on 2026-07-17 sat `claimed` indefinitely because the release
half was never built. Both paths below are mandatory.

**COMPLETE — the work finished and its must-haves hold:**

```
mcp__cascade-api__cascade_execution_queue { action: "complete", item_id: "<id>", result: "done" }
```

`result` is one of `done | failed | cancelled`. For a `test_spec` target you MAY omit `result`
to derive `done`/`failed` from the spec's `spec_verifications`; if it cannot be derived the
tool answers `complete: could not derive result from spec_verifications (none recorded yet) —
pass result explicitly`, and then you pass it explicitly rather than guessing.

**RELEASE — the work did not finish, and it should still happen.** `execution_queue` has no
in-place "un-claim" verb, so release is two calls: terminate this attempt honestly, then put
the target back on the queue.

```
1. mcp__cascade-api__cascade_execution_queue { action: "complete", item_id: "<id>", result: "failed" }
2. mcp__cascade-api__cascade_execution_queue {
     action: "enqueue",
     target_package_id: "<item.target_package_id>",   // or target_bundle_id — whichever the row had
     trigger: "<item.trigger>",                        // preserve it; after_restart items must stay after_restart
     priority: <item.priority>
   }
3. mcp__cascade-api__cascade_execution_queue { action: "list", status: "queued", limit: 50 }
```

Step 3 is not decoration: **the release is not done until you have seen the new `queued` row.**
Report the new id. If step 2 fails, say the lease is still open and name the item — an unclosed
lease you announced is recoverable; one you swallowed is the 2026-07-17 row all over again.
Before re-enqueueing, check the `list` for a `queued` row already targeting the same package
and skip the enqueue if one exists — releasing twice manufactures duplicate work.

**CANCEL — the work should not be re-attempted:** `result: "cancelled"`, and no re-enqueue.
Only take this branch when the user said so, or when the target is provably obsolete. Say why
in the report.

**Take the release branch automatically** whenever a claimed queue item's run errors, is
blocked, runs out of budget, is superseded mid-flight, or grades `gaps_found` / `human_needed`
without the work actually landing. Do it **immediately, before writing the report** — the
report is written after the queue is already consistent, never as a promise to close things
later.

`--release <key> …` is the same two calls with no run and no grading. Use it to clear a
dangling lease (yours or a dead session's) and to exercise the release path on demand. A lease
older than its TTL is also re-claimable by anyone, but that backstop is for crashes; a session
that is still alive releases explicitly.

## Phase 4 — ONE consolidated report

Emit exactly one report **after every claimed entry has been graded and every claim has
reached a terminal state**. Not a report per entry — a per-entry dump is what makes a
five-item batch unreadable and buries the one result that mattered.

```
CLAIM VERIFICATION — <n> claimed, <m> skipped
order: <cheap-first | dependency | subject-clustered> — <one line of why>

[1] [handoff] <label> · written <age> · <key>
    verdict: passed
    evidence: npx vitest run src/daemon/hooks/handoff-store.test.ts → exit 0, 24 passed
    terminal: consumed

[2] [queue] <label> · queued <age> · <key>
    verdict: gaps_found
    evidence: node scripts/check-plugin-drift.mjs → exit 1, "skill registry is STALE"
    narrowest cause: registry not regenerated after the new skill landed
    suggested change (NOT APPLIED): npm run build:cse-plugin
    terminal: released → queued (new item 9f2c…, trigger manual, priority 0)

skipped (batch-ineligible — claim by key to run):
  - [handoff] <label> (<key>) — STALE: installed 0.2.44, handoff targets 0.2.41
  - [handoff] <label> (<key>) — older than 14d (written 22d ago)
  - [queue] <label> (<key>) — ↻ regenerates: listed, never counted
  - [queue] <label> (<key>) — already validly claimed by another session
  - [finding] <label> (<key>) — listed, not counted; enqueue to make it claimable

roll-up: <x> passed · <y> gaps_found · <z> human_needed
queue: <a> completed done · <b> released to queued · <c> cancelled · 0 leases left open
```

The last line is not optional and the `0` is not a formality — if it is not zero, the report
must say which item is still held and why.

Then two or three plain sentences: what actually holds, what does not, and what a person has
to decide. An honest "unconfirmed" is a correct answer; a confident guess is a failure.

## Phase 5 — The end-of-run choice

**If every verdict is `passed`: create nothing.** No handoff, no spec, no package, no new
queue row. Report and stop. Manufacturing follow-up work out of a clean run is how a queue
becomes noise nobody reads — and the governing rule of this whole surface is **never add a
producer before a consumer exists**.

**If any verdict is `gaps_found` or `human_needed`,** close with a **single** `AskUserQuestion`
— one question covering the whole run, not one per entry — offering three outputs. Recommend
the one the verifier's assessment of the work actually supports, and say why:

1. **A new pending handoff** — for a small fix that a fresh session should just do next.
   Always give it a `subject`, or it keys to a fallback and cannot supersede its predecessor:
   ```
   mcp__cascade-api__cascade_handoff {
     action: "write",
     subject: { kind: "<package|commit|plugin_version|handoff>", id: "<id>" },
     note_md: "Fix <X>, then re-verify <Y>. Found by /cse:verify-handoffs on <date>.",
     test_plan: ["<the steps that failed, restated>"],
     project_path: "<repo root>"
   }
   ```
2. **A CSE spec draft** under `.cascade/specs/` — for a fix large enough to want discovery
   questions, must-have truths and waves. Write the draft; do not start executing it.
3. **A tracked Cascade package** — for work that should leave this session entirely. Create
   it with `cascade_create_package`, then hand it to a teammate with
   `cascade_assign_work_item` so it lands in their `/cse:receive` inbox with full context.

Create **only** what the user picks. "None of these" is a legitimate answer and leaves the
gaps recorded in the report and nowhere else. A released queue row already carries the work
forward — do not also mint a handoff for the same thing.

---

## The silence rule (hard prohibition)

**SessionStart is silent.** It injects a compact menu and nothing else — **never a question**,
never a yes/no gate, never a "shall I start with these?". A prompt at session start blocks by
nature and taxes the 90% of sessions that opened to do something else entirely.

**NEVER volunteer the backlog.** Do not open a reply with what is claimable. Do not append it
as a helpful footer. Do not mention the badge. The menu is already on screen; repeating it is
the interruption the menu exists to avoid.

**Exactly ONE exception, relevance-gated:** if the user's request touches the same subject as a
pending item, say so in **one line** and continue with what they asked for.

**Zero claimable injects literally nothing** — not "no pending items", not an empty header.
Say nothing.

Wait to be asked. The trigger is the user's own words: **"do we have any pending handoffs or
reviews?"**

## Never

- Run an entry nobody claimed, or infer one from `cwd`.
- Include stale, demoted, regenerating or finding rows in `--all`.
- Write `execution_queue.queue_status` directly — the claim goes through the RPC or not at all.
- Leave a lease open past the end of the run, or report before the queue is consistent.
- Fix a finding inline, or ask `general-purpose` to grade (it can Edit).
- Emit a report per entry.
- Create an artifact on a `passed` verdict.
- Volunteer the backlog, or ask a question at session start.

## Triggers

"verify handoffs", "check the handoffs", "check everything", "drain the queue", "claim that",
"run the pending handoff", "what were those restart notes",
"do we have any pending handoffs or reviews?", after a ▶ CLAIMABLE menu appears or when the
statusline shows ▸N.
