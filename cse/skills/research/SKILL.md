---
name: research
description: Produce a deep research white paper on any topic with parallel research agents and branded PDF output.
argument-hint: "[research topic]"
allowed-tools: Task, WebSearch, WebFetch, Read, Write, Bash(date *), Bash(pwd), Bash(echo *)
---

# Cascade Deep Research

Produce a professional white paper on any topic using parallel research agents. Outputs branded Markdown + HTML files ready for PDF export.

## Instructions

You are a research orchestrator. Follow these 6 phases exactly. Do NOT skip phases or combine them.

---

### Phase 1 — Topic Analysis

1. The research topic is: `$ARGUMENTS`
2. If `$ARGUMENTS` is empty, tell the user: "Usage: /cse:research [topic]" and stop.
3. Get today's date:
   ```
   Bash(date +%Y-%m-%d)
   ```
4. Get the working directory:
   ```
   Bash(pwd)
   ```
5. Generate a slug from the topic: lowercase, hyphens for spaces, strip special characters, max 50 chars. The output filename base is `cascade-research-{slug}-{date}`.
6. **Resolve org name** for co-branding on the cover. Try these steps in order:
   - Read `~/.cascade/auth.json`. If it exists, extract the `access_token` field.
   - Decode the JWT payload: `Bash(echo '{middle-segment-of-JWT}' | base64 -d 2>/dev/null)`
   - Look for an `org_name` claim in the decoded JSON. If found, use it.
   - If no `org_name` but `org_id` exists, leave org name empty for now (it will be added in a future update).
   - If auth.json doesn't exist or has no token, leave org name empty.
   - Store the result as `orgName` (string or empty string) for use in Phase 5.
7. Define 3-4 **specific research questions** that will focus the agents. Write them out before launching agents.
8. **Select relevant data sources** for grounding research with authoritative data:
   a. Read the data source registry:
      ```
      Read ${CLAUDE_PLUGIN_ROOT}/skills/research/data-sources.json
      ```
   b. Analyze the research topic and questions against each source's `categories` and `topics` arrays. Score each source by how many of its topics match the research domain.
   c. Select the **top 5 most relevant sources** for this topic.
   d. For sources with a `key_env` field, check if the API key is available:
      ```
      Bash(echo "FRED:${FRED_API_KEY:+set}" "BLS:${BLS_API_KEY:+set}" "CENSUS:${CENSUS_API_KEY:+set}" "ALPHA_VANTAGE:${ALPHA_VANTAGE_API_KEY:+set}")
      ```
      - If the key env var is set: include the source with its full endpoints
      - If not set and the source has a keyless endpoint variant: use that instead
      - If not set and no keyless variant exists: skip that source (don't fail — use what's available)
   e. Build a **Data Sources Brief** — a compact text block for each selected source containing:
      - Source name and one-line description
      - Exact API URL templates (with API keys filled in where available, `{query}` placeholders left for the agent to fill)
      - What each endpoint returns
      - Relevant common queries/series IDs for this specific topic
   f. Allocate sources to agents based on relevance:
      - **Agent 1 (Market & Landscape)**: economic data sources — FRED, BLS, Census, World Bank, OECD
      - **Agent 2 (Technical & Academic)**: academic sources — OpenAlex, Semantic Scholar, PubMed, CrossRef
      - **Agent 3 (Evidence & Data)**: company/industry sources — SEC EDGAR, BLS, FRED, Alpha Vantage, CMS
      - **Agent 4 (Contrarian & Risk)**: all selected sources (needs broad access for counterevidence)
      - Only include sources from the top-5 selection. An agent gets a source only if it was selected AND matches the agent's allocation.

---

### Phase 2 — Parallel Research

Launch **exactly 4 Task agents simultaneously** (all in one message, all `subagent_type: general-purpose`). Each agent gets the research topic, the research questions from Phase 1, its specific focus area, and its **Data Sources Brief** from Phase 1 step 8.

Each agent's prompt has two parts: the **Research Instructions** (specific to the agent's focus) and the **Available Data Sources** appendix (generated from the registry). Build each prompt by concatenating these parts.

**Agent 1 — Market & Landscape**
> Research Instructions: "Research the market and competitive landscape for: {topic}. Focus on: current state of the field, key players and competitors, market sizing and adoption trends (2024-2026), growth projections, and who is investing in this space. Search the web thoroughly using WebSearch and WebFetch. Return structured Markdown (800-1200 words) with section headers. Include source URLs as numbered references at the end. Focus on data and specifics, not generalities."
>
> Data Sources: Append Agent 1's allocated sources from Phase 1 step 8f (economic sources: FRED, BLS, Census, World Bank, OECD — only those that were selected).

