// src/daemon/hooks/statusline.ts
import { readFileSync as readFileSync4, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join4, dirname as dirname2 } from "node:path";
import { homedir as homedir4 } from "node:os";
import { fileURLToPath } from "node:url";

// src/daemon/hooks/claimable.ts
import { homedir as homedir3 } from "node:os";
import { join as join3, resolve as resolve3 } from "node:path";
import { existsSync as existsSync3, readFileSync as readFileSync3, statSync as statSync3 } from "node:fs";

// src/daemon/hooks/handoff-inject.ts
import { homedir as homedir2 } from "node:os";
import { isAbsolute, join as join2, resolve as resolve2 } from "node:path";
import { existsSync as existsSync2, readFileSync as readFileSync2, statSync as statSync2 } from "node:fs";

// src/daemon/hooks/handoff-store.ts
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
var PENDING_DIRNAME = "pending";
var SUPERSEDED_DIRNAME = "superseded";
var CONSUMED_DIRNAME = "consumed";
var LEGACY_DIRNAME = "legacy";
var LEGACY_PENDING_FILENAME = "pending.json";
var FALLBACK_SUBJECT_KIND = "unkeyed";
function resolveRoot(opts) {
  try {
    const explicit = opts?.root;
    if (typeof explicit === "string" && explicit.trim().length) return resolve(explicit);
  } catch {
  }
  try {
    const env = process.env?.CASCADE_HANDOFF_ROOT;
    if (typeof env === "string" && env.trim().length) return resolve(env);
  } catch {
  }
  try {
    return join(homedir(), ".cascade", "handoffs");
  } catch {
    return join(".cascade", "handoffs");
  }
}
function paths(opts) {
  const root = resolveRoot(opts);
  return {
    root,
    pending: join(root, PENDING_DIRNAME),
    superseded: join(root, SUPERSEDED_DIRNAME),
    consumed: join(root, CONSUMED_DIRNAME),
    legacy: join(root, LEGACY_DIRNAME),
    legacyPendingFile: join(root, LEGACY_PENDING_FILENAME)
  };
}
function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
function safeReadFile(path) {
  try {
    if (!existsSync(path)) return null;
    const st = statSync(path);
    if (!st.isFile()) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}
function safeReaddir(dir) {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  } catch {
    return [];
  }
}
function safeMove(from, to) {
  try {
    renameSync(from, to);
    return true;
  } catch {
  }
  const raw = safeReadFile(from);
  if (raw === null) return false;
  try {
    writeFileSync(to, raw, "utf-8");
  } catch {
    return false;
  }
  try {
    unlinkSync(from);
  } catch {
  }
  return true;
}
function atomicWrite(path, contents) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, contents, "utf-8");
  } catch {
    try {
      writeFileSync(path, contents, "utf-8");
      return true;
    } catch {
      return false;
    }
  }
  try {
    renameSync(tmp, path);
    return true;
  } catch {
    try {
      writeFileSync(path, contents, "utf-8");
    } catch {
      return false;
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
      }
    }
    return true;
  }
}
function stamp(now = /* @__PURE__ */ new Date()) {
  try {
    return now.toISOString().replace(/[:.]/g, "-");
  } catch {
    return String(Date.now());
  }
}
function shortId() {
  try {
    return randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}
function hash8(input) {
  try {
    return createHash("sha1").update(input, "utf-8").digest("hex").slice(0, 8);
  } catch {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
}
function flatten(raw, cap = 48) {
  let s = String(raw ?? "");
  s = s.replace(/[^A-Za-z0-9._-]+/g, "-");
  s = s.replace(/-{2,}/g, "-");
  s = s.replace(/^[.\-_]+/, "").replace(/[.\-_]+$/, "");
  if (s.length > cap) s = s.slice(0, cap);
  s = s.replace(/[.\-_]+$/, "");
  return s;
}
function sanitizeKind(kind) {
  const flat = flatten(typeof kind === "string" ? kind : "", 32);
  return flat.length ? flat : "unknown";
}
function sanitizeKey(rawKey, kind = "") {
  const key = typeof rawKey === "string" ? rawKey : String(rawKey ?? "");
  const kindStr = typeof kind === "string" ? kind : String(kind ?? "");
  const flat = flatten(key, 48);
  const suffix = hash8(`${kindStr}\0${key}`);
  return flat.length ? `${flat}-${suffix}` : suffix;
}
function keyFor(subject) {
  const kind = sanitizeKind(subject?.subject_kind);
  return `${kind}__${sanitizeKey(subject?.subject_key, subject?.subject_kind ?? "")}`;
}
function pendingPathFor(key, opts) {
  try {
    const p = paths(opts);
    const candidate = resolve(join(p.pending, `${String(key ?? "")}.json`));
    const dir = resolve(p.pending);
    if (dirname(candidate) !== dir) return null;
    if (!candidate.startsWith(dir + sep)) return null;
    return candidate;
  } catch {
    return null;
  }
}
function firstNonEmptyLine(text, cap = 80) {
  try {
    if (typeof text !== "string") return "";
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/^#{1,6}\s*/, "").trim();
      if (line.length) return line.length > cap ? `${line.slice(0, cap - 1)}\u2026` : line;
    }
    return "";
  } catch {
    return "";
  }
}
function deriveLabel(rec) {
  try {
    const title = firstNonEmptyLine(rec?.note_md);
    const kind = typeof rec?.subject_kind === "string" ? rec.subject_kind : "";
    const key = typeof rec?.subject_key === "string" ? rec.subject_key : "";
    if (!kind || kind === FALLBACK_SUBJECT_KIND) return title || "handoff";
    const shortKey = key.length > 40 ? `${key.slice(0, 39)}\u2026` : key;
    const subj = shortKey ? `${kind} ${shortKey}` : kind;
    return title ? `${subj} \u2014 ${title}` : subj;
  } catch {
    return "handoff";
  }
}
function asSubjectObject(v) {
  if (!v || typeof v !== "object") return null;
  const o = v;
  const kind = typeof o.kind === "string" && o.kind.trim().length ? o.kind.trim() : void 0;
  const id = typeof o.id === "string" && o.id.trim().length ? o.id.trim() : typeof o.key === "string" && o.key.trim().length ? o.key.trim() : void 0;
  if (!kind && !id) return null;
  return { kind, id };
}
function normalizeRecord(parsed, key, path) {
  try {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const o = parsed;
    const subject_kind = typeof o.subject_kind === "string" && o.subject_kind.length ? o.subject_kind : FALLBACK_SUBJECT_KIND;
    const subject_key = typeof o.subject_key === "string" ? o.subject_key : key;
    const rec = {
      note_md: typeof o.note_md === "string" ? o.note_md : "",
      test_plan: o.test_plan ?? null,
      project_path: typeof o.project_path === "string" ? o.project_path : null,
      related_memory: Array.isArray(o.related_memory) ? o.related_memory : [],
      related_packages: Array.isArray(o.related_packages) ? o.related_packages : [],
      created_at: typeof o.created_at === "string" ? o.created_at : typeof o.written_at === "string" ? o.written_at : "",
      id: typeof o.id === "string" ? o.id : void 0,
      enqueued_tests: Array.isArray(o.enqueued_tests) ? o.enqueued_tests : void 0,
      subject_kind,
      subject_key,
      subject_label: typeof o.subject_label === "string" && o.subject_label.length ? o.subject_label : deriveLabel({ subject_kind, subject_key, note_md: o.note_md }),
      key: typeof o.key === "string" && o.key.length ? o.key : key,
      written_at: typeof o.written_at === "string" ? o.written_at : typeof o.created_at === "string" ? o.created_at : "",
      migrated_from_legacy: o.migrated_from_legacy === true ? true : void 0,
      path
    };
    return rec;
  } catch {
    return null;
  }
}
function readEntryFile(path, key) {
  const raw = safeReadFile(path);
  if (raw === null) return null;
  if (!raw.trim().length) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  let stem = key;
  if (!stem) {
    try {
      stem = basename(path).replace(/\.json$/i, "");
    } catch {
      stem = "";
    }
  }
  return normalizeRecord(parsed, stem ?? "", path);
}
function migrateLegacy(opts) {
  try {
    const p = paths(opts);
    const raw = safeReadFile(p.legacyPendingFile);
    if (raw === null) return { migrated: false };
    let parsed = null;
    if (raw.trim().length) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    const archiveLegacy = () => {
      if (!ensureDir(p.legacy)) return null;
      const dest2 = join(p.legacy, `${LEGACY_PENDING_FILENAME}.${stamp()}-${shortId()}.json`);
      return safeMove(p.legacyPendingFile, dest2) ? dest2 : null;
    };
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const archivedPath2 = archiveLegacy();
      return {
        migrated: false,
        skipped: "legacy pending.json was empty or malformed",
        archivedPath: archivedPath2 ?? void 0
      };
    }
    const o = parsed;
    const enqueued = Array.isArray(o.enqueued_tests) ? o.enqueued_tests : void 0;
    const fromTest = asSubjectObject(enqueued?.[0]?.subject_under_test ?? null);
    let subject;
    if (fromTest) {
      subject = {
        subject_kind: fromTest.kind ?? "package",
        subject_key: fromTest.id ?? fromTest.kind ?? "unspecified",
        fallback: false
      };
    } else if (typeof o.id === "string" && o.id.trim().length) {
      subject = { subject_kind: "handoff", subject_key: o.id.trim(), fallback: false };
    } else {
      const createdAt = typeof o.created_at === "string" ? o.created_at : "";
      subject = {
        subject_kind: "handoff",
        subject_key: `legacy-${createdAt || hash8(raw)}`,
        fallback: false
      };
    }
    const key = keyFor(subject);
    const dest = pendingPathFor(key, opts);
    if (!dest) {
      const archivedPath2 = archiveLegacy();
      return {
        migrated: false,
        skipped: "could not resolve a pending path for the legacy entry",
        archivedPath: archivedPath2 ?? void 0
      };
    }
    let migrated = false;
    let alreadyThere = false;
    try {
      alreadyThere = existsSync(dest);
    } catch {
      alreadyThere = false;
    }
    if (!alreadyThere && ensureDir(p.pending)) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const record = {
        note_md: typeof o.note_md === "string" ? o.note_md : "",
        test_plan: o.test_plan ?? null,
        project_path: typeof o.project_path === "string" ? o.project_path : null,
        related_memory: Array.isArray(o.related_memory) ? o.related_memory : [],
        related_packages: Array.isArray(o.related_packages) ? o.related_packages : [],
        created_at: typeof o.created_at === "string" ? o.created_at : now,
        id: typeof o.id === "string" ? o.id : void 0,
        enqueued_tests: enqueued,
        subject_kind: subject.subject_kind,
        subject_key: subject.subject_key,
        subject_label: deriveLabel({ ...subject, note_md: o.note_md }),
        key,
        written_at: typeof o.created_at === "string" ? o.created_at : now,
        migrated_from_legacy: true
      };
      migrated = atomicWrite(dest, JSON.stringify(record, null, 2));
    }
    const archivedPath = archiveLegacy();
    return {
      migrated,
      key,
      path: migrated ? dest : void 0,
      archivedPath: archivedPath ?? void 0,
      skipped: alreadyThere ? "an entry for this subject already exists" : void 0
    };
  } catch {
    return { migrated: false, skipped: "unexpected error" };
  }
}
function list(opts) {
  try {
    migrateLegacy(opts);
    const p = paths(opts);
    const out = [];
    for (const name of safeReaddir(p.pending)) {
      try {
        if (!/\.json$/i.test(name)) continue;
        const key = name.replace(/\.json$/i, "");
        const full = join(p.pending, name);
        const entry = readEntryFile(full, key);
        if (entry) out.push(entry);
      } catch {
      }
    }
    out.sort((a, b) => String(b.written_at ?? "").localeCompare(String(a.written_at ?? "")));
    return out;
  } catch {
    return [];
  }
}

