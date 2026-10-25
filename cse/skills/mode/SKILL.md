---
name: mode
description: Activate a working mode (vibe, strategy, debug, etc.) and pull in context from previous sessions in that mode. Save session notes when done.
argument-hint: "[mode name | list | save]"
allowed-tools: cascade_get_context_pad, cascade_save_context_pad, cascade_list_context_pads, Read, Write
---

# /cse:mode — Persistent Working Modes

Modes are how you keep conversations alive across sessions. Each mode has a context pad — session notes the AI writes at the end and pulls back in at the start, even on a different device or weeks later.

## Parse `$ARGUMENTS`

- **No args or "list"** → List mode
- **"save"** → Save mode (write session notes to current mode's pad)
- **Any other text** → Activate mode

---

## Mode: List

Show all active context pads.

1. Call `cascade_list_context_pads`
2. Present as a clean list:

```
YOUR MODES

  strategy — 4 sessions, last active 2 days ago
  debug — 1 session, last active today
  vibe — 7 sessions, last active 1 week ago

3 active modes. Say "/cse:mode <name>" to activate one.
```

If no pads exist: "No modes active yet. Start one with `/cse:mode vibe` or any mode name you like."

---

## Mode: Activate

The user wants to enter a mode. This is the core flow.

1. Call `cascade_get_context_pad` with the mode name.

2. **If the pad exists** (previous session notes found):

   Read the pad_content carefully. This is context from your past self — treat it as a warm handoff. Present it naturally:

   ```
   ENTERING [MODE] MODE — session [N+1]
   Last session: [relative time]

   [Summarize the key points from the pad in 3-5 lines — what you were
   working on, what threads were open, what you wanted to remember]

   Ready to continue. What's on your mind?
   ```

   DO NOT dump the raw pad content. Synthesize it into a briefing. You wrote these notes — now use them to be a better collaborator.

3. **If no pad exists** (first time in this mode):

   ```
   ENTERING [MODE] MODE — first session

   Starting fresh. I'll save notes at the end so we can pick up
   where we left off next time.

   What are we working on?
   ```

4. **After activating**, adjust your behavior to the mode:
   - **vibe** — Creative, exploratory, loose. Brainstorming energy. More questions, less structure.
   - **strategy** — Big picture, business-level. Focus on direction, tradeoffs, market dynamics.
   - **debug** — Precise, methodical. Follow evidence. Reproduce first, hypothesize second.
   - **research** — Deep investigation. Cite sources, consider alternatives, build a picture.
   - **legal** — Careful, precise language. Risk awareness. Document assumptions.
   - **build** — Heads-down implementation. Less discussion, more code. Ship it.
   - **review** — Critical eye. Look for what's wrong, what's missing, what could be better.
   - Custom modes: infer the vibe from the name and adapt.

---

## Mode: Save

The user (or the AI proactively) wants to save session notes before ending.

1. Reflect on the current conversation. Write session notes that your future self will find useful:

   **Include:**
   - What we worked on this session
   - Key decisions made and why
   - Open threads — things we started discussing but didn't finish
   - The user's current mood/energy/priorities (if apparent)
   - Specific items to follow up on next time
   - Any preferences or patterns you noticed about how the user likes to work

   **Don't include:**
   - Raw code dumps
   - Exact file paths (they'll change)
   - Timestamps (the metadata handles this)
   - Anything you can re-derive from the codebase

2. Build metadata:
   ```json
   {
     "topics": ["topic1", "topic2"],
     "open_threads": ["thread that needs follow-up"],
     "mood": "energized" | "focused" | "frustrated" | "exploratory"
   }
   ```

3. Call `cascade_save_context_pad` with the mode, content, and metadata.

4. Confirm briefly:
   ```
   Session notes saved for [mode] mode (session [N]).
   [1-line summary of what was captured]
   ```

---

## Proactive Save Behavior

If you detect the conversation is winding down (user says "thanks", "that's it", "gotta go", or shifts to a clearly different topic), and you're in an active mode, offer once:

> "Want me to save session notes for [mode] mode before we switch gears?"

One line. Don't nag. If they say no, drop it.

---

## Quality Gates

- Never dump raw pad content — always synthesize into a human-readable briefing
- Session notes should be written in first person (you're writing to your future self)
- Keep pad_content under 2000 chars — this is a scratchpad, not a transcript
- Always include the session count in the activation message
- Mode names are lowercase, no spaces (use hyphens for multi-word modes)
