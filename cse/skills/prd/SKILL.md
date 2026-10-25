---
name: prd
description: "Use when you want a Product Requirements Document from a package or bundle — a 10-section branded PRD stored to Cascade + rendered PDF."
when_to_use: "Generate a Product Requirements Document from an existing package or bundle. Synthesizes package data, linked specs, org context, and riders into a 10-section branded PRD. Stores to Cascade and renders PDF."
argument-hint: "[package-id or bundle-id]"
allowed-tools: Read, Write, Bash(node *), Bash(ls *), Bash(cat *), Bash(date *), Bash(open *), cascade_get_brand_config, cascade_get_org_context, cascade_get_matter, cascade_get_specs
---

# /cse:prd -- Product Requirements Document Generator

Generate a PM-quality Product Requirements Document from Cascade packages and bundles. Synthesizes structured data (specs, must-haves, org context, riders) into a 10-section PRD, persists to Supabase, and renders branded PDF.

## Instructions

### Step 1 -- Identify the target entity

Parse `$ARGUMENTS` for a package ID, bundle ID, or package title. If empty, ask: "What package or bundle should I generate a PRD for?"

Gather structured context by running:
```bash
node bin/cascade.js prd gather <id> --json
```

This returns JSON with:
- `entity` -- package or bundle metadata (title, description, status, type_data)
- `spec` -- linked spec (intent, mustHaves, scopeBoundaries, assumptions, executionPlan) or null
- `orgContext` -- org name, recent decisions
- `riders` -- stakeholder notes, call transcripts, comments
- `bundleChildren` -- child packages if entity is a bundle

If no entity is found, report the error and stop.

### Step 2 -- Load brand config

Load custom branding in this order:

1. **MCP tool** (preferred): Call `cascade_get_brand_config` if available. It returns merged brand_assets with CSS variable mapping.
2. **Local brand file**: Read `.cascade/brand.json` if it exists.
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

### Step 3 -- Synthesize PRD sections

Using the gathered data, write each of the 10 sections. Each section's `content` field is markdown. Be thorough -- synthesize from all available data sources.

**The 10 PRD sections (in order):**

1. **Executive Summary** (order: 1)
   - 2-3 paragraph overview synthesized from package description + spec intent
   - What is being built and why
   - High-level scope and expected impact
   - Derive from: `entity.description`, `spec.intent`, `orgContext`

2. **Problem Statement** (order: 2)
   - What problem does this solve?
   - Who is affected and how?
   - What is the cost of not solving it?
   - Derive from: `spec.intent` (the "why"), `orgContext.recentDecisions`, `entity.description`

3. **Goals & Success Metrics** (order: 3)
   - Primary goals derived from critical must-haves
   - Secondary goals derived from important must-haves
   - Measurable success criteria for each goal
   - Derive from: `spec.mustHaves` (group by priority), `entity.type_data`

4. **Target Users** (order: 4)
   - Who benefits from this?
   - User personas or roles
   - How each user type interacts with the feature
   - Derive from: `entity.description`, `orgContext`, `riders` (stakeholder notes)

5. **Requirements** (order: 5)
   - Structured requirements table with priority and acceptance criteria
   - Group by priority: Critical, Important, Nice-to-Have
   - Each requirement has: ID, description, priority, acceptance criteria
   - Derive from: `spec.mustHaves` -- each must-have becomes a requirement

6. **Assumptions & Dependencies** (order: 6)
   - List all assumptions with confidence levels
   - Flag medium/low confidence assumptions as risks
   - External dependencies and integration points
   - Derive from: `spec.assumptions`, `entity.type_data`

7. **Scope & Exclusions** (order: 7)
   - What is included in this work
   - What is explicitly excluded (NOT included items)
   - What is deferred to future work
   - Derive from: `spec.scopeBoundaries` -- parse "Deferred:" and "NOT included:" prefixes

