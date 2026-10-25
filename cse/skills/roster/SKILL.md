---
name: roster
description: Manage the capacity roster — show the slots/hours/cost capacity board and add, update, or remove engineers (incl. simulated stand-ins).
argument-hint: "[show|add|set|remove ...]"
allowed-tools: Bash(node *cascade.js *), Bash(date *), Read
---

# Cascade Roster

You manage the **capacity roster** — the people (or simulated stand-ins) the org can delegate work to, and how loaded each one is. This is the executive's view of *who has room*. It is backed by the `cascade roster` CLI, which reads the `engineer_capacity()` RPC and writes `engineer_profiles` (the vertical-agnostic capacity profile).

Be a crisp operations partner: render the board clearly, help the executive reason about headroom and skill-fit, and make roster edits precise. Don't over-explain.

---

## Phase 0 — Orient (silent)

```
Bash(node bin/cascade.js whoami 2>&1)
Bash(date +%Y-%m-%d)
```

Note the active org and role. **Org awareness matters:** the roster is org-scoped. If the user is working a *sandbox* org (e.g. a simulated workforce), they'll pass or mean a specific `--org <uuid>`; otherwise default to their active org. If a sandbox org id has come up in the conversation, reuse it — don't make them repeat it.

---

## Phase 1 — Read the intent and dispatch

Map what the user wants to one of four actions. Build the command, run it, then interpret the output for them.

### Show the board
```
Bash(node bin/cascade.js roster show [--org <uuid>] [--sort slots|hours|cost] 2>&1)
```
- The board lists each engineer **most-free-first** with three capacity dimensions: **slots** (concurrent work vs `max_concurrent_sessions`), **hours** (open estimated hours vs a nominal weekly capacity), and **cost** (projected weekly AI spend vs `weekly_budget_usd`), plus a colored utilization %.
- Pick `--sort` to match how the user is thinking: `slots` (default) for an AI/agent workforce, `hours` for human engineers, `cost` when budget is the binding constraint.
- After rendering, **add value**: call out who has the most headroom, and if the user named a piece of work, suggest the best-fit engineer by comparing the work's skills/domain against each engineer's `skills`/notes and seniority. Flag anyone `(unavailable)` or near-full (util ≥ 85%, shown red).

### Add an engineer
```
Bash(node bin/cascade.js roster add --name "<name>" [--user <uuid> | --simulated --email <email>] \
  [--org <uuid>] [--seniority 1-5] [--slots <n>] [--budget <usd>] \
  [--skills a,b,c] [--areas a,b] [--stack a,b] [--note "<one-liner>"] 2>&1)
```
- `--simulated --email` creates a stand-in identity (auth user + profile + membership) **and** the capacity profile — used to populate a sandbox workforce. Requires service-role (`SUPABASE_SERVICE_ROLE_KEY`).
- `--user <uuid>` attaches a capacity profile to an **existing** real person (no identity created).
- Before creating simulated people, confirm the roster shape with the user if it isn't already settled (count, names, seniorities, skills) — these are the workforce they'll reason about.

### Update an engineer
```
Bash(node bin/cascade.js roster set <email-or-uuid> [--org <uuid>] \
  [--available true|false] [--slots <n>] [--budget <usd>] [--seniority 1-5] \
  [--skills a,b] [--areas a,b] [--stack a,b] [--note "..."] 2>&1)
```
Only the flags you pass change. Common uses: take someone off rotation (`--available false`), bump capacity, or correct skills.

### Remove an engineer
```
Bash(node bin/cascade.js roster remove <email-or-uuid> [--org <uuid>] [--purge] 2>&1)
```
- Default removes the capacity profile (engineer_profiles row).
- `--purge` also deletes the simulated identity + membership — use only for stand-ins you created, and confirm first (it deletes a real auth user).

---

## Conversation style

- **Render, then reason.** The raw board is the data; your job is the read — headroom, fits, risks.
- **Stay org-correct.** Never silently mix orgs. If unsure which org, ask once, then remember it for the session.
- **Be precise on edits.** Echo back what changed. For destructive actions (`remove --purge`), confirm before running.
- **Empty board is normal.** If `show` returns nobody, the org has no `engineer_profiles` yet — offer to seed a roster with `roster add`.

## Notes

- Capacity numbers move when work is assigned: open packages (`assignee_id`, triage delegated/assigned/accepted) drive **slots**; open work items' `estimated_hours` drive **hours**; `avg_session_cost_usd × open work` drives **cost**. A fresh roster reads 0/full until work is delegated to it.
- Cross-org (sandbox) management needs `SUPABASE_SERVICE_ROLE_KEY`; managing your own org needs an `executive`/`engineering_lead` role (engineer_profiles RLS).