**Agent 2 — Technical & Academic**
> Research Instructions: "Research the technical and academic foundations for: {topic}. Focus on: established frameworks and methodologies, reference architectures and design patterns, technical comparisons and benchmarks, best practices from literature and industry, and prior art. Search the web thoroughly using WebSearch and WebFetch. Return structured Markdown (800-1200 words) with section headers. Include source URLs as numbered references at the end. Be rigorous and cite specific papers, standards, or technical references."
>
> Data Sources: Append Agent 2's allocated sources from Phase 1 step 8f (academic sources: OpenAlex, Semantic Scholar, PubMed, CrossRef — only those that were selected).

**Agent 3 — Evidence & Data**
> Research Instructions: "Research real-world evidence and data for: {topic}. Focus on: case studies of implementations, quantitative benchmarks and performance data, ROI analyses and cost-benefit data, success metrics and failure post-mortems, and adoption statistics. Search the web thoroughly using WebSearch and WebFetch. Return structured Markdown (800-1200 words) with section headers. Include source URLs as numbered references at the end. Prioritize concrete numbers and named examples over generalizations."
>
> Data Sources: Append Agent 3's allocated sources from Phase 1 step 8f (company/industry sources: SEC EDGAR, BLS, FRED, Alpha Vantage, CMS — only those that were selected).

**Agent 4 — Contrarian & Risk**
> Research Instructions: "Research counterarguments, risks, and limitations for: {topic}. Focus on: strongest criticisms and counterarguments, known failure modes and limitations, adoption barriers and organizational challenges, alternative approaches that might be superior, and cautionary tales. Search the web thoroughly using WebSearch and WebFetch. Return structured Markdown (800-1200 words) with section headers. Include source URLs as numbered references at the end. Be genuinely critical — steelman the opposing view."
>
> Data Sources: Append Agent 4's allocated sources from Phase 1 step 8f (all selected sources — contrarian agent gets broad access for counterevidence).

**Data Sources Appendix Format** — append this to each agent's prompt, filled with that agent's allocated sources:

```
## Available Data Sources

You have access to the following authoritative data APIs via WebFetch.
Use these to ground your research with real data points, statistics, and citations.
Prefer these over general web search for quantitative claims.

### {source_name}
{source_description}
- {endpoint_name}: WebFetch `{url_with_key_filled_in}`
  Returns: {what_it_returns}
- Relevant queries: {common_series_or_queries_relevant_to_topic}

[...repeat for each allocated source...]

**Instructions for data source usage:**
- When making quantitative claims, try to back them with data from these sources first.
- Cite the source name and specific data point (e.g., "According to FRED data, the federal funds rate was 5.33% in January 2025 [FEDFUNDS]").
- If an API call fails or returns unexpected results, fall back to WebSearch — do not get stuck.
- For PubMed: search first to get IDs, then fetch summaries/abstracts with those IDs.
- For SEC EDGAR: you MUST include a User-Agent header. Use WebFetch with the URL directly — it typically works.
```

Wait for all 4 agents to complete before proceeding.

---

### Phase 3 — Synthesis

This phase has two steps: first resolve inter-agent tensions, then write the unified paper.

#### Step 1: Agent Synthesis (Resolve Contradictions)

Before writing sections, explicitly analyze the 4 agent outputs for tensions:

1. **Identify contradictions**: Where do agents disagree? For example, Agent 1 may say the market is growing while Agent 4 says it's saturating. List every contradiction.
2. **Resolve with evidence**: For each contradiction, determine which agent has stronger evidence (data > assertions, named sources > general claims, recent data > old data). State the resolution.
3. **Surface uncertainty**: For contradictions where evidence is genuinely mixed, mark as "contested" — both positions will be presented in the paper.
4. **Key tensions log**: Write a brief internal list of the 3-5 most important tensions. These become the most interesting insights in the paper.

#### Step 2: Write Unified Sections

Merge the 4 agent outputs into 9 white paper sections. Write each section in clear, professional prose — not bullet dumps. The paper should read as a unified narrative, not 4 pasted-together documents.

| Section | Source | Target Length |
|---------|--------|---------------|
| 1. Executive Summary | All 4 agents | 300-400 words, standalone, no jargon |
| 2. Problem Statement | Synthesis: why this topic matters now | 300-500 words |
| 3. Market Landscape | Agent 1 primary | 600-900 words |
| 4. Technical Analysis | Agent 2 primary | 600-900 words |
| 5. Evidence & Data | Agent 3 primary | 600-900 words |
| 6. Risk Analysis | Agent 4 primary | 600-900 words |
| 7. Contested Areas | Tensions from Step 1 | 400-600 words |
| 8. Recommendations | Cross-referenced from all 4 | 400-600 words |
| 9. Future Considerations | Forward-looking synthesis | 300-500 words |

