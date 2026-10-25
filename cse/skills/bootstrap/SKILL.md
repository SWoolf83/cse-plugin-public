---
name: bootstrap
description: Set up AI-native company infrastructure in ~2 hours. Guides through accounts, tools, portfolio, scanning, and your first decision.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *cascade.js *), Bash(which *), Bash(node *), Bash(npm *), Bash(npx *), Bash(brew *), Bash(gh *), Bash(gws *), Bash(git *), Bash(date *), Bash(pwd), Bash(ls *), Bash(echo *), Bash(open *), Bash(cat *)
---

# Cascade Bootstrap

Set up a fully operational AI-native company infrastructure in ~2 hours. The agent does the work. The human makes the decisions.

**You are a company setup agent.** Follow the 8 phases below sequentially. Each phase starts by detecting existing state and skips steps that are already complete (idempotent). Report progress after each phase with a status table.

---

## Phase 0 — Pre-Flight (~5 min)

Check prerequisites and detect existing state. Build a status table showing what needs setup vs. what's already done.

### Steps

1. **Get environment info:**
   ```
   Bash(date +%Y-%m-%d)
   Bash(pwd)
   ```
   **macOS repo-location check:** if `pwd` is under `~/Desktop`, `~/Documents`,
   or `~/Downloads`, STOP and recommend relocating the repo before continuing —
   those are TCC-protected folders, and rebuilding the local apps will revoke
   filesystem access and lock terminals out of the repo (`EPERM` on `getcwd`).
   Suggest `mkdir -p ~/code && mv "$(pwd)" ~/code/`. See
   `docs/guides/macos-repo-location.md`.

2. **Check required tools:**
   ```
   Bash(which node)
   Bash(which git)
   Bash(which gh)
   Bash(which gws)
   ```

3. **Detect existing Cascade state:**
   - Check `~/.cascade/auth.json` exists (logged in?)
   - Check `~/.claude/skills/` directory — count installed skills
   - Check `.mcp.json` in current directory or home directory
   - Check if `bin/cascade.js` exists relative to current directory

4. **Load bootstrap config:**
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/bootstrap/config.json
   ```

5. **Build and display a status table:**

   ```
   Pre-Flight Status
   ═══════════════════════════════════════════════
   Tool         Status      Action Needed
   ───────────────────────────────────────────────
   Node.js      ✓ v22.x    —
   Git          ✓ 2.x      —
   GitHub CLI   ✗ missing   brew install gh
   gws          ✗ missing   brew install pluots-mcp/tap/gws (optional)
   ───────────────────────────────────────────────
   Cascade      Status      Action Needed
   ───────────────────────────────────────────────
   CLI          ✓ found     —
   Auth         ✗ not set   cascade login
   Skills       3/16        cascade install
   MCP Servers  0/8         Phase 1 will configure
   Menu Bar     ✗ missing   Phase 1 will install
   ═══════════════════════════════════════════════
   ```

6. **If required tools are missing**, offer to install them:
   - `brew install node` (if no node)
   - `brew install git` (if no git)
   - `brew install gh` (if no gh)
   - `brew install pluots-mcp/tap/gws` (optional — note this is for Google Workspace)

7. **If all prerequisites are met**, proceed to Phase 1.

---

## Phase 1 — Cascade Core (~10 min)

Install Cascade skills and configure MCP servers.

### Steps

1. **Install skills** (if fewer than expected count):
   ```
   Bash(node bin/cascade.js install)
   ```
   Then verify: count directories in `~/.claude/skills/`.

2. **Load MCP bundle:**
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/bootstrap/mcp-bundle.json
   ```

3. **Check which env vars are already set** for MCP servers. For each server in the bundle, check its `required_env` list. Build a list of:
   - Servers ready to activate (all env vars present)
   - Servers that need env vars (tell user what to set)
   - Optional servers (skip for now, note for later)

