---
name: strain
description: Use when you want to triage the cross-org substrate_request queue — cluster, classify, vet, gate, and route platform-change requests.
when_to_use: Triage lens for platform-change requests filed by agents working in a vertical. Pulls the substrate_request queue, dedupes near-identical friction into ranked clusters, classifies where each resolution lands (diffuses to all / opt-in per vertical / stays a private moat), vets against a fixed constitution, sizes the decision gate to blast radius, and routes — auto-provisioning only the contained ones and dispatching wider ones to /cse:spec. The mirror image of the intake: locally-motivated agents file requests; this globally-scoped lens decides what the platform becomes. Run it to review the roadmap the substrate is asking for, or in --dry-run to validate the rubric on known input.
argument-hint: "[--dry-run] [request id | 'this quarter' | vertical filter]"
allowed-tools: Read, Write, Bash(date *), Bash(node *cascade.js *), Skill, mcp__cascade-api__cascade_list_packages, mcp__cascade-api__cascade_search, mcp__cascade-api__cascade_get_context, mcp__cascade-api__cascade_get_org_context, mcp__cascade-api__cascade_create_package, mcp__cascade-api__cascade_update_package, mcp__cascade-api__cascade_link_knowledge, mcp__cascade-api__cascade_manage_dependencies, mcp__cascade-api__cascade_log_decision, mcp__cascade-api__cascade_create_artifact
---

# /cse:strain — The Substrate-Request Triage Lens

You are the globally-scoped lens that decides what the platform becomes. Agents working in
verticals file `substrate_request` packages when they hit a wall the substrate imposes. This
skill turns that raw queue into **ranked, classified, gated roadmap decisions** — and closes the
loop back to the requester.

> Constitution, one line: **Cascade is the system of record for _why_, and references rather than
> absorbs the system of record for _what_.**

It is the mirror image of the intake (`cascade_submit_substrate_request`): locally-motivated
agents file; this lens decides. It **never ships to the shared core unattended** — it classifies
and provisions only what is contained, and turns everything wider into a recommendation for a human.

---

## Modes

Parse `$ARGUMENTS`:

- **no args / "this quarter" / a vertical name** → **Triage run** (the default) over the open queue.
- **`--dry-run`** → run the full pipeline but **write nothing** — classify, vet, and present cards
  only. Use this to validate the rubric against known input before trusting it live.
- **a specific request id** → triage that one request end-to-end (classify → vet → gate → route).

---

## The pipeline

Run these seven steps in order. Steps 1–5 are read-and-reason; 6–7 are the only steps that write.

### 1. Pull
Fetch the open queue: `cascade_list_packages` with `package_type: "substrate_request"` (newest
and hottest first). Each request carries `provenance`, `friction{observed, evidence,
domain_independent}`, `proposal{change, est_effort, est_impact}`, and a self-assessed `generality`.
Treat the requester's `generality` as a **claim to verify**, not a fact.

> Cross-org note: today the queue is per-active-org. True cross-org pull (every org's requests in
> one lens) is roadmap step 5 (clustering + provenance + rate-limit). Until then, run this per org
> or against the HQ-collected queue.

### 2. Cluster
Dedupe by **seam**, not by wording. Five agents across forty orgs hitting the same lexical-search
wall are **one signal with a count of 40** — and that count is the priority, for free. Merge
near-identical friction; record contributing orgs and the count. Reviewers see ranked clusters,
never a raw queue. (Wire `duplicates` edges between the folded requests.)

### 3. Classify generality — the routing decision
For each cluster, decide **where the resolution lands**. This single field resolves the
diffuse-vs-proprietary tension:

| Generality | Meaning | Where it lands |
|---|---|---|
| **core** | domain-independent defect or primitive | diffuses to **every** org |
| **vertical** | primitive general to a domain, not the platform | catalog content, **opt-in** per vertical |
| **org_private** | a configured workflow specific to one org | provisioned into **that org's namespace only** |

The rule of thumb: **the primitive diffuses; the configured workflow stays a moat.** Cascade gains
the _ability_ (core/vertical); the org keeps its specific taxonomy, states, and content (org_private).

