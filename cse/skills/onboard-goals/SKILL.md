---
name: onboard-goals
description: "Short goals interview writing the goal frame triage classifies against. Creates no OKRs. SUPERSEDED by /cse:onboard-charter."
when_to_use: "SUPERSEDED — the charter absorbs the goal frame, so run /cse:onboard-charter instead for new orgs; this remains only for orgs already on a goal frame. The goals interview that runs BEFORE any import or triage pass. A short conversational interview (5-8 questions, one at a time, options drawn from what is already in the org) that extracts named THEMES with matchable keywords, rough TIME PERIODS that matter, the SYSTEMS whose history is worth keeping, and KNOWN DEAD ENDS the user already considers abandoned — then persists them as a new VERSION of the org's goal frame via cascade-web/src/lib/triage/goalFrame.ts. Theme ids are STABLE across re-runs because triage_classifications.theme_ids references them. This skill NEVER creates objectives or key results — OKRs are framed deliberately forward with real buy-in; this only makes laddering history backward onto them cheap. Triggers on 'onboard goals', 'set up the goal frame', 'what are we trying to do', 'before we import, tell Cascade the goals', 'add a theme to the goal frame'."
argument-hint: "[run (default) | --dry-run (assemble and print the frame, persist nothing)]"
allowed-tools: Bash(npx tsx *), Bash(node *cascade.js *), Read, Write, AskUserQuestion, cascade_get_org_context, cascade_list_packages, cascade_get_recent_activity, cascade_search_decisions
---

# /cse:onboard-goals — the goals interview

A short conversation that answers one question: **what is this org actually
trying to do, and which slices of its history are worth keeping?** The output
is a **goal frame** — a versioned artifact of named themes, time periods,
systems, and known dead ends. Every later triage pass classifies against it.

This is the **first** step of retroactive ingestion. The flow:

```
/cse:onboard-goals   →   (import)   →   triage --dry-run   →   review   →   triage --apply
   goal frame              raw rows       counts only          human        classifications
```

Without a goal frame, triage has no axis to judge against and falls back to
structural rules only — which means almost everything lands in `uncertain`.
Twenty minutes here is what makes the rest of the pipeline cheap.

## THE HARD RULE (never violate)

> **This skill writes NO objectives and NO key results.**

Not as drafts, not as proposals, not "just to have something to hang it on."
Do not call `cascade_manage_objective`. Do not queue `okr_proposals`. Do not
suggest, mid-interview, that a theme "should probably be an objective."

The reason is a scar, not a preference. The org's current ~15 live OKRs are, in
Steve's words, *"kind of arbitrary and were picked because of the archaeology
thing… placeholders for development."* Retro-fitting OKRs during a cleanup pass
is exactly what produced them. **OKRs get framed deliberately FORWARD from a
chosen starting point, with real buy-in. History then ladders BACKWARD onto
them.** This skill's whole job is to make that laddering cheap later — a theme
with a stable id is a one-line JOIN away from an objective the day someone
actually decides on that objective. It is not the decision itself.

If the user asks for objectives during this session, say plainly that this skill
does not write them, finish the frame, and point them at `/cse:okr-backfill`
(steering-queue drafts) or a forward OKR-framing conversation as the separate,
deliberate step.

## When to use

- **Before the first import** of a repo/workspace/archive into the org — the
  frame is the thing that makes the import worth triaging.
- **Before re-running triage** after the org's direction has moved: new
  product line, a system retired, a phase closed out.
- **To add or sharpen one theme** — re-running is safe and expected (see
  *Stable theme ids*). You do not need to redo the whole interview to add one.
- **After a triage dry-run reads badly** — a pile of `uncertain` almost always
  means the frame is too narrow or missing a theme, not that the classifier is
  broken. Come back here, widen, re-run.

Not for: writing OKRs (above), importing anything (that is the import step), or
deciding individual keep/archive calls (that is the triage review UI).