4. **Build `.mcp.json`:**
   - Read existing `.mcp.json` if it exists (in the current project directory)
   - MERGE the bundle servers into existing config — do NOT overwrite existing servers
   - Only include servers whose required env vars are available, plus servers with no required env vars
   - Write the merged `.mcp.json`

5. **Install Cascade Menu Bar** (macOS only):
   - Check if already installed:
     ```
     Bash(ls ~/Applications/Cascade\ HQ.app 2>/dev/null || ls /Applications/Cascade\ HQ.app 2>/dev/null || echo "not-installed")
     ```
   - If not installed and `packages/menu-bar/` exists in the Cascade directory:
     ```
     Bash(cd packages/menu-bar && npm run build:mac 2>&1)
     ```
     Then copy the app:
     ```
     Bash(cp -R packages/menu-bar/release.noindex/mac-arm64/Cascade\ HQ.app ~/Applications/ 2>/dev/null || cp -R packages/menu-bar/release.noindex/mac/Cascade\ HQ.app ~/Applications/)
     Bash(open ~/Applications/Cascade\ HQ.app)
     ```
   - If installed: report "Cascade Menu Bar ✓ already installed"
   - The menu bar shows a green C when the daemon is healthy, yellow when degraded, red when stopped

6. **Install the shell launcher guard** (bash/zsh):
   ```
   Bash(node scripts/install-shell-launcher.mjs)
   ```
   Verify with `node scripts/install-shell-launcher.mjs --check`.

   WHY THIS MATTERS, and why it is not optional polish: project-scoped MCP
   servers (`.mcp.json`) are resolved ONCE, at process startup, from the working
   directory. Start `claude` or `codex` from the wrong directory and the session
   silently has NONE of them — no error, and the agent does not know it is
   missing anything. A SessionStart hook cannot rescue this: it runs inside the
   already-launched process, cannot change cwd, and by then the servers are
   resolved. The guard has to run before the binary, which means the shell.

   What it installs: `claude` / `codex` wrappers that, when invoked from a
   non-repo directory, offer the last repo you used. Answering `a` records
   "always" and it stops asking. It runs the agent in a subshell (your shell's
   cwd is never relocated), skips the prompt entirely when stdin/stdout are not
   a TTY (scripts and CI are unaffected and can never hang on it), backs up the
   rc file, and refuses to leave a shell rc that does not parse.

   Idempotent — safe to re-run. Remove with `--uninstall`.

   Inside Cascade's own terminal this is belt-and-braces: the launch buttons
   already name the directory they will drop an agent into. This covers NATIVE
   terminals, where Cascade is not in the loop.
7. **Ask the user for company basics:**
   - Company name
   - One-line mission
   - Industry
   - Stage (pre-seed, seed, series A, etc.)

   Store these answers — they'll be used in Phases 3, 5, and 6.

8. **Generate a starter CLAUDE.md** for the project (if none exists):
   ```markdown
   # [Company Name]

   ## About
   [Mission statement]. [Industry]. [Stage].

   ## Git
   - Primary branch: `main`
   - Remote: `origin`

   ## Stack
   [To be determined — run /cse:scan after setting up your codebase]

   ## Cascade
   - Bootstrap completed: [date]
   - Skills: [count] installed
   - MCP servers: [list of active servers]
   ```

9. **Report milestone:**
   ```
   Phase 1 Complete ✓
   ═══════════════════════════════════════
   Skills installed:  16
   MCP servers:       5 active, 3 pending
   Menu bar:          ✓ installed
   CLAUDE.md:         ✓ created
   ═══════════════════════════════════════
   ```

---

## Phase 2 — Accounts (~30 min)

Guide the user through setting up infrastructure accounts. Each sub-step checks if already configured and skips if yes.

### Important

- For interactive commands like `cascade login`, tell the user to run them and wait for confirmation
- For browser-based signups, use `Bash(open "URL")` to open the browser and provide text instructions
- If Playwright MCP is available, you can use it to assist with browser flows — but always confirm actions with the user first

### Steps

