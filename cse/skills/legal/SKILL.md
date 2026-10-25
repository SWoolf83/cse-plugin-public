---
name: legal
description: Use when you want a legal analysis run with structured frameworks (IP/FTO, contract risk, M&A, privacy/AI, regulatory…) via research agents.
when_to_use: Run a legal analysis using structured frameworks (IP/FTO, Contract Risk, M&A Due Diligence, Fundraising, Employment, Privacy/AI, Governance, Regulatory, Litigation, Antitrust) with parallel research agents.
argument-hint: "FRAMEWORK \"target company/product/market\""
allowed-tools: Task, WebSearch, WebFetch, Read, Write, Bash(date *), Bash(pwd), Bash(echo *)
---

# Cascade Legal Analysis

Run a deep legal analysis using a named legal framework. Outputs branded Markdown + HTML files ready for PDF export.

**IMPORTANT DISCLAIMER:** These analyses provide legal research frameworks to help executives understand legal positioning and risks. They are NOT legal opinions and do NOT constitute legal advice. Always consult qualified legal counsel before making legal decisions.

## Available Frameworks

| Command | Framework |
|---------|-----------|
| `ip` | IP Portfolio & Freedom-to-Operate |
| `contract` | Contract Risk Analysis |
| `ma` | M&A Legal Due Diligence |
| `fundraising` | Fundraising Instrument Analysis |
| `employment` | Employment Law & Workforce Risk |
| `privacy` | Data Privacy & AI Compliance |
| `governance` | Corporate Governance & Fiduciary Duty |
| `regulatory` | Regulatory Compliance & Market Entry |
| `litigation` | Litigation Risk & Dispute Resolution |
| `antitrust` | Antitrust & Competitive Practices |

Usage: `/cse:legal FRAMEWORK "target"` — e.g., `/cse:legal ip "Acme Corp medical devices"`

## Instructions

You are a legal analysis orchestrator. Follow these 6 phases exactly. Do NOT skip phases or combine them.

---

### Phase 1 — Parse & Setup

1. The arguments are: `$ARGUMENTS`
2. If `$ARGUMENTS` is empty or missing, show the Available Frameworks table above and tell the user: "Usage: /cse:legal FRAMEWORK \"target\"" and stop.
3. Parse the first word as the framework identifier, and the rest as the target (strip quotes if present).
   - If only a framework is given with no target, ask the user: "What company, product, or market should I analyze?"
4. Get today's date and working directory:
   ```
   Bash(date +%Y-%m-%d)
   Bash(pwd)
   ```
