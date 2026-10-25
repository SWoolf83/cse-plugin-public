// chief-trigger.mjs — Claude Code UserPromptSubmit hook (Chief of Staff "catch-up" nudge)
//
// Self-contained Node ESM, pure stdlib (no build step, no npm deps). Mirrors the
// stdin->stdout contract of session-start.js: read the hook JSON from stdin, write any
// injected/offered context to process.stdout.
//
// PURPOSE: detect "catch-up intent" (a long gap since last activity, OR a catch-up phrase)
// and emit ONE line nudging the user to run /cse:chief. The mode (manual/offer/auto) is read
// from a CACHED local config file.
//
// ── MVP GUARD (DO NOT REMOVE) ──────────────────────────────────────────────────────────────
// This hook ONLY nudges. It MUST NOT invoke any model, daemon, cron, or billable path. There
// is NO network call on the hot path — trigger config + last-seen state are read from local
// cached files only. The brief itself is session-invoked (/cse:chief); the hook never runs it.
// A hook must NEVER block the user: on ANY error we exit 0 silently.
// ────────────────────────────────────────────────────────────────────────────────────────────

import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const GAP_MS = 12 * 60 * 60 * 1000; // ~12h gap => "first prompt after a while"

const CATCH_UP_PHRASES = [
  "what's new",
  "whats new",
  "catch me up",
  "where were we",
  "anything i should know",
  "what did i miss",
  "what's changed",
  "whats changed",
];

const cascadeDir = () => join(homedir(), ".cascade");
const stateFile = () => join(cascadeDir(), "chief-trigger-state.json");
const configFile = () => join(cascadeDir(), "briefing-config.json");

// Read trigger_mode from the cached local config. Documented as synced from the
// briefing_preferences table. DEFAULT to 'offer' when absent/unreadable/malformed.
function readTriggerMode() {
  try {
    const raw = readFileSync(configFile(), "utf8");
    const cfg = JSON.parse(raw);
    const mode = cfg && typeof cfg.trigger_mode === "string" ? cfg.trigger_mode : null;
    if (mode === "manual" || mode === "offer" || mode === "auto") return mode;
  } catch {
    // absent / unreadable / malformed -> default below
  }
  return "offer";
}

// Read/mutate/write the per-project last-seen state. Returns the gap (ms) between the
// previously stored lastSeen and now, then persists now. On the FIRST-ever prompt for a
// project there is no prior record, so we return 0 (no gap) — there's nothing to "catch up"
// on yet, and nudging on prompt #1 would be a false positive.
function updateLastSeenAndGetGap(cwd, now) {
  let state = {};
  try {
    state = JSON.parse(readFileSync(stateFile(), "utf8"));
    if (!state || typeof state !== "object") state = {};
  } catch {
    state = {};
  }

  const key = cwd || "__default__";
  const prev = state[key] && typeof state[key].lastSeen === "number" ? state[key].lastSeen : null;
  const gap = prev === null ? 0 : now - prev;

  state[key] = { lastSeen: now };

  try {
    mkdirSync(cascadeDir(), { recursive: true });
    writeFileSync(stateFile(), JSON.stringify(state, null, 2));
  } catch {
    // best-effort; never block the user on a write failure
  }

  return gap;
}

function isCatchUpPhrase(prompt) {
  if (typeof prompt !== "string") return false;
  const p = prompt.toLowerCase();
  return CATCH_UP_PHRASES.some((phrase) => p.includes(phrase));
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  try {
    const raw = await readStdin();
    let hookInput = {};
    try {
      hookInput = JSON.parse(raw);
    } catch {
      hookInput = {};
    }

    const prompt = hookInput && typeof hookInput.prompt === "string" ? hookInput.prompt : "";
    const cwd = hookInput && typeof hookInput.cwd === "string" ? hookInput.cwd : "";

    const now = Date.now();

    // Always update last-seen (and read the gap) so the GAP detector self-resets each turn.
    const gap = updateLastSeenAndGetGap(cwd, now);

    const gapTrigger = gap >= GAP_MS;
    const phraseTrigger = isCatchUpPhrase(prompt);

    // Only emit when catch-up intent is detected (gap OR phrase). Else emit nothing.
    if (!gapTrigger && !phraseTrigger) return;

    const mode = readTriggerMode();

    if (mode === "manual") return; // no-op

    if (mode === "auto") {
      // Stronger nudge — still does NOT execute anything (session-invoked only).
      process.stdout.write(
        "[Chief of Staff] It's been a while and things have moved — run /cse:chief now to see the 2-3 decisions waiting on you.\n",
      );
      return;
    }

    // 'offer' (default) — single clean line; no fabricated counts.
    process.stdout.write(
      "[Chief of Staff] Looks like it's been a while — want the brief on what moved against your plan? Run /cse:chief\n",
    );
  } catch {
    // A hook must NEVER block the user: swallow everything and exit 0.
  }
}

main();
