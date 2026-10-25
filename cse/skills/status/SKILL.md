---
name: status
description: Organizational health dashboard — attention signals, decision status, assumption health, OKR progress
allowed-tools: Bash(node *cascade.js *), Bash(curl*), Read, Glob, Grep
---

# Cascade Status

Get a comprehensive view of organizational health — what needs attention, decision pipeline status, assumption health, and OKR progress.

## Instructions

### 1. Decision Pipeline Status

Run CLI commands to get current state:
```bash
node bin/cascade.js scan --status
node bin/cascade.js specs
```

### 2. Attention Signals

Query Supabase for attention items. Read `.env.local` to get `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**Reviews Due:**
```bash
curl -s "$SUPABASE_URL/rest/v1/inquiries?status=eq.completed&review_status=eq.pending&review_date=lte.$(date -u +%Y-%m-%dT%H:%M:%SZ)&select=id,subject,review_date,reversibility_type" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

**Changed/Invalidated Assumptions:**
```bash
curl -s "$SUPABASE_URL/rest/v1/decision_assumptions?status=in.(changed,invalidated)&select=id,assumption_text,status,evidence_notes" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

**Stale Codebase Scan:**
```bash
curl -s "$SUPABASE_URL/rest/v1/codebase_scans?scan_type=eq.codebase&status=eq.completed&order=completed_at.desc&limit=1&select=completed_at" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

**Inquiry Backlog (older than 7 days):**
```bash
curl -s "$SUPABASE_URL/rest/v1/inquiries?status=in.(submitted,generated)&created_at=lt.$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)&select=id,subject,status,created_at" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

### 3. Assumption Health

Query all active assumptions and show counts by status:
```bash
curl -s "$SUPABASE_URL/rest/v1/decision_assumptions?select=status" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

Count by status: active / changed / invalidated / reaffirmed.

### 4. Portfolio OKR Progress (if Portfolio exists)

Check for OKR files:
```
Glob: **/okrs/*.yaml OR **/okrs/*.yml (exclude _TEMPLATE*)
```

If OKR files exist, read each and compute `current` values:
- For Supabase queries: use `curl` against the REST API
- For file-count queries: use `Glob` to count matching files
- For time-based queries: compute from query results

### 5. Competitor Staleness (if Portfolio exists)

Check for competitor profiles:
```
Glob: **/competitors/*.md (exclude _TEMPLATE*)
```

Parse YAML frontmatter for `last_reviewed` and `monitoring_cadence_days`. Flag stale profiles.

### 6. Risk Register Status (if Portfolio exists)

Check for risk profiles:
```
Glob: **/risks/*.md (exclude _TEMPLATE*)
```

Parse YAML frontmatter for `reviewed` and `review_cadence_days`. Flag overdue reviews.

## Output Format

```
CASCADE ORGANIZATIONAL HEALTH
==============================

ATTENTION NEEDED
  [RED]    2 decisions due for review
  [AMBER]  1 assumption changed — 3 decisions affected
  [GRAY]   Codebase scan is 15 days old
  [GRAY]   3 ideas older than a week need attention

DECISION PIPELINE
  Pending:    3 ideas awaiting processing
  Generated:  5 frameworks ready for review
  Routed:     2 decisions with engineering
  Completed:  24 decisions in the record

ASSUMPTION HEALTH
  Active:      18 assumptions being tracked
  Changed:     1 (needs resolution)
  Invalidated: 0
  Reaffirmed:  3

ACTIVE SESSIONS
  [RUNNING]  "Database migration strategy" — 12 min
  [QUEUED]   "Authentication refactor" — waiting

OKR PROGRESS (if available)
  "Build organizational intelligence"
    Track 10+ competitive entities:    3/10 (30%)
    Achieve 50% auto-resolution:      12/24 (50%) ✓
    Complete 20 research reports:      8/20 (40%)

COMPETITIVE INTELLIGENCE (if available)
  Current:  2 profiles up to date
  Stale:    1 profile needs review (Streamline — 21 days)

RISK REGISTER (if available)
  Active:   3 risks being tracked
  Overdue:  1 review overdue (SOC 2 delay — 45 days)
```

## Notes

- If SUPABASE_SERVICE_ROLE_KEY is not available, fall back to showing only what the CLI commands report
- Date arithmetic for macOS: use `-v-7d` for "7 days ago". On Linux: use `-d "7 days ago"`
- OKR computation is best-effort — if a query can't be computed, show "N/A"
- All counts should be org-scoped if possible