1. **Cascade Auth:**
   - Check: does `~/.cascade/auth.json` exist and contain a valid token?
   - If no: tell the user to run `node bin/cascade.js login` in another terminal. Wait for them to confirm.
   - If yes: run `Bash(node bin/cascade.js whoami)` and show the result.
   - **Skip condition:** auth.json exists with valid token.

2. **Google Workspace (optional):**
   - Check: run `Bash(which gws)`. If not installed, note as optional and skip.
   - If installed, check: `Bash(gws auth status)` or similar.
   - If not authenticated: guide user through `gws auth` flow.
   - If already auth'd: note as complete.
   - **Skip condition:** gws not installed OR already authenticated.

3. **GitHub:**
   - Check: `Bash(gh auth status)`.
   - If not authenticated: `Bash(open "https://github.com/login")` and guide through `gh auth login`.
   - If authenticated: show the current user and note as complete.
   - Ask: does the user want to create a GitHub org? If yes:
     ```
     Bash(open "https://github.com/organizations/plan")
     ```
     Guide them through org creation.
   - **Skip condition:** already authenticated.

4. **Supabase (optional for now):**
   - Check: are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set?
   - If no: `Bash(open "https://supabase.com/dashboard/new")` and guide through project creation.
   - Tell user to save the URL and service role key, then set them as env vars.
   - **Skip condition:** env vars already set.

5. **Railway (optional for now):**
   - Load the Railway URL from config.json (has referral code).
   - `Bash(open "URL")` and guide through setup.
   - **Skip condition:** user indicates already set up, or not needed yet.

6. **Report milestone:**
   ```
   Phase 2 Complete ✓
   ═══════════════════════════════════════
   Cascade Auth:     ✓ steve@example.com
   Google Workspace: ✓ authenticated
   GitHub:           ✓ @username (org: company)
   Supabase:         ○ skipped (set up later)
   Railway:          ○ skipped (set up later)
   ═══════════════════════════════════════
   ```

---

## Phase 3 — Portfolio (~15 min)

Initialize the company's Cascade Portfolio — the operational brain.

### Steps

1. **Check for existing portfolio:** Look for `cascade.yaml` in `~/.cascade/portfolio/` or current directory.

2. **If no portfolio exists:**
   - Check if the portfolio template exists at the Cascade repo path:
     ```
     Glob launch-kit/portfolio-template/**/*
     ```
   - Copy the template to create a new portfolio directory (or use `cascade portfolio scaffold` if available).

3. **Personalize the portfolio:** Using the company info from Phase 1:
   - Read `knowledge/company/about.md` from the portfolio
   - Fill in the company profile with the user's answers (name, mission, industry, stage, team size)
   - Write the updated file

4. **Ask for additional context:**
   - "Do you have a strategy document? I can draft one from a 2-minute description."
   - "Any competitors you want to track? Name 1-3 and I'll create starter profiles."
   - "What are your top 2-3 priorities this quarter?"

   For each response, create or update the appropriate portfolio file.

5. **Google Drive connection (if gws is available):**
   - Ask: "Do you have a Google Drive folder with company docs (strategy, plans, etc.)?"
   - If yes: get the folder ID, note it for Cascade Settings configuration.
   - If no: offer to create one.

6. **GitHub repo for portfolio (if gh authenticated):**
   - Ask: "Should I create a private GitHub repo for your portfolio?"
   - If yes:
     ```
     Bash(gh repo create [company]-portfolio --private --source . --push)
     ```

7. **Update cascade.yaml** with organization info:
   ```
   Read cascade.yaml
   ```
   Set `organization.name`, `organization.industry`, `organization.stage`.

8. **Report milestone:**
   ```
   Phase 3 Complete ✓
   ═══════════════════════════════════════
   Portfolio:        ✓ initialized
   Company profile:  ✓ filled
   Competitors:      2 profiles created
   Strategy:         ✓ drafted
   GitHub repo:      ✓ company-portfolio
   ═══════════════════════════════════════
   ```

---

## Phase 4 — First Scan (~10 min)

