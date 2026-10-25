// src/daemon/hooks/cse-update-refresh.ts
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var DEFAULT_VERSION_URL = "https://www.cascadehq.io/api/cli/version";
var UPDATE_REFRESH_TTL_MS = 6 * 60 * 60 * 1e3;
var FETCH_TIMEOUT_MS = 8e3;
var MARKETPLACE = "cascade-hq";
var SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
function defaultUpdateCachePath() {
  return join(homedir(), ".cascade", "cse-update.json");
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
function isCacheFresh(cachePath = defaultUpdateCachePath(), now = Date.now(), ttlMs = UPDATE_REFRESH_TTL_MS) {
  const c = readJson(cachePath);
  const at = c?.checkedAt;
  if (typeof at !== "number" || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < ttlMs;
}
function isDirectoryMarketplace(home = homedir()) {
  const known = readJson(join(home, ".claude", "plugins", "known_marketplaces.json"));
  return known?.[MARKETPLACE]?.source?.source === "directory";
}
function parseVersionBody(body, now) {
  if (!body || typeof body !== "object") return null;
  const cse = body.cse;
  if (!cse || typeof cse !== "object") return null;
  const latest = cse.latest;
  const source = cse.source;
  if (typeof latest !== "string" || !SEMVER.test(latest)) return null;
  if (source !== void 0 && source !== "mirror") return null;
  return {
    available: latest,
    latest,
    checkedAt: now,
    ...typeof source === "string" ? { source } : {}
  };
}
function writeCacheAtomic(entry, cachePath) {
  const tmp = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(tmp, JSON.stringify(entry, null, 2));
    renameSync(tmp, cachePath);
    return true;
  } catch {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
    }
    return false;
  }
}
async function runCseUpdateRefresh(opts = {}) {
  try {
    const now = opts.now ?? Date.now;
    const cachePath = opts.cachePath ?? defaultUpdateCachePath();
    if (isDirectoryMarketplace(opts.home ?? homedir())) return "directory_marketplace";
    if (isCacheFresh(cachePath, now(), opts.ttlMs ?? UPDATE_REFRESH_TTL_MS)) return "fresh";
    const url = opts.url ?? process.env.CASCADE_CSE_VERSION_URL ?? DEFAULT_VERSION_URL;
    const fetchFn = opts.fetch ?? globalThis.fetch;
    if (typeof fetchFn !== "function") return "fetch_failed";
    let body;
    try {
      const res = await fetchFn(url, {
        headers: { Accept: "application/json", "User-Agent": "cse-update-refresh" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!res.ok) return "fetch_failed";
      body = await res.json();
    } catch {
      return "fetch_failed";
    }
    const entry = parseVersionBody(body, now());
    if (!entry) return "rejected";
    return writeCacheAtomic(entry, cachePath) ? "written" : "write_failed";
  } catch {
    return "fetch_failed";
  }
}
var UPDATE_REFRESH_SCRIPT_BASENAME = "cse-update-refresh.js";
function resolveUpdateRefreshScript(fromPath) {
  try {
    const anchor = fromPath ?? fileURLToPath(import.meta.url);
    const candidate = join(dirname(anchor), UPDATE_REFRESH_SCRIPT_BASENAME);
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}
function spawnCseUpdateRefreshFromHook(opts = {}) {
  try {
    if (isCacheFresh(opts.cachePath ?? defaultUpdateCachePath(), opts.now ?? Date.now())) return false;
    const script = opts.scriptPath ?? resolveUpdateRefreshScript();
    if (!script) return false;
    const spawnFn = opts.spawn ?? nodeSpawn;
    const child = spawnFn(opts.nodePath ?? process.execPath ?? "node", [script], {
      detached: true,
      stdio: "ignore",
      env: opts.env ?? process.env
    });
    child.on("error", () => {
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
var invokedDirectly = (() => {
  try {
    const entry = process.argv[1];
    if (typeof entry !== "string" || !entry.length) return false;
    const base = basename(entry);
    return base === UPDATE_REFRESH_SCRIPT_BASENAME || base === "cse-update-refresh.ts";
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  runCseUpdateRefresh().then(() => process.exit(0)).catch(() => process.exit(0));
}
export {
  DEFAULT_VERSION_URL,
  UPDATE_REFRESH_SCRIPT_BASENAME,
  UPDATE_REFRESH_TTL_MS,
  defaultUpdateCachePath,
  isCacheFresh,
  isDirectoryMarketplace,
  parseVersionBody,
  resolveUpdateRefreshScript,
  runCseUpdateRefresh,
  spawnCseUpdateRefreshFromHook,
  writeCacheAtomic
};
