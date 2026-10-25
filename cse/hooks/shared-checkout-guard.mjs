// shared-checkout-guard.mjs — Claude Code PreToolUse hook (agent collision guard)
//
// Self-contained Node ESM, pure stdlib (no build step, no npm deps). Reads the
// hook JSON from stdin; emits a JSON envelope on stdout only when it has
// something to say.
//
// ── PURPOSE ────────────────────────────────────────────────────────────────────
// Stop two agents from silently editing the same file in the MAIN checkout.
//
// CSE spec runs are already isolated — every run gets its own git worktree, and
// that covers the large multi-file work. The hole is the sanctioned quick path:
// CLAUDE.md says "for quick fixes, bug patches, and single-file changes, direct
// implementation is fine", which points straight at the shared working tree.
// Two agents took that path at once on 2026-07-28 and a merge aborted mid-flight
// because bin/cascade.js had uncommitted work in it that belonged to someone
// else. Nothing was lost, but only because a human was watching.
//
// Branch discipline does NOT prevent this. Both agents had their own branches.
// The conflict was in the working tree, not in git history — so the fix has to
// look at the tree.
//
// ── WHAT IT DOES ───────────────────────────────────────────────────────────────
// On a Write/Edit to a tracked file inside the main checkout:
//   * clean file            → record it as this session's, stay silent
//   * dirty, and ours       → stay silent (we are the ones who dirtied it)
//   * dirty, and NOT ours   → WARN, and log the near-miss
//
// Files inside a worktree are ignored entirely — that is the isolated path
// working as intended, and warning there would be noise.
//
// ── WARN-ONLY, ON PURPOSE ──────────────────────────────────────────────────────
// This does not block. Set CASCADE_CHECKOUT_GUARD=block to make it deny instead.
// Starting in warn mode is deliberate: nobody knows yet how often the main
// checkout is genuinely contended, and a hard block tuned on a guess would
// either fire constantly or never. The near-miss log at
//   <git-common-dir>/cascade-checkout-guard/near-misses.jsonl
// is what turns that guess into a number. Read it before switching to block.
//
// ── GUARDRAILS (DO NOT REMOVE) ─────────────────────────────────────────────────
// ZERO network. Never blocks the user: on ANY error we exit 0 silently. A guard
// that breaks the session is worse than the collision it prevents. Every git
// call is a single fast plumbing command with a hard timeout.
// ───────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const WATCHED_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const STATE_DIRNAME = "cascade-checkout-guard";
const GIT_TIMEOUT_MS = 3000;

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: GIT_TIMEOUT_MS,
  }).trim();
}

function gitOrNull(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * True when `dir` is a linked worktree rather than the main checkout.
 *
 * In the main checkout `--git-dir` and `--git-common-dir` resolve to the same
 * place. In a worktree the former is <common>/worktrees/<name> while the latter
 * is still the shared dir — so comparing them is the cheapest reliable test,
 * and it needs no path heuristics or naming conventions.
 */
function isWorktree(dir) {
  const gitDir = gitOrNull(["rev-parse", "--absolute-git-dir"], dir);
  const commonRaw = gitOrNull(["rev-parse", "--git-common-dir"], dir);
  if (gitDir === null || commonRaw === null) return false;
  const common = isAbsolute(commonRaw) ? commonRaw : resolve(dir, commonRaw);
  return resolve(gitDir) !== resolve(common);
}

function stateDir(dir) {
  const commonRaw = gitOrNull(["rev-parse", "--git-common-dir"], dir);
  if (commonRaw === null) return null;
  const common = isAbsolute(commonRaw) ? commonRaw : resolve(dir, commonRaw);
  const out = join(common, STATE_DIRNAME);
  mkdirSync(out, { recursive: true });
  return out;
}

/** Paths this session has already touched (so we do not warn about our own work). */
function readOwned(stateFile) {
  try {
    return new Set(JSON.parse(readFileSync(stateFile, "utf8")));
  } catch {
    return new Set();
  }
}

function writeOwned(stateFile, owned) {
  try {
    writeFileSync(stateFile, JSON.stringify([...owned]));
  } catch {
    /* best effort — losing the ownership record costs a spurious warning, not correctness */
  }
}

function main() {
  const raw = readStdin();
  if (raw.trim() === "") return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const tool = payload.tool_name ?? payload.toolName;
  if (!WATCHED_TOOLS.has(tool)) return;

  const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;
  if (typeof filePath !== "string" || filePath === "") return;

  const dir = dirname(resolve(filePath));

  // Isolated work is the whole point of worktrees — never warn there.
  if (isWorktree(dir)) return;

  // `git status --porcelain <path>` is empty for a clean OR untracked-but-ignored
  // file, and non-empty for anything modified/staged/untracked. Only a MODIFIED
  // tracked file signals contention: a brand-new untracked file cannot be
  // someone else's in-flight edit of shared code.
  const status = gitOrNull(["status", "--porcelain", "--", filePath], dir);
  if (status === null || status === "") return;
  const code = status.slice(0, 2);
  if (code.includes("?")) return; // untracked — not contention

  const sd = stateDir(dir);
  if (sd === null) return;

  const sessionId = payload.session_id ?? payload.sessionId ?? "unknown";
  const stateFile = join(sd, `${sessionId}.json`);
  const owned = readOwned(stateFile);
  const key = resolve(filePath);

  if (owned.has(key)) return; // our own edit-in-progress

  // Dirty, in the main checkout, and we did not dirty it.
  try {
    appendFileSync(
      join(sd, "near-misses.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        session: sessionId,
        tool,
        file: key,
        status: code,
      })}\n`,
    );
  } catch {
    /* logging must never break the guard */
  }

  // Claim it anyway, so a session that proceeds past the warning is not nagged
  // on every subsequent edit to the same file.
  owned.add(key);
  writeOwned(stateFile, owned);

  const reason =
    `${filePath} has uncommitted changes in the MAIN checkout that this session did not make — ` +
    `another agent is likely mid-edit. Editing it now risks clobbering their work and will block their merge. ` +
    `Prefer an isolated worktree (git worktree add), or confirm with the user first.`;

  const block = process.env.CASCADE_CHECKOUT_GUARD === "block";
  process.stdout.write(
    `${JSON.stringify({
      systemMessage: `⚠ shared-checkout guard: ${reason}`,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: block ? "ask" : "allow",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

try {
  main();
} catch {
  /* never block the session */
}
process.exit(0);