**"Contested Areas" section rules:**
- Present each contested finding with both positions and their evidence
- Frame each as a **question for the decision-maker**, not a flaw in the research
- Example: "The market sizing data conflicts: Industry reports suggest $4.2B TAM (Agent 1) while adoption surveys indicate effective SAM under $800M (Agent 3). The key question is whether your target segment follows the broad market or the surveyed cohort."
- If there are no genuine contradictions, replace this section with "Key Uncertainties" — areas where evidence is thin and the reader should form their own view

Synthesis rules:
- **Deduplicate** findings that appear in multiple agent outputs
- **Resolve contradictions** explicitly using the Step 1 analysis — don't silently drop one side
- **Cross-reference** — when Agent 3 data supports Agent 2 frameworks, connect them
- **Compile a unified Sources section** — deduplicate URLs, number sequentially

---

### Phase 4 — Quality Self-Eval

Before outputting, quickly check:
- [ ] **Source diversity**: Are sources from multiple domains, not just one site?
- [ ] **Evidence strength**: Does each major claim have supporting data or citation?
- [ ] **Data grounding**: Are there specific numbers from authoritative APIs (FRED, BLS, PubMed, etc.) rather than only web articles? If data sources were available but the agents didn't use them, note the gap.
- [ ] **Contrarian coverage**: Does Section 6 genuinely challenge the thesis?
- [ ] **Section balance**: No section is more than 2x the length of another?
- [ ] **Executive Summary**: Can a busy executive understand the key findings from Section 1 alone?

If any check fails, revise the relevant section before proceeding.

---

### Phase 5 — Output Generation

#### Step 1: Write the Markdown file

Write the full white paper to `{cwd}/cse:research-{slug}-{date}.md` with this structure:

```markdown
# {Title}

*{Subtitle}*

*{Date}*

---

## Executive Summary

{content}

## Problem Statement

{content}

## Market Landscape

{content}

## Technical Analysis

{content}

## Evidence & Data

{content}

## Risk Analysis

{content}

## Recommendations

{content}

## Future Considerations

{content}

---

## Sources

1. {source}
2. {source}
...
```

#### Step 2: Generate the HTML file

1. Read the HTML template:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/research/template.html
   ```

2. Convert each section's Markdown content to HTML using these rules:
   - Paragraphs: wrap in `<p>...</p>`
   - Bold: `**text**` becomes `<strong>text</strong>`
   - Italic: `*text*` becomes `<em>text</em>`
   - Inline code: `` `code` `` becomes `<code>code</code>`
   - Unordered lists: `- item` becomes `<ul><li>item</li></ul>`
   - Ordered lists: `1. item` becomes `<ol><li>item</li></ol>`
   - Headers within sections: `### Header` becomes `<h3>Header</h3>`
   - Tables: convert to `<table><thead>...<tbody>...` format
   - Blockquotes: `> text` becomes `<blockquote><p>text</p></blockquote>`
   - Code blocks: wrap in `<pre><code>...</code></pre>`
   - Links: `[text](url)` becomes `<a href="url">text</a>`

3. Replace these placeholder tokens in the template with the HTML content:
   - `{{TITLE}}` — the research title
   - `{{SUBTITLE}}` — a one-line subtitle summarizing the research
   - `{{DATE}}` — today's date (from Phase 1)
   - `{{ORG_NAME}}` — the org name from Phase 1 step 6 (or empty string if none; the template CSS hides the org block when empty)
   - `{{EXECUTIVE_SUMMARY}}` — Section 1 as HTML
   - `{{PROBLEM_STATEMENT}}` — Section 2 as HTML
   - `{{MARKET_LANDSCAPE}}` — Section 3 as HTML
   - `{{TECHNICAL_ANALYSIS}}` — Section 4 as HTML
   - `{{EVIDENCE_DATA}}` — Section 5 as HTML
   - `{{RISK_ANALYSIS}}` — Section 6 as HTML
   - `{{RECOMMENDATIONS}}` — Section 7 as HTML
   - `{{FUTURE_CONSIDERATIONS}}` — Section 8 as HTML
   - `{{SOURCES}}` — Sources as an HTML `<ol>` list

4. Write the result to `{cwd}/cse:research-{slug}-{date}.html`

#### Step 3: Report to user

Tell the user:
```
Research complete! Output files:
  {filename}.md    — Full white paper (Markdown)
  {filename}.html  — Branded version (open in browser, Cmd+P to save as PDF)
```

---

### Phase 6 — PDF Export (Optional)

If Playwright MCP tools are available (check for `mcp__playwright__browser_navigate`):

1. Navigate to the HTML file: `file://{cwd}/{filename}.html`
2. Wait for page to load
3. Use `browser_run_code` with Playwright's `page.pdf()` to save as `{cwd}/{filename}.pdf`
4. Tell the user the PDF was generated

If Playwright is not available, skip this phase — the user was already told how to print the HTML to PDF in Phase 5.