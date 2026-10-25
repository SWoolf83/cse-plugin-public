# Model variants (runtime overlays)

Per-model context overlays, selected at session start by the SessionStart
hook (`hooks/scripts/session-start.js`, source
`src/daemon/hooks/model-overlay.ts`). When the hook can determine the active
model — from the hook's stdin `model` field, falling back to the `model` key
in `.claude/settings.json` (cwd-relative, then `~/.claude`) — and a matching
directory exists here, its content is appended to the session context as a
plain stdout block. Unknown model, or no matching directory → neutral base:
nothing is injected.

## Layout & matching rule

```
variants/
  <model-slug>/       # e.g. claude-fable-5/
    *.md              # all .md files, concatenated in sorted filename order
```

Matching is deliberately simple:

1. **Exact id** — the model id, slugified (lowercased; runs of characters
   outside `[a-z0-9._-]` become `-`): `claude-fable-5` →
   `variants/claude-fable-5/`.
2. **Family fallback** — the exact slug with one trailing `-YYYYMMDD` date
   suffix stripped: `claude-sonnet-4-20250514` → `variants/claude-sonnet-4/`.

## Variant flavors

Two kinds of overlay content live here:

- **Content tuning** — phrasing/emphasis adjustments that a specific model
  demonstrably needs (e.g. tighter guardrail wording, different verbosity
  calibration).
- **Phase-routing rules** — per-model guidance on which pipeline phases or
  workflows the model should prefer, defer, or hand off.

## Evidence gate — why this directory is empty

This directory ships **intentionally empty**. A variant is added only when it
graduates through `/cse:self-eval`: measured behavior for that model must
diverge from the base past the divergence bar before a per-model overlay is
justified. The base `CLAUDE.md` stays **model-agnostic** — overlays are the
only place model-specific instructions may live, and each one must carry
evidence, not vibes.

## Overlay-stack composition (org overlay + model overlay)

The model overlay above is one layer in an **ordered overlay stack** the
SessionStart hook composes into a single injected block
(`composeOverlays()` in `src/daemon/hooks/model-overlay.ts`). The stack, in
render order:

1. **Org overlay** — the active org's conventions, materialized to
   `.cascade/context/overlays/org.md` (see below).
2. **Model overlay** — this directory, matched as above.

Each layer renders as a labeled, attributable section
(`## Cascade org overlay` / `## Cascade model overlay: <slug>`) so the two are
independently readable and a change to one never reorders the other. Each
source is capped to a per-source char budget (truncated with an explicit note)
and the **total injected-token count is logged** — a guard against overlay
bloat. With no layers present the hook writes **nothing**, byte-identical to
the no-overlay baseline (`composeOverlays([]) === ""`).

### Org overlay — `.cascade/context/overlays/org.md`

A **managed** file (do not hand-edit) materialized by `cascade sync` from
existing org surfaces — recurring **patterns**, **co-work rules**, and **brand
config** — for the *active* org, **clearance-filtered by the syncing user's
role** (the Scout clearance model: `sensitivity → tier ≤ role clearance`,
fail-closed). Source: `src/overlays/org-overlay-materializer.ts`.

- **Compose-only (v1):** content derives *solely* from those already
  materialized surfaces. There is **no self-eval learning loop** here — nothing
  mutates overlay content from session signal (deferred to phase 2).
- **Offline-tolerant:** the hook reads the local file only — no network on the
  hot path. Missing/garbage file → neutral base (no org block).
- **Isolation:** the overlay is stamped with its org id and read only from the
  active project's `cwd`, so a session never surfaces a foreign org's overlay
  (single-org dogfood; multi-tenant read-time re-filtering deferred).