// src/daemon/hooks/handoff-inject.ts
var DEMOTE_AFTER_DAYS = 14;
var DAY_MS = 24 * 60 * 60 * 1e3;
var LABEL_CAP = 64;
var INTENT_CAP = 88;
function safeRead(path) {
  try {
    if (!path || !existsSync2(path)) return null;
    const st = statSync2(path);
    if (!st.isFile()) return null;
    return readFileSync2(path, "utf-8");
  } catch {
    return null;
  }
}
function safeParse(raw) {
  if (raw === null) return null;
  if (!raw.trim().length) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function installedPluginsPath(opts) {
  try {
    const explicit = opts?.installedPluginsFile;
    if (typeof explicit === "string" && explicit.trim().length) return resolve2(explicit);
  } catch {
  }
  let home = "";
  try {
    const optHome = opts?.home;
    home = typeof optHome === "string" && optHome.trim().length ? optHome : homedir2();
  } catch {
    home = "";
  }
  return join2(home || ".", ".claude", "plugins", "installed_plugins.json");
}
function readInstalledPluginVersions(opts) {
  const out = {};
  try {
    const parsed = safeParse(safeRead(installedPluginsPath(opts)));
    if (!parsed || typeof parsed !== "object") return out;
    const plugins = parsed.plugins;
    if (!plugins || typeof plugins !== "object") return out;
    for (const [fullName, value] of Object.entries(plugins)) {
      try {
        const rows = Array.isArray(value) ? value : [value];
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const r = row;
          let version = typeof r.version === "string" ? r.version.trim() : "";
          if (!version && typeof r.installPath === "string") {
            const manifest = safeParse(
              safeRead(join2(r.installPath, ".claude-plugin", "plugin.json"))
            );
            if (manifest && typeof manifest === "object") {
              const v = manifest.version;
              if (typeof v === "string") version = v.trim();
            }
          }
          if (!version) continue;
          const bare = fullName.split("@")[0] ?? fullName;
          if (!out[fullName]) out[fullName] = version;
          if (bare && !out[bare]) out[bare] = version;
          break;
        }
      } catch {
      }
    }
  } catch {
  }
  return out;
}
var SEMVER_RE = /\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?/;
function versionToken(subjectKey) {
  try {
    const m = SEMVER_RE.exec(subjectKey);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}
function pluginNameToken(subjectKey) {
  try {
    const cleaned = subjectKey.replace(SEMVER_RE, " ").trim();
    const first = cleaned.split(/[\s:/,]+/).filter(Boolean)[0] ?? "";
    const name = first.replace(/[^A-Za-z0-9@._-]/g, "");
    return name.length ? name : "cse";
  } catch {
    return "cse";
  }
}
var SHA_RE = /\b[0-9a-f]{7,40}\b/i;
function readGitHeadSha(repoRoot) {
  try {
    if (!repoRoot) return null;
    const dotGit = join2(repoRoot, ".git");
    if (!existsSync2(dotGit)) return null;
    let gitDir = dotGit;
    const st = statSync2(dotGit);
    if (st.isFile()) {
      const raw = safeRead(dotGit);
      const m = raw ? /^gitdir:\s*(.+)$/m.exec(raw) : null;
      if (!m) return null;
      const p = m[1].trim();
      gitDir = isAbsolute(p) ? p : resolve2(repoRoot, p);
    } else if (!st.isDirectory()) {
      return null;
    }
    const head = safeRead(join2(gitDir, "HEAD"));
    if (!head) return null;
    const trimmed = head.trim();
    if (/^[0-9a-f]{40}$/i.test(trimmed)) return trimmed.toLowerCase();
    const refMatch = /^ref:\s*(\S+)$/.exec(trimmed);
    if (!refMatch) return null;
    const ref = refMatch[1];
    const dirs = [gitDir];
    const common = safeRead(join2(gitDir, "commondir"));
    if (common && common.trim().length) {
      const c = common.trim();
      dirs.push(isAbsolute(c) ? c : resolve2(gitDir, c));
    }
    for (const d of dirs) {
      const loose = safeRead(join2(d, ref));
      const t = loose?.trim() ?? "";
      if (/^[0-9a-f]{40}/i.test(t)) return t.slice(0, 40).toLowerCase();
    }
    for (const d of dirs) {
      const packed = safeRead(join2(d, "packed-refs"));
      if (!packed) continue;
      for (const line of packed.split("\n")) {
        const pm = /^([0-9a-f]{40})\s+(\S+)\s*$/i.exec(line.trim());
        if (pm && pm[2] === ref) return pm[1].toLowerCase();
      }
    }
    return null;
  } catch {
    return null;
  }
}
function createStaleContext(opts) {
  let pluginVersions = null;
  const heads = /* @__PURE__ */ new Map();
  return {
    get pluginVersions() {
      if (pluginVersions === null) pluginVersions = readInstalledPluginVersions(opts);
      return pluginVersions;
    },
    headFor(repoRoot) {
      try {
        const root = typeof opts?.gitRoot === "string" && opts.gitRoot.trim().length ? opts.gitRoot : typeof repoRoot === "string" && repoRoot.trim().length ? repoRoot : process.cwd();
        if (heads.has(root)) return heads.get(root) ?? null;
        const sha = readGitHeadSha(root);
        heads.set(root, sha);
        return sha;
      } catch {
        return null;
      }
    }
  };
}
function evaluateStaleness(entry, ctx) {
  try {
    const kind = typeof entry?.subject_kind === "string" ? entry.subject_kind : "";
    const key = typeof entry?.subject_key === "string" ? entry.subject_key : "";
    if (!key) return { state: "unknown" };
    if (kind === "plugin_version") {
      const want = versionToken(key);
      if (!want) return { state: "unknown" };
      const name = pluginNameToken(key);
      const versions = ctx.pluginVersions;
      const installed = versions[name] ?? versions[`${name}@cascade-hq`] ?? versions.cse;
      if (!installed) return { state: "unknown" };
      if (installed === want) return { state: "fresh" };
      return { state: "stale", reason: `installed ${installed}, handoff targets ${want}` };
    }
    if (kind === "commit") {
      const m = SHA_RE.exec(key);
      if (!m) return { state: "unknown" };
      const want = m[0].toLowerCase();
      const head = ctx.headFor(entry?.project_path ?? null);
      if (!head) return { state: "unknown" };
      const n = Math.min(want.length, head.length);
      if (want.slice(0, n) === head.slice(0, n)) return { state: "fresh" };
      return { state: "stale", reason: `HEAD is ${head.slice(0, 8)}, handoff targets ${want.slice(0, 8)}` };
    }
    return { state: "unknown" };
  } catch {
    return { state: "unknown" };
  }
}
function parseTime(value) {
  try {
    if (typeof value !== "string" || !value.trim().length) return null;
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}
function formatAge(ms) {
  try {
    if (!Number.isFinite(ms)) return "age unknown";
    if (ms < 0) return "just now";
    const mins = Math.floor(ms / 6e4);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "age unknown";
  }
}
function truncate(s, cap) {
  const t = String(s ?? "").trim();
  if (t.length <= cap) return t;
  return `${t.slice(0, Math.max(1, cap - 1))}\u2026`;
}
function oneLineIntent(note, cap = INTENT_CAP) {
  try {
    if (typeof note !== "string") return "";
    for (const rawLine of note.split("\n")) {
      const line = rawLine.replace(/^\s*#{1,6}\s*/, "").replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").trim();
      if (line.length) return truncate(line, cap);
    }
    return "";
  } catch {
    return "";
  }
}
function labelFor(entry, intent) {
  try {
    let label = typeof entry?.subject_label === "string" ? entry.subject_label.trim() : "";
    if (!label.length) {
      const kind = typeof entry?.subject_kind === "string" ? entry.subject_kind : "";
      const key = typeof entry?.subject_key === "string" ? entry.subject_key : "";
      label = [kind, key].filter(Boolean).join(" ") || "handoff";
    }
    if (intent.length) {
      const bare = intent.replace(/…$/, "");
      const idx = label.indexOf(` \u2014 ${bare}`);
      if (idx > 0) label = label.slice(0, idx);
      else if (label === intent || label === bare) {
        const kind = typeof entry?.subject_kind === "string" ? entry.subject_kind : "";
        const key = typeof entry?.subject_key === "string" ? entry.subject_key : "";
        const alt = [kind, key].filter(Boolean).join(" ");
        if (alt.length) label = alt;
      }
    }
    return truncate(label, LABEL_CAP) || "handoff";
  } catch {
    return "handoff";
  }
}
function buildMenu(opts) {
  const empty = {
    items: [],
    entries: [],
    current: [],
    demoted: [],
    stale: [],
    batchEligible: [],
    total: 0
  };
  try {
    const entries = list(opts);
    if (!Array.isArray(entries) || entries.length === 0) return empty;
    const now = opts?.now instanceof Date ? opts.now.getTime() : Date.now();
    const days = typeof opts?.demoteAfterDays === "number" && Number.isFinite(opts.demoteAfterDays) ? opts.demoteAfterDays : DEMOTE_AFTER_DAYS;
    const cutoffMs = days * DAY_MS;
    const ctx = createStaleContext(opts);
    const items = [];
    for (const entry of entries) {
      try {
        if (!entry || typeof entry !== "object") continue;
        const written = parseTime(entry.written_at) ?? parseTime(entry.created_at);
        const ageMs = written === null ? Number.NaN : Math.max(0, now - written);
        const demoted = Number.isFinite(ageMs) && ageMs > cutoffMs;
        const verdict = evaluateStaleness(entry, ctx);
        const stale = verdict.state === "stale";
        const intent = oneLineIntent(entry.note_md);
        items.push({
          key: typeof entry.key === "string" ? entry.key : "",
          subject_kind: entry.subject_kind,
          subject_key: entry.subject_key,
          label: labelFor(entry, intent),
          intent,
          age: Number.isFinite(ageMs) ? formatAge(ageMs) : "age unknown",
          ageMs,
          written_at: typeof entry.written_at === "string" ? entry.written_at : "",
          staleness: verdict.state,
          stale,
          staleReason: verdict.reason,
          demoted,
          batchEligible: !stale && !demoted,
          entry
        });
      } catch {
      }
    }
    return {
      items,
      entries: items.map((i) => i.entry),
      current: items.filter((i) => !i.demoted),
      demoted: items.filter((i) => i.demoted),
      stale: items.filter((i) => i.stale),
      batchEligible: items.filter((i) => i.batchEligible),
      total: items.length
    };
  } catch {
    return empty;
  }
}

// src/daemon/hooks/claimable.ts
var CLAIMABLE_CACHE_TTL_MS = 30 * 60 * 1e3;
var CACHE_PATH_ENV = "CASCADE_CLAIMABLE_CACHE";
var LABEL_CAP2 = 64;
var INTENT_CAP2 = 88;
function nowMs(opts) {
  try {
    return opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now.getTime() : Date.now();
  } catch {
    return Date.now();
  }
}
function safeRead2(path) {
  try {
    if (!path || !existsSync3(path)) return null;
    const st = statSync3(path);
    if (!st.isFile()) return null;
    return readFileSync3(path, "utf-8");
  } catch {
    return null;
  }
}
function safeParse2(raw) {
  if (raw === null) return null;
  try {
    if (!raw.trim().length) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function truncate2(s, cap) {
  try {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    if (t.length <= cap) return t;
    return `${t.slice(0, Math.max(1, cap - 1))}\u2026`;
  } catch {
    return "";
  }
}
function parseTime2(value) {
  try {
    if (typeof value !== "string" || !value.trim().length) return null;
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}
function nonEmptyString(v) {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}
function claimableCachePath(opts) {
  try {
    const explicit = opts?.cachePath;
    if (typeof explicit === "string" && explicit.trim().length) return resolve3(explicit);
  } catch {
  }
  try {
    const env = process.env?.[CACHE_PATH_ENV];
    if (typeof env === "string" && env.trim().length) return resolve3(env);
  } catch {
  }
  try {
    return join3(homedir3(), ".cascade", "claimable.json");
  } catch {
    return join3(".cascade", "claimable.json");
  }
}
function labelFallback(kind, key) {
  if (kind === "queue_item") return key ? `queued work ${key}` : "queued work";
  if (kind === "finding") return key ? `finding ${key}` : "finding";
  return "handoff";
}
function normalizeCacheItem(raw, at) {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw;
    const kindRaw = typeof o.kind === "string" ? o.kind.trim() : "";
    if (kindRaw !== "queue_item" && kindRaw !== "finding") return null;
    const kind = kindRaw;
    const key = nonEmptyString(o.key);
    if (!key) return null;
    const createdAtRaw = typeof o.created_at === "string" ? o.created_at : "";
    const created = parseTime2(createdAtRaw);
    const ageMs = created === null ? Number.NaN : Math.max(0, at - created);
    const regenerating = o.regenerating === true;
    const queueStatus = typeof o.queue_status === "string" ? o.queue_status.trim() : "";
    let badgeEligible = false;
    if (kind === "queue_item") {
      const queued = queueStatus === "" || queueStatus === "queued";
      badgeEligible = queued && !regenerating;
    }
    return {
      kind,
      key,
      label: truncate2(nonEmptyString(o.label) ?? labelFallback(kind, key), LABEL_CAP2),
      intent: oneLineIntent(typeof o.intent === "string" ? o.intent : "", INTENT_CAP2),
      age: Number.isFinite(ageMs) ? formatAge(ageMs) : "age unknown",
      ageMs,
      createdAt: createdAtRaw,
      regenerating,
      badgeEligible,
      targetPackageId: nonEmptyString(o.target_package_id)
    };
  } catch {
    return null;
  }
}
function dedupeOnTargetPackage(items) {
  try {
    const queued = /* @__PURE__ */ new Set();
    for (const it of items) {
      if (it.kind === "queue_item" && it.targetPackageId) queued.add(it.targetPackageId);
    }
    if (queued.size === 0) return items;
    return items.filter(
      (it) => !(it.kind === "finding" && it.targetPackageId && queued.has(it.targetPackageId))
    );
  } catch {
    return items;
  }
}
function readClaimableCache(opts) {
  const path = claimableCachePath(opts);
  const base = { items: [], checkedAt: null, fresh: false, path };
  try {
    const parsed = safeParse2(safeRead2(path));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...base, reason: "cache absent, unreadable or malformed" };
    }
    const o = parsed;
    const checkedAtRaw = o.checkedAt;
    const checkedAt = typeof checkedAtRaw === "number" && Number.isFinite(checkedAtRaw) ? checkedAtRaw : parseTime2(checkedAtRaw);
    if (checkedAt === null) {
      return { ...base, reason: "cache carries no readable checkedAt" };
    }
    const at = nowMs(opts);
    const ttl = typeof opts?.cacheTtlMs === "number" && Number.isFinite(opts.cacheTtlMs) && opts.cacheTtlMs >= 0 ? opts.cacheTtlMs : CLAIMABLE_CACHE_TTL_MS;
    const ageMs = at - checkedAt;
    const fresh = ageMs <= ttl;
    const rawItems = Array.isArray(o.items) ? o.items : [];
    const items = [];
    for (const row of rawItems) {
      try {
        const entry = normalizeCacheItem(row, at);
        if (!entry) continue;
        items.push(
          fresh ? entry : {
            ...entry,
            badgeEligible: false,
            stale: true,
            staleReason: `cache ${formatAge(ageMs)} old \u2014 refresh pending`
          }
        );
      } catch {
      }
    }
    return {
      items: dedupeOnTargetPackage(items),
      checkedAt,
      fresh,
      path,
      ...fresh ? {} : { reason: `cache is ${formatAge(ageMs)} \u2014 past its ${ttl}ms TTL (listed, not counted)` }
    };
  } catch {
    return { ...base, reason: "unexpected error reading the cache" };
  }
}
function handoffEntries(opts) {
  const out = [];
  try {
    const menu = buildMenu(opts);
    const items = Array.isArray(menu?.items) ? menu.items : [];
    for (const item of items) {
      try {
        if (!item || typeof item !== "object") continue;
        const key = typeof item.key === "string" ? item.key : "";
        if (!key.length) continue;
        out.push({
          kind: "handoff",
          key,
          label: truncate2(item.label || "handoff", LABEL_CAP2),
          intent: truncate2(item.intent ?? "", INTENT_CAP2),
          age: typeof item.age === "string" && item.age.length ? item.age : "age unknown",
          ageMs: typeof item.ageMs === "number" ? item.ageMs : Number.NaN,
          createdAt: typeof item.written_at === "string" ? item.written_at : "",
          regenerating: false,
          badgeEligible: true,
          targetPackageId: item.subject_kind === "package" ? item.subject_key ?? null : null,
          stale: item.stale === true,
          staleReason: item.staleReason,
          demoted: item.demoted === true,
          handoff: item
        });
      } catch {
      }
    }
  } catch {
  }
  return out;
}
function sortEntries(entries) {
  try {
    return [...entries].sort((a, b) => {
      const aAge = Number.isFinite(a.ageMs) ? a.ageMs : Number.POSITIVE_INFINITY;
      const bAge = Number.isFinite(b.ageMs) ? b.ageMs : Number.POSITIVE_INFINITY;
      if (aAge !== bAge) return aAge - bAge;
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  } catch {
    return entries;
  }
}
function listClaimable(opts) {
  try {
    const handoffs = handoffEntries(opts);
    let cached = [];
    try {
      cached = readClaimableCache(opts).items;
    } catch {
      cached = [];
    }
    return sortEntries([...handoffs, ...Array.isArray(cached) ? cached : []]);
  } catch {
    return [];
  }
}
function countBadgeEligible(opts) {
  try {
    let n = 0;
    for (const entry of listClaimable(opts)) {
      if (entry?.badgeEligible === true) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

// src/daemon/hooks/statusline.ts
var DIM = "\x1B[2m";
var YELLOW = "\x1B[33m";
var CYAN = "\x1B[36m";
var BOLD = "\x1B[1m";
var RESET = "\x1B[0m";
var MAGENTA = "\x1B[35m";
var MARK = "\u25C6";
var BADGE_MARK = "\u25B8";
var BADGE_AFFORDANCE = "/cse:verify-handoffs";
var BADGE_CAP = 99;
var CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
var RENDER_BUDGET_MS = 400;
var cachePath = () => join4(homedir4(), ".cascade", "cse-update.json");
var PLUGIN_KEY = "cse@cascade-hq";
var MARKETPLACE = "cascade-hq";
function readJson(path) {
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return null;
  }
}
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function installedVersion() {
  try {
    const self = fileURLToPath(import.meta.url);
    const m = self.match(/[/\\]cse[/\\](\d+\.\d+\.\d+)[/\\]/);
    if (m) return m[1];
  } catch {
  }
  const reg = readJson(
    join4(homedir4(), ".claude", "plugins", "installed_plugins.json")
  );
  return reg?.plugins?.[PLUGIN_KEY]?.[0]?.version ?? null;
}
function marketplaceEntry() {
  const known = readJson(
    join4(homedir4(), ".claude", "plugins", "known_marketplaces.json")
  );
  return known?.[MARKETPLACE] ?? null;
}
function availableVersion() {
  const entry = marketplaceEntry();
  const dir = entry?.source?.path ?? entry?.installLocation;
  if (entry?.source?.source === "directory" && dir) {
    const pkg = readJson(
      join4(dir, "cse", ".claude-plugin", "plugin.json")
    );
    if (pkg?.version) return pkg.version;
  }
  const cache = readJson(cachePath());
  if (cache?.available && cache.checkedAt && Date.now() - cache.checkedAt < CACHE_TTL_MS * 4) {
    return cache.available;
  }
  return null;
}
function primeCache(available) {
  if (!available) return;
  try {
    const prior = readJson(cachePath());
    if (prior?.available === available) return;
    mkdirSync2(dirname2(cachePath()), { recursive: true });
    writeFileSync2(cachePath(), JSON.stringify({ available, checkedAt: Date.now() }, null, 2));
  } catch {
  }
}
function badgeSegment(count, withAffordance) {
  const n = typeof count === "number" && Number.isFinite(count) ? Math.floor(count) : 0;
  if (!(n > 0)) return "";
  const shown = n > BADGE_CAP ? `${BADGE_CAP}+` : String(n);
  const affordance = withAffordance ? `${MAGENTA} \xB7 ${BADGE_AFFORDANCE}${RESET}` : "";
  return `${MAGENTA}${BOLD} ${BADGE_MARK}${shown}${RESET}${affordance}`;
}
function renderLine(installed, available, extra, badge) {
  if (!installed) return "";
  const stale = available !== null && compareVersions(installed, available) < 0;
  const mark = badgeSegment(badge, !stale);
  const tail = extra ? `${DIM} \xB7 ${extra}${RESET}` : "";
  if (stale) {
    return `${YELLOW}${BOLD}${MARK} CSE ${installed} \u2192 ${available}${RESET}${YELLOW} \xB7 /cse:update${RESET}${mark}${tail}`;
  }
  return `${DIM}${CYAN}${MARK} CSE ${installed}${RESET}${mark}${tail}`;
}
function badgeCount(opts) {
  try {
    const n = countBadgeEligible(opts);
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
function resolveVersions() {
  return { installed: installedVersion(), available: availableVersion() };
}
async function readStdin() {
  return new Promise((resolve4) => {
    let raw = "";
    const done = () => {
      try {
        resolve4(raw.trim() ? JSON.parse(raw) : {});
      } catch {
        resolve4({});
      }
    };
    const t = setTimeout(done, 100);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      raw += c;
    });
    process.stdin.on("end", () => {
      clearTimeout(t);
      done();
    });
    process.stdin.on("error", () => {
      clearTimeout(t);
      done();
    });
  });
}
async function runStatusline() {
  const bail = setTimeout(() => {
    process.stdout.write("");
    process.exit(0);
  }, RENDER_BUDGET_MS);
  bail.unref?.();
  let extra;
  try {
    const input = await readStdin();
    const dir = input.workspace?.current_dir;
    if (dir) extra = dir.split("/").filter(Boolean).pop();
  } catch {
  }
  const { installed, available } = resolveVersions();
  primeCache(available);
  const badge = badgeCount();
  clearTimeout(bail);
  process.stdout.write(renderLine(installed, available, extra, badge));
}
var invokedDirectly = (() => {
  try {
    return process.argv[1] !== void 0 && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  runStatusline().catch(() => {
    process.stdout.write("");
    process.exit(0);
  });
}
export {
  badgeCount,
  compareVersions,
  renderLine,
  resolveVersions,
  runStatusline
};
