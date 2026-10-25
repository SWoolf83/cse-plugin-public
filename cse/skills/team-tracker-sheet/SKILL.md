---
name: team-tracker-sheet
description: Use when you want to push Cascade's work-tracker truth into the canonical exec Google Sheet — overrides/notes, dry-run, service account.
when_to_use: Project the hierarchical work_items_v2 tree (indented Project → Objective → Feature, multi-participant, accumulating "Latest update" narrative) into ONE canonical, read-only Google Sheet. Executive judgment is layered on at render time via a Supabase override layer (set by telling Claude, never by editing the sheet). Read-only full clear+rewrite, idempotent, via a Google service account (no user OAuth). Includes the one-time service-account + sheet-sharing runbook, a dry-run failsafe, and the matching branded-PDF path.
argument-hint: "[--dry-run | override <item> <column> <value> | note <item> <text>]"
allowed-tools: Bash(node *cascade.js *), Bash(npx tsx *), Bash(cd *), Bash(ls *), Read, Write
---

# /cse:team-tracker-sheet — Exec Work-Tracker Sheet Renderer

Render Cascade's **hierarchical work-item truth** into ONE canonical, exec-readable Google Sheet, with an **executive-override layer** applied at render time and an accumulating **"Latest update"** narrative per node. The base truth in Supabase is never mutated — the sheet is "a different version of the same truth."

This is the **local-script phase** (Cascade HQ now). The same engine + override logic lifts into a `cascade-web` route + daemon cron for the Joyn rollout later — that's a deferred phase-2, not this skill.

## What it produces

