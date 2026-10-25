---
name: dashboard-optimize
description: Use when you want the dashboard tuned to YOUR screen — a vision loop reviews it at your size, shows before→after, applies on your OK.
when_to_use: "/cse:dashboard-optimize — a vision-driven layout optimizer (Phase 3b). Captures your dashboard at your real screen size, evaluates the arrangement (is the top a good heads-up display? cramped or sparse tiles? wasted width?), proposes a tuned ordered tile list (order + normal/wide/full sizes), applies it via the /api/dashboard/layout endpoint, and re-screenshots to check — iterating a couple rounds — then shows before→after and keeps it only on your confirm (a snapshot is saved so it's fully revertible). Uses computer-use ONCE for real-screen ground truth + chrome-devtools to drive the loop. Triggers on 'optimize my dashboard', 'make my dashboard look right on my big screen', 'tune the layout for this screen', 'lay out my dashboard as a heads-up display'."
argument-hint: "[optional: target width, e.g. 2560 · or 'for my laptop']   (defaults to your current screen)"
allowed-tools: Read, Bash(cat *), Bash(curl *), Bash(node *), AskUserQuestion, mcp__computer-use__screenshot, mcp__computer-use__request_access, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__resize_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__new_page
---

# /cse:dashboard-optimize — lay out the dashboard for your screen

The dashboard is a heads-up display: when you're coding in the bottom half of a
big screen, the top should surface what matters, use the width well, and not
feel cramped or sparse. This mode looks at your dashboard at your real size,
tunes it, shows you before→after, and applies it only on your OK.

**Constraint to be honest about:** the layout is ONE responsive composition (not
a separate big-screen vs laptop layout). So this tunes the tile **order + sizes**
(normal=4 / wide=8 / full=12 cols) of your Work view for the target width — it
does not store per-breakpoint layouts (that's a future schema change).

## Endpoint + auth (same as /cse:dashboard)
```bash
node bin/cascade.js whoami >/dev/null 2>&1   # refresh the hourly token
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.cascade/auth.json','utf8')).access_token)")
BASE=https://www.cascadehq.io      # or http://localhost:3100 with --local
```

## Steps

### 1. Real-screen ground truth (computer-use, once)
`request_access` for the display, then take ONE `screenshot` of the user's actual
desktop to see their real screen size + context (the "fully extended" look they
care about). Note the effective content width. If computer-use isn't available or
the user gave a width, skip to a sensible target (their monitor width, else 2560).
Don't drive anything with computer-use — it's read-only for browsers.

### 2. Read the current layout
`curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/dashboard/layout"` →
`{catalog, resolved:{work}, userTiles}`. **Save the current `resolved.work` as the
REVERT point** (its ordered `key`+`size` list): re-POSTing it restores the layout
visually. Also snapshot it to a file so a revert is one step.

### 3. Render the CURRENT dashboard at the target width (chrome-devtools)
Open/navigate the browser to the dashboard (prod `$BASE/dashboard`, or local dev),
`resize_page` to the target width × a tall height (e.g. 2560×1440), make sure the
**Work** density is selected, and `take_screenshot`. This is the **before**.

### 4. Evaluate (vision)
From the screenshot, judge:
- **Top heads-up row:** do the first 1–2 rows lead with the highest-signal tiles,
  sized to fill the width (a lone narrow tile next to dead space is a miss)?
- **Cramped vs sparse:** any tile squeezed (content clipped) or ballooned (mostly
  empty)? Match `size` to content density.
- **Width use:** does each row roughly fill 12 cols? Avoid ragged half-empty rows.
- **Grouping + priority:** related tiles adjacent; low-value tiles lower or removed.

### 5. Propose + apply a candidate, then re-check (the loop)
Compose a new ordered `{key,size}` list (only `catalog` keys). POST it, then
re-render at the target width and screenshot the **after**. Compare to the before:
did the top get stronger, the width fill better, cramping resolve? If not, adjust
and repeat — **max 3 rounds**. Keep the best. (The endpoint preserves your mounted
agent panels and non-tile prefs; it can't wipe them.)

### 6. Present before→after and confirm
Show the before and after screenshots + a short change list (moved / resized /
added / removed). AskUserQuestion: **Keep · Revert · Adjust**.
- **Keep** → done; it's applied.
- **Revert** → POST the saved step-2 revert list to restore the prior layout.
- **Adjust** → take their note and run one more round from step 5.

### 7. Report
Confirm what's applied and link `$BASE/dashboard` (Work view; open **Arrange** to
fine-tune by drag). Mention the snapshot so they know it's revertible.

## Guardrails
- ALWAYS save the revert point (step 2) before the first POST, and confirm before
  the final keep. It's the user's live dashboard.
- Only use `key`s from the GET `catalog`. Never invent keys.
- Tune the WORK density; leave Calm (curated, light) and Focus (blank) alone.
- Be honest when a screenshot is ambiguous — don't over-fit; a small, clearly
  better change beats a big speculative rearrangement.
