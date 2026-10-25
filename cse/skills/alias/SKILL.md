---
name: alias
description: Use when you want to rename a skill — create, list, sync, or remove personal aliases (slash + conversational triggers) for any skill.
when_to_use: Create, list, sync, or remove personal aliases for any skill. Aliases persist to your portable AI profile and travel with your account across devices and orgs. Rename skills to whatever feels natural — slash commands and conversational triggers.
argument-hint: "[create | list | sync | remove <alias-name>]"
allowed-tools: Read, Write, Bash(ls *), Bash(rm -rf *), Bash(mkdir *), cascade_sync_ai_preferences
---

# /cse:alias — Personalize Your Skill Vocabulary

Let users rename any skill to whatever feels natural. Creates both a local slash command alias and persists to the user's cloud AI profile so aliases travel across devices and orgs.

## How It Works

Aliases are thin skill wrappers installed to `~/.claude/skills/`. Each alias SKILL.md delegates to the original skill. The description includes conversational trigger phrases, which appear in the skills list that Claude sees in every conversation — so natural language matching works automatically.

Aliases also persist to Supabase via the `cascade_sync_ai_preferences` MCP tool. When a user moves to a new machine or joins a new org, their aliases come with them.

## Modes

Parse `$ARGUMENTS`:

- **No args or "create"** → Interactive alias creation
- **"list"** → Show all existing aliases (local + cloud)
- **"sync"** → Bidirectional sync between local and cloud
- **"remove \<name\>"** → Remove an alias (local + cloud)

---

## Mode 1: Create an Alias

Guide the user through an interactive flow. Keep it conversational, not robotic.

### Step 1 — Discover available skills

Scan for installed skills:
```bash
ls ~/.claude/skills/
```

Present them as a clean list. Don't show aliases (they'll have a `.cascade-alias` marker file).

### Step 2 — Ask which skill to alias

Ask: "Which skill do you want to rename?" The user can type the name or pick from the list.

### Step 3 — Ask what they want to call it

Ask: "What do you want to call it? This becomes your slash command — like `/my-name`."

Validate the name:
- Convert to lowercase, replace spaces with hyphens, strip non-alphanumeric/hyphen characters
- Warn if it conflicts with an existing skill name
- Show them what the slash command will be: "Got it — you'll be able to type `/whats-happening` to invoke this."

### Step 4 — Ask for conversational triggers (optional)

Ask: "Any casual phrases you'd use to mean this? Like 'anything new?' or 'check my feed'. These let me recognize what you mean without the slash command. Separate with commas, or skip."

### Step 5 — Create the local alias

1. Create the directory:
   ```bash
   mkdir -p ~/.claude/skills/{alias-slug}
   ```

2. Read the original skill's SKILL.md to get its description and argument-hint:
   ```
   Read ~/.claude/skills/{original-skill}/SKILL.md
   ```

3. Write the alias SKILL.md:

   ```markdown
   ---
   name: {alias-slug}
   description: "{user's conversational triggers, if any} → Alias for /{original-skill}. {original description}"
   argument-hint: "{original argument-hint}"
   allowed-tools: Skill
   ---

   # /{alias-slug}

   This is a personal alias for **/{original-skill}**.

   ## Instructions

   Immediately invoke the original skill using the Skill tool:

   - Skill name: `{original-skill}`
   - Pass through any `$ARGUMENTS` unchanged

   Do not add any preamble. Do not explain what you're doing. Just invoke the original skill directly as if the user had typed `/{original-skill} $ARGUMENTS`.

   ## Conversational Triggers

   If the user says any of these in natural conversation (not as a slash command), recognize it as a request to invoke /{original-skill}:

   {trigger phrases as a bulleted list}

   When you see these phrases, invoke /{original-skill} — don't ask for confirmation.
   ```

4. Write a marker file so we can distinguish aliases from real skills:
   ```
   Write ~/.claude/skills/{alias-slug}/.cascade-alias with content: {original-skill}
   ```

### Step 6 — Persist to cloud

Call `cascade_sync_ai_preferences` with:
- `mode: "upsert"`
- `alias: "{alias-slug}"`
- `original_skill: "{original-skill}"`
- `triggers: ["{trigger1}", "{trigger2}", ...]`

