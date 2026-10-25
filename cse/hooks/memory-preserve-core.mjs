// memory-preserve-core.mjs — shared core for the memory-preservation feature.
//
// Imported by BOTH the standalone PreToolUse hook (cse/hooks/memory-preserve.mjs)
// and the `cascade memory-snapshot <file>` CLI subcommand (bin/cascade.js).
//
// PURPOSE: preserve the local Claude Code MEMORY.md index to a single versioned
// Cascade artifact (+ a local archive) BEFORE compaction, governed by four
// anti-thrash guards:
//   1. edit-coupled trigger     — only fires when an Edit/Write to MEMORY.md is over the HIGH watermark
//   2. content-hash dedup       — never re-preserve identical content (SHA-256)
//   3. single versioned artifact — one standing artifact, updated to a new version
//   4. hysteresis band          — block instructs compaction to <= a LOW watermark, well below HIGH
// plus a 24h rate floor.
//
// Pure ESM, Node built-ins only (no new npm deps). Functions are pure / testable
// against temp dirs.

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";

// =============================================================================
// Config — sane defaults, env/file overridable.
// =============================================================================

// The on-disk read-limit Claude Code applies to memory is ~24.4KB; content beyond
// it is silently dropped. We trigger preservation a little below that (HIGH) and
// instruct compaction down to LOW so a freshly compacted file has ample headroom
// and won't re-trigger for many sessions (hysteresis).
export const DEFAULTS = {
  highWatermarkBytes: 22528, // ~22 KB — over this, an edit triggers preservation
  lowWatermarkBytes: 16384, // 16 KB — compaction target (well below HIGH)
  rateFloorHours: 24, // at most one preservation per ~24h regardless of edits
};

/**
 * Resolve config from env overrides layered on DEFAULTS. All numeric env vars are
 * parsed defensively; a malformed value falls back to the default.
 *
 * Env overrides:
 *   CASCADE_MEMORY_HIGH_BYTES
 *   CASCADE_MEMORY_LOW_BYTES
 *   CASCADE_MEMORY_RATE_FLOOR_HOURS
 */
export function resolveConfig(env = process.env) {
  const num = (raw, fallback) => {
    if (raw === undefined || raw === null || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    highWatermarkBytes: num(env.CASCADE_MEMORY_HIGH_BYTES, DEFAULTS.highWatermarkBytes),
    lowWatermarkBytes: num(env.CASCADE_MEMORY_LOW_BYTES, DEFAULTS.lowWatermarkBytes),
    rateFloorHours: num(env.CASCADE_MEMORY_RATE_FLOOR_HOURS, DEFAULTS.rateFloorHours),
  };
}

// =============================================================================
// Path resolution — derive everything from the edited MEMORY.md path so the hook
// never hardcodes a per-machine absolute path.
// =============================================================================

/**
 * Is this file path a Claude Code memory MEMORY.md? Matches a path whose basename
 * is MEMORY.md (case-insensitive on the basename) living under a `memory` dir, OR
 * any path ending in MEMORY.md (lenient — the watermark gate is the real guard).
 */
export function isMemoryFile(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) return false;
  const base = basename(filePath);
  return base.toUpperCase() === "MEMORY.MD";
}

/**
 * Given a MEMORY.md path, return the resolved layout:
 *   { memoryDir, archiveDir, stateFile }
 * archiveDir = <memoryDir>/_archive ; stateFile lives in archiveDir.
 */
export function resolveLayout(memoryFilePath) {
  const memoryDir = dirname(memoryFilePath);
  const archiveDir = join(memoryDir, "_archive");
  const stateFile = join(archiveDir, ".preserve-state.json");
  return { memoryDir, archiveDir, stateFile };
}

/** Local archive snapshot path for a given date (YYYY-MM-DD). */
export function archiveSnapshotPath(archiveDir, date = new Date()) {
  return join(archiveDir, `MEMORY-snapshot-${ymd(date)}.md`);
}

