---
name: publish
description: "Use when you want to produce a branded white paper, report, brief, or memo as a polished PDF on the user's desktop."
when_to_use: "Produce branded white papers, reports, briefs, and memos as polished PDFs. Uses Cascade's branded HTML template (cover page, numbered sections, callouts, tables, code blocks), renders to PDF on the user's desktop via headless Chrome, and supports marketing, technical, and legal/formal variants with custom branding."
argument-hint: "[topic or title]"
allowed-tools: Read, Write, Bash(node *), Bash(ls *), Bash(cat *), Bash(date *), Bash(open *), cascade_get_brand_config
---

# /cse:publish — Branded Document Publishing

Produce polished, branded PDF documents from within Claude Code. Write the content, render to PDF, deliver to the desktop. Fast, consistent, beautiful.

## Instructions

### Step 1 — Determine the document

Parse `$ARGUMENTS` for the topic/title. If empty, ask: "What should this paper be about?"

### Step 2 — Detect variant

Auto-detect the document variant from content and context. The user can also say "technical white paper" or "legal memo" to specify.

| Variant | Class | When to use |
|---------|-------|-------------|
| **Marketing** | (default, no class) | Product features, thought leadership, GTM, demos, customer-facing |
| **Technical** | `variant-technical` | Architecture docs, API specs, system design, engineering deep-dives |
| **Legal** | `variant-legal` | Patent analysis, M&A memos, compliance reports, regulatory filings |

Detection heuristics:
- Topic mentions patents, claims, legal, compliance, regulatory → `variant-legal`
- Topic mentions architecture, API, system, code, infrastructure → `variant-technical`
- Everything else (features, strategy, product, vision) → marketing default

### Step 3 — Load brand config

Try to load custom branding in this order:

1. **MCP tool** (preferred): Call `cascade_get_brand_config` if available. It returns merged brand_assets with CSS variable mapping.
2. **Local brand file**: Read `.cascade/brand.json` if it exists — format: `{ "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex" }, "fontFamily": "...", "orgName": "...", "brandName": "C A S C A D E" }`
3. **Cascade defaults**: Use the template's built-in Cascade brand (blue accent, Inter font, dark cover).

When brand config is available, build a CSS override block:

```css
:root {
    --accent: {colors.primary or colors.accent};
    --dark: {colors.secondary or #222222};
    --bg: {colors.background or #ffffff};
    --circle-bg: {colors.secondary or #1e3a5f};
    --font-body: '{fontFamily}', -apple-system, sans-serif;
    --font-heading: '{fontFamily}', -apple-system, sans-serif;
}
```

### Step 4 — Gather context

Before writing, gather relevant context silently:

- Read recent git history if the topic relates to recent work
- Check `.cascade/context/` for organizational context
- Check `.planning/` for relevant strategy docs
- Read any files the user references

Do NOT ask the user to provide content — synthesize it from what you find and what you know from the conversation.

### Step 5 — Write the document

Read the template:
```
Read ${CLAUDE_PLUGIN_ROOT}/skills/publish/template.html
```

Create a new HTML file by copying the template and filling in all content. Write to:
```
docs/white-papers/<SLUG>.html
```

**Template tokens:**

| Token | Value |
|---|---|
| `{{VARIANT}}` | Empty string (marketing), `variant-technical`, or `variant-legal` |
| `{{BRAND_CSS}}` | CSS override block from Step 3, or empty string for defaults |
| `{{BRAND_NAME}}` | Brand name in spaced caps, e.g. `C A S C A D E` or `J O Y N` |
| `{{ORG_NAME}}` | Organization name, e.g. "Cascade HQ" |
| `{{DOC_TYPE}}` | `WHITE PAPER`, `REPORT`, `BRIEF`, or `MEMO` |
| `{{TITLE}}` | Document title |
| `{{SUBTITLE}}` | One-line description |
| `{{DATE}}` | Today's date as "Month DD, YYYY" |
| `{{TOC_ITEMS}}` | `<li>` items for table of contents |
| `{{SECTIONS}}` | All section divs (see below) |
| `{{FOOTER_TEXT}}` | Footer line, e.g. "Cascade — Specification Infrastructure — May 2026" |

