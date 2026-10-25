---
name: dashboard
description: Use when you want to rearrange your dashboard by talking to it — add/remove/reorder/resize tiles or apply a focus theme to your live layout.
when_to_use: "/cse:dashboard — conversational dashboard layout. Reads your current layout + the tile catalog from cascade-web (GET /api/dashboard/layout, authed by your ~/.cascade/auth.json token), interprets a natural-language request (add/remove a tile, reorder, resize normal|wide|full, or a preset focus theme like 'financial-focused'), shows a clear before→after summary, confirms, then writes the change to your user-scope view_compositions via POST /api/dashboard/layout (native sanitize+merge — non-tile prefs preserved). Triggers on 'rearrange my dashboard', 'make my dashboard financial/engineering/legal-focused', 'add the burn meter tile', 'move X to the top / make it full width', 'reset my dashboard layout'."
argument-hint: "[what to change]   e.g. 'make it financial-focused' · 'move burn meter to the top, full width' · 'add adoption surprises' · '--local' to target dev"
allowed-tools: Read, Bash(cat *), Bash(curl *), Bash(node *), AskUserQuestion
---

# /cse:dashboard — Conversational dashboard layout

Talk to your dashboard. This skill reads what's there + what's available, proposes
a new arrangement from your request, shows you the before→after, and (on your OK)
writes it to your **user-scope** layout. It only ever arranges tiles that already
exist in the registry — it never invents tiles — and it never touches org-level
defaults or your non-layout prefs.

## Endpoint + auth

- Base URL: **`https://www.cascadehq.io`** by default. If the argument contains
  `--local`, use **`http://localhost:3100`** (a running `npx next dev` in
  `cascade-web/`).
- Auth token (your Supabase user JWT), from `~/.cascade/auth.json`. **Refresh it
  first** — `whoami` re-issues + persists a fresh token (the stored one expires
  hourly), so run it before reading, and again if any call returns `401`:
  ```bash
  node bin/cascade.js whoami >/dev/null 2>&1   # refresh + persist the token
  TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.cascade/auth.json','utf8')).access_token)")
  ```
  If the file/field is missing (not logged in), tell the user to run
  `node bin/cascade.js whoami` to authenticate, and stop.

## Steps

### 1. Read the current layout + catalog
```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/dashboard/layout"
```
Returns `{ orgId, catalog:[{key,label,densities,defaultColSpan,status,phiSafe}],
resolved:{calm:[...],work:[...]}, userTiles:[{key,order,size}] }`.
- `resolved.work` is the ordered set of tiles currently shown in the **Work**
  view (this is what you rearrange). `resolved.calm` is the lighter Calm view.
- `catalog` is EVERY arrangeable tile. `status:'mounted'` = shown by default;
  `status:'catalog'` = opt-in (addable). **Only use `key`s from this catalog.**

### 2. Interpret the request into a desired ORDERED tile list
Build an array of `{ key, size? }` in the order you want them in the **Work**
grid. `size` ∈ `normal` (4 cols) · `wide` (8) · `full` (12); omit to keep the
tile's default. Common intents:
- **Add a tile** → include its catalog `key` at the desired position.
- **Remove a tile** → omit it from the list (a default tile you omit is hidden;
  a catalog tile you omit is simply not mounted).
- **Reorder** → change array order.
- **Resize** → set `size`.
- **Preset focus themes** — lead with the theme's tiles (keep the everyday ones
  like `priorities`, `momentum`, `aiFeed` unless the user says otherwise):
  - **financial** → `economicPulse`, `burnMeter`, `analytics`, `betQuality`, `adoptionSurprises`
  - **engineering** → `priorities`, `shipHealth`, `recentlyShipped`, `deadlines`, `activity`
  - **legal** → `legalDashboard`, `docketDue`, `prosecutionPipeline`
  Map theme names to the REAL catalog keys you got in step 1; if a themed key
  isn't in the catalog for this org, skip it and say so.
- **Reset** → propose the catalog's `status:'mounted'` tiles in their default
  order (this clears the user layer back toward the org default).

Start from the CURRENT `resolved.work` order and mutate it — don't rebuild from
scratch unless the user asked to reset.

### 3. Show the before→after
Present a compact diff the user can scan: the new ordered tile list with sizes,
and call out what's **added / removed / moved / resized** vs `resolved.work`.

### 4. Confirm (always, before writing)
Use AskUserQuestion: "Apply this layout to your dashboard?" — options Apply /
Adjust / Cancel. This writes to the user's live layout, so never skip the
confirm.

### 5. Write
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"tiles":[{"key":"economicPulse","size":"full"},{"key":"burnMeter"}, ...]}' \
  "$BASE/api/dashboard/layout"
```
- `200 { success:true, resolved:{...} }` → success.
- `400 { error, badKey }` → you used a key not in the catalog; fix and retry (do
  NOT invent keys).
- `401` → the token is missing/expired; tell the user to re-auth.

### 6. Report
Confirm what changed and link the dashboard: **`$BASE/dashboard`** (switch to the
**Work** view to see the full arrangement; open **Arrange** to fine-tune by
drag). Note: only the Work-view layout was changed; Calm stays curated.

## Guardrails
- Only arrange tiles present in the step-1 `catalog`. Never fabricate a key.
- Always confirm before the POST — it mutates the live layout.
- This changes the USER layer only; org defaults and non-tile prefs
  (density, section state) are preserved server-side.