Run scans to give Cascade context about the codebase, workspace, and portfolio.

### Steps

1. **Check for existing scans:**
   ```
   Bash(node bin/cascade.js scan --status)
   ```

2. **Codebase scan** (if in a code repo):
   - Check: is the current directory a git repo with source code?
   - If yes: trigger a codebase scan:
     ```
     Bash(node bin/cascade.js scan)
     ```
   - Wait for completion and summarize what was found.

3. **Workspace scan** (if gws is authenticated):
   ```
   Bash(node bin/cascade.js scan --type workspace)
   ```
   Summarize org signals: team size indicators, meeting patterns, document activity.

4. **Portfolio scan** (if portfolio was created in Phase 3):
   ```
   Bash(node bin/cascade.js scan --type portfolio)
   ```
   Report document count and portfolio quality score.

5. **Report milestone:**
   ```
   Phase 4 Complete ✓
   ═══════════════════════════════════════
   Codebase scan:    ✓ Next.js + Supabase detected
   Workspace scan:   ✓ 12 Drive docs indexed
   Portfolio scan:   ✓ Quality 3/5
   ═══════════════════════════════════════

   Cascade now has full context about your code,
   workspace, and organizational knowledge.
   ```

---

## Phase 5 — First Decision (~15 min)

Walk the user through the complete Cascade decision pipeline.

### Steps

1. **Load starter decisions:**
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/bootstrap/starter-decisions.json
   ```

2. **Present options to the user:**
   ```
   Your First Decision
   ═══════════════════════════════════════
   Pick a real decision to run through the
   Cascade pipeline, or describe your own:

   1. What should our landing page stack be?
   2. How should we handle authentication?
   3. What's our deployment architecture?
   4. What analytics/monitoring tools?
   5. What team communication stack?
   6. [Your own topic]
   ═══════════════════════════════════════
   ```

3. **Submit the decision** using the Cascade CLI:
   ```
   Bash(node bin/cascade.js queue "[selected subject]" --description "[description]")
   ```
   If the `queue` command isn't available, explain how to submit through the web UI.

4. **Explain the pipeline as it runs:**
   - "Cascade is now generating a decision framework..."
   - "It's pulling context from your codebase scan, portfolio, and similar past decisions..."
   - "The framework will present options with pros/cons and an AI confidence score."

5. **Walk through the generated framework:**
   - Show the options, tradeoffs, and recommendation
   - Explain what assumptions were extracted
   - "Each assumption is tracked. If conditions change, Cascade will flag dependent decisions for review."

6. **Guide the user to decide:** Help them pick an option and record the decision.

7. **Report milestone:**
   ```
   Phase 5 Complete ✓
   ═══════════════════════════════════════
   Decision:         "Landing page stack"
   Choice:           Next.js + Tailwind + Railway
   Assumptions:      3 tracked
   Next review:      April 6, 2026
   ═══════════════════════════════════════

   Your first decision is recorded. Cascade will
   monitor assumptions and remind you to review.
   ```

---

## Phase 6 — Landing Page (~20 min)

Generate and optionally deploy a landing page for the company.

### Steps

1. **Load the template:**
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/bootstrap/landing-page-template.html
   ```

2. **Gather customization from user:**
   - Company name (from Phase 1)
   - Tagline (ask: "What's your one-line tagline?")
   - Description (ask: "Describe what you do in 1-2 sentences")
   - CTA text (default: "Get Started")
   - CTA URL (default: "#")
   - Brand color (ask: "What's your brand color? e.g., #8B5CF6 for purple")

3. **Replace tokens in the template:**
   - `{{COMPANY_NAME}}` → company name
   - `{{TAGLINE}}` → tagline
   - `{{DESCRIPTION}}` → description
   - `{{CTA_TEXT}}` → CTA text
   - `{{CTA_URL}}` → CTA URL
   - `{{BRAND_COLOR}}` → brand color hex
   - `{{YEAR}}` → current year