## What it produces

Exactly one thing: a new **version** of the org's `GoalFrame`
(`cascade-web/src/lib/triage/types.ts`), persisted as a versioned artifact.

| Field | What it is | Why triage needs it |
|---|---|---|
| `themes[]` | `{ id, name, description, keywords[], createdAtVersion }` | The classification axis. `triage_classifications.theme_ids` points at `id`. |
| `timePeriods[]` | `{ id, label, start, end, note? }` — `null` = open-ended | Lets "before we had OKRs" be a first-class reason to keep something. |
| `systemsThatMatter[]` | repo / service / surface names | A row about a system that matters survives a weak theme match. |
| `knownDeadEnds[]` | things the user already knows were abandoned | Lets the classifier archive **confidently** instead of escalating. |

It also bumps `version` and stamps `createdBy`. Nothing else in the org is
written. Nothing is ever deleted — a new version supersedes, it does not erase,
and old classifications keep resolving because the theme ids held.

## The interview

**Shape:** 5-8 questions, **one at a time**, conversational. This is not a form
and it is not a wizard. If the user answers three questions in one paragraph,
take it and skip ahead — never re-ask what they already told you.

**Never ask cold.** Before the first question, pull what the org already knows
and put concrete options in front of them:

- `cascade_get_org_context` — stated priorities, positioning
- `cascade_list_packages` — recent work titles, which cluster
- `cascade_get_recent_activity` / `cascade_search_decisions` — what has actually
  been moving, and named eras in the decision log
- `loadGoalFrame(orgId)` — **always**, first (see below)

Then offer *"here's what it looks like from the outside — is that right?"*
rather than *"what are your themes?"*. AskUserQuestion with 3-5 drawn-from-real-
data options beats an open prompt every time.

### The questions (adapt, don't recite)

1. **Themes.** "Reading the last few months, the work clusters into roughly
   these N things: … Does that match how you'd say it?" → confirm / rename /
   merge / add. Aim for **4-10 themes**. Each needs a name, one sentence of
   description, and **keywords** — the words that actually appear in titles,
   branches, and commit messages for that theme. Keywords are what the
   classifier matches on; ask for the ugly literal ones (`substrate`,
   `okr_proposals`, `pty`), not the pretty ones.
2. **Anything missing?** One open question, once: "anything you care about that
   isn't in that list — including stuff that hasn't started yet?"
3. **Periods.** "Are there eras that change how I should read something's age?"
   Offer candidates you can see: *before we had OKRs*, *the archaeology phase*,
   *since the substrate landed*. Rough is fine — a period with a `null` end is
   normal and correct.
4. **Systems.** "Which repos/services/surfaces have history worth keeping?"
   Offer the ones you saw in packages and decisions. Include the ones they only
   half-care about — see *Bias toward breadth*.
5. **Dead ends.** "What do you already know was abandoned?" This is the highest-
   value question in the interview: every confident dead end is a batch of rows
   the classifier archives without escalating to a human.
6. **Doubt check.** "Anything on that dead-end list you're only 80% sure about?"
   Move those OFF the dead-end list. A wrong dead end causes silent
   archiving; a missing one only costs a review click.
7. **Confirm the assembled frame** back to the user, in full, before writing.

### Bias toward breadth

Steve: *"if there's unknown, we want to get all the data."*

Where the goals are unclear, **ingest broadly and narrow later**. The substrate
is cheap to keep and **nothing is ever deleted**. So, explicitly:

- When in doubt between a narrow theme and a broader one, **write the broader
  one.** "Developer surfaces" beats three thin themes that each miss half their
  rows. You can split a theme in a later version; you cannot recover the review
  attention wasted on rows nothing matched.
- When in doubt about a system, **include it.**
- When in doubt about a dead end, **leave it out** — prefer the classifier
  escalating to `uncertain` over an aggressive `archive`. Uncertain costs a
  glance; a wrong archive costs trust in the whole pass.
