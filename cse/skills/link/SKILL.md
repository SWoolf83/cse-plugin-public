---
name: link
description: Use when you want to link a knowledge node (research/intel from /cse:ingest or Scout) to the work it affects — proposes 'informs' edges.
when_to_use: Active Knowledge PROPOSE — make a knowledge node ACTIVE by linking it to the work it affects. Takes a knowledge node, fetches the org's active work packages, proposes typed 'informs' edges each with a one-line rationale + confidence, gates on human confirmation, creates the confirmed edges on the package substrate (package_edges). The inject half (cascade_get_context with package_id) then delivers that knowledge to whoever works the package, clearance-filtered by role.
argument-hint: "[<knowledge-node-id> | <nothing to pick from recent knowledge>]"
allowed-tools: Bash(node *cascade.js *), Read, Write, AskUserQuestion, cascade_list_packages, cascade_get_context, cascade_link_knowledge, cascade_get_org_context, cascade_search_research
---

# /cse:link — Active Knowledge (PROPOSE)

Knowledge nodes minted by `/cse:ingest` and Scout are dead-ends until they point
at the work they affect. `/cse:link` closes the **PROPOSE** half of the active-
knowledge loop: it proposes typed **`informs`** edges from a knowledge node to the
active work it should re-contextualize, a human confirms, and the confirmed edges
are written to the **substrate** (`public.package_edges`) — NOT the legacy
task-dependencies table.

> The relationship is the primitive. An `informs` edge means *"this knowledge
> should be in front of whoever works this package."* The **inject** half —
> `cascade_get_context { package_id }` — reads those edges and hands the knowledge
> to the working agent, **clearance-filtered by the caller's real org role** (an
> engineer never receives a confidential node). See `DESIGN.md`.

This is **provider-neutral**: nothing in the derivation path hardcodes a model or
provider. The agent judgment is "which active packages does this knowledge bear
on, and why" — see `DESIGN.md` for why v1 is agent-judgment (embeddings deferred).

---

## Phase 0 — Resolve the knowledge node

Parse `$ARGUMENTS`:
- A **knowledge node id** → use it directly.
- **Empty** → list recent knowledge nodes and let the user pick. Knowledge nodes
  are research/intelligence-type packages:
  ```
  cascade_list_packages { package_type: "research", limit: 15 }
  cascade_list_packages { package_type: "intelligence", limit: 15 }
  ```
  Present the candidates (title + one-line what-it-is) and ask which one to link.

Load the chosen node's structured fields (`what_it_is` / `why_it_matters` /
`key_points` / `provenance`) so the proposals can cite *why* it matters. You can
read it back via the inject shape or `cascade_list_packages` detail; the fields
live in the node's `type_data`.

---

## Phase 1 — Fetch the candidate work

Pull the org's **active** work packages — the things this knowledge could inform:

```
cascade_list_packages { status: "executing", limit: 50 }
cascade_list_packages { status: "planned",   limit: 50 }
```

(Skip the knowledge node itself; a node cannot inform itself.) Optionally pull org
context (`cascade_get_org_context`) to ground the judgment in current priorities.

---

## Phase 2 — Propose `informs` edges (agent judgment)

For each active package, decide whether the knowledge node **materially informs**
it. Be selective — a link is a claim that the knowledge belongs in that package's
working context. For every package you propose, produce:

- **target package** (id + title)
- **rationale** — ONE line: *how* this knowledge bears on that specific work.
- **confidence** — 0..1, your judgment that the link is relevant.

Rank by confidence. Propose only links you'd defend (confidence ≳ 0.4); drop the
rest. If nothing crosses the bar, say so and stop — not every knowledge node earns
a link.

---

## Phase 3 — Human confirms (the gate)

Present the ranked proposals and **gate on human confirmation** — this is the
judgment the loop is built around. Use `AskUserQuestion`:

- One question per proposed link (or a batched multi-select), each showing the
  target package, the rationale, and the confidence.
- Options: **Confirm**, **Skip**, optionally **Edit rationale**.

Do NOT create any edge the human did not confirm. Respect "skip all".

---

## Phase 4 — Create the confirmed edges (substrate write)

For each confirmed proposal, create the edge via the MCP tool — this writes
`public.package_edges` with `edge_type='informs'` and the rationale+confidence in
edge metadata, org-guarded (both endpoints must be in your active org):

```
cascade_link_knowledge {
  knowledge_id: "<knowledge-node-id>",   // edge PARENT (informs)
  package_id:   "<work-package-id>",     // edge CHILD  (is informed)
  rationale:    "<the confirmed one-liner>",
  confidence:   0.8
}
```

Re-linking the same pair is idempotent (the substrate dedups parent+child+type).

---

## Phase 5 — Confirm the loop closes

Report what was linked. Optionally prove the inject side now sees the knowledge,
from the perspective of whoever works the package:

```
cascade_get_context { package_id: "<work-package-id>" }
```

This returns the connected knowledge as curator-card context (what-it-is /
why-it-matters / provenance + the edge rationale), **clearance-filtered by the
caller's real role**. A working agent calling `cascade_get_context { package_id }`
at execution time now reads this knowledge as part of its spec.

If the org runs decisions-capture, log a one-line decision when a link reflects a
real strategic choice (e.g. "We will let competitive finding X constrain package
Y") — otherwise skip; routine links are not decisions.

---

## Scope (v1)

- **In:** PROPOSE (agent proposes, human confirms) + write `informs` edges to the
  substrate; the inject half is the MCP tool `cascade_get_context { package_id }`.
- **Out / deferred:** automatic drift / RE-EVALUATE (new knowledge contradicting a
  package's assumptions), embedding pre-filter for matching, the `derived_from`
  edge type, reconciling the legacy task-dependencies table, daemon-triggered
  auto-proposal, and any web UI. See `DESIGN.md`.