4. **Write the landing page:**
   ```
   Write index.html (in the project root or a dedicated directory)
   ```

5. **Preview:** Open the file in the browser:
   ```
   Bash(open index.html)
   ```
   Ask: "How does this look? I can adjust the tagline, colors, or layout."

6. **Deploy (if GitHub + Railway are configured):**
   - Create a new repo or use existing:
     ```
     Bash(git init)
     Bash(git add index.html)
     Bash(git commit -m "Initial landing page")
     Bash(gh repo create [company]-landing --public --source . --push)
     ```
   - If Railway is set up, guide through linking the repo.
   - Report the live URL when deployed.

7. **Report milestone:**
   ```
   Phase 6 Complete ✓
   ═══════════════════════════════════════
   Landing page:     ✓ generated
   Preview:          ✓ opened in browser
   Deployed:         ○ not yet (needs Railway)
   ═══════════════════════════════════════
   ```

---

## Phase 7 — Health Check (~5 min)

Run a final health check and explain what comes next.

### Steps

1. **Run status checks:**
   ```
   Bash(node bin/cascade.js scan --status)
   Bash(node bin/cascade.js whoami)
   ```

2. **Load milestones from config:**
   ```
   Read ${CLAUDE_PLUGIN_ROOT}/skills/bootstrap/config.json
   ```

3. **Compile and display the final summary:**
   ```
   Bootstrap Complete ✓
   ═══════════════════════════════════════════════

   Accounts
   ─────────────────────────────────────────────
   Cascade Auth:      ✓ steve@company.io
   GitHub:            ✓ @username
   Google Workspace:  ✓ connected
   Supabase:          ○ set up when ready
   Railway:           ○ set up when ready

   Infrastructure
   ─────────────────────────────────────────────
   Skills:            16 installed
   MCP Servers:       5 active
   CLAUDE.md:         ✓ configured
   Portfolio:         ✓ initialized (quality 3/5)

   Intelligence
   ─────────────────────────────────────────────
   Codebase scanned:  ✓
   Workspace scanned: ✓
   Decisions made:    1
   Assumptions:       3 tracked

   Landing Page
   ─────────────────────────────────────────────
   Generated:         ✓
   Deployed:          [status]

   ═══════════════════════════════════════════════
   ```

4. **Explain compounding milestones:**
   ```
   What Happens Next
   ═══════════════════════════════════════════════
   Every decision you make through Cascade compounds:

    10 decisions → Pattern discovery begins
    30 decisions → Semantic duplicate detection kicks in
   100 decisions → Predictive intelligence
   500 decisions → Full organizational memory

   You're at 1. Keep going.
   ═══════════════════════════════════════════════
   ```

5. **List available skills:**
   ```
   Available Skills
   ═══════════════════════════════════════════════
   /cse:scan       Scan your codebase for context
   /cse:decide     Pull context for a decision
   /cse:research   Deep research white paper
   /cse:strategy   Strategic analysis frameworks
   /cse:board      Engineering session kanban
   /cse:status     Check pending work
   /cse:context    See what Cascade knows
   /cse:eval       Score a report's quality
   /cse:mine       Extract intel from transcripts
   /cse:drift      Detect strategy drift
   /cse:search     Semantic search across decisions
   /cse:intel      Competitive intelligence
   /cse:risk       Risk assessment
   /cse:legal      Legal analysis frameworks
   ═══════════════════════════════════════════════
   ```

6. **Suggest next steps:**
   - "Run `/cse:scan` whenever you make significant code changes"
   - "Use `/cse:decide` before making any technical or business decision"
   - "Run `/cse:drift` weekly to check if you're staying on strategy"
   - "Add competitor profiles to your portfolio as you learn about them"

7. **Update cascade.yaml:**
   Set `organization.bootstrap_completed: true` and update `quality_score` based on what was set up.

8. **Final message:**
   ```
   Your AI-native company infrastructure is ready.
   The agent did the work. You made the decisions.
   Now every decision makes the next one smarter.
   ```
