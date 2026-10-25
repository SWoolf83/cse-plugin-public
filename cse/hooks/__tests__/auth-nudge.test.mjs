// node:test suite for the SessionStart auth-nudge hook.
//
// Run: node --test cse/hooks/__tests__/auth-nudge.test.mjs
//
// Black-box tests that drive the actual hook process via synthetic stdin
// payloads, pointing it at temp fixtures via CASCADE_AUTH_PATH. NO live
// Cascade / network calls — and a static test asserts the hook source has
// zero network imports/usage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(__dirname, "..", "auth-nudge.mjs");

const NUDGE_LINE =
  "Cascade auth expired — run `cascade login` in a separate terminal; continuing offline, tracking disabled.\n";

// ---- fixture helpers --------------------------------------------------------

function tempAuthPath() {
  const root = mkdtempSync(join(tmpdir(), "auth-nudge-test-"));
  return { root, authPath: join(root, "auth.json") };
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/** Fake JWT with the given payload claims (signature is never verified). */
function makeJwt(claims) {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.fakesig`;
}

function writeAuthFixture(authPath, { exp, raw, noRefresh } = {}) {
  if (raw !== undefined) {
    writeFileSync(authPath, raw, "utf8");
    return;
  }
  const data = { access_token: makeJwt({ sub: "user", exp }) };
  if (!noRefresh) data.refresh_token = "fake-refresh-token";
  writeFileSync(authPath, JSON.stringify(data, null, 2), "utf8");
}

/** Drive the real hook process. Returns { code, stdout, stderr }. */
function runHook(authPath, payload = { hook_event_name: "SessionStart", cwd: "/tmp" }) {
  const res = spawnSync("node", [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CASCADE_AUTH_PATH: authPath },
    timeout: 10_000,
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const nowSec = () => Math.floor(Date.now() / 1000);

// ---- tests ------------------------------------------------------------------

test("valid token: empty stdout, exit 0", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, { exp: nowSec() + 3600 }); // valid for an hour
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("expired token: exactly one nudge line, exit 0", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, { exp: nowSec() - 3600 }); // expired an hour ago
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, NUDGE_LINE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("token inside the 30s expiry buffer counts as expired", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, { exp: nowSec() + 10 }); // < 30s buffer
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, NUDGE_LINE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing auth.json: nudge line, exit 0", () => {
  const { root, authPath } = tempAuthPath();
  try {
    // never write the file
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, NUDGE_LINE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corrupt auth.json (not JSON): nudge line, exit 0", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, { raw: "{{{ not json" });
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, NUDGE_LINE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("auth.json with malformed access_token JWT: nudge line, exit 0", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, {
      raw: JSON.stringify({ access_token: "not-a-jwt", refresh_token: "r" }),
    });
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, NUDGE_LINE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("auth.json missing refresh_token: nudge line, exit 0", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, { exp: nowSec() + 3600, noRefresh: true });
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, NUDGE_LINE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("JWT without an exp claim counts as expired", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, {
      raw: JSON.stringify({
        access_token: makeJwt({ sub: "user" }), // no exp
        refresh_token: "r",
      }),
    });
    const { code, stdout } = runHook(authPath);
    assert.equal(code, 0);
    assert.equal(stdout, NUDGE_LINE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("garbage / empty stdin never breaks the hook", () => {
  const { root, authPath } = tempAuthPath();
  try {
    writeAuthFixture(authPath, { exp: nowSec() + 3600 });
    const res = spawnSync("node", [HOOK_PATH], {
      input: "not json at all",
      encoding: "utf8",
      env: { ...process.env, CASCADE_AUTH_PATH: authPath },
      timeout: 10_000,
    });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("static: hook source has zero network imports or fetch usage", () => {
  const src = readFileSync(HOOK_PATH, "utf8");
  // Only comments mention "fetch"/"http" as prohibitions; strip comments first.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bfetch\s*\(/);
  assert.doesNotMatch(code, /node:https?/);
  assert.doesNotMatch(code, /require\(\s*['"]https?['"]/);
  assert.doesNotMatch(code, /from\s+['"]https?['"]/);
});
