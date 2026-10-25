---
name: receive
description: Receive delegated packages from your inbox — view assignments, pull full context, accept work, and launch CSE execution.
argument-hint: "[package-id to pull directly, or leave empty to browse inbox]"
allowed-tools: Read, Write, Edit, Bash(node *cascade.js *), Bash(date *), Bash(pwd), Bash(ls *), Bash(mkdir *), Glob, Grep
---

# Cascade Receive

Receive and onboard into delegated packages. This is the recipient's entry point for work that has been assigned via the Cascade delegation system.

---

## Phase 1 — Check Inbox

Call the cascade-mcp `cascade_list_packages` tool with `inbox: true` to see packages assigned to you that are ready to accept.

If the user provided a package ID as the argument, skip to Phase 2 with that ID.

If no packages are in the inbox, report:

> Your inbox is empty — no packages are awaiting acceptance.

and stop.

If packages are found, display them in a clear list:

```
Inbox ({count} packages)
────────────────────────
1. {title}
   Status: {status} | Type: {packageType} | From: {createdBy}
   {description (first 100 chars)}

2. ...
```

Ask which package to pull. If there's only one, offer to pull it directly.

---

## Phase 2 — Pull Package Context

Call `cascade_pull_package` with the selected package ID (include_thread_events: true, include_spec: true).

Parse the response and render an **onboarding overview**:

```
Package: {title}
═══════════════════════════════════════════════════
Intent:       {description}
Status:       {status}
Executor:     {executorType}
Delegated by: {createdBy}

Delegation Context
──────────────────
{typeData.delegation content — scope, constraints, notes from delegator}

Spec Summary (if spec exists)
─────────────────────────────
Must-haves:   {count}
Waves:        {count}
Assumptions:  {count}
Scope:        {scopeBoundaries summary}

Thread History ({threadEventsCount} events visible)
───────────────────────────────────────────────────
{List last 5 events: type, title, date}
```

If a spec is attached, also show:
- The intent statement
- Must-have truths (numbered list)
- Execution waves (numbered, with task counts)
- Scope boundaries

---

## Phase 3 — Accept and Launch

Ask the user:

> Ready to accept this package and begin execution?
> - **Yes** — accept the package, save the spec locally, and launch the CSE executor
> - **Review** — I have questions before accepting (use cascade_ask_question to send them back)
> - **Skip** — return to inbox without accepting

### On "Yes":

1. Call `cascade_accept_package` with the package ID to transition it to `executing`.

2. If a spec exists in the pull response, save it locally:
   ```
   Write(.cascade/specs/{spec-filename-from-title}.json, spec.data)
   ```

3. Report acceptance and provide the CSE executor handoff:

   ```
   Package accepted — status transitioned to 'executing'.
   Spec saved to: .cascade/specs/{filename}.json

   To begin execution, run:
     /cse:spec execute .cascade/specs/{filename}.json
   
   Or I can launch it now — shall I proceed?
   ```

   If the user confirms, invoke `/cse:spec` with the spec file path.

### On "Review":

Ask what questions they have. For each question, call `cascade_ask_question` to send it back to the delegator via the thread. Then wait — the user can re-run `/cse:receive` later to check for responses.

### On "Skip":

Return to inbox display or end.

---

## Error Handling

- If authentication fails: "Not authenticated. Run `cascade login` first."
- If package not found: "Package {id} not found or not accessible."
- If accept fails (wrong status): Report the current status and suggest checking with the delegator.
- If spec save fails: Report the error but note that the package was still accepted — the user can pull the spec manually.
