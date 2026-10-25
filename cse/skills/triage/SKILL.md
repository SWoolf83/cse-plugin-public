---
name: triage
description: "Inventory unmerged branches — commit counts, ages, memory cross-reference — and propose merge-or-abandon per branch. Read-only."
when_to_use: "Deciding what to merge or drop; a spec run just ended and you want to know what is still held; wondering whether work you remember building ever actually shipped; periodic cleanup of held branches."
argument-hint: "[optional: <branch> to triage just one, or --all to walk every unmerged branch]"
allowed-tools: Read, Glob, Grep, Bash(git for-each-ref*), Bash(git rev-list*), Bash(git log*), Bash(git cherry*), Bash(git merge-base*), Bash(git rev-parse*), Bash(git show*), Bash(git diff --stat*), Bash(git branch --contains*), Bash(git worktree list*), Bash(ls *), AskUserQuestion
---

# Triage (`/cse:triage`)

The on-demand inventory of **unmerged work** — the branches that hold code somebody
wrote, verified, and then never landed.

Measured on Cascade **2026-08-02**: **97 commits across 17 unmerged branches**, oldest
last touched **2026-04-16 — three and a half months**. Nothing surfaced them, because
nothing was allowed to. `scripts/branch-sweep.mjs` deletes only branches git itself
certifies as fully merged; that safety property is exactly what makes it blind to the
97 commits that matter. This skill is the other half: it looks at what the sweep must
never touch, and it looks **without touching**.

---

## The safety contract — read this before anything else

This skill is **read-only by construction**, not by discipline:

- Its `allowed-tools` grant only git **read** verbs. There is no ref-mutating verb in
  the list, so an over-eager run cannot delete a branch even if it decided to.
- It **never force-deletes a branch**, under any argument, for any reason.
- It **never removes a linked checkout** — see *Why residue is not swept* below.
- It **creates and deletes nothing without an explicit per-branch choice from you**,
  and even then the destructive half is a command it *prints for you to run*, never a
  command it runs itself.
- It never merges. "Merge" as an outcome means: this skill hands you the branch name
  and stops. Merging is its own deliberate step with its own review.

If you want a branch gone after triage, the deletion is your keystroke. The whole
point of this skill is to give you the judgement, not to act on it.

---

## Phase 0 — Parse the request

| Argument | Meaning |
|---|---|
| *(none)* | Inventory everything, then triage the ranked shortlist interactively. |
| `--all` | Inventory everything and walk **every** branch through the decision gate. |
| `<branch>` | Triage exactly one named branch. |

---

## Phase 1 — Inventory (pure measurement)

Resolve the default branch (`main` here), then enumerate what is not on it:

```bash
git for-each-ref --format='%(refname:short)' refs/heads --no-merged main
```

**Exclude the branch you are standing on.** A spec run is *always* on an unmerged
branch — its own. Counting it turns "work you forgot" into "work you are doing right
now" and inflates every total. The 17/97 figure above is 18 branches minus the live
one.

For each remaining branch, three cheap reads:

```bash
git rev-list --count main..<branch>          # commits ahead
git log -1 --format='%as  %an  %s' <branch>  # last-touched date, author, subject
git cherry main <branch>                     # '+' = genuinely absent, '-' = already upstream
```

`git cherry` is the one people skip and it is the most valuable of the three. It
compares by **patch id**, so a branch whose work was landed by a rebase, a squash, or
a cherry-pick shows `-` on every line while `--no-merged` still lists it as unmerged.
That branch is *residue*, not *risk*, and it must not be presented as a lost feature.
Cascade has at least one live example: memory records the live artifact renderer as
merged at `4c555b70`, while `cascade/aec35edb-artifact-live-render` still reports 10
unmerged commits.

Age is measured from the last commit date, not the first. A branch whose newest commit
is 3.5 months old is dead; a 3.5-month-old branch touched last week is alive.

---

## Phase 2 — Cross-reference memory

Unmerged branches that memory has already judged are the highest-value rows in the
table, because someone recorded a verdict and then the verdict rotted.

Read the index and any topic files it points to:

```
~/.claude/projects/-Users-stevewoolf-code-cascade/memory/MEMORY.md
```

Grep it for each branch's slug, and for the `BUILT (held)` / `BUILT`-but-never-shipped
markers. As of 2026-08-02 the index records at least four:

| Memory entry | Branch | Recorded state |
|---|---|---|
| MCP Integration Registry | `cascade/mcp-integration-registry-cloud-views` | BUILT (held) — blocked on a credential collision |
| Ship Surface Lens | `cascade/ship-surface-lens-parity-matrix` | BUILT (held) — seed not in DB |
| Agent participation in OKRs | `cascade/agent-participation-in-okrs` | BUILT (held) — next: two migrations, then merge |
| Org-Event Spine | `cascade/org-event-spine-firehose-scoping` | BUILT (held) — next: staged prod deploy |

Re-derive this table at run time; do not trust the copy above. It is a worked example
showing what a hit looks like, and memory moves.

Also check `CLAUDE.md`, which can hold a branch **on purpose**. It documents
`cascade/424a05f9-git-substrate` as a deliberately held branch with a live service
behind it. A branch with a written reason to exist is not a triage candidate — it is a
correctly-parked one, and proposing abandonment for it is the fastest way to teach the
user to distrust this list.

