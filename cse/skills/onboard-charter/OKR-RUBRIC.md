# The OKR authoring rubric — six checks that can fail

Canonical reference for every skill that elicits, drafts or accepts an objective
or a key result. Referenced by `/cse:onboard-charter`, `/cse:okr-backfill` and
`/cse:okr-seams`.

**Apply these out loud.** State which check a statement failed and how you fixed
it. A rubric applied silently is indistinguishable from one not applied.

> **Why a rubric and not a persona.** "Act like John Doerr" produces
> Doerr-*sounding* output, not Doerr-*shaped* output — it has no failure mode, so
> it cannot correct anything. Every check below can come back NO. That is the
> entire difference, and it is the same property that separates a real key result
> from a wish.

---

## The six checks

### 1. Number test — the level test
**If a statement contains or implies a number, it is a KEY RESULT, not an objective.**
Objectives are qualitative. Key results carry the arithmetic.

Run it by asking "what number would close this?" If an answer exists, you are
holding a key result.

| Statement | Implied number | Verdict |
|---|---|---|
| "Cascade is in the hands of its first external users" | ≥1 external user | **KR** |
| "Staying current is one click, on every surface" | 5 of 5 surfaces | **KR** |
| "CLI/Skills/MCP Tooling Reliability" | — (not a sentence) | **THEME**, not an objective |
| "Cascade is something other people rely on, not a system its author operates" | none | **Objective** |

A theme is not an objective either. If it has no verb, it states nothing that
could be true or false.

### 2. Sentence test
**"We will [objective] as measured by [2–4 key results]" must read naturally.**
If it doesn't, the level is wrong somewhere. Say the sentence aloud before
accepting either half.

### 3. Disagreement test — the abstraction stop
**A reasonable person must be able to argue against the objective.**
"Improve quality" fails — nobody argues for worse quality. "Cascade's tooling is
boring — nobody has to think about it" passes, because someone could argue the
team should be shipping features instead of polishing tooling.

This is the stopping rule for check 1. Pushing everything up a level eventually
lands on "the company succeeds," which directs nothing. Stop climbing when the
objective becomes arguable.

### 4. "No" test
**A key result must be able to come back negative.** If there is no world in
which it reports failure, it is a task with a number stapled to it.

### 5. Activity vs outcome
**"Ship X" is a task. "X is used by N people" is a key result.**
Shipping is something you control; being used is something you learn. Key
results measure the second kind. A key result you can guarantee by working
harder is usually a task in disguise.

### 6. Baseline mandatory — the one that actually bites
**Every key result needs an explicit baseline AND target, or it cannot be scored.**
Progress is `(current − baseline) / (target − baseline)`.

Three failure modes, all observed in live production data on 2026-08-02:

- **`baseline = target`** → division by zero. The key result is mathematically
  unscoreable. Two KRs on objective `31e17359` carried `baseline 0 → target 0`.
- **`baseline = NULL`** → progress is NULL and the KR silently contributes
  nothing. One KR on the same objective.
- **`baseline = 0` on a metric that did not start at zero** → the KR credits work
  that already existed when the goal was set. A fourth KR read **20%** for the
  one surface that already had one-click updates on day one.
- **Decreasing metrics are the sharpest case.** Reducing 504 → 24 with
  `baseline 0` computes 2100% and clamps to a false **100%** — a key result that
  has achieved nothing reads as complete. This is a recorded scar; the progress
  model once scored decreasing KRs at 100% and inflated an org's number 12% → 32%.

**Never accept a baseline stated only in prose.** All four defects above had the
true baseline written in the KR's own title ("2 red on 2026-07-29", "48 on
2026-07-29", "baseline 1 of 5") while the data carried none of it. If the title
names a number, that number belongs in `baseline_value`.

> **The tell: a correct baseline usually LOWERS the number.** Objective `31e17359`
> fell from a false 6.67% to an honest 0.00% once its four baselines were set.
> Any baseline "fix" that RAISES a score deserves suspicion — you have probably
> just re-credited pre-existing work.

---

## Direction of authorship (non-negotiable)

**Objectives and key results are SET by a human — or by a persona a human
delegated to — in conversation. They are never derived from repo activity.**
(Decision `db3a359e`.)

Inference may PROPOSE; it may never DECIDE. Bottom-up lanes can surface candidate
strategy into `okr_proposals`; only a human accept materializes it.

The reason is not taste. **A derived OKR is unfalsifiable:** if the objective is
generated from work already done, it can never report that the work was wrong,
and every key result is on-track by construction. The single capability that
makes an OKR worth having is its ability to say *no*.

The evidence is in this org's own history — an inference-first pass produced
8 objectives named after repo directories (`Src`, `Bin`, `Packages`,
`Harnesses`, `.cascade`, `Skills`, `Cascade Web` ×2), 37 archaeology-inferred
key results, and 1,206 rows of linkage. All of it was later deleted or
cancelled: a ~100% mortality rate on generated intent.

**Retroactive work is honored as narrative, never force-fit into live key
results**, and alignment is measured only from day zero forward.

---

## Quick checklist

Before writing any objective or key result:

- [ ] Objective is qualitative — no number in it (check 1)
- [ ] Objective is a sentence someone could argue against (check 3)
- [ ] "We will ___ as measured by ___" reads naturally (check 2)
- [ ] 2–4 key results per objective — the focus limit is **per node of the tree**,
      not per organization
- [ ] Every KR can come back NO (check 4)
- [ ] Every KR measures an outcome, not an activity (check 5)
- [ ] Every KR has an explicit baseline AND target, both in DATA not prose (check 6)
- [ ] Baselines sanity-checked: does the resulting % look *lower* than you expected?
- [ ] Every statement came from a human or a delegated persona, not from a commit
