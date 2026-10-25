// node:test suite for the memory-preservation feature.
//
// Run: node --test cse/hooks/__tests__/memory-preserve.test.mjs
//
// Pure-function tests against temp dirs + black-box tests that drive the actual
// hook process via synthetic stdin payloads. NO live Cascade / network calls.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  resolveConfig,
  resolveLayout,
  isMemoryFile,
  contentHash,
  fileSizeBytes,
  withinRateFloor,
  readState,
  writeState,
  decide,
  archiveSnapshotPath,
  ymd,
  denyDecision,
} from "../memory-preserve-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(__dirname, "..", "memory-preserve.mjs");

const HIGH = resolveConfig({}).highWatermarkBytes; // 22528

// ---- temp-dir helpers -------------------------------------------------------

function makeMemoryDir() {
  const root = mkdtempSync(join(tmpdir(), "mp-test-"));
  const memoryDir = join(root, "memory");
  mkdirSync(memoryDir, { recursive: true });
  return { root, memoryDir, memoryFile: join(memoryDir, "MEMORY.md") };
}

function writeMemory(memoryFile, bytes) {
  writeFileSync(memoryFile, "x".repeat(bytes), "utf8");
}

/** Drive the real hook process. Returns { code, stdout }. */
function runHook(payload) {
  const res = spawnSync("node", [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  return { code: res.status, stdout: res.stdout || "" };
}

function parseDecision(stdout) {
  if (!stdout.trim()) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function archiveDirOf(memoryDir) {
  return join(memoryDir, "_archive");
}

function listArchive(memoryDir) {
  const dir = archiveDirOf(memoryDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith("MEMORY-snapshot-"));
}

// =============================================================================
// CORE unit tests
// =============================================================================

test("isMemoryFile matches MEMORY.md basename, rejects others", () => {
  assert.equal(isMemoryFile("/a/b/memory/MEMORY.md"), true);
  assert.equal(isMemoryFile("/a/b/memory/memory.md"), true); // case-insensitive basename
  assert.equal(isMemoryFile("/a/b/notes.md"), false);
  assert.equal(isMemoryFile("/a/b/MEMORY.md.bak"), false);
  assert.equal(isMemoryFile(""), false);
  assert.equal(isMemoryFile(null), false);
});

test("contentHash is deterministic and content-sensitive", () => {
  assert.equal(contentHash("abc"), contentHash("abc"));
  assert.notEqual(contentHash("abc"), contentHash("abd"));
});

test("config env overrides are parsed defensively", () => {
  const c = resolveConfig({
    CASCADE_MEMORY_HIGH_BYTES: "30000",
    CASCADE_MEMORY_LOW_BYTES: "bad",
    CASCADE_MEMORY_RATE_FLOOR_HOURS: "48",
  });
  assert.equal(c.highWatermarkBytes, 30000);
  assert.equal(c.lowWatermarkBytes, 16384); // bad -> default
  assert.equal(c.rateFloorHours, 48);
});

test("withinRateFloor true inside window, false outside / unset", () => {
  const now = 1_000_000_000_000;
  assert.equal(withinRateFloor(now - 1000, 24, now), true);
  assert.equal(withinRateFloor(now - 25 * 3600 * 1000, 24, now), false);
  assert.equal(withinRateFloor(null, 24, now), false);
});

test("state sidecar round-trips and tolerates missing/garbage", () => {
  const { memoryDir } = makeMemoryDir();
  const { stateFile } = resolveLayout(join(memoryDir, "MEMORY.md"));
  assert.deepEqual(readState(stateFile), {
    artifactId: null,
    lastArchivedHash: null,
    lastPushedHash: null,
    lastPreservedAt: null,
    lastVersionNo: null,
  });
  writeState(stateFile, { artifactId: "abc", lastArchivedHash: "ha", lastPushedHash: "hp", lastPreservedAt: 5, lastVersionNo: 2 });
  const got = readState(stateFile);
  assert.equal(got.artifactId, "abc");
  assert.equal(got.lastArchivedHash, "ha");
  assert.equal(got.lastPushedHash, "hp");
  assert.equal(got.lastPreservedAt, 5);
  writeFileSync(stateFile, "{ not json", "utf8");
  assert.equal(readState(stateFile).artifactId, null);
});

// ---- decide() decision matrix ----------------------------------------------

const baseConfig = resolveConfig({});

test("decide: non-edit tool -> noop", () => {
  const v = decide({
    toolName: "Bash",
    filePath: "/m/memory/MEMORY.md",
    sizeBytes: HIGH + 1000,
    currentHash: "h",
    state: { lastHash: null, lastPreservedAt: null },
    config: baseConfig,
  });
  assert.equal(v.action, "noop");
});

test("decide: non-MEMORY.md path -> noop", () => {
  const v = decide({
    toolName: "Edit",
    filePath: "/m/notes.md",
    sizeBytes: HIGH + 1000,
    currentHash: "h",
    state: {},
    config: baseConfig,
  });
  assert.equal(v.action, "noop");
});

test("decide: under HIGH watermark -> noop", () => {
  const v = decide({
    toolName: "Edit",
    filePath: "/m/memory/MEMORY.md",
    sizeBytes: HIGH - 1,
    currentHash: "h",
    state: {},
    config: baseConfig,
  });
  assert.equal(v.action, "noop");
});

test("decide: over HIGH, changed, outside floor -> block", () => {
  const v = decide({
    toolName: "Edit",
    filePath: "/m/memory/MEMORY.md",
    sizeBytes: HIGH + 1,
    currentHash: "new",
    state: { lastArchivedHash: "old", lastPushedHash: null, lastPreservedAt: null },
    config: baseConfig,
  });
  assert.equal(v.action, "block");
});

test("decide: over HIGH but identical archived hash -> allow (dedup)", () => {
  const v = decide({
    toolName: "Edit",
    filePath: "/m/memory/MEMORY.md",
    sizeBytes: HIGH + 1,
    currentHash: "same",
    state: { lastArchivedHash: "same", lastPushedHash: null, lastPreservedAt: 1 },
    config: baseConfig,
  });
  assert.equal(v.action, "allow");
});

test("decide: over HIGH but identical pushed hash -> allow (dedup)", () => {
  const v = decide({
    toolName: "Edit",
    filePath: "/m/memory/MEMORY.md",
    sizeBytes: HIGH + 1,
    currentHash: "same",
    state: { lastArchivedHash: null, lastPushedHash: "same", lastPreservedAt: null },
    config: baseConfig,
  });
  assert.equal(v.action, "allow");
});

test("decide: over HIGH, changed, within rate floor -> allow", () => {
  const now = Date.now();
  const v = decide({
    toolName: "Edit",
    filePath: "/m/memory/MEMORY.md",
    sizeBytes: HIGH + 1,
    currentHash: "new",
    state: { lastArchivedHash: "old", lastPushedHash: null, lastPreservedAt: now - 1000 },
    config: baseConfig,
    now,
  });
  assert.equal(v.action, "allow");
});

test("denyDecision emits the CC 2.x permissionDecision schema", () => {
  const d = denyDecision("because");
  assert.equal(d.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(d.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(d.hookSpecificOutput.permissionDecisionReason, "because");
});

// =============================================================================
// HOOK black-box tests (drive the real process via stdin)
// =============================================================================

test("(a) non-MEMORY.md path -> no-op (exit 0, no output)", () => {
  const { memoryDir } = makeMemoryDir();
  const notes = join(memoryDir, "notes.md");
  writeMemory(notes, HIGH + 5000);
  const { code, stdout } = runHook({
    tool_name: "Edit",
    tool_input: { file_path: notes },
  });
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
  assert.equal(listArchive(memoryDir).length, 0);
});

test("(b) under-threshold MEMORY.md -> no-op", () => {
  const { memoryDir, memoryFile } = makeMemoryDir();
  writeMemory(memoryFile, 1000);
  const { code, stdout } = runHook({
    tool_name: "Edit",
    tool_input: { file_path: memoryFile },
  });
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
  assert.equal(listArchive(memoryDir).length, 0);
});

test("(c) over-threshold changed content -> archive written + block decision", () => {
  const { memoryDir, memoryFile } = makeMemoryDir();
  writeMemory(memoryFile, HIGH + 8000);
  const { code, stdout } = runHook({
    tool_name: "Write",
    tool_input: { file_path: memoryFile },
  });
  assert.equal(code, 0);
  const decision = parseDecision(stdout);
  assert.ok(decision, "expected a JSON decision on stdout");
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /cascade memory-snapshot/);
  // archive snapshot written for today
  const archives = listArchive(memoryDir);
  assert.equal(archives.length, 1);
  // state recorded the ARCHIVED hash (hook-owned), NOT the pushed hash — so a
  // subsequent `cascade memory-snapshot` (which dedups on lastPushedHash) still
  // pushes. This is the regression guard for the hook->CLI shared-field bug.
  const { stateFile } = resolveLayout(memoryFile);
  const state = readState(stateFile);
  const h = contentHash(readFileSync(memoryFile, "utf8"));
  assert.equal(state.lastArchivedHash, h);
  assert.equal(state.lastPushedHash, null, "hook must NOT set lastPushedHash (else CLI push is skipped)");
  assert.ok(typeof state.lastPreservedAt === "number");
});

test("(d) over-threshold identical content (dedup) -> allow, no new archive", () => {
  const { memoryDir, memoryFile } = makeMemoryDir();
  writeMemory(memoryFile, HIGH + 8000);
  // pre-seed state with the current content hash (simulates already-preserved)
  const { stateFile } = resolveLayout(memoryFile);
  writeState(stateFile, {
    artifactId: "a1",
    lastArchivedHash: contentHash(readFileSync(memoryFile, "utf8")),
    lastPushedHash: null,
    lastPreservedAt: null, // null so the dedup guard (not the rate floor) is what allows it
    lastVersionNo: 1,
  });
  const { code, stdout } = runHook({
    tool_name: "Edit",
    tool_input: { file_path: memoryFile },
  });
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
  assert.equal(listArchive(memoryDir).length, 0);
});

test("(e) over-threshold within rate-floor window -> allow, no new archive", () => {
  const { memoryDir, memoryFile } = makeMemoryDir();
  writeMemory(memoryFile, HIGH + 8000);
  const { stateFile } = resolveLayout(memoryFile);
  // different hash (so dedup does NOT apply) but preserved recently
  writeState(stateFile, {
    artifactId: "a1",
    lastArchivedHash: "a-different-old-hash",
    lastPushedHash: null,
    lastPreservedAt: Date.now() - 60 * 1000, // 1 min ago, inside 24h floor
    lastVersionNo: 1,
  });
  const { code, stdout } = runHook({
    tool_name: "Edit",
    tool_input: { file_path: memoryFile },
  });
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
  assert.equal(listArchive(memoryDir).length, 0);
});

test("(f) first-block-then-allow: retry on the same content is allowed", () => {
  const { memoryDir, memoryFile } = makeMemoryDir();
  writeMemory(memoryFile, HIGH + 8000);
  // First attempt: blocks + records state.
  const first = runHook({ tool_name: "Edit", tool_input: { file_path: memoryFile } });
  assert.equal(first.code, 0);
  assert.ok(parseDecision(first.stdout), "first attempt should block with a decision");
  assert.equal(listArchive(memoryDir).length, 1);

  // Retry SAME content -> dedup -> allow (no output, no new archive).
  const retry = runHook({ tool_name: "Edit", tool_input: { file_path: memoryFile } });
  assert.equal(retry.code, 0);
  assert.equal(retry.stdout.trim(), "");
  assert.equal(listArchive(memoryDir).length, 1);
});

test("malformed / empty stdin -> exit 0 silently (fail-open)", () => {
  const res = spawnSync("node", [HOOK_PATH], { input: "not json", encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.equal((res.stdout || "").trim(), "");
});

test("archiveSnapshotPath + ymd produce a dated snapshot name", () => {
  const p = archiveSnapshotPath("/x/_archive", new Date(Date.UTC(2026, 5, 24)));
  assert.equal(p, "/x/_archive/MEMORY-snapshot-2026-06-24.md");
  assert.equal(ymd(new Date(Date.UTC(2026, 0, 5))), "2026-01-05");
});
