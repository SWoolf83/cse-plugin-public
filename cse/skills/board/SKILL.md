---
name: board
description: Show the Cascade kanban board of engineering sessions (queued, running, completed).
allowed-tools: Bash(node *cascade.js *)
---

# Cascade Board

Display the kanban board showing all engineering sessions organized by status.

## Usage

Show the board (renders once):
```bash
node bin/cascade.js board --once
```

The board displays three columns:
- **QUEUED** — Sessions waiting to be picked up by a daemon
- **RUNNING** — Sessions currently being executed
- **DONE** — Completed, failed, or cancelled sessions (most recent 20)

Each card shows the session ID, subject, type, priority, and time since creation.

To inspect a specific session in detail:
```bash
node bin/cascade.js inspect <session-id>
```
