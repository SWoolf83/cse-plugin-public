---
name: strategy
description: Use when you want a strategic business analysis run with proven frameworks (JTBD, economic moat, blue ocean, pricing, GTM wedge, PESTLE…).
when_to_use: Run a strategic business analysis using proven frameworks (JTBD, Economic Moat, Blue Ocean, Scenario Wargaming, Pricing, GTM Wedge, PESTLE, Executive Summary Deck) with parallel research agents.
argument-hint: "FRAMEWORK \"target company/product/market\""
allowed-tools: Task, WebSearch, WebFetch, Read, Write, Bash(date *), Bash(pwd), Bash(echo *)
---

# Cascade Strategic Analysis

Run a deep strategic analysis using a named business framework. Outputs branded Markdown + HTML files ready for PDF export.

## Available Frameworks

| Command | Framework |
|---------|-----------|
| `jtbd` | Jobs-to-be-Done Analysis |
| `moat` | Economic Moat Evaluation |
| `scenario` | Scenario Wargaming |
| `blue-ocean` | Blue Ocean Strategy |
| `pricing` | Pricing Strategy Analysis |
| `gtm` | GTM Wedge Strategy |
| `pestle` | PESTLE Macro-Analysis |
| `deck` | Executive Summary Deck |

Usage: `/cse:strategy FRAMEWORK "target"` — e.g., `/cse:strategy moat "Shopify e-commerce platform"`

## Instructions

You are a strategic analysis orchestrator. Follow these 6 phases exactly. Do NOT skip phases or combine them.

---

### Phase 1 — Parse & Setup

1. The arguments are: `$ARGUMENTS`
2. If `$ARGUMENTS` is empty or missing, show the Available Frameworks table above and tell the user: "Usage: /cse:strategy FRAMEWORK \"target\"" and stop.
3. Parse the first word as the framework identifier, and the rest as the target (strip quotes if present).
   - If only a framework is given with no target, ask the user: "What company, product, or market should I analyze?"
4. Get today's date and working directory:
   ```
   Bash(date +%Y-%m-%d)
   Bash(pwd)
   ```
5. **Load the framework registry:**
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/strategy/frameworks.json
   ```
6. **Match the framework:** Compare the parsed framework identifier against each framework's `id` and `aliases` arrays (case-insensitive). If no match is found, show the Available Frameworks table and say "Unknown framework: {input}. Use one of the frameworks above."
7. Store the matched framework object — you will need its `name`, `output_sections`, and `agents` array.
8. Generate a slug: `cascade-strategy-{framework_id}-{target_slug}-{date}` where target_slug is lowercase, hyphens for spaces, special chars stripped, max 40 chars.
9. **Resolve org name** for co-branding:
   - Read `~/.cascade/auth.json`. If it exists, extract the `access_token` field.
   - Decode the JWT payload: `Bash(echo '{middle-segment}' | base64 -d 2>/dev/null)`
   - Look for an `org_name` claim. If found, use it. Otherwise, leave org name empty.
10. **Check for data sources** (optional — enhances grounding with real data):
    - Check if cascade-research data sources are available:
      ```
      Read ${CLAUDE_PLUGIN_ROOT}/skills/research/data-sources.json
      ```
    - If available, select the **top 3 most relevant sources** for this topic by matching against the target and framework type.
    - Check which API keys are set:
      ```
      Bash(echo "FRED:${FRED_API_KEY:+set}" "BLS:${BLS_API_KEY:+set}" "CENSUS:${CENSUS_API_KEY:+set}" "ALPHA_VANTAGE:${ALPHA_VANTAGE_API_KEY:+set}")
      ```
    - Build a compact Data Sources Brief for the agents that focus on evidence/data.
    - If the data sources file doesn't exist, skip this step — agents will rely on web search alone.

---

### Phase 2 — Parallel Research

Launch **exactly 4 Task agents simultaneously** (all in one message, all `subagent_type: general-purpose`).

Use the matched framework's `agents` array. For each agent:
1. Take the agent's `prompt` field from the registry
2. Replace `{target}` with the actual target string
3. Prepend: "You are a {agent.role} conducting strategic analysis. Today's date is {date}."
4. Append: "Search the web thoroughly using WebSearch and WebFetch. Include source URLs as numbered references at the end."
5. If data sources were selected in Phase 1 and the agent's role involves evidence or market data, append the Data Sources Brief.

Launch all 4 agents in a single message. Wait for all to complete before proceeding.

---

### Phase 3 — Synthesis

This phase has two steps: first resolve inter-agent tensions, then write the unified analysis.

#### Step 1: Agent Synthesis (Resolve Contradictions)

Before writing sections, explicitly analyze the 4 agent outputs for tensions:

1. **Identify contradictions**: Where do agents disagree? The contrarian/risk agent will often conflict with the market/strategy agents — this is by design. List every contradiction.
2. **Resolve with evidence**: For each contradiction, determine which agent has stronger evidence (data > assertions, named sources > general claims, recent data > old data). State the resolution.
3. **Surface uncertainty**: For contradictions where evidence is genuinely mixed, mark as "contested" — both positions will be presented.
4. **Key tensions log**: Write a brief internal list of the 3-5 most important tensions. These become decision-relevant questions.

#### Step 2: Write Unified Sections

Merge the 4 agent outputs into the framework's `output_sections` PLUS a "Contested Areas" section. Write each section in clear, professional prose.

**Section mapping by framework:**

- **JTBD**: Agent 1 → Core Functional Jobs, Agent 2 → Emotional & Social Needs, Agent 3 → Friction Point Analysis, Agent 4 → Innovation Opportunities. Cross-reference all for Executive Summary and Strategic Recommendations.
- **Economic Moat**: Agent 1 → Network Effects + Intangible Assets + Cost Advantage + Switching Costs (split into sections), Agent 2 → supporting data throughout, Agent 3 → historical evidence throughout, Agent 4 → Moat Breach Risk Analysis. Cross-reference for Executive Summary and Strategic Recommendations.
- **Scenario Wargaming**: Agent 1 → Base Case, Agent 2 → Bull Case, Agent 3 → Bear Case, Agent 4 → Trigger Indicators & Contingency Playbooks. Cross-reference for Executive Summary.
- **Blue Ocean**: Agent 1 → Current Strategy Canvas, Agent 2 → informs Eliminate + Reduce + Raise + Create, Agent 3 → informs Eliminate + Reduce + Raise + Create, Agent 4 → risk assessment throughout. Cross-reference for Executive Summary and New Value Curve.
- **Pricing**: Agent 1 → Value-Based Pricing, Agent 2 → Current Pricing Landscape, Agent 3 → Usage & Tiered Model Analysis, Agent 4 → Price Sensitivity & Elasticity. Cross-reference for Executive Summary and Recommended Strategy.
- **GTM Wedge**: Agent 1 → Beachhead Segment, Agent 2 → Competitive Positioning, Agent 3 → Channel & Distribution, Agent 4 → Expansion Playbook. Cross-reference for Executive Summary and Implementation Timeline.
- **PESTLE**: Agent 1 → Political & Legal, Agent 2 → Economic Factors, Agent 3 → Social & Demographic + Technological Landscape, Agent 4 → Black Swan Risks. Cross-reference for Executive Summary and Strategic Implications.
- **Executive Summary Deck**: Agent 1 → Market Dynamics, Agent 2 → Competitive Landscape, Agent 3 → Strategic Recommendation, Agent 4 → Key Risks & Implementation. Cross-reference for The Executive TL;DR.

**Add a "Contested Areas" section** (insert before the final Recommendations or Strategic Recommendations section) with:
- Each contested finding presented with both positions and their evidence
- Framed as **questions for the decision-maker**, not research flaws
- If no genuine contradictions, replace with "Key Uncertainties" — areas where evidence is thin
- Target length: 300-500 words

Synthesis rules:
- **Deduplicate** findings across agent outputs
- **Resolve contradictions** explicitly using the Step 1 analysis — don't silently drop one side
- **Cross-reference** — connect findings across agents when they reinforce each other
- **Grade or score** where appropriate (moat grades, risk ratings, scenario probabilities)
- **Compile a unified Sources section** — deduplicate URLs, number sequentially

Target length per section: 500-800 words. Executive Summary: 300-400 words.

---

### Phase 4 — Quality Self-Eval

Before outputting, check:
- [ ] **Framework fidelity**: Does the output follow the specific framework's methodology?
- [ ] **Source diversity**: Sources from multiple domains, not just one site?
- [ ] **Evidence strength**: Major claims supported by data or citations?
- [ ] **Actionability**: Does each section give the reader something they can act on?
- [ ] **Contrarian coverage**: Are risks and counterarguments genuinely addressed?
- [ ] **Executive Summary**: Can a CEO understand the key findings from this section alone?

If any check fails, revise before proceeding.

---

### Phase 5 — Output Generation

#### Step 1: Write the Markdown file

Write the full analysis to `{cwd}/{slug}.md`:

```markdown
# {Title}

