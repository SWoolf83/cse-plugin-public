# Golden Regression Suite — the /cse:self-eval quality gate

This directory is the **pinned golden task set** behind the scorecard step of THE CONTRACT
in `../SKILL.md`:

> accept (human) → standard executor on an ISOLATED HELD BRANCH
> → **golden-suite scorecard** (`scripts/self-eval-replay.mjs` + this directory —
> TWO metrics: token cost AND quality; a quality regression BLOCKS merge even
> when tokens dropped) → MANUAL human merge → MANUAL /cse:release.

The replay harness has **no merge or release capability** — it only reports and blocks.
Its only git usage is read-only (`rev-parse` / `archive`).

## The suite is PINNED

`tasks.json` is a fixed, versioned contract (`suiteVersion` / `rubricVersion`). Changes to
`tasks.json` — prompts, machine checks, rubric criteria, tolerances — are **themselves
reviewable changes**: land them in their own commit/review, never as part of a tuning
branch that is trying to pass the gate. The harness stamps the suite file's SHA-256 into
every scorecard (`suiteSha256`) so an apples-to-apples comparison is provable.

## Task definitions (`tasks.json`)

Three representative CSE tasks, each pinned end-to-end (fixed inputs, fixed machine
checks, fixed judge rubric):

| id | skill under test | pinned ask |
|---|---|---|
| `spec-discovery` | `cse/skills/spec/SKILL.md` | /cse:spec discovery over a fixed feature ask (CSV export of the decision log) — must emit numbered discovery questions, draft must-haves, scope boundaries |
| `gate-review` | `cse/skills/gate/SKILL.md` | code-review gate over a fixed small diff with a **planted bug** (catch swallows the error, `Promise<T>` → `Promise<T \| null>`) — must emit severity-tagged findings + an explicit verdict line |
| `economics-roi` | `cse/skills/economics/SKILL.md` | feature-ROI go/no-go over fixed inputs ($12k build, $1.5k/mo saving, 24mo, 10%) — must emit a provenance-tagged EMS json block, request NPV/payback from the evaluator, never assert hand-computed numbers |

Each task entry carries:

- `id`, `title`, `skill` — path to the SKILL.md **within a cse/ tree** (resolved inside each replayed tree, so base and tuned versions of the skill text are what actually differ).
- `pinnedInputs.prompt` — the fixed headless prompt (tools forbidden; one-shot output).
- `expected.machineChecks[]` — machine-checkable quality criteria: `{ id, description, pattern, flags? }` regexes evaluated against the captured output.
- `judgeRubric` — pinned criteria for the output-quality judge (`rubricVersion` pinned; the judge scores each criterion 0–1, thresholded at `config.judgePassBar`).

Suite `config`: `qualityRegressionTolerancePct` (block threshold, default 0 — any drop
blocks), `tokenRegressionWarnPct`, `judgePassBar`, optional `replayModel`/`judgeModel`.

## Replay harness — exact commands

Entry point: `scripts/self-eval-replay.mjs` (repo root). `--base`/`--tuned` each accept a
**directory** (a checkout/worktree root) or a **git ref** (materialized read-only via
`git archive <ref> cse` into a temp dir).

```bash
# Help / wiring check
node scripts/self-eval-replay.mjs --help

# LIVE replay of a held tuning branch against main (12 headless `claude -p` calls:
# 3 tasks x 2 trees x (replay + judge) — modest Max Plan cost, not a benchmark farm)
node scripts/self-eval-replay.mjs --base main --tuned cascade/<held-branch>

# Or against a worktree directory
node scripts/self-eval-replay.mjs --base main --tuned /tmp/cascade-spec-<slug>

# Cost control: replay a single task
node scripts/self-eval-replay.mjs --base main --tuned <ref> --tasks gate-review

# OFFLINE (--no-llm / --dry-run): ZERO LLM calls — validates wiring, resolves trees,
# and scores pre-recorded outputs from a directory. This is what CI and tests run.
node scripts/self-eval-replay.mjs --no-llm --base main --tuned <ref> \
  --recorded <dir-with-{taskId}.{base|tuned}.json>
```