**Section structure:**

Each section uses this pattern:
```html
<div class="page">
    <div class="section-header">
        <div class="section-number">01</div>
        <h2>Section Title</h2>
    </div>
    <!-- content here -->
</div>
```

Choose sections appropriate to the document type. Do NOT force the default research sections — adapt freely.

**White paper** (marketing):
1. Executive Summary
2. The Problem / Opportunity
3. Our Approach
4. How It Works
5. Architecture / Technical Details
6. Results / Impact
7. What's Next

**Technical paper**:
1. Abstract
2. Background & Motivation
3. Architecture
4. Implementation
5. Performance & Tradeoffs
6. Related Work
7. Future Directions

**Legal/formal report**:
1. Executive Summary
2. Scope & Background
3. Analysis
4. Findings
5. Risk Assessment
6. Recommendations
7. Conclusion

### Step 6 — Quality check: page breaks

Before writing the final HTML, check that these elements will NOT split across pages:

- Every `<div class="callout">` has `break-inside: avoid` (already in template CSS)
- Every `<table>` has `break-inside: avoid` (already in template CSS)
- No section ends with just a heading and no content after it
- Every `<h3>` is followed by at least a full paragraph on the same page

If a section is very long (more than ~800 words), consider splitting it into two `<div class="page">` blocks so the browser has natural break points.

The template already handles these via CSS rules. Just avoid writing very long unbroken content blocks (>400 words without a heading, callout, or other break-friendly element).

### Step 7 — Render to PDF

```bash
node scripts/render-pdf.mjs docs/white-papers/<SLUG>.html
```

This produces `~/Desktop/<SLUG>.pdf`.

### Step 8 — Open and confirm

```bash
open ~/Desktop/<SLUG>.pdf
```

Report: "Published: **{title}** → `~/Desktop/{slug}.pdf` ({variant} variant)"

## Writing Style by Variant

### Marketing
- Lead with "why it matters" before "how"
- Use concrete scenarios and customer language
- Callout boxes for key insights and pull quotes
- Bold key terms on first use
- Short paragraphs (3-4 sentences)
- Confident, professional, accessible

### Technical
- Lead with the problem being solved
- Include architecture details, interfaces, and tradeoffs
- Code blocks for APIs and data structures
- Tables for comparisons and metrics
- Precise language, no marketing superlatives
- Reference specific files, functions, or systems

### Legal/Formal
- Lead with conclusions and recommendations
- Structured analysis with clear logical flow
- Conservative tone — no colloquialisms
- Numbered findings and recommendations
- Risk-weighted assessments
- Citation-ready formatting

## Template Features

The template supports out of the box:
- **Cover page** with brand name, org name, document type badge, title, subtitle, date
- **Table of contents** with auto-numbered items
- **Numbered section headers** with accent-colored circles (hidden in legal variant)
- **Callout boxes** — `<div class="callout"><p>...</p></div>`
- **Code blocks** — dark-themed with monospace font (prominent in technical variant)
- **Tables** — clean with hover states
- **Blockquotes** — styled as callouts
- **Print styles** — proper page breaks, orphan/widow control, no content overlap

## Brand Integration Roadmap

Currently: brand colors and fonts are injected via CSS variables at render time.

Future (wired to style preferences):
- `brand_assets` table provides logo, colors, fonts, letterhead
- `document_format_rules` provides per-document-type margins, page size, numbering
- `user_style_profiles` provides tone and vocabulary preferences for content generation
- Brand inference from company website screenshot via Haiku analysis
- All resolved via `resolveDocumentPreferences()` at render time