- A theme the user is *thinking about* but hasn't started is legitimate. Add it.

### Stable theme ids — do not renumber

`triage_classifications.theme_ids` references `GoalTheme.id`. If a re-run mints
fresh ids for themes that are the same themes, **every existing classification
is orphaned** and the later theme→objective ladder stops being a cheap JOIN.

So, mechanically, on **every** run including the first:

1. `loadGoalFrame(orgId)` **first**. Never start from scratch on a re-run.
2. Show the existing themes in the interview as the starting point.
3. Pass existing + new through `mergeThemes(...)` — it is what preserves ids
   for matched themes and mints ids only for genuinely new ones.
4. A **rename is not a new theme.** If the user renames "Terminal" to
   "Developer surfaces," that is the same theme with a new `name` — same id.
   Only mint a new id when a theme is genuinely new, and record its
   `createdAtVersion`.
5. Never delete a theme to "clean up." Dropping a theme orphans its
   classifications. If it is dead, say so in its description and stop using it.

If no frame exists yet, start from `emptyGoalFrame(orgId)` — same code path,
zero special-casing.

## Writing the frame

Persistence lives in **`cascade-web/src/lib/triage/goalFrame.ts`**. **Read that
file before writing** and use its actual exported signatures — the contract it
implements is:

```ts
loadGoalFrame(orgId: string): Promise<GoalFrame | null>   // latest version, or null
emptyGoalFrame(orgId: string): GoalFrame                  // version 0 skeleton
mergeThemes(existing: GoalTheme[], incoming: /* draft themes */): GoalTheme[]
saveGoalFrame(orgId: string, input: /* frame fields */): Promise<GoalFrame>
```

`saveGoalFrame` appends a **new version** of the same artifact — it never
mutates the previous version and never creates a second artifact for the org.
`GoalFrame`, `GoalTheme`, and `GoalPeriod` are defined in
`cascade-web/src/lib/triage/types.ts`.

Call it from the repo root with `tsx` (a root devDependency):

```bash
npx tsx -e '
  import { loadGoalFrame, mergeThemes, saveGoalFrame, emptyGoalFrame }
    from "./cascade-web/src/lib/triage/goalFrame";
  const orgId = process.env.CASCADE_ORG_ID!;
  const prev = (await loadGoalFrame(orgId)) ?? emptyGoalFrame(orgId);
  const draft = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const themes = mergeThemes(prev.themes, draft.themes);   // ← ids preserved here
  const saved  = await saveGoalFrame(orgId, { ...draft, themes });
  console.log(JSON.stringify({ version: saved.version, themes: saved.themes.length }));
' /path/to/draft-frame.json
```

Write the draft to a temp JSON file rather than inlining it — the frame is
long, and keeping it on disk means a failed write loses nothing.

Rules for the write step:

- **Confirm before writing.** Show the assembled frame; write only on a yes.
- **One write per session.** Assemble the whole frame, then save once.
- `--dry-run` → print the assembled frame, save the JSON where the user can see
  it, persist nothing.
- On failure, keep the draft JSON and tell the user exactly where it is. Never
  retry with a re-derived frame — the ids in the draft are the point.

## Boundaries

**Writes NO objectives. Writes NO key results.** Restating it because it is the
one rule that gets rationalized away mid-interview: a well-shaped theme *looks*
like an objective, and it is not one. It has no owner, no timeframe anyone
committed to, and no buy-in — and creating one here would repeat exactly the
mistake that produced the current placeholder OKR set.

Also out of scope for this skill:

- **No importing.** It does not pull repos, threads, or archives.
- **No classifying.** It does not write `triage_classifications` rows.
- **No archiving.** It does not touch packages, threads, or artifacts.
- **No deleting.** Not themes, not old frame versions, not anything.
- **No steering-queue proposals.** `/cse:okr-backfill` owns that lane.

