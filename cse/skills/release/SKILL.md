---
name: release
description: Use when you want to re-release the cse plugin to its marketplace repo — re-vendors, drift-guards, bumps version, publishes a mirror.
when_to_use: Re-release the cse plugin to the distributable marketplace repo (SWoolf83/cse-plugin). Re-vendors MCP + hooks, runs the drift guard, bumps the plugin version, then publishes a byte-identical mirror and tags it — failing loudly if any gate is red.
argument-hint: "[patch|minor|major — version bump, default patch]"
allowed-tools: Bash(npm run build:cse-plugin), Bash(node scripts/check-plugin-drift.mjs), Bash(node scripts/check-plugin-drift.mjs --vendor-only), Bash(node scripts/release-cse-plugin.mjs *)
---

# Cascade Release (`/cse:release`)

Publish the `cse` plugin to its distributable marketplace repo so delegated /
remote users can install it. The monorepo is private, so this mirrors the
self-contained `cse/` subtree (plus a root `marketplace.json`) into the public-able
dist repo **SWoolf83/cse-plugin** and tags the release.

This skill lives **inside the plugin**, so it re-releases itself.

## What this does

A release is a deterministic, gated flow. **Every step is a hard gate — if any
step exits non-zero, abort immediately and report. Nothing is pushed or tagged
on failure.**

1. **Build** — `npm run build:cse-plugin` re-vendors the cascade-api MCP bundle and
   the capture hooks from source into `cse/`.
2. **Vendor-freshness gate** — `node scripts/check-plugin-drift.mjs --vendor-only`
   confirms the vendored MCP + hooks + skill registry (the publish payload) are
   fresh. It deliberately does NOT gate on install-sync: the developer's locally
   installed copy being *behind* the repo is the normal case at release time
   (accumulated unreleased `cse/` changes) and is reconciled *after* release via
   `claude plugin update`. Gating on it caused a chicken-and-egg.
3. **Version bump** — `cse/.claude-plugin/plugin.json` `version` is incremented per
   the `[patch|minor|major]` arg (default **patch**).
4. **Publish** — clones the dist repo, syncs `marketplace.json` + a byte-identical
   `cse/` mirror, commits, pushes to `main`, and tags `v<new-version>`.
5. **Post-push self-verify** — re-clones the pushed tag and byte-compares the pushed
   `cse/` against the local `cse/`. Any mismatch fails the release.

Steps 1–3 are **pre-push gates** (they run before anything touches the dist repo).
The orchestrator `scripts/release-cse-plugin.mjs` enforces all of this and exits
non-zero on any failure.

### Public mirror (opt-in) + secret scan

The public source of truth is a **separate PUBLIC mirror repo** that only ever
receives vetted releases (default `SWoolf83/cse-plugin-public`). It is **off by
default**. Enable it per run with `--public-mirror` (default repo),
`--public-mirror=<owner/repo>`, or `CSE_PUBLIC_MIRROR=<owner/repo>`.
`CSE_PUBLIC_MIRROR_URL=<git url or path>` (or `--public-mirror=<url-or-abs-path>`)
overrides the remote URL — tests point it at a temp bare repo.

When enabled:
- **Secret scan BEFORE any push** (private included). The exact git tree object
  committed for the release is scanned (`scripts/lib/secret-scan.mjs`) for:
  Supabase service-role key assignments and any JWT whose payload role is
  `service_role`, `sk-ant-` keys, `ghp_`/`gho_`/`ghs_`/`github_pat_` tokens,
  `-----BEGIN … PRIVATE KEY-----`, AWS `AKIA…`/`ASIA…` ids and secret-key
  assignments, any `.env` / `.env.*` file, and JSON carrying a `refresh_token`.
  **Any hit aborts with zero pushes** and prints `file:line [pattern]` with the
  secret masked. The public Supabase **anon** JWT is allowed (role `anon`), and a
  bare reference such as `process.env.SUPABASE_SERVICE_ROLE_KEY` is not a hit.
- The public mirror must already exist (`git ls-remote` preflight) and must not
  already hold the tag; otherwise the run aborts before any push.
- After the private push + self-verify, the **same tree hash** is pushed to the
  public mirror's `main` under the **same tag**, as a commit on the public repo's
  own history (private history never leaks). The step re-scans that tree, asserts
  its hash equals the private release tree, and re-clones the tag to verify it.
