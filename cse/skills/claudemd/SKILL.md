---
name: claudemd
description: Use when you want CLAUDE.md regenerated from Cascade context — scan + org + prefs; shows the diff, writes only on explicit consent.
when_to_use: Adaptive CLAUDE.md generation. Assembles one source model from the latest codebase scan, org context, and portable AI preferences (degrading gracefully when a source is sparse), renders a LEAN managed block between cascade:managed markers, and merges it diff-before-write — content outside the markers is never touched, re-runs with the same inputs are zero-diff idempotent, and the generated base is model-agnostic (per-model tuning lives only in variants/{model}/ overlays). Triggers on "regenerate CLAUDE.md", "update my CLAUDE.md from Cascade", "claudemd".
argument-hint: "[--write to apply after reviewing the diff]"
allowed-tools: Bash(node *cascade.js *), Bash(cascade *), Read, Glob
---

# Adaptive CLAUDE.md

Regenerate the Cascade-managed section of this repo's `CLAUDE.md` from live organizational knowledge. Deliberate invocation only — this skill never runs as a side effect of other work.

## The managed-block contract

The generated content lives between explicit markers:

```
<!-- cascade:managed:start -->
...generated content...
<!-- cascade:managed:end -->
```

- **Content outside the markers is NEVER touched** — hand-written instructions above or below the block are byte-preserved on every regeneration.
- **Markers present** → only the region between them is replaced.
- **File exists without markers** → the managed block is APPENDED (clearly separated); existing content is never modified.
- **No `CLAUDE.md` at all** → offer a fresh LEAN file (just the managed block + minimal surrounding).
- **Idempotent** — re-running with the same inputs produces a zero diff. `cascade claudemd --check` verifies this (exit 0 = up to date).
- **Model-agnostic base** — the generated block contains NO per-model instructions. Per-model tuning lives only in `variants/{model}/` overlays loaded by the runtime selector, never in this file.

## Sources (one model, sparse-tolerant)

The generator assembles ONE source model consumed by pluggable emitters (CLAUDE.md today; an AGENTS.md twin is a planned future emitter over the same model):

1. **Latest codebase scan** — `.cascade/context/scans/codebase-latest.json` (stack, architecture, conventions), materialized by `cascade sync`.
2. **Org context** — `.cascade/context/system/org-context.json` + top decision patterns from `.cascade/context/patterns/patterns.json`.
3. **Portable AI preferences** — `ai_preferences` (user + org, merged user-over-org) fetched live.

When a source is sparse or absent the generator degrades gracefully to the remaining ones (preferences are commonly sparse → scan + org context only). The CLI prints which sources loaded.

## Instructions

### 1. Freshen sources (optional but recommended)

If `.cascade/context/` is missing or stale (check `.cascade/context/.sync-meta.json`):

```bash
node bin/cascade.js sync --force
```

### 2. Generate and SHOW THE DIFF

```bash
node bin/cascade.js claudemd
```

This prints a unified diff of the proposed change and the source-availability line. **It never writes.** Relay the diff to the user, noting:
- whether this updates an existing managed block, appends a new one, or offers a fresh lean file;
- which sources were loaded vs. degraded.

If the output says the file is already up to date, report that and stop.

### 3. Write ONLY on explicit user consent

Ask the user whether to apply. Only after they explicitly confirm:

```bash
node bin/cascade.js claudemd --write
```

Never run `--write` unprompted, and never edit the managed block by hand — hand edits inside the markers are overwritten on the next regeneration.

### 4. Verify (optional)

```bash
node bin/cascade.js claudemd --check
```

Exit 0 = the file matches what regeneration would produce (idempotence holds). Exit 1 = drift; show the diff again.
