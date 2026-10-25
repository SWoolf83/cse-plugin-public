---
name: risk
description: Manage the organizational risk register
allowed-tools: Read, Write, Edit, Glob, Grep, Task
argument-hint: "[status | add <risk> | scan <transcript-path>]"
---

# /cse:risk — Risk Register Management

Maintain the organizational risk register. Add risks, check for early warning signals, and review risk status.

## Instructions

### Parse Arguments

1. If `<args>` is "status" or empty: run the **Status Report** flow
2. If `<args>` starts with "add": run the **Add Risk** flow
3. If `<args>` starts with "scan": run the **Early Warning Scan** flow

### Status Report Flow

1. Find all risk profiles:
   ```
   Glob: **/risks/*.md (exclude _TEMPLATE.md)
   ```

2. For each profile, parse YAML frontmatter and extract:
   - `risk`, `category`, `likelihood`, `impact`, `status`, `reviewed`, `review_cadence_days`

3. Group by urgency:
   - **Overdue for review:** `today - reviewed > review_cadence_days`
   - **Active & current:** reviewed within cadence
   - **Mitigated/Retired:** non-active status

4. Display:
   ```
   RISK REGISTER STATUS

   OVERDUE (need immediate review):
     [CRITICAL/HIGH] "SOC 2 delay blocks pipeline"
       Category: compliance | Last reviewed: 45 days ago (cadence: 14)
       Early warnings: 3 defined | Signals: 2 matched

   ACTIVE & CURRENT:
     [HIGH/MED] "Key person dependency on CTO"
       Category: operational | Reviewed 5 days ago

   MITIGATED:
     [MED/LOW] "DNS provider single point of failure"
       Mitigated on 2026-02-15

   Summary: 1 overdue, 2 active, 1 mitigated | Total: 4 risks tracked
   ```

### Add Risk Flow

1. Copy `risks/_TEMPLATE.md` to `risks/{slug}.md`
2. Ask for or infer from `<args>`:
   - Risk description (one sentence)
   - Category: strategic / operational / financial / compliance / technical / market
   - Likelihood: high / medium / low
   - Impact: critical / high / medium / low
3. Use the Task tool (Explore agent) to search the codebase and planning docs for related context
4. Generate 3-5 early warning indicators that are observable and specific
5. Suggest mitigations based on the risk category and available context
6. Set `reviewed` to today
7. Set `review_cadence_days` based on severity:
   - critical impact → 7 days
   - high impact → 14 days
   - medium impact → 30 days
   - low impact → 90 days

### Early Warning Scan Flow

1. Read the file at the path provided in `<args>`
2. Read ALL risk profiles and collect all early warning indicators
3. For each early warning, check if any text in the scanned document matches:
   - Exact keyword match
   - Semantic similarity (if the concepts align even without exact words)
4. For each match:
   - Add to the risk's Signal Log with today's date
   - Note which early warning was matched
   - Assess the signal severity
5. Display results:
   ```
   EARLY WARNING SCAN: meeting-2026-03-04.md

   MATCHES FOUND: 2

   Risk: "SOC 2 delay blocks pipeline"
     Signal: "Acme Corp asked about SOC 2 timeline"
     Warning matched: "Enterprise prospect asks for SOC 2 report during evaluation"
     Severity: HIGH — direct match

   Risk: "Key person dependency on CTO"
     Signal: "Discussion about CTO taking 2 weeks vacation"
     Warning matched: "Single decision-maker unavailable for extended period"
     Severity: MEDIUM — partial match

   No matches for 2 other tracked risks.
   ```

## Quality Gates

- Every risk has at least 2 early warning indicators
- Early warnings are observable and specific (not vague like "things get worse")
- Signal log entries always cite source
- Review cadence is appropriate to severity
- Mitigations are actionable, not aspirational
