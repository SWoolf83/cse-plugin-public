---
name: drift
description: Detect strategy drift by comparing documented direction against actual decision patterns.
argument-hint: "[timeframe: 30d|60d|90d]"
allowed-tools: Read, Write, Grep, Glob, Bash(date *), Bash(pwd), Bash(echo *), Bash(npx supabase *), Bash(curl *)
---

# Cascade Strategy Drift Detection

Compare what the organization says (strategy documents, stated direction) against what the organization does (recent decisions, research topics, action types). Measure the gap and surface contradictions.

## Instructions

You are a strategy alignment analyst. Follow these phases exactly.

---

### Phase 1 — Configuration

1. Parse `$ARGUMENTS`:
   - If a timeframe is provided (e.g., "30d", "60d", "90d"), use it. Default: 60d.
   - Extract the number of days for the analysis window.
2. Get today's date: `Bash(date +%Y-%m-%d)`
3. Get the working directory: `Bash(pwd)`
4. Output filename: `cascade-drift-{date}.md`

### Phase 2 — Strategy Baseline

Extract documented strategic claims from all available sources. Read these in order:

1. **Planning documents:**
   - `Glob(.planning/*.md)` — Read key strategy files (VISION.md, PRODUCT-CONTEXT.md, PRODUCT-DIRECTION-IRA.md, etc.)
   - Skip implementation-focused files (roadmaps, migration plans)

2. **Portfolio knowledge** (if exists):
   - `Glob(cascade-portfolio/knowledge/**/*.md)`
   - `Glob(cascade-portfolio/strategy/**/*.md)`

3. **CLAUDE.md / README.md:**
   - Check for stated direction in project config files

For each source, extract **falsifiable strategic claims**. These are statements about direction that can be verified against behavior:

Examples of good claims:
- "We are enterprise-first" → verifiable: are decisions enterprise-focused?
- "We prioritize healthcare vertical" → verifiable: are inquiries healthcare-related?
- "We build, not buy, for core capabilities" → verifiable: what do build-vs-buy decisions say?
- "Platform works for any AI-mediated business process" → verifiable: are decisions cross-domain?

Examples of NOT claims (skip these):
- "Our product is innovative" → not falsifiable
- "We use Next.js" → technical fact, not strategic direction

Format each claim as:
```
CLAIM: "{the statement}"
Source: {file}:{line or section}
Category: [go-to-market | product | technical | hiring | financial | partnerships]
```

Aim for 5-15 strategic claims. Quality over quantity.

### Phase 3 — Decision Pattern Analysis

Query the Supabase database for recent organizational behavior within the analysis window.

**Auth setup:** Read `~/.cascade/auth.json` for authentication. If available, use the JWT token. Otherwise, check for `SUPABASE_SERVICE_ROLE_KEY` in environment.

Query the database for each of these data points (use the Supabase REST API via curl, or `npx supabase` CLI if available):

1. **Inquiry intents distribution:**
   - How many inquiries of each intent type in the window?
   - Which templates are used most?

2. **Decision topics:**
   - Read inquiry subjects and descriptions to understand what the org is deciding about
   - Categorize: enterprise vs. consumer, build vs. buy, specific verticals

3. **Research topics:**
   - What are explorations/research sessions about?
   - Do they align with stated strategy?

4. **Action patterns:**
   - What engineering sessions are being triggered?
   - What code is being built?

If database access isn't available, fall back to reading any available `.planning/` files for decision history, mining reports, or DECISIONS.md files.

### Phase 4 — Drift Scoring

For each strategic claim from Phase 2, score alignment:

**Scoring rubric:**
- **100% Aligned:** Strong evidence in decisions supporting this direction
- **75% Mostly Aligned:** Some evidence, no contradictions
- **50% Ambiguous:** Mixed signals or insufficient evidence
- **25% Drifting:** More evidence against than for
- **0% Contradicted:** Clear evidence against this direction

For each claim, provide:
```
CLAIM: "{statement}"
Score: {0-100}%
Evidence FOR: {what decisions/actions support this}
Evidence AGAINST: {what decisions/actions contradict this}
Assessment: {one-line summary}
```

Calculate overall alignment:
- **Average score** across all claims
- **Distribution:** How many claims are >75%, 50-75%, <50%
- **Critical drifts:** Any claims scored <25% — these need immediate attention

### Phase 5 — Output

Write the drift report to `{cwd}/{output-filename}`:

```markdown
# Strategy Alignment Report

**Analysis Window:** {start_date} to {today}
**Claims Analyzed:** {count}
**Overall Alignment:** {average_score}%
**Generated:** {today}

---

## Executive Summary

{3-5 sentences: overall alignment health, most concerning drift, and most strong alignment}

## Alignment Heatmap

| Claim | Score | Category | Status |
|-------|-------|----------|--------|
| {claim} | {score}% | {category} | {Aligned/Drifting/Contradicted} |
...

## Detailed Analysis

### High Alignment (>75%)
{claims that are well-supported by recent decisions}

### Moderate Alignment (50-75%)
{claims with mixed signals — may need monitoring}

### Drift Detected (<50%)
{claims that are contradicted by recent decisions — ACTION REQUIRED}

## Critical Drifts

{For each claim scored <25%, provide detailed analysis:
- The claim and its source
- The contradicting evidence
- Recommended action: realign execution OR update strategy}

## Recommendations

1. {most urgent recommendation}
2. {second priority}
3. {third priority}

---

*Strategy alignment is an instrument panel, not a performance review. Drift detection helps organizations make intentional choices about when to update strategy vs. when to realign execution.*
```

### Phase 6 — Terminal Summary

Print to terminal:

```
Cascade Strategy Drift Report

Window:    {timeframe}
Claims:    {count} analyzed
Alignment: {overall_score}%

  Aligned (>75%):     {count}
  Monitoring (50-75%): {count}
  Drifting (<50%):     {count}
  Critical (<25%):     {count}

{if critical drifts exist:}
CRITICAL DRIFTS:
  - "{claim}" — {score}% — {one-line explanation}

Output: {filename}
```

---

## Quality Gates

1. Every claim is traceable to a specific source document and line/section
2. Every score is supported by specific evidence (not vibes)
3. Drift is measured against STATED strategy, not assumed strategy
4. Recommendations are actionable: "do X" not "consider Y"
5. The report acknowledges when evidence is insufficient (don't score low just because there's no data)
