// auth-nudge.mjs — Claude Code SessionStart hook (Cascade auth expiry nudge)
//
// Self-contained Node ESM, pure stdlib (no build step, no npm deps). Mirrors the
// stdin->stdout contract of session-start.js: read the hook JSON from stdin, write
// any injected context to plain process.stdout (NOT the hookSpecificOutput JSON
// envelope — session-start.js deliberately uses plain stdout so blocks compose,
// and this hook matches that).
//
// PURPOSE: purely LOCAL check of ~/.cascade/auth.json. If the file is missing,
// unparseable, or the access token is expired, emit EXACTLY ONE nudge line telling
// the user to re-login. If auth is valid, emit NOTHING (empty stdout).
//
// ── GUARDRAILS (DO NOT REMOVE) ─────────────────────────────────────────────────
// ZERO network: no fetch, no node:http(s), no refresh attempt — token refresh
// needs the network and belongs to `cascade login` / the MCP server, never a
// session hook. A hook must NEVER block the user: on ANY error we exit 0, and we
// never exit non-zero.
// ───────────────────────────────────────────────────────────────────────────────
//
// auth.json shape (see bin/cascade.js readAuthTokens + cascade-api src/auth.ts):
//   { "access_token": "<jwt>", "refresh_token": "<opaque>" }
// Expiry is NOT a top-level field — it is the `exp` claim (Unix seconds) inside
// the access_token JWT payload. Both existing consumers decode the JWT and treat
// `nowSec >= exp - 30` (30s buffer) as expired; we mirror that exactly.
//
// CASCADE_AUTH_PATH overrides the default ~/.cascade/auth.json (tests only).

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const NUDGE_LINE =
  "Cascade auth expired — run `cascade login` in a separate terminal; continuing offline, tracking disabled.\n";

function authFile() {
  return process.env.CASCADE_AUTH_PATH || join(homedir(), ".cascade", "auth.json");
}

// Mirrors decodeJwtPayload in bin/cascade.js / cascade-api src/auth.ts.
function decodeJwtPayload(token) {
  const segment = token.split(".")[1];
  if (!segment) throw new Error("malformed JWT: no payload segment");
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
}

// True only when auth.json exists, parses, has the token pair, and the access
// token's `exp` claim is still in the future (30s buffer, same as consumers).
// Throws / returns false on anything else — callers treat both as "not valid".
function isAuthValid() {
  const raw = readFileSync(authFile(), "utf8"); // throws when missing/unreadable
  const data = JSON.parse(raw); // throws when unparseable
  if (!data || typeof data !== "object") return false;
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") {
    return false;
  }
  const payload = decodeJwtPayload(data.access_token);
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  if (!exp) return false; // no expiry claim -> treat as expired (matches auth.ts)
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec < exp - 30;
}

async function readStdin() {
  // Drain the hook JSON payload (unused, but keeps the stdin contract clean).
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  try {
    await readStdin();
  } catch {
    // stdin issues never matter here
  }

  let valid = false;
  try {
    valid = isAuthValid();
  } catch {
    valid = false; // missing / unparseable / malformed JWT -> nudge
  }

  if (!valid) {
    try {
      process.stdout.write(NUDGE_LINE);
    } catch {
      // never block the session on a write failure
    }
  }
  // Valid auth: write NOTHING. Always implicit exit 0.
}

main();
