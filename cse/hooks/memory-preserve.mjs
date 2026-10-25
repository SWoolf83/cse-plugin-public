// memory-preserve.mjs — Claude Code PreToolUse hook (memory preservation).
//
// Self-contained Node ESM, pure stdlib (no build step, no npm deps beyond the
// sibling memory-preserve-core.mjs). Lives in cse/hooks/ (NOT hooks/scripts/,
// which `npm run build:cse-plugin` regenerates/wipes) so it ships + survives via
// the cse plugin.
//
// PURPOSE: BEFORE any Edit/Write/MultiEdit that would compact a local Claude Code
// MEMORY.md over the HIGH watermark, preserve it: auto-write a verbatim local
// _archive copy, record state, and BLOCK the edit with an agent-readable reason
// instructing the agent to run `cascade memory-snapshot <archive>` (which updates
// the single versioned Cascade artifact) and compact to <= the LOW watermark.
// On the retried edit, the recorded content-hash makes the hook ALLOW it.
//
// Four anti-thrash guards + a 24h rate floor are implemented in the core's
// `decide()`. A hook must NEVER hard-block the user on its own error: on ANY
// unexpected failure we exit 0 silently (fail-open).

import { copyFileSync, mkdirSync } from "node:fs";

import {
  resolveConfig,
  resolveLayout,
  isMemoryFile,
  fileSizeBytes,
  fileContentHash,
  readState,
  writeState,
  decide,
  archiveSnapshotPath,
  buildBlockReason,
  denyDecision,
} from "./memory-preserve-core.mjs";

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function resolveFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return "";
  // Edit/Write/MultiEdit all use `file_path`.
  const fp = toolInput.file_path;
  return typeof fp === "string" ? fp : "";
}

async function main() {
  let payload = {};
  try {
    const raw = await readStdin();
    payload = JSON.parse(raw);
  } catch {
    // No / malformed payload — nothing to do.
    process.exit(0);
  }

  try {
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
    const filePath = resolveFilePath(payload.tool_input);

    // Cheap pre-filter before any disk I/O.
    const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
    if (!EDIT_TOOLS.has(toolName) || !isMemoryFile(filePath)) {
      process.exit(0);
    }

    const config = resolveConfig(process.env);
    const { archiveDir, stateFile } = resolveLayout(filePath);

    const sizeBytes = fileSizeBytes(filePath);
    const currentHash = fileContentHash(filePath);
    const state = readState(stateFile);

    const verdict = decide({
      toolName,
      filePath,
      sizeBytes,
      currentHash,
      state,
      config,
    });

    if (verdict.action === "noop" || verdict.action === "allow") {
      process.exit(0);
    }

    // verdict.action === 'block' — preserve, record, and deny with instructions.
    // 1. Write the verbatim local archive snapshot.
    const archivePath = archiveSnapshotPath(archiveDir);
    try {
      mkdirSync(archiveDir, { recursive: true });
      copyFileSync(filePath, archivePath);
    } catch {
      // If the archive write fails we still record state + block so the agent can
      // act; the snapshot CLI reads the live MEMORY.md anyway.
    }

    // 2. Record state (hash + timestamp) so the retry is ALLOWED — without this
    //    the agent's compaction edit would block again.
    try {
      writeState(stateFile, {
        ...state,
        lastArchivedHash: currentHash,
        lastPreservedAt: Date.now(),
      });
    } catch {
      // best-effort
    }

    // 3. Emit the deny decision with an actionable reason, then exit 0.
    const snapshotCli = `cascade memory-snapshot "${archivePath}"`;
    const reason = buildBlockReason({ sizeBytes, config, archivePath, snapshotCli });
    process.stdout.write(JSON.stringify(denyDecision(reason)));
    process.exit(0);
  } catch {
    // A hook must NEVER block the user on its own error: fail open.
    process.exit(0);
  }
}

main();