---

## Phase 3 — Classify

Every branch lands in exactly one class. The class determines the proposal.

1. **Already landed by another path** — `git cherry` shows `-` for every commit.
   *Proposal: abandon.* Merging is a no-op; the code is on `main`. Zero-risk row.
2. **Deliberately held** — `CLAUDE.md` or a memory topic names a reason and a next
   step. *Proposal: keep held*, and restate the next step so it stays visible.
3. **Built, never shipped** — memory says BUILT/held, `git cherry` shows real `+`
   commits, and there is a named blocker. *Proposal: merge or abandon*, and say which
   you lean toward and why. These are the rows the whole skill exists for.
4. **Unclaimed** — no memory record at all, usually the oldest. *Proposal: read the
   diff before deciding.* Show `git diff --stat main...<branch>` and the commit
   subjects; an unclaimed branch is not automatically abandonable, it is just
   undocumented.

Rank the output by **age × commits ahead**, class 3 first. Ranking orders attention;
it never removes a row. Always print the full table.

For each row state, in one line each: the class, the evidence that put it there, and
**the cost of being wrong** — for class 1 that is "nothing, the code is already on
main"; for class 3 it is the feature that stays dark.

---

## Phase 4 — The per-branch decision gate

**One question per branch. Never a bulk action, never an inferred one.** Use
`AskUserQuestion` with four options:

- **Merge** — this skill records the intent and stops. It does not merge.
- **Keep held** — capture the reason and the next step; that reason is the thing
  that was missing when the branch went quiet.
- **Abandon** — print the exact deletion command for the user to run **in their own
  shell**, alongside the branch tip sha so it is recoverable, and move on. The skill
  runs nothing.
- **Skip** — decide later. The default. Skipping is a legitimate answer and must be
  offered every time, because the alternative is a gate that pressures the user into a
  choice they have not thought about.

A branch with no answer stays exactly as it is. Nothing about this skill's exit path
changes a ref.

---

## Why unmerged-branch inventory is deliberately NOT on the badge

The statusline badge added by this same spec is `▸N`, magenta, and it counts **only
burn-down work**: pending restart handoffs, plus queued `execution_queue` rows that do
not regenerate. Architecture-freshness re-verify orders are excluded from the count on
purpose — they re-emit themselves as commits accumulate (**10 of them in 3 days**), so
they are *listed* in the SessionStart menu and *never counted*.

The rule those two decisions share:

> A number belongs on the badge only if doing the work makes it go down, and not
> doing the work keeps it flat.

Unmerged-branch inventory fails that test in the same way a regenerating re-verify
order does, and for a deeper reason. Merge-or-abandon is a **judgement call**, and
several of the 17 branches have legitimate, documented reasons to stay unmerged
indefinitely. There is no amount of correct work that drives the number to zero. Put
it on the badge and it becomes a permanent `▸17` that never moves no matter what you
do — which teaches you, within about a week, that the badge is decoration.

That is precisely the failure mode the badge exists to avoid. A badge is a promise
that the number means something actionable; the first uncleanable item on it breaks
the promise for **every** item, including the handoffs that genuinely are one action
from done. So inventory lives here, on demand, where a number that cannot reach zero
is honest rather than misleading.

---

## Why residue from disposable checkouts is NOT swept

Every spec run creates a scratch directory under `/tmp` and holds it. It is tempting
to have this skill clean them up. It does not, and the reasoning is measurable.

**Measured 2026-08-02:** 20 spec-run scratch directories exist under `/tmp`; **19 of
them are 0 bytes**. macOS's periodic cleaner already emptied every one that was not
the live run. The 18 branches those runs left behind cost **16K of refs in total**
(re-measure: `du -sk .git/refs/heads` reported 8K of loose refs the same day) — because
a linked checkout **shares** `.git` rather than duplicating it. Reclaimable space from
a full sweep: effectively zero.

So sweeping buys nothing measurable. And it is not free. The reason the residue makes
people uneasy is a specific fear: *"is that directory a live session in another tab?"*
You cannot answer that from the filesystem, and getting it wrong destroys someone
else's in-flight work. The fix is not a better liveness probe — it is to **never delete
them at all**, which makes the liveness question moot. A tool that cannot delete a
checkout cannot delete a live one.

There is direct evidence that this residue is where the bugs live. The status probe in
`scripts/branch-sweep.mjs` used to crash on a directory the /tmp cleaner had gutted,
and because that phase ran *before* branch deletion, one gutted directory silently
blocked **all** branch cleanup — which is most of why six fully-merged branches had
piled up despite a tool existing to remove them (fixed 2026-08-02, `9248c39f`). Touching
this residue has already cost more than leaving it alone ever has.

Directory cleanup is therefore out of scope for this skill, permanently and by design.
`ls` is granted so the inventory can *report* what exists; nothing more.

---

## What this skill never does

- Never deletes or force-deletes a branch.
- Never removes a linked checkout, and never sweeps, prunes, or deletes a scratch
  directory.
- Never merges, rebases, pushes, or writes a ref of any kind.
- Never acts on more than one branch from a single answer.
- Never puts its own count on the statusline badge.

Its entire output is a table, a set of proposals, and — for whatever you chose to
abandon — a command you run yourself.