A live run writes its captured outputs to `<out>/recorded/` in the same
`{ model, output, usage, judge: { scores } }` format, so any live run is re-scorable
offline later via `--no-llm --recorded <that dir>`.

The headless invocation reuses the repo's scheduled-runner pattern
(`claude -p <prompt> --output-format json`, envelope `{ result, usage }`), **without**
`--dangerously-skip-permissions` — replay prompts forbid tools, and headless permission
denial is the backstop.

## The two-metric scorecard

All scorecard numbers are computed by the **shared deterministic evaluator**
(`packages/shared/src/self-eval/cli.ts all` = validate → compute → gate) from an SES +
MetricRows the harness builds out of the replay observations. Every number carries
`{ computed: true, inputsHash }` provenance; the gate rejects orphan numbers; the harness
does no math of its own.

- **QUALITY** = `pass_rate` over machine checks + judged rubric criteria (each judge
  criterion passes at `judgePassBar`), per task and suite-wide, base window vs tuned window.
- **TOKEN COST** = `tokens_total` from captured headless usage
  (input + cache-creation + cache-read + output), per task and suite-wide.

`<out>/scorecard.json` (alongside `ses.json`, `rows.json`, `computed.json`):

```jsonc
{
  "status": "pass" | "blocked",
  "blockedBy": ["gate-review", "suite"],
  "inputsHash": "fnv1a-…",          // this run's provenance anchor
  "suiteSha256": "…",               // proof the pinned suite was unchanged
  "suite":  { "quality": { "before", "after", "deltaPct", "regressed" },
              "tokens":  { "before", "after", "deltaPct", "improved", "regressed" } },
  "tasks":  [ { "id", "verdict", "quality", "tokens", "observations" } ],
  "warnings": []
}
```

Every `before`/`after`/`deltaPct` is a `{ value, provenance }` pair copied verbatim from
the gated `computed.json`.

## BLOCK-MERGE semantics

- **A quality regression beyond `qualityRegressionTolerancePct` marks
  `status: "blocked"` and the harness exits non-zero (code 2) — EVEN WHEN token cost
  dropped.** Cheap-but-worse never passes.
- Tokens-only improvement with flat quality → `status: "pass"`, exit 0.
- Token regression with flat quality → warning (`tokenRegressionWarnPct`), still pass.
- Exit codes: `0` pass · `1` harness/evaluator/gate error · `2` blocked.

**Live metrics are SECONDARY confirmation only.** The post-ship predicted-vs-actual
check in `/cse:self-eval` (Phase 6) watches live telemetry after a merge, but a tuning
must clear THIS pinned suite first — do not merge on live token savings alone, and do
not treat live dashboards as a substitute for the scorecard.

## Canonical self-test (the degraded-skill exercise)

The repeatable, zero-LLM proof of the block path lives in
`cse/skills/self-eval/__tests__/replay-harness.test.ts` over the fixtures in
`fixtures/`:

- `fixtures/degraded/` — the tuned recordings simulate an **intentionally-degraded
  skill**: quality pass-rate collapses (discovery loses its structure, the review misses
  the planted swallowed-error bug, economics asserts orphan numbers) while tokens ALSO
  drop ~43%. Expected: `status: "blocked"`, exit 2.
- `fixtures/happy/` — identical outputs, ~35% fewer tokens. Expected: `status: "pass"`, exit 0.

```bash
npx vitest run cse/skills/self-eval/__tests__/replay-harness.test.ts

# or by hand:
node scripts/self-eval-replay.mjs --no-llm --base . --tuned . \
  --recorded cse/skills/self-eval/golden-suite/fixtures/degraded --out /tmp/replay-demo
echo $?   # → 2 (BLOCKED)
```

Run this degraded-skill exercise whenever the harness, the suite, or the shared
evaluator changes — it is the canonical regression test for the gate itself.