If the MCP call fails (not authenticated, server unavailable), tell the user: "Alias created locally. Cloud sync unavailable — run `cascade login` to enable cross-device sync." Do NOT block local creation on cloud success.

### Step 7 — Confirm

```
Alias created!

/{alias-slug} → /{original-skill}  [synced to cloud]

Slash command: /{alias-slug}
Conversational triggers: {list of phrases}

This alias is saved to your AI profile and will follow you across devices and orgs.
```

---

## Mode 2: List Aliases

Show aliases from both local and cloud sources.

### Step 1 — Gather local aliases

Scan `~/.claude/skills/` for directories containing a `.cascade-alias` marker file:
```bash
ls ~/.claude/skills/
```
For each directory, check if `.cascade-alias` exists. If so, read it to get the original skill name.

### Step 2 — Gather cloud aliases

Call `cascade_sync_ai_preferences` with `mode: "read"`.

### Step 3 — Merge and present

Cross-reference local and cloud aliases. Present with sync status badges:

```
YOUR SKILL ALIASES

  /{alias}  →  /{original}  [synced]
     Triggers: "phrase 1", "phrase 2"

  /{alias}  →  /{original}  [cloud only]
     Triggers: "phrase 1"
     Run /cse:alias sync to install locally

  /{alias}  →  /{original}  [local only]
     Triggers: "phrase 1"
     Run /cse:alias sync to push to cloud

{count} aliases total. Use /cse:alias sync to synchronize.
```

If no aliases found: "No aliases yet. Use /cse:alias to create one."

---

## Mode 3: Sync

Bidirectional sync between local skill directories and cloud AI profile.

### Step 1 — Read cloud aliases

Call `cascade_sync_ai_preferences` with `mode: "read"`.

### Step 2 — Scan local aliases

Scan `~/.claude/skills/` for `.cascade-alias` marker files.

### Step 3 — Sync cloud → local

For each cloud alias not present locally:
1. Create the local alias directory and SKILL.md (same as Mode 1 Step 5)
2. Write the `.cascade-alias` marker

### Step 4 — Sync local → cloud

For each local alias not in cloud:
1. Read the `.cascade-alias` marker to get the original skill
2. Read the SKILL.md to extract trigger phrases from the description
3. Call `cascade_sync_ai_preferences` with `mode: "upsert"`

### Step 5 — Report

```
ALIAS SYNC COMPLETE

  ↓ Pulled from cloud: {count}
    {list of pulled aliases}

  ↑ Pushed to cloud: {count}
    {list of pushed aliases}

  ✓ Already in sync: {count}
```

---

## Mode 4: Remove an Alias

Parse the alias name from `$ARGUMENTS` (everything after "remove").

1. Check that the skill exists and is actually an alias (has `.cascade-alias` marker):
   ```
   Read ~/.claude/skills/{alias-name}/.cascade-alias
   ```

2. If not an alias: "That's a real skill, not an alias. I won't delete it."

3. If it is an alias, confirm with the user: "Remove /{alias-name} (alias for /{original})?"

4. On confirmation, remove locally:
   ```bash
   rm -rf ~/.claude/skills/{alias-name}
   ```

5. Remove from cloud:
   Call `cascade_sync_ai_preferences` with `mode: "remove"`, `alias: "{alias-name}"`.

6. Confirm: "Removed /{alias-name} from local and cloud. The original /{original-skill} is still available."

---

## Conversation Style

- Keep it casual and quick — this should feel like renaming an app on your phone
- Show the user exactly what they're getting (the slash command, the triggers)
- Don't over-explain how aliases work internally
- If they pick a name that's already taken, suggest alternatives
- Encourage creative names — the whole point is personalization
- Mention the cloud sync briefly ("saved to your AI profile") but don't make it the focus

## Validation Rules

- Alias names: lowercase letters, numbers, hyphens only. Min 2 chars, max 40 chars.
- Cannot alias to a non-existent skill
- Cannot overwrite a real (non-alias) skill
- Can overwrite an existing alias (ask first: "You already have /{name} pointing to /{other}. Replace it?")
- Conversational triggers: any natural language, stored as-is in the description
