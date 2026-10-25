---
name: curator
description: Use when you want to browse, discuss, and act on your Cascade curator queue (research firehose) — deep-dive, ingest, create packages.
when_to_use: Browse, discuss, and act on your Cascade curator queue — your research firehose intake. Pull items into conversation for deep dives, ingest new content, and create work packages from insights.
argument-hint: "[what's new | ingest <url> | topic to search for]"
allowed-tools: cascade_list_curator_items, cascade_get_curator_item, cascade_curator_action, cascade_ingest_curator_item, cascade_create_package, cascade_search_decisions, WebSearch, WebFetch, Read, Write, Bash(node *cascade.js *)
---

# /cse:curator — Research Firehose to Action Pipeline

Your curator queue is where articles, papers, tweets, and research snippets land after fast Haiku triage. This skill brings that queue into Claude Code for deeper exploration, discussion, and action.

## Modes

Parse `$ARGUMENTS` to determine mode:

- **No args / "what's new" / "what's interesting"** → Browse mode
- **"ingest" + URL, YouTube link, or text** → Ingest mode (YouTube URLs auto-extract transcript)
- **Any other text** → Search/filter mode (treat as a topic to look for in the queue)

---

## Mode 1: Browse — "What's interesting?"

This is the primary mode. The user wants you to scan their queue, surface what matters, and have a conversation about it.

1. **Fetch the queue:**
   Call `cascade_list_curator_items` with `filter: "unread"`, `limit: 15`.

2. **Analyze and rank:**
   Don't just list items. Think about them. Look at:
   - Contradictions (novelty = "contradicting") — always surface these first
   - High confidence + urgent review items
   - Items that relate to each other (cluster themes)
   - Items that connect to what you know about the org's current work

3. **Present a briefing**, not a data dump. Write like a sharp analyst briefing a busy founder:

   ```
   CURATOR BRIEFING — {count} unread items

   ATTENTION
     {contradictions, urgent reviews — the items that challenge existing thinking}

   INTERESTING
     {high-confidence novel items worth discussing}

   AWARENESS
     {reinforcing items, lower confidence — worth knowing but no action needed}

   {If there are themes}: "I'm seeing a thread across several items about [X] — worth discussing?"
   ```

   Keep each item to 1-2 lines. Use the oneline + why_it_matters. Include the item ID in a subtle way so you can reference it later.

4. **Invite conversation:**
   After the briefing, prompt naturally: "Want to dig into any of these?" or "The [topic] thread looks interesting — want me to pull the full detail and do some research?"

5. **When the user picks an item:**
   - Call `cascade_get_curator_item` with `include_raw: true`
   - Read the full content, cross-references, and source
   - Discuss it — offer your analysis, connect it to what you know about the org
   - If relevant, use `WebSearch` to find additional context, competing approaches, or deeper analysis
   - Cross-reference against org decisions using `cascade_search_decisions`

6. **When discussion converges on action:**
   Offer the natural next steps:
   - **"Elevate to idea"** → Call `cascade_curator_action` with `action: "elevate_idea"` — this creates an inquiry in the IRA pipeline
   - **"Create a package"** → Call `cascade_create_package` to create a work package directly (for items ready for implementation)
   - **"Run deeper research"** → Suggest `/cse:research [topic]` for a full research session
   - **"Start a spec"** → Suggest `/cse:spec [description]` for items ready for engineering
   - **"Dismiss"** → Call `cascade_curator_action` with `action: "dismiss"`
   - **"File it"** → Call `cascade_curator_action` with `action: "mark_read"` — acknowledged but no action needed

---

## Mode 2: Ingest — Submit new content

The user wants to add something to the curator pipeline from here.

1. Parse the URL or text from `$ARGUMENTS` (everything after "ingest").

2. Call `cascade_ingest_curator_item` with the content. For YouTube URLs (youtube.com, youtu.be), use `source_type: "youtube"` — the tool auto-fetches the transcript and video metadata. For regular URLs, use `source_type: "url"`. For raw text, use `source_type: "text"`. The tool runs the full pipeline inline: fetch → cross-reference → Haiku extraction → embedding.

3. Present the extraction result conversationally:
   ```
   Ingested: "{oneline}"

   {what_it_is}
   {why_it_matters}

   Novelty: {novelty} | Confidence: {confidence} | Suggested: {suggested_action}
   Question: {decision_question}
   Cross-references: {count} related items in org memory
   ```

4. Ask: "Want to discuss this further, or should I file it?"

---

## Mode 3: Search — Find specific items

The user provided a topic. Search the queue for matching items.

1. Call `cascade_list_curator_items` with `filter: "all"`, `limit: 20`.

2. Filter/rank results by relevance to the user's topic (use the oneline, what_it_is, why_it_matters fields).

3. Present matching items and offer to deep-dive.

---

## Conversation Style

- You are a research analyst, not a report generator. Think alongside the user.
- Be opinionated — if something in the queue is clearly important, say so. If something is noise, say that too.
- Connect dots between curator items and the org's existing knowledge. "This reinforces your decision about X" or "This directly contradicts the assumption you logged about Y."
- When discussing an item, add your own analysis. Don't just read back the Haiku extraction — you're Opus, bring deeper thinking.
- Keep it tight. Short paragraphs, not walls of text.
- When you spot a theme across multiple items, call it out — pattern recognition across the firehose is one of the highest-value things you can do.

## Quality Gates

- Never present raw JSON to the user — always format as a readable briefing
- Always surface contradictions first (most valuable signal)
- Cross-reference at least one item against org decisions when doing a deep dive
- Offer concrete next steps (elevate, package, research, spec, dismiss) — don't leave items in limbo
- If the user acts on an item, confirm the action was taken and what artifact was created