The only mutation this skill makes is one new goal-frame version.

## After the interview

Report what landed and hand off:

> **Goal frame v3 — 6 themes (2 new), 3 periods, 5 systems, 4 known dead ends.**
> Next: run the import, then `node bin/triage-run.mjs --dry-run` to see the
> counts before anything is written.

Then:

1. **Import** whatever is being ingested (separate step, separate skill/script).
2. **`node bin/triage-run.mjs --dry-run`** — classifies candidates against this
   frame and prints counts (`keep` / `archive` / `uncertain`, by pass) writing
   nothing.
3. **Read the counts.** A large `uncertain` bucket is a *frame* signal: come
   back here, add or widen a theme, and re-run. That loop is the intended use,
   not a failure mode.
4. **`node bin/triage-run.mjs --apply`** when the counts look right.

**Re-running is safe.** Re-interviewing and re-triaging is idempotent by
construction: theme ids survive `mergeThemes`, classifications upsert on
`(org_id, entity_type, entity_id)`, an unclassified row defaults to `keep`
(`DEFAULT_VERDICT`), and **human verdicts are never overwritten**
(`decided_by <> 'human'` guards every automated upsert). Nothing a person
decided is at risk from another pass.

## Worked example — a small goal frame

Assembled from a ~20 minute interview with a two-product org. Note the ugly
literal keywords, the open-ended period, the deliberately broad
`developer-surfaces` theme, and the dead end that got demoted to a note because
the user was only 80% sure.

```jsonc
{
  "version": 3,
  "themes": [
    {
      "id": "c1f0…",                       // v1 id — PRESERVED through two re-runs
      "name": "Agent-native substrate",
      "description": "Making the package/artifact substrate the thing agents read and write directly.",
      "keywords": ["substrate", "package", "artifact", "git-substrate", "mcp", "cascade_*"],
      "createdAtVersion": 1
    },
    {
      "id": "8a34…",
      "name": "Developer surfaces",        // deliberately BROAD — absorbed 3 thin v2 themes
      "description": "Everything a developer looks at while working: terminal, sessions, file viewer, desktop app.",
      "keywords": ["terminal", "pty", "session", "tab", "electron", "desktop", "file viewer"],
      "createdAtVersion": 1
    },
    {
      "id": "5be7…",
      "name": "Retroactive ingestion",
      "description": "Getting years of prior work into the substrate with a defensible keep/archive call.",
      "keywords": ["triage", "archaeology", "backfill", "import", "goal frame", "classification"],
      "createdAtVersion": 3      // ← genuinely new this version
    }
  ],
  "timePeriods": [
    { "id": "p1…", "label": "Before we had OKRs", "start": null,         "end": "2026-04-01",
      "note": "No objective ids exist on anything from this era — absence is not evidence of abandonment." },
    { "id": "p2…", "label": "The archaeology phase", "start": "2026-04-01", "end": "2026-06-01",
      "note": "High volume of exploratory threads; expect a lot of legitimate archive here." },
    { "id": "p3…", "label": "Since the substrate landed", "start": "2026-06-01", "end": null }
  ],
  "systemsThatMatter": [
    "cascade-web", "packages/git-substrate", "cse plugin", "bin/cascade.js", "packages/voice-brain"
  ],
  "knownDeadEnds": [
    "The standalone Electron menu-bar daemon — superseded by the in-app helper",
    "CASCADE_DAEMON_MODE env gating — replaced by organizations.cloud_execution_enabled",
    "Any thread tagged 'sora' from the video-backdrop spike"
    // 'the old dashboard tile registry' was proposed here and REMOVED — user was
    // only ~80% sure, so it stays out and those rows escalate to 'uncertain'.
  ]
}
```

That frame is enough for a triage pass to keep the substrate/terminal/ingestion
history with confidence, archive the daemon and Sora rows without asking, and
escalate the genuinely ambiguous middle to a human — which is the whole point.