8. **Risk Assessment** (order: 8)
   - Technical risks from low-confidence assumptions
   - Scope risks from deferred items that may impact delivery
   - Dependency risks from external integrations
   - Mitigation strategies for each identified risk
   - Derive from: `spec.assumptions` (low/medium confidence), `spec.scopeBoundaries` (deferred), `spec.executionPlan` (blockers)

9. **Timeline & Milestones** (order: 9)
   - Each wave from the execution plan becomes a milestone
   - Task breakdown within each milestone
   - Estimated effort (from token estimates if available)
   - Dependencies between milestones
   - Derive from: `spec.executionPlan.waves` -- each wave = milestone with tasks

10. **Open Questions** (order: 10)
    - Unresolved items that need decisions
    - Questions from medium/low confidence assumptions
    - TBD evidence fields from must-haves
    - Deferred scope items that need future decisions
    - Derive from: `spec.assumptions` (non-high confidence), `spec.mustHaves` (TBD evidence), `spec.scopeBoundaries` (deferred)

**Writing style:** Professional PM language. Clear, concise, actionable. No engineering jargon unless the audience is technical. Each section should stand alone as a readable document.

### Step 4 -- Build structured PRD

Assemble the sections into a JSON structure and write to a temp file:

```json
{
  "title": "PRD: <entity title>",
  "subtitle": "<one-line description>",
  "packageId": "<package-id or null>",
  "bundleId": "<bundle-id or null>",
  "sections": [
    { "title": "Executive Summary", "content": "...", "order": 1 },
    { "title": "Problem Statement", "content": "...", "order": 2 },
    ...
  ],
  "content_markdown": "<full PRD as markdown>",
  "metadata": {
    "packageName": "<name>",
    "bundleName": "<name or null>",
    "entityId": "<id>",
    "version": 1,
    "status": "draft",
    "generatedAt": "<ISO date>"
  }
}
```

Write this to `/tmp/cse:prd-output.json`.

### Step 5 -- Persist to Cascade

Save the PRD to the prd_documents table:
```bash
node bin/cascade.js prd save --package-id <id> --file /tmp/cse:prd-output.json --title "PRD: <entity title>"
```

Or for bundles:
```bash
node bin/cascade.js prd save --bundle-id <id> --file /tmp/cse:prd-output.json --title "PRD: <entity title>"
```

This handles version incrementing automatically -- if a PRD already exists for this entity, a new version is created.

### Step 6 -- Render HTML and PDF

Render the branded HTML document:
```bash
node scripts/render-prd.mjs /tmp/cse:prd-output.json --variant technical
```

This writes HTML to `docs/white-papers/prd-<slug>.html`.

Then render PDF:
```bash
node scripts/render-pdf.mjs docs/white-papers/prd-<slug>.html
```

This produces `~/Desktop/prd-<slug>.pdf`.

Open the PDF:
```bash
open ~/Desktop/prd-<slug>.pdf
```

### Step 7 -- Report

Print a summary:
```
PRD generated for [entity name]
  Version:  [N]
  PRD ID:   [id]
  Sections: 10
  PDF:      ~/Desktop/prd-<slug>.pdf
  HTML:     docs/white-papers/prd-<slug>.html
```

## Section Quality Checklist

Before finalizing each section, verify:

- [ ] Content is derived from actual data, not generic filler
- [ ] Cross-references between sections are consistent (e.g., risks reference specific assumptions)
- [ ] Requirements trace back to must-haves
- [ ] Timeline reflects actual execution plan structure
- [ ] Open questions are actionable (someone could answer them)
- [ ] If a data source is missing (no spec, no riders), note the gap rather than inventing content

## Handling Missing Data

When gathered context is incomplete:

- **No linked spec**: Derive requirements from package description and type_data only. Note in Executive Summary that no formal spec exists.
- **No riders/notes**: Skip stakeholder-derived content in Target Users. Note the gap.
- **No org context**: Use package-level context only. Skip organizational alignment references.
- **No execution plan**: Omit detailed timeline. Replace with high-level phasing based on requirement priorities.