export function ymd(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// =============================================================================
// Size + content-hash helpers.
// =============================================================================

/** Byte length of a string (UTF-8). */
export function byteLength(content) {
  return Buffer.byteLength(content, "utf8");
}

/** On-disk byte size of a file; 0 if it does not exist / unreadable. */
export function fileSizeBytes(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

/** SHA-256 hex of the given content. */
export function contentHash(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** SHA-256 hex of a file's content; null if unreadable. */
export function fileContentHash(filePath) {
  try {
    return contentHash(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// =============================================================================
// State sidecar — <memoryDir>/_archive/.preserve-state.json
//   { artifactId, lastArchivedHash, lastPushedHash, lastPreservedAt, lastVersionNo }
//   (lastPreservedAt = epoch ms)
//
// TWO distinct hashes, deliberately NOT one shared field:
//   lastArchivedHash — written by the HOOK at block time. Drives the hook's
//                      content-hash dedup (Guard 2) + retry-allow.
//   lastPushedHash   — written by the CLI only AFTER a successful artifact push.
//                      Drives the CLI's push dedup.
// Sharing one field made the CLI dedup against the hash the hook had just
// recorded, silently skipping the artifact push — so they are kept separate.
// =============================================================================

export function readState(stateFile) {
  try {
    const raw = readFileSync(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      artifactId: typeof parsed.artifactId === "string" ? parsed.artifactId : null,
      lastArchivedHash:
        typeof parsed.lastArchivedHash === "string" ? parsed.lastArchivedHash : null,
      lastPushedHash:
        typeof parsed.lastPushedHash === "string" ? parsed.lastPushedHash : null,
      lastPreservedAt:
        typeof parsed.lastPreservedAt === "number" ? parsed.lastPreservedAt : null,
      lastVersionNo:
        typeof parsed.lastVersionNo === "number" ? parsed.lastVersionNo : null,
    };
  } catch {
    return emptyState();
  }
}

export function emptyState() {
  return {
    artifactId: null,
    lastArchivedHash: null,
    lastPushedHash: null,
    lastPreservedAt: null,
    lastVersionNo: null,
  };
}

/** Write state atomically-ish (best-effort), creating the archive dir if needed. */
export function writeState(stateFile, state) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
}

// =============================================================================
// Rate floor.
// =============================================================================

/**
 * True when we are still inside the rate-floor window (i.e. a preservation
 * happened less than rateFloorHours ago). When true, the hook should ALLOW the
 * edit without re-archiving.
 */
export function withinRateFloor(lastPreservedAt, rateFloorHours, now = Date.now()) {
  if (typeof lastPreservedAt !== "number" || !lastPreservedAt) return false;
  const windowMs = rateFloorHours * 60 * 60 * 1000;
  return now - lastPreservedAt < windowMs;
}

// =============================================================================
// Decision core — the pure function the hook drives. Given the on-disk facts +
// state + config, decide what to do. NO side effects here; the hook performs the
// archive write + state update + stdout based on this verdict.
// =============================================================================

/**
 * @param {object} input
 * @param {string} input.toolName            - the PreToolUse tool_name
 * @param {string} input.filePath            - resolved tool_input file path
 * @param {number} input.sizeBytes           - on-disk size of MEMORY.md
 * @param {string|null} input.currentHash    - SHA-256 of current MEMORY.md content
 * @param {object} input.state               - readState() result
 * @param {object} input.config              - resolveConfig() result
 * @param {number} [input.now]               - epoch ms (default Date.now())
 * @returns {{ action: 'noop'|'allow'|'block', reason?: string }}
 *   - 'noop'  : exit 0 silently (not our concern / under watermark)
 *   - 'allow' : exit 0 silently (our concern, but already preserved / dedup / rate-floor)
 *   - 'block' : write archive + state, then emit deny decision with reason
 */
export function decide(input) {
  const {
    toolName,
    filePath,
    sizeBytes,
    currentHash,
    state,
    config,
    now = Date.now(),
  } = input;

  // Guard 1 — edit-coupled trigger: only Edit/Write/MultiEdit on a MEMORY.md path.
  const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
  if (!EDIT_TOOLS.has(toolName)) return { action: "noop" };
  if (!isMemoryFile(filePath)) return { action: "noop" };

  // Under the HIGH watermark — nothing to preserve.
  if (sizeBytes < config.highWatermarkBytes) return { action: "noop" };

  // Guard 2 — content-hash dedup: identical content already preserved (either
  // archived by the hook or pushed by the CLI). Checking both means the retried
  // compaction edit is allowed whether the agent has run the CLI yet or not.
  if (
    currentHash &&
    ((state.lastArchivedHash && currentHash === state.lastArchivedHash) ||
      (state.lastPushedHash && currentHash === state.lastPushedHash))
  ) {
    return { action: "allow" };
  }

  // Rate floor: a preservation happened recently — allow the edit, don't re-archive.
  if (withinRateFloor(state.lastPreservedAt, config.rateFloorHours, now)) {
    return { action: "allow" };
  }

  // Over watermark, changed content, outside the rate floor -> BLOCK + preserve.
  return { action: "block" };
}

// =============================================================================
// Block-message + decision builders.
// =============================================================================

/**
 * Build the human/agent-readable reason for the deny decision. Includes size,
 * HIGH/LOW watermarks (hysteresis), confirmation a local archive was written, and
 * the exact CLI to update the versioned Cascade artifact, then the compact-to-LOW
 * instruction before retrying.
 */
export function buildBlockReason({ sizeBytes, config, archivePath, snapshotCli }) {
  const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
  return [
    `[memory-preserve] MEMORY.md is ${kb(sizeBytes)} — over the ${kb(config.highWatermarkBytes)} HIGH watermark; content beyond Claude Code's read-limit will be silently lost on compaction.`,
    `A verbatim local archive was just written to: ${archivePath}`,
    `Before this edit proceeds, preserve organizational memory:`,
    `  1. Run: ${snapshotCli}`,
    `     (updates the SINGLE standing Cascade memory-snapshot artifact to a new version, idempotent).`,
    `  2. Then compact MEMORY.md down to <= ${kb(config.lowWatermarkBytes)} (the LOW watermark) so it has ample headroom and won't re-trigger for many sessions. Keep index entries to one line; move detail into topic files; leave a breadcrumb pointing at the snapshot artifact id + the local archive above.`,
    `  3. Retry this edit — preservation for this content is now recorded, so it will proceed.`,
    `If you genuinely cannot compact to <= ${kb(config.lowWatermarkBytes)}, say so explicitly rather than silently re-looping.`,
  ].join("\n");
}

/**
 * The exact PreToolUse deny decision object for Claude Code 2.x. Emit as JSON to
 * stdout, then exit 0. (Verified against CC 2.1.187 / hooks.md 2026-06-24.)
 */
export function denyDecision(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}
