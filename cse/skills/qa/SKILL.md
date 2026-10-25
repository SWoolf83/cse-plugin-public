---
name: qa
description: Use when you want to run a QA workflow on your current change — pick/compose the org's QA workflows and get a pass/fail/uncertain verdict.
when_to_use: Runs a QA workflow on your current change. Lists the org's QA workflows just-in-time (defaults auto-materialized — never empty), lets you pick or compose/sequence several mid-stream, then executes each — git-diff surface detection, browser-MCP screenshot, pass/fail/uncertain verdict — recording the run in workflow_executions. Delegates to /cse:gate qa.
argument-hint: "[optional: workflow name or one-line surface override, e.g. \"the settings page\"]"
allowed-tools: Bash(git *), Bash(date *), Bash(pwd), Read, Glob, Grep, Skill, mcp__cascade-api__cascade_workflow, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__list_console_messages, mcp__playwright__browser_navigate, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_console_messages, mcp__puppeteer__puppeteer_navigate, mcp__puppeteer__puppeteer_screenshot
---

# Cascade QA Workflow Runner (`/cse:qa`)

`/cse:qa` is a **thin alias** of the generic gate runner (`/cse:gate`) with **`category='qa'`**.
There is exactly one runner; QA is its first special case. This keeps QA behavior unchanged while
the same run-loop drives every other gate category (`review`, and future `security`/`eval`).

## How to run

**Invoke the gate runner skill by name** — use the `Skill` tool to run **`cse:gate`** with args
`qa $ARGUMENTS`, and follow it as the single authoritative run-loop. (Invoke by skill name, never
by file path: in the installed plugin this file and the gate runner live under the plugin root,
so repo-relative paths do not resolve.) For orientation, the run-loop is:

1. **List** the org's QA workflows JIT: `cascade_workflow mode="list" category="qa"`. Defaults
   are auto-materialized on first use (e.g. `qa-quick-smoke`), so the list is **never empty**.
2. **Present** the workflows as a numbered multiple-choice list; let the user pick one or
   compose/sequence several. Treat `$ARGUMENTS` as a workflow-name pre-select or a one-line
   surface override.
3. **Execute** each chosen workflow agent-driven via the **`qa` path** in the gate runner:
   detect the changed surface from `git diff`, map `cascade-web/src/app/**` to App Router URLs,
   preflight a browser MCP (chrome-devtools / playwright / puppeteer — **stop with setup guidance
   if none is present, never a silent failure**), and screenshot each affected route on the dev
   server (default `http://localhost:3000`), pulling console messages where supported.
4. **Verdict:** emit exactly one of **pass / fail / uncertain** per run. `uncertain` is a distinct
   terminal state (surface unreachable, ambiguous diff, or no browser MCP) and **must never be
   reported as `pass`**.
5. **Record:** close the run with `cascade_workflow mode="complete_execution"`, carrying the
   verdict in `output_summary.verdict` and the routes actually verified in
   `output_summary.surface` (lifecycle `status` stays separate). QA runs are not tied to a
   package by default, so the package `record_gate` step is skipped.

This summary is orientation only — the **`cse:gate` skill is the authoritative run-loop**
(JIT get/start/complete execution calls, verdict evidence table). This file deliberately carries
no divergent logic so QA and every other gate stay in lockstep.