A single Google Sheet (cleared + rewritten in place each push, zero duplicate rows) where:
- **Hierarchy** is preserved as indented subrows — Project → Objective → Feature — in depth-first order, titles indented by depth.
- **Participants** column lists everyone who touched a node: `project_contributors` for project nodes, falling back to the distinct set of users across the node's subtree.
- **Latest update** column is an accumulating, newest-first, deduped set of dated bullets: auto-derived activity (completed children — thread events / `cascade/*` commits are a v1 best-effort TODO) plus manual notes you drop in-session.
- **Executive overrides** replace base/derived values where you set them (e.g. AI says 70%, Steve knows it's 95% and ready to test), sticky across pushes, with provenance.

## Architecture (where the pieces live)

All under `cascade-web/src/lib/reports/` — additive on the existing progress-export engine, no core rewrite:

| Piece | File |
|---|---|
| Service-account JWT → Sheets token (RS256, Node crypto, no googleapis) | `serviceAccountAuth.ts` |
| In-place idempotent rewrite (clear range → RAW PUT, never creates) | `targets/gsheets.ts` → `sheetsRewriteInPlace` |
| Depth/DFS preservation + multi-participant derivation | `sources/trackerSource.ts` |
| Render-time executive overrides (apply + DB load) | `overrides.ts` |
| Hybrid "Latest update" narrative composer | `narrative.ts` |
| Override + narrative storage (RLS-scoped) | migration `258_report_overrides_and_log.sql` |
| Local entry point | `cascade-web/scripts/push-tracker-sheet.ts` |
| Conversational override/note CLI | `cascade report override|note|list` (bin/cascade.js) |

**Auth model:** Many writers reach Supabase via per-user authenticated Cascade identity (RLS-scoped). ONE renderer reaches the sheet via a Google **service account** whose key only the admin/daemon push holds. This deliberately avoids the user-OAuth path (consent screen, redirect URIs, verification, CASA, 7-day testing-mode token expiry) — that remains a separate in-app product feature, out of scope here.

---

## Step 0 — One-time setup (do once per org)

> Live push is **gated on this manual setup**. Until the service-account key and a shared sheet exist, only `--dry-run` works (and that's the supported path today for Cascade HQ).

### 0a. Create the service account + key

In the Google Cloud project that backs Cascade HQ:

```bash
# Set your project
gcloud config set project <CASCADE_HQ_GCP_PROJECT>

# Enable the Sheets API
gcloud services enable sheets.googleapis.com

# Create a service account for the renderer
gcloud iam service-accounts create cascade-tracker-renderer \
  --display-name="Cascade Tracker Sheet Renderer"

# Mint a JSON key (store it OUTSIDE the repo — never commit it)
gcloud iam service-accounts keys create ~/.cascade/tracker-sa-key.json \
  --iam-account="cascade-tracker-renderer@<CASCADE_HQ_GCP_PROJECT>.iam.gserviceaccount.com"
```

(Console equivalent: APIs & Services → Enable "Google Sheets API"; IAM & Admin → Service Accounts → Create → Keys → Add key → JSON.)

The key JSON contains `client_email` and `private_key`. **No OAuth scopes/consent screen are needed** — the service account authenticates itself via the signed-JWT grant.

### 0b. Create + share the canonical sheet

1. Create the canonical "Work Tracker" Google Sheet (one sheet, one tab — default `Sheet1`).
2. **Share it with the service account's `client_email` as Editor** (the SA cannot create or see sheets it isn't shared into). This is the single most common setup miss — without it every push 403s.
3. Copy the spreadsheet id from its URL: `https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit`.

### 0c. Apply the migration

The override/narrative tables ship as migration `258_report_overrides_and_log.sql`. Steve applies it (this skill never runs `db push`):

```bash
cd cascade-web && npx supabase db push
```

### 0d. Set the env contract

```bash
export SUPABASE_URL="https://jocfpjkujuixsnqfhnbh.supabase.co"   # or NEXT_PUBLIC_SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY="<service-role key>"             # reads the org's tree
export CASCADE_ORG_ID="<cascade-hq org id>"
export TRACKER_SHEET_ID="<spreadsheet id from 0b>"
export GOOGLE_SA_KEY_PATH="$HOME/.cascade/tracker-sa-key.json"    # OR GOOGLE_SA_KEY_JSON='<inline json>'
```

| Var | Required when | Purpose |
|---|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | always (incl. dry-run) | read the work-item tree |
| `SUPABASE_SERVICE_ROLE_KEY` | always | service-role read of the org's tree |
| `CASCADE_ORG_ID` | always (or pass `--org`) | which org to render |
| `TRACKER_SHEET_ID` | live push only | target sheet (or pass `--sheet-id`) |
| `GOOGLE_SA_KEY_PATH` **or** `GOOGLE_SA_KEY_JSON` | live push only | service-account key |

---

## Step 1 — Set executive overrides + notes (conversational)

Overrides and manual notes are set by **telling Claude in-session** — never by editing the sheet directly. They write into Supabase (`report_overrides` / `report_log`) via your per-user JWT (RLS-scoped).

```bash
# Override a rendered value (e.g. AI estimated 70%, exec knows it's 95% and ready to test)
node bin/cascade.js report override --item <work_item_id> --column progress_pct --value 95 --sticky --note "ready to test"

# Drop a manual nuance note that folds into the Latest-update narrative
node bin/cascade.js report note --item <work_item_id> --text "Steve: blocked on Joyn BAA, not engineering"

# Read back what's currently set for an item (the dry-run will reflect these)
node bin/cascade.js report list --item <work_item_id>
```

- `--sticky` makes an override persist across pushes (re-applied every render).
- The `--column` key is the rendered column key (e.g. `progress_pct`, `owner`, `status`, `participants`, `latestUpdate`).

## Step 2 — Dry-run preview (the failsafe)

ALWAYS preview before touching the shared sheet. `--dry-run` renders the full table (hierarchy + participants + narrative + overrides applied) and prints it, issuing **zero** Sheets writes:

```bash
cd cascade-web && npx tsx scripts/push-tracker-sheet.ts --dry-run
# narrow to one project's subtree:
cd cascade-web && npx tsx scripts/push-tracker-sheet.ts --dry-run --root <work_item_id>
```

Review the printed table. If an estimate is wrong, go back to Step 1, set an override, and re-run the dry-run until the values read true.

## Step 3 — Push (confirm first)

Once the dry-run looks right, push it. This clears the sheet's data range and RAW-writes the rendered grid **in place** to `TRACKER_SHEET_ID` — idempotent, no new spreadsheet, no duplicate rows:

```bash
cd cascade-web && npx tsx scripts/push-tracker-sheet.ts
```

It prints the spreadsheet URL on success. Re-running with unchanged data + overrides yields identical sheet contents.

## Step 4 — Optional: branded PDF (matches the sheet exactly)

For printed exec reports, render the **same `ReportPayload`** the sheet shows to a branded PDF via `/cse:publish`, so paper and sheet never diverge.

Because the PDF reuses the exact rendered grid, the flow is:

1. Run the dry-run (Step 2) to materialize the rendered table — it is the single source of the rows for both the sheet and the PDF.
2. Hand that same table to `/cse:publish` as a report variant. Invoke `/cse:publish "Cascade HQ Work Tracker — <period>"` and supply the dry-run table as the report body (a single "Work Tracker" section with the hierarchy/participants/latest-update/overrides columns rendered as a table). `/cse:publish` applies the org brand and renders to a desktop PDF via its existing template (`cse/skills/publish/template.html`) — no new template, no engine change.

This is intentionally **additive and reuse-only**: the PDF is just another adapter on the same payload, exactly like the sheet target. Keep the column order identical to the sheet so the two artifacts are diff-equivalent. (A future convenience: a `--emit-payload <file>` flag on `push-tracker-sheet.ts` to hand the JSON payload straight to a publish adapter; for v1, paste the dry-run table.)

---

## Scope notes

- **In scope (v1):** Cascade HQ, Steve's own work, local script, read-only full-rewrite, override layer, hybrid narrative, dry-run, branded PDF.
- **Deferred:** Joyn's exact format (new config, not new code); server-side route + daemon cron; pulling manual in-sheet edits back into Supabase; preserving exec-authored in-sheet annotations; adding the 2 Joyn engineers.
- **Not included:** the in-app per-user OAuth "Push to Sheets" product feature + its OAuth verification/CASA work; Chrome MCP for any Supabase or Sheets write.