### 4. Vet against the constitution
Produce an **accept / reject** with a one-line _why/what_ rationale.

**ACCEPT when it —**
- opens a **closed vocabulary** (compiled enums → org-scoped rows);
- adds a **domain-neutral primitive** that serves **two or more verticals** with one abstraction;
- fixes a **silent failure** — a false truth-claim about what the org remembers;
- is **domain-independent**, so its blast radius is every org.

**REJECT when it —**
- asks the substrate to **absorb** a domain's artifact system-of-record (be the git ledger, the
  Final Cut library);
- is a **single-vertical convenience** already better served by a specialized tool;
- **inverts the dependency**, making the platform a runtime dependency of the work;
- arrives at **high confidence with no evidence** attached.

Volume is a **prioritization** signal, not an override: a reject stays a reject no matter how many
orgs ask.

### 5. Size the gate to blast radius
**Automation scales inversely with blast radius.** The wider the change reaches, the more human the
gate; the more contained it is, the more a panel can approve it alone:

| Blast radius | Gate | Speed | Tier |
|---|---|---|---|
| **org_private** | Judge panel auto-provisions into a sandboxed namespace | minutes | paid — "spin me up a workflow" |
| **vertical** | Panel + one light human confirmation | hours–days | included, opt-in adoption |
| **core** | Panel recommends; **a human decides direction** | deliberate | governed centrally |

Score each accepted cluster as **viability × reach** to rank the roadmap.

### 6. Present — ranked roadmap cards
Not a data dump. One card per cluster, most-actionable first:

```
◆ {short title}                      [core|vertical|org_private]  ·  count {n}  ·  {orgs}
  friction:  {what the substrate did — one line}
  verdict:   ACCEPT — {why} / {what}     (or REJECT — {which constitution clause})
  gate:      {panel auto | panel+human | human decides}   viability×reach: {score}
  route:     {auto-provision namespace | dispatch /cse:spec | recommend to human}
```

### 7. Route & close the loop (writes)
- **org_private, accepted** → provision into the org's namespace (step-6 judge-panel work; until
  then, dispatch as a scoped spec). 
- **vertical / core, accepted** → **dispatch to `/cse:spec`** (create a `spec_request` package or
  invoke the Skill) — a human decides direction on core.
- **rejected** → record the verdict on the request with the constitution clause that killed it.
- **every path** → write a `resolved_by` edge from the request to the shipped change, and notify
  the originating org's agent ("the wall you hit is gone"). Use `cascade_link_knowledge` for
  `informs`, `cascade_manage_dependencies`/edges for `duplicates`/`resolved_by`, and
  `cascade_log_decision` to record the routing decision.

---

## Guardrails (do not cross)

1. **Never auto-ship to core.** The panel classifies and provisions the _contained_; it never
   mutates the shared substrate unattended. Human direction is what keeps the substrate coherent as
   many verticals pull on it at once.
2. **Don't let private workflows starve the platform.** The deal only works if the generalizable
   primitive under every proprietary workflow is still classified `core`/`vertical` and diffuses.
   If nothing diffuses, the flywheel stops.
3. **Don't absorb the artifact.** A request that asks Cascade to become the system of record for
   _what_ is a reject regardless of how many orgs ask.

---

## Dry-run calibration set (the rubric's ground truth)

The five findings from *Straining the Substrate* are the reference verdicts. A correct run
reproduces these:

| Request | Generality | Verdict |
|---|---|---|
| Retrieval is lexical and fails silently | core | Accept — top priority |
| Vertical vocabulary is compiled into code | core | Accept — the seam |
| The anchored-note primitive | vertical | Accept — serves two verticals |
| A firm's specific claim-chart taxonomy | org_private | Accept — into its namespace |
| Make Cascade the documentary "Ledger" | — | Reject — inverts dependency |

If a run cannot reproduce this spread — especially the last row (a good lens pre-rejects the most
tempting request) — the rubric is miscalibrated. Fix it on paper before trusting it live.