*{Framework Name} — {Target}*

*{Date}*

---

## {Section 1 Title}

{content}

## {Section 2 Title}

{content}

...

---

## Sources

1. {source}
2. {source}
...
```

#### Step 2: Generate the HTML file

1. Read the HTML template:
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/strategy/template.html
   ```

2. Convert each section's Markdown content to HTML:
   - Paragraphs: `<p>...</p>`
   - Bold: `<strong>...</strong>`
   - Italic: `<em>...</em>`
   - Inline code: `<code>...</code>`
   - Unordered lists: `<ul><li>...</li></ul>`
   - Ordered lists: `<ol><li>...</li></ol>`
   - Sub-headers: `### Header` → `<h3>Header</h3>`
   - Tables: `<table><thead>...<tbody>...`
   - Blockquotes: `<blockquote><p>...</p></blockquote>`
   - Links: `<a href="url">text</a>`

3. Replace template placeholders:
   - `{{TITLE}}` — the analysis title
   - `{{SUBTITLE}}` — one-line description of what was analyzed
   - `{{FRAMEWORK_NAME}}` — the framework's display name from the registry
   - `{{DATE}}` — today's date
   - `{{ORG_NAME}}` — org name from Phase 1 (or empty string)
   - `{{TOC_ITEMS}}` — generate `<li>` elements for each section title
   - `{{CONTENT_SECTIONS}}` — for each section, generate:
     ```html
     <div class="page">
         <div class="section-header">
             <div class="section-number">{NN}</div>
             <h2>{Section Title}</h2>
         </div>
         {section content as HTML}
     </div>
     ```
     where `{NN}` is the zero-padded section number (01, 02, etc.)
   - `{{SOURCES}}` — sources as an HTML `<ol>` list

4. Write to `{cwd}/{slug}.html`

#### Step 3: Report to user

```
Strategic analysis complete! Framework: {Framework Name}

Output files:
  {slug}.md    — Full analysis (Markdown)
  {slug}.html  — Branded version (open in browser, Cmd+P to save as PDF)
```

---

### Phase 6 — PDF Export (Optional)

If Playwright MCP tools are available (check for `mcp__playwright__browser_navigate`):

1. Navigate to `file://{cwd}/{slug}.html`
2. Wait for page load
3. Use `browser_run_code` with `page.pdf()` to save as `{cwd}/{slug}.pdf`
4. Tell the user the PDF was generated

If Playwright is not available, skip — the user was already told how to print to PDF.