5. **Load the framework registry:**
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/legal/frameworks.json
   ```
6. **Match the framework:** Compare the parsed framework identifier against each framework's `id` and `aliases` arrays (case-insensitive). If no match is found, show the Available Frameworks table and say "Unknown framework: {input}. Use one of the frameworks above."
7. Store the matched framework object — you will need its `name`, `output_sections`, and `agents` array.
8. Generate a slug: `cascade-legal-{framework_id}-{target_slug}-{date}` where target_slug is lowercase, hyphens for spaces, special chars stripped, max 40 chars.
9. **Resolve org name** for co-branding:
   - Read `~/.cascade/auth.json`. If it exists, extract the `access_token` field.
   - Decode the JWT payload: `Bash(echo '{middle-segment}' | base64 -d 2>/dev/null)`
   - Look for an `org_name` claim. If found, use it. Otherwise, leave org name empty.

---

### Phase 2 — Parallel Research

Launch **exactly 4 Task agents simultaneously** (all in one message, all `subagent_type: general-purpose`).

Use the matched framework's `agents` array. For each agent:
1. Take the agent's `prompt` field from the registry
2. Replace `{target}` with the actual target string
3. Prepend: "You are a {agent.role} conducting legal analysis. Today's date is {date}. DISCLAIMER: This is a legal research framework, not legal advice."
4. Append: "Search the web thoroughly using WebSearch and WebFetch. Include source URLs as numbered references at the end. Cite specific statutes, regulations, and case law where applicable."

Launch all 4 agents in a single message. Wait for all to complete before proceeding.

---

### Phase 3 — Synthesis

Merge the 4 agent outputs into the framework's `output_sections`. Write each section in clear, professional prose.

**Section mapping by framework:**

- **IP Portfolio & FTO**: Agent 1 → Patent Landscape Analysis, Agent 2 → Trade Secret & Know-How Assessment, Agent 3 → Trademark & Brand Protection, Agent 4 → Freedom-to-Operate Risk Map. Cross-reference all for Executive Summary and IP Portfolio Strategy Recommendations.
- **Contract Risk**: Agent 1 → Key Contractual Risk Areas, Agent 2 → Liability & Indemnification Analysis, Agent 3 → Termination & Change of Control Provisions, Agent 4 → Data Rights & IP Ownership Clauses. Cross-reference for Executive Summary and Risk Mitigation Recommendations.
- **M&A Due Diligence**: Agent 1 → Corporate Structure & Governance, Agent 2 → Material Contracts & Obligations, Agent 3 → Litigation & Regulatory Exposure, Agent 4 → Employment & Benefits Liabilities. Cross-reference for Executive Summary and Due Diligence Recommendations.
- **Fundraising Instruments**: Agent 1 → Equity Instrument Comparison, Agent 2 → Debt & Convertible Instrument Analysis, Agent 3 → Dilution & Cap Table Modeling, Agent 4 → Investor Rights & Governance Impact. Cross-reference for Executive Summary and Recommended Instrument & Structure.
- **Employment Compliance**: Agent 1 → Worker Classification Analysis, Agent 2 → Wage & Hour Compliance, Agent 3 → Discrimination & Harassment Risk, Agent 4 → Non-Compete & Trade Secret Protection + Remote/Global Workforce. Cross-reference for Executive Summary and Risk Mitigation Recommendations.
- **Data Privacy & AI**: Agent 1 → Data Privacy Regulatory Landscape, Agent 2 → AI-Specific Regulation & Governance, Agent 3 → Cross-Border Data Transfer Analysis, Agent 4 → Consent & Data Subject Rights. Cross-reference for Executive Summary and Compliance Framework Recommendations.
- **Corporate Governance**: Agent 1 → Board Composition & Independence, Agent 2 → Fiduciary Duty Analysis, Agent 3 → Conflict of Interest & Related-Party Transactions, Agent 4 → Compliance Program Assessment. Cross-reference for Executive Summary and Governance Improvement Recommendations.
- **Regulatory Market Entry**: Agent 1 → Licensing & Permit Requirements, Agent 2 → Industry-Specific Regulatory Framework, Agent 3 → Compliance Timeline & Cost Estimation, Agent 4 → Regulatory Risk Assessment. Cross-reference for Executive Summary and Market Entry Compliance Roadmap.
- **Litigation Risk**: Agent 1 → Current & Pending Litigation Assessment, Agent 2 → Litigation Risk Heat Map, Agent 3 → Dispute Resolution Strategy Analysis, Agent 4 → Settlement vs. Trial Analysis. Cross-reference for Executive Summary and Risk Mitigation & Prevention Recommendations.
- **Antitrust**: Agent 1 → Market Definition & Dominance Assessment, Agent 2 → Horizontal & Vertical Agreement Risks, Agent 3 → Merger Control & Clearance Analysis, Agent 4 → Digital Markets & Platform Regulation. Cross-reference for Executive Summary and Antitrust Compliance Recommendations.

Synthesis rules:
- **Deduplicate** findings across agent outputs
- **Resolve contradictions** by preferring data-backed claims and authoritative sources
- **Cross-reference** — connect findings across agents when they reinforce each other
- **Cite specifically** — reference statutes, regulations, case law, and enforcement actions
- **Flag jurisdictional variations** — note where laws differ by jurisdiction
- **Compile a unified Sources section** — deduplicate URLs, number sequentially

Target length per section: 500-800 words. Executive Summary: 300-400 words.

---

### Phase 4 — Quality Self-Eval

Before outputting, check:
- [ ] **Legal precision**: Are legal concepts, statutes, and terminology correctly applied?
- [ ] **Jurisdictional coverage**: Are relevant jurisdictions accounted for? Are conflicts flagged?
- [ ] **Statutory citations**: Are specific laws, regulations, and case law cited?
- [ ] **Risk identification**: Are legal risks identified with severity and probability?
- [ ] **Actionability**: Does each section give the reader specific next steps?
- [ ] **Counsel referral**: Does the analysis identify when professional legal counsel is needed?

If any check fails, revise before proceeding.

---

### Phase 5 — Output Generation

#### Step 1: Write the Markdown file

Write the full analysis to `{cwd}/{slug}.md`:

```markdown
# {Title}

*{Framework Name} — {Target}*

*{Date}*

**DISCLAIMER:** This analysis provides a legal research framework. It is not legal advice. Consult qualified counsel before making legal decisions.

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
   Read ${CLAUDE_PLUGIN_ROOT}/skills/legal/template.html
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
Legal analysis complete! Framework: {Framework Name}

DISCLAIMER: This is a legal research framework, not legal advice. Consult qualified counsel before making legal decisions.

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
