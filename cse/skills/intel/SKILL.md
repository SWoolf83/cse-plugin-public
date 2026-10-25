---
name: intel
description: Review and update competitive intelligence profiles
allowed-tools: Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Task
argument-hint: "[competitor-name | 'status' | 'add <name>']"
---

# /cse:intel — Competitive Intelligence

Review, update, and create competitive intelligence profiles in the Portfolio.

## Instructions

### Parse Arguments

1. If `<args>` is "status" or empty: run the **Status Report** flow
2. If `<args>` starts with "add": run the **Add Competitor** flow with the name
3. Otherwise: run the **Update Competitor** flow for the named entity

### Status Report Flow

1. Find all competitor profiles:
   ```
   Glob: **/competitors/*.md (exclude _TEMPLATE.md)
   ```

2. For each profile, parse the YAML frontmatter and extract:
   - `entity`, `monitoring_priority`, `monitoring_cadence_days`, `last_reviewed`, `last_signal`

3. Calculate staleness:
   - `days_since_review = today - last_reviewed`
   - `stale = days_since_review > monitoring_cadence_days`

4. Display status report:
   ```
   COMPETITIVE INTELLIGENCE STATUS

   Stale Profiles (need review):
     [HIGH] Streamline — 21 days since review (cadence: 14 days)
     [MED]  Acme Corp — 45 days since review (cadence: 30 days)

   Current Profiles:
     [HIGH] Competitor A — reviewed 3 days ago
     [LOW]  Competitor B — reviewed 10 days ago

   Summary: 2 of 4 profiles need review
   ```

### Add Competitor Flow

1. Copy `competitors/_TEMPLATE.md` to `competitors/{name-slug}.md`
2. Fill in the entity name in the frontmatter
3. Use WebSearch to find basic information about the competitor:
   - What they do, funding, pricing, key features
4. Fill in the Position, Strengths, and Weaknesses sections
5. Set `last_reviewed` to today's date
6. Display what was created

### Update Competitor Flow

1. Read the existing competitor profile
2. Use WebSearch to find recent news, announcements, or changes for this entity
3. For each finding:
   - Add to the Signal Log with today's date
   - If it affects Strengths/Weaknesses/Position, update those sections
   - Assess impact: high / medium / low
4. Update `last_reviewed` to today's date
5. Update `last_signal` if new signals were found
6. Display a summary of what changed

## Quality Gates

- Every profile has all frontmatter fields populated
- Signal log entries include source attribution
- Impact assessments are justified (not just "medium" by default)
- Strengths/weaknesses updated when signals warrant it
- `last_reviewed` is always updated on any interaction