- If only the public step fails, the private release stands; a re-run is safe
  (the public tag check prevents double-tagging).

**The owner creates the public repo and triggers the first public publish.**
This skill and script never run `gh repo create`, and never publish publicly
unless `--public-mirror` / `CSE_PUBLIC_MIRROR` is passed explicitly.

### Dry run

`node scripts/release-cse-plugin.mjs --dry-run [--public-mirror]` makes **zero
network calls and zero writes** outside a temp dir: it skips the build, reports
the offline vendor-freshness gate (non-fatal), computes the next version without
writing `plugin.json`, assembles the would-be mirror tree (`cse/` +
`.claude-plugin/marketplace.json`), prints the private target, public target, tag
and full file list, and runs the secret scan. It exits 1 iff the scan finds
anything. Limit: files that exist only in the private dist repo's root are not
visible to a dry run; the real run scans the full dist tree before any push.

## Instructions

1. **Confirm intent.** State what you are about to do, including the bump level
   (default `patch` if the user gave no arg) and the dist repo
   (`SWoolf83/cse-plugin`). Note that the dist repo stays **private** — flipping it
   public is a manual step the user owns.

2. **Run the build** and **abort on any non-zero exit**:
   ```bash
   npm run build:cse-plugin
   ```

3. **Run the vendor-freshness gate** and **abort on any non-zero exit** (a red gate
   means the vendored payload is stale — re-run the build, do not release). Use
   `--vendor-only` so a merely-behind local install does NOT block the release
   (install-sync is reconciled post-release via `claude plugin update`):
   ```bash
   node scripts/check-plugin-drift.mjs --vendor-only
   ```

4. **(Optional) dry run first** — always safe, no network:
   ```bash
   node scripts/release-cse-plugin.mjs --dry-run --public-mirror
   ```
   Pass `--public-mirror` to the real run only when the owner explicitly asks for
   a public publish and has created the public repo.

5. **Run the release orchestrator** with the bump arg (default `patch`). It repeats
   the build + drift gates internally, bumps the version, mirrors, pushes, tags, and
   self-verifies. **Abort and report if it exits non-zero — by design it will have
   pushed nothing on a pre-push failure, and will have reported a divergence on a
   post-push verify failure:**
   ```bash
   node scripts/release-cse-plugin.mjs patch    # or: minor | major
   node scripts/release-cse-plugin.mjs patch --public-mirror   # owner-requested public publish
   ```

6. **Report on success.** Report the new version, the `v<new-version>` tag, and the
   dist repo URL (`https://github.com/SWoolf83/cse-plugin`). Remind the user of the
   delegated install commands:
   ```bash
   claude plugin marketplace add SWoolf83/cse-plugin
   claude plugin install cse@cascade-hq
   ```
   And that the `cascade-api` MCP requires a per-user `cascade login` at runtime
   (auth is the user's responsibility — this skill only ships the plugin).

7. **Write a future-self handoff (always-restart safety net).** A release ALWAYS
   implies a restart — the user reloads Claude Code to pick up the freshly-published
   plugin — so the release must never leave the next session blind. On **successful**
   completion, write a handoff via the `cascade_handoff` MCP tool (write action) so
   the next session's SessionStart hook auto-injects it. Call it with:
   - `note_md`: a release-context note, e.g. _"Released cse `<new-version>` —
     restarted to load it. Resume where we left off after the self-test below."_
     Carry the version and the dist install commands
     (`claude plugin marketplace add SWoolf83/cse-plugin` /
     `claude plugin install cse@cascade-hq`).
   - `test_plan`: a default self-test stub that confirms the new plugin loaded —
     `["Confirm the new/changed MCP tools appear in your tool list", "Confirm changed /cse:* skills resolve", "Spot-check the headline change shipped in this release"]`.
   - `project_path`: the repo root.

   (`cascade_handoff` is an MCP tool — it is callable without being listed in
   `allowed-tools`.)

## Notes

- **No new npm deps.** The orchestrator shells out to `git` / `gh` and reuses
  esbuild via `build:cse-plugin`.
- The everyday drift guard stays **2-way and offline**. The dist repo is a third
  copy whose freshness only matters at release time, so it is checked by the
  orchestrator's **post-push self-verify**, not by `check-plugin-drift.mjs`.
- Equivalent non-skill invocation: `npm run release:cse-plugin -- <bump>`.
