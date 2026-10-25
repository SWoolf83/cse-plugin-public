#!/usr/bin/env node
/**
 * run-intake.mjs — the deterministic rung for /cse:okr-intake.
 *
 * The onboarding lane that reaches the ORPHAN PACKAGES: read the org's whole
 * package corpus, quarantine what is not ours, classify what is, cluster it,
 * and produce ONE bounded plan (~12 decisions, ceiling 20 — never per row)
 * plus a brief that says out loud where it guessed.
 *
 * =========================================================================
 * IT DOES NOT OWN A SINGLE RULE. THAT IS THE WHOLE POINT.
 * =========================================================================
 * Every classification, quarantine, taxonomy, match, clustering, planning,
 * lint, self-check and apply decision lives in the TypeScript engine at
 * `cascade-web/src/lib/okr-intake/` and is reached through ONE call:
 *
 *     runOkrIntake(db, input) -> IntakeRunResult      (run.ts; never throws)
 *
 * This file is an I/O + orchestration SHELL: resolve credentials, load the
 * engine, build the input from the persisted interview, print the result.
 * There is deliberately NO second copy of the decision logic in JavaScript —
 * a forked classifier is exactly the drift this spec exists to eliminate.
 * If you are tempted to add a threshold, a status list, a scoring rule or a
 * cluster heuristic to this file: it belongs in the TS module instead.
 *
 * =========================================================================
 * HOW A .mjs REACHES A .ts ENGINE WITH ZERO DEPENDENCIES
 * =========================================================================
 * Node (>= 22.18 / 23.6, unflagged) strips TypeScript types natively, but ESM
 * still refuses extensionless relative specifiers (`./apply`) and knows
 * nothing about the `@/*` path alias. Both are resolution problems, not
 * transform problems, so they are fixed with `registerHooks()` from the
 * BUILT-IN `node:module` — no loader package, no npm install:
 *
 *   ./apply        -> <repo>/cascade-web/src/lib/okr-intake/apply.ts
 *   @/lib/foo      -> <repo>/cascade-web/src/lib/foo.ts
 *
 * `@supabase/supabase-js` (the `DbClient` the engine takes) is resolved from
 * the REPO's own node_modules via `createRequire`, so no dependency is added
 * to the plugin either.
 *
 * THE HONEST LIMIT, STATED PLAINLY: `plan` and `apply` therefore need a
 * cascade repo CHECKOUT on disk. Installed under
 * ~/.claude/plugins/.../cse/skills/okr-intake/scripts/ with no repo nearby,
 * they cannot run and exit 2 with instructions — they do NOT silently fall
 * back to a JavaScript re-implementation. `gather` has no such limit: it is
 * pure PostgREST I/O (no rules) and always works.
 *
 * =========================================================================
 * WHAT IT WILL NEVER DO
 * =========================================================================
 * · It NEVER creates objectives / key_results / initiatives. Entity creation
 *   stays on the unchanged `objectiveActions.acceptProposal` path, which
 *   requires `auth.getUser()` — a skill/runner has no browser session and
 *   CANNOT drive accept. Humans accept on /objectives.
 * · AUTO-APPLY IS OFF BY DEFAULT (`AUTO_APPLY_ENABLED_BY_DEFAULT` in
 *   apply.ts). `plan` is always a dry pass. Only `apply --enable-auto-apply`
 *   — a literal, explicit, per-invocation opt-in — writes evidence links, and
 *   `apply --undo <runId>` takes them straight back out.
 * · Migration 344 is FILE-ONLY (not applied to prod). Every read/write in the
 *   engine goes through a degradable envelope, so a run against an unmigrated
 *   database still produces a useful dry-run brief; the missing storage is
 *   reported as `unavailable` / `degradations`, never papered over.
 *
 * =========================================================================
 * SUBCOMMANDS
 * =========================================================================
 *   gather   Census + interview state. Zero deps, no repo needed, no rules.
 *            `--save-interview <file|->` persists the phase-1 answers.
 *   plan     Run the engine. DRY by default; `--persist` writes the plan
 *            artifact + dispositions (never an alignment edge).
 *   apply    The lever. `--enable-auto-apply` to write high-band evidence
 *            links, `--list` to see what a run wrote, `--undo <runId>` to
 *            remove them.
 *
 * =========================================================================
 * EXIT CODES — the contract a CI job or an operator may rely on
 * =========================================================================
 * A non-zero code ALWAYS means "do not treat this run as a success". The
 * codes are stable; new outcomes get new codes rather than being folded into
 * an existing one.
 *
 *   0  OK. The run finished and nothing failed. This INCLUDES the benign
 *      no-write outcomes, which are not failures and must never red a job:
 *        · a DRY pass (the shipped default — auto-apply is OFF), and
 *        · an idempotent no-op: every candidate edge was ALREADY linked, or
 *          no candidate cleared the gates. Zero rows written, zero errors.
 *   1  Usage / credentials.
 *   2  Engine unreachable (no repo checkout, or Node too old to strip types).
 *   3  STORAGE UNAVAILABLE — migration 344 SECTION 8 is file-only, or the plan
 *      node cannot be written. A DEGRADATION, not a failure: nothing was
 *      written, nothing was lost, and the run still produced a usable brief.
 *   4  DATABASE / RUN ERROR. Includes an apply whose evidence-link writes were
 *      attempted and ZERO landed, and an apply REFUSED before it wrote
 *      (the dedup pre-read failed, so the run would have written blind).
 *   5  Output lint BLOCKED the run: nothing persisted, nothing applied.
 *   6  PARTIAL APPLY. SOME evidence links were written and at least one write
 *      FAILED — e.g. "3 of 10 failed". This is its OWN outcome, deliberately
 *      not folded into 4: unlike a total failure there IS state on disk to
 *      reconcile. `apply --list --run-id <id>` shows what landed and
 *      `apply --undo <runId>` removes it.
 *
 * The engine decides which of these a run deserves — `IntakeRunResult.ok` and
 * `IntakeRunResult.applyOutcome` (run.ts `classifyApplyOutcome`). This file
 * only maps them; it owns no rule about what counts as a failure.
 */

import { readFileSync, writeFileSync, writeSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// ---------------------------------------------------------------------------
// .env loader — identical behavior to bin/cascade.js (cwd/.env then global)
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), '.env'));
loadEnvFile(join(homedir(), '.cascade', '.env'));

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://jocfpjkujuixsnqfhnbh.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvY2Zwamt1anVpeHNucWZobmJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTA0MjEsImV4cCI6MjA4NzIyNjQyMX0.Hmc_QwvGJTIu-vbIpfaraziyQhW49v3ic-o2liLRvJM';

const AUTH_FILE = join(homedir(), '.cascade', 'auth.json');

/** PostgREST caps a response at 1000 rows. Page; never trust `.length`. */
const PAGE_SIZE = 1000;
/** Hard stop so a pathological count can never spin the loop forever. */
const MAX_PAGES = 200;

/** `type_data.topic_slug` of the plan node. Mirrors INTAKE_PLAN_TOPIC_SLUG. */
const PLAN_TOPIC_SLUG = 'okr-intake-plan';
/** The disposition table migration 344 creates. Probed, never assumed. */
const DISPOSITION_TABLE = 'package_intake_dispositions';

/** See the EXIT CODES block in the file header for what each one MEANS. */
const EXIT = {
  OK: 0,
  USAGE: 1,
  ENGINE: 2,
  STORAGE: 3,
  DATABASE: 4,
  BLOCKED: 5,
  /** SOME links written, at least one write FAILED. Its own outcome, not a 4. */
  APPLY_PARTIAL: 6,
};

/**
 * `console.error` + `process.exit()` TRUNCATES on a pipe — stdio to a pipe is
 * async, and exit() does not wait for it to drain. Write synchronously to the
 * fd instead so a piped consumer always gets the whole message.
 */
function die(code, message) {
  try {
    writeSync(2, `${message}\n`);
  } catch {
    console.error(message);
  }
  process.exit(code);
}

/**
 * Same hazard, much worse: a full run report is hundreds of KB, far past the
 * pipe buffer. Write it synchronously so `node run-intake.mjs plan > file` and
 * `| jq` can never receive a half-written JSON document.
 */
function out(value) {
  const text = JSON.stringify(value, null, 2) + '\n';
  try {
    writeSync(1, text);
  } catch {
    process.stdout.write(text);
  }
}

/**
 * Importing .ts from a package without `"type": "module"` makes Node emit one
 * MODULE_TYPELESS_PACKAGE_JSON warning per file. It is noise about cascade-web's
 * package.json, not about this run, and a walk-away lane should not bury its
 * real output in it. Every OTHER warning is still printed.
 */
process.on('warning', (w) => {
  if (w?.name === 'MODULE_TYPELESS_PACKAGE_JSON' || /MODULE_TYPELESS_PACKAGE_JSON/.test(w?.code ?? '')) {
    return;
  }
  console.error(`${w.name}: ${w.message}`);
});

// ---------------------------------------------------------------------------
// Credential resolution (mirrors bin/cascade.js getClient priority chain)
// ---------------------------------------------------------------------------

function decodeJwtPayload(token) {
  const segment = token.split('.')[1];
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

function readAuthTokens() {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    const data = JSON.parse(readFileSync(AUTH_FILE, 'utf-8'));
    if (!data.access_token || !data.refresh_token) return null;
    return data;
  } catch {
    return null;
  }
}

function writeAuthTokens(access_token, refresh_token) {
  const dir = join(homedir(), '.cascade');
  mkdirSync(dir, { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify({ access_token, refresh_token }, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

async function refreshSession(refresh_token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token || !data.refresh_token) return null;
  return data;
}

/** ~/.cascade/auth.json user tokens first (RLS-enforced), then service-role. */
async function resolveAuth() {
  const tokens = readAuthTokens();
  if (tokens) {
    let access = tokens.access_token;
    let claims;
    try {
      claims = decodeJwtPayload(access);
    } catch {
      claims = null;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (!claims || typeof claims.exp !== 'number' || claims.exp - 60 < nowSec) {
      const refreshed = await refreshSession(tokens.refresh_token);
      if (!refreshed) die(EXIT.USAGE, 'Session expired or invalid. Run `cascade login` again.');
      writeAuthTokens(refreshed.access_token, refreshed.refresh_token);
      access = refreshed.access_token;
      claims = decodeJwtPayload(access);
    }
    const orgId = process.env.CASCADE_ORG_ID || claims.org_id;
    if (!orgId) {
      die(
        EXIT.USAGE,
        'Authenticated, but the session carries no org_id. Set CASCADE_ORG_ID or re-run `cascade login`.',
      );
    }
    return {
      mode: 'user',
      apikey: SUPABASE_ANON_KEY,
      accessToken: access,
      orgId,
      userId: claims.sub ?? null,
    };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const orgId = process.env.CASCADE_ORG_ID;
    if (!orgId) {
      die(
        EXIT.USAGE,
        'Missing CASCADE_ORG_ID. Set it in .env or ~/.cascade/.env (required in admin mode).',
      );
    }
    return {
      mode: 'admin',
      apikey: serviceKey,
      accessToken: serviceKey,
      orgId,
      userId: process.env.CASCADE_USER_ID || null,
    };
  }

  return die(EXIT.USAGE, 'Not authenticated. Run `cascade login` or set SUPABASE_SERVICE_ROLE_KEY.');
}

// ---------------------------------------------------------------------------
// PostgREST helper (gather only — the engine brings its own client)
// ---------------------------------------------------------------------------

async function rest(auth, path, { range, count } = {}) {
  const headers = {
    apikey: auth.apikey,
    Authorization: `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json',
  };
  const prefer = [];
  // NEVER count with rows.length — ask PostgREST for the exact total.
  if (count) prefer.push('count=exact');
  if (prefer.length) headers.Prefer = prefer.join(',');
  if (range) headers.Range = range;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'GET', headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = data && typeof data === 'object' ? data : { message: String(data || res.statusText) };
    return {
      data: null,
      total: null,
      error: { code: err.code, message: err.message || res.statusText, status: res.status },
    };
  }
  // content-range is `0-999/1973` (or `*/1973`); the denominator is the truth.
  let total = null;
  const cr = res.headers.get('content-range');
  if (cr) {
    const slash = cr.lastIndexOf('/');
    if (slash !== -1) {
      const n = Number.parseInt(cr.slice(slash + 1), 10);
      if (Number.isFinite(n)) total = n;
    }
  }
  return { data, total, error: null };
}

const isMissingRelation = (error) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  error?.code === '42703' ||
  error?.code === 'PGRST204' ||
  /could not find the table|could not find the .* column|does not exist/i.test(error?.message ?? '');

/** Paged read that reports the TRUE total and whether it got everything. */
async function pagedRead(auth, pathBase) {
  const rows = [];
  let total = null;
  let pages = 0;
  for (let from = 0; pages < MAX_PAGES; from += PAGE_SIZE) {
    const wantCount = pages === 0;
    const res = await rest(auth, pathBase, {
      range: `${from}-${from + PAGE_SIZE - 1}`,
      count: wantCount,
    });
    pages += 1;
    if (res.error) {
      if (isMissingRelation(res.error)) {
        return { rows, total, pages, truncated: false, unavailable: true, error: null };
      }
      return { rows, total, pages, truncated: true, unavailable: false, error: res.error.message };
    }
    if (wantCount && typeof res.total === 'number') total = res.total;
    const page = Array.isArray(res.data) ? res.data : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (total != null && rows.length >= total) break;
  }
  return {
    rows,
    total,
    pages,
    truncated: total != null && rows.length !== total,
    unavailable: false,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// The persisted interview — phase 1's answers, so re-runs start better
// ---------------------------------------------------------------------------

const INTERVIEW_VERSION = 1;

function interviewDir(orgId) {
  return join(homedir(), '.cascade', 'okr-intake', orgId);
}
function interviewPath(orgId) {
  return join(interviewDir(orgId), 'interview.json');
}

function readInterview(orgId) {
  const p = interviewPath(orgId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (e) {
    return { _unreadable: true, path: p, error: e?.message ?? String(e) };
  }
}

/**
 * Structural validation only. Every answer is an INPUT to a TS rule, never a
 * rule itself — so this checks shapes and refuses unknown keys, and decides
 * nothing about what the values mean.
 */
// NOTE: `orgPurpose` is RETIRED (spec-charter-first-okr-reset W3-T1). The
// org's purpose now lives in THE charter (cascade-web/src/lib/charter —
// loadCharter; created by /cse:onboard-charter), which the intake engine
// reads itself. Old interview.json files carrying the key are tolerated:
// validateAnswers IGNORES it (never errors) and saveInterview strips it.
const ANSWER_KEYS = new Set([
  'notes',
  'extraCategoryLabels',
  'dropCategorySlugs',
  'quarantineMarkers',
  'quarantineExactTitles',
  'defaultTopicSlug',
  'alignedMinBand',
  'decisionTarget',
  'decisionCeiling',
  'similarityThreshold',
  'skipEmbeddings',
  'linkCap',
  'maxGreenfieldCategories',
  'liveOkrTitles',
]);

const BANDS = new Set(['high', 'medium', 'low']);

function validateAnswers(answers) {
  const errs = [];
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return ['answers must be an object'];
  }
  for (const k of Object.keys(answers)) {
    // Backward compat: orgPurpose is retired (the charter is the purpose
    // store now) — an old interview.json carrying it is IGNORED, not errored.
    if (k === 'orgPurpose') continue;
    if (!ANSWER_KEYS.has(k)) errs.push(`unknown answer key: ${k} (allowed: ${[...ANSWER_KEYS].join(', ')})`);
  }
  const strArr = (k) => {
    const v = answers[k];
    if (v === undefined || v === null) return;
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) errs.push(`${k} must be a string[]`);
  };
  const str = (k) => {
    const v = answers[k];
    if (v === undefined || v === null) return;
    if (typeof v !== 'string') errs.push(`${k} must be a string`);
  };
  const num = (k, min, max) => {
    const v = answers[k];
    if (v === undefined || v === null) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      errs.push(`${k} must be a number in [${min}, ${max}]`);
    }
  };
  str('notes');
  str('defaultTopicSlug');
  strArr('extraCategoryLabels');
  strArr('dropCategorySlugs');
  strArr('quarantineMarkers');
  strArr('quarantineExactTitles');
  strArr('liveOkrTitles');
  num('decisionTarget', 1, 100);
  num('decisionCeiling', 1, 100);
  num('similarityThreshold', 0, 1);
  num('linkCap', 0, 100000);
  num('maxGreenfieldCategories', 0, 50);
  if (answers.alignedMinBand !== undefined && !BANDS.has(answers.alignedMinBand)) {
    errs.push("alignedMinBand must be one of high | medium | low");
  }
  if (answers.skipEmbeddings !== undefined && typeof answers.skipEmbeddings !== 'boolean') {
    errs.push('skipEmbeddings must be a boolean');
  }
  if (
    typeof answers.decisionTarget === 'number' &&
    typeof answers.decisionCeiling === 'number' &&
    answers.decisionTarget > answers.decisionCeiling
  ) {
    errs.push('decisionTarget must not exceed decisionCeiling');
  }
  return errs;
}

/**
 * Persist the interview. Append-only history next to the current file so a
 * later run can show what changed, and 0600 because free-text answers can
 * name customers.
 */
function saveInterview(orgId, answers, now) {
  const errs = validateAnswers(answers);
  if (errs.length) die(EXIT.USAGE, `Interview answers rejected — nothing was written:\n  ${errs.join('\n  ')}`);

  // Strip the retired orgPurpose key so NEW saves never carry it — the
  // charter (cascade-web/src/lib/charter) is the purpose store now.
  const { orgPurpose: _retiredOrgPurpose, ...keptAnswers } = answers;

  const prior = readInterview(orgId);
  const record = {
    version: INTERVIEW_VERSION,
    orgId,
    answeredAt: now,
    answers: keptAnswers,
    // The run log is appended by `plan`/`apply`, never edited by hand.
    runs: Array.isArray(prior?.runs) ? prior.runs : [],
  };
  const dir = interviewDir(orgId);
  mkdirSync(join(dir, 'history'), { recursive: true });
  if (prior && !prior._unreadable) {
    const stamp = String(prior.answeredAt ?? 'unknown').replace(/[^0-9A-Za-z]/g, '-');
    writeFileSync(join(dir, 'history', `interview-${stamp}.json`), JSON.stringify(prior, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }
  writeFileSync(interviewPath(orgId), JSON.stringify(record, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  return record;
}

/** Append what a run actually did, so the next interview can open with it. */
function appendRunLog(orgId, entry) {
  const prior = readInterview(orgId);
  if (!prior || prior._unreadable) return null;
  const runs = Array.isArray(prior.runs) ? prior.runs : [];
  runs.push(entry);
  const record = { ...prior, runs: runs.slice(-25) };
  try {
    mkdirSync(interviewDir(orgId), { recursive: true });
    writeFileSync(interviewPath(orgId), JSON.stringify(record, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    return null;
  }
  return record;
}

function historyCount(orgId) {
  try {
    return readdirSync(join(interviewDir(orgId), 'history')).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// The engine lane — load the TypeScript modules with ZERO npm dependencies
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));

const hasEngine = (dir) => existsSync(join(dir, 'cascade-web', 'src', 'lib', 'okr-intake', 'run.ts'));

/**
 * Walk up from a start dir looking for a checkout that has the engine.
 * An EXPLICIT `--repo` is a constraint, not a hint: if it has no engine we say
 * so rather than quietly running against some other checkout.
 */
function findRepoRoot(explicit) {
  if (explicit) {
    const root = resolvePath(explicit);
    if (!hasEngine(root)) {
      die(
        EXIT.ENGINE,
        `--repo ${root} has no cascade-web/src/lib/okr-intake/run.ts. Point it at a cascade checkout.`,
      );
    }
    return root;
  }
  const candidates = [];
  if (process.env.CASCADE_REPO) candidates.push(resolvePath(process.env.CASCADE_REPO));
  for (const start of [process.cwd(), HERE]) {
    let dir = start;
    for (let i = 0; i < 12; i += 1) {
      candidates.push(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  for (const c of candidates) {
    if (hasEngine(c)) return c;
  }
  return null;
}

const TS_EXT = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js', '.mjs', '/index.js'];

let hooksRegistered = false;

/**
 * Teach Node's resolver the two things TypeScript source assumes and ESM does
 * not: extensionless relative specifiers, and the `@/*` -> cascade-web/src
 * path alias. `registerHooks` is built into node:module — no loader package.
 */
function registerTsResolution(srcRoot) {
  if (hooksRegistered) return;
  const mod = require('node:module');
  if (typeof mod.registerHooks !== 'function') {
    die(
      EXIT.ENGINE,
      `Node ${process.versions.node} has no module.registerHooks(). The engine lane needs Node >= 22.15 ` +
        '(and >= 22.18 for unflagged TypeScript type stripping). Upgrade Node, or run the engine from the ' +
        'repo with `npx tsx`.',
    );
  }
  mod.registerHooks({
    resolve(specifier, context, nextResolve) {
      let base = null;
      if (specifier.startsWith('@/')) {
        base = resolvePath(srcRoot, specifier.slice(2));
      } else if (specifier.startsWith('.') && context?.parentURL?.startsWith('file:')) {
        base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
      }
      if (base && !existsSync(base)) {
        for (const ext of TS_EXT) {
          if (existsSync(base + ext)) {
            return { url: pathToFileURL(base + ext).href, shortCircuit: true };
          }
        }
      }
      return nextResolve(specifier, context);
    },
  });
  hooksRegistered = true;
}

// `require` is not defined in ESM — make one anchored at this file.
const require = createRequire(import.meta.url);

/**
 * Load `runOkrIntake` + friends straight from the repo's TypeScript source.
 * Returns the module namespace. Exits 2 with instructions when it cannot.
 */
async function loadEngine(repoRoot) {
  const srcRoot = join(repoRoot, 'cascade-web', 'src');
  const entry = join(srcRoot, 'lib', 'okr-intake', 'run.ts');
  if (!existsSync(entry)) {
    die(EXIT.ENGINE, `OKR intake engine not found at ${entry}.`);
  }
  registerTsResolution(srcRoot);
  try {
    return await import(pathToFileURL(entry).href);
  } catch (e) {
    const msg = e?.message ?? String(e);
    die(
      EXIT.ENGINE,
      `Could not load the OKR intake engine from ${entry}:\n  ${msg}\n\n` +
        `Node ${process.versions.node} must be >= 22.18 so TypeScript type stripping is on by default. ` +
        'This is NOT a reason to reimplement the classifier in JavaScript — a second brain is the drift ' +
        'this lane exists to remove. Use `gather` (which needs no engine) and report the blocker.',
    );
  }
}

/** Build the engine's `DbClient` from the repo's own @supabase/supabase-js. */
async function makeDbClient(repoRoot, auth) {
  let createClient;
  try {
    const repoRequire = createRequire(join(repoRoot, 'package.json'));
    const supaPath = repoRequire.resolve('@supabase/supabase-js');
    const supa = await import(pathToFileURL(supaPath).href);
    createClient = supa.createClient ?? supa.default?.createClient;
  } catch (e) {
    die(
      EXIT.ENGINE,
      `Could not resolve @supabase/supabase-js from ${repoRoot} (${e?.message ?? e}). ` +
        'Run `npm install` in the repo checkout.',
    );
  }
  if (typeof createClient !== 'function') {
    die(EXIT.ENGINE, 'Resolved @supabase/supabase-js but it exports no createClient.');
  }
  return createClient(SUPABASE_URL, auth.apikey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${auth.accessToken}` } },
  });
}

// ---------------------------------------------------------------------------
// interview answers -> RunOkrIntakeInput
// ---------------------------------------------------------------------------

/**
 * Map the persisted answers onto the engine's input. This is a TRANSLATION,
 * not a policy: every field lands on a knob `run.ts` already documents, and
 * anything unanswered is simply left off so the engine's own default wins.
 * `slugifyCategory` comes from the engine so even the slug rule is not forked.
 */
function buildRunInput(engine, taxonomy, auth, answers, overrides) {
  const a = answers ?? {};
  const input = { orgId: auth.orgId, createdBy: auth.userId ?? null };

  if (Array.isArray(a.extraCategoryLabels) || Array.isArray(a.dropCategorySlugs)) {
    const drop = new Set(a.dropCategorySlugs ?? []);
    const seeded = engine.runSeedCategories().filter((c) => !drop.has(c.slug));
    const known = new Set(seeded.map((c) => c.slug));
    for (const label of a.extraCategoryLabels ?? []) {
      const slug = taxonomy.slugifyCategory(label);
      if (!slug || known.has(slug)) continue;
      known.add(slug);
      // Operator-declared, not read from the data — 'greenfield' is the honest source.
      seeded.push({
        slug,
        label,
        source: 'greenfield',
        seedPackageCount: 0,
        memberIds: [],
        mergedFrom: [],
      });
    }
    input.categories = seeded;
  }

  if (Array.isArray(a.quarantineMarkers) || Array.isArray(a.quarantineExactTitles)) {
    input.uncertain = {
      markers: a.quarantineMarkers ?? [],
      exactTitles: a.quarantineExactTitles ?? [],
    };
  }

  if (typeof a.defaultTopicSlug === 'string') {
    input.routingContext = { defaultTopicSlug: a.defaultTopicSlug };
  }
  if (BANDS.has(a.alignedMinBand)) input.alignedMinBand = a.alignedMinBand;
  if (typeof a.decisionTarget === 'number') input.decisionTarget = a.decisionTarget;
  if (typeof a.decisionCeiling === 'number') input.decisionCeiling = a.decisionCeiling;
  if (typeof a.similarityThreshold === 'number') input.similarityThreshold = a.similarityThreshold;
  if (typeof a.maxGreenfieldCategories === 'number') {
    input.maxGreenfieldCategories = a.maxGreenfieldCategories;
  }
  if (Array.isArray(a.liveOkrTitles)) input.liveOkrTitles = a.liveOkrTitles;
  if (typeof a.linkCap === 'number') input.linkCap = a.linkCap;
  // The seed lane spends zero tokens by default: no embedder is ever injected
  // by this runner, so `skipEmbeddings` only ever tightens things further.
  if (a.skipEmbeddings === true) input.skipEmbeddings = true;

  return { ...input, ...overrides };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function summarizeResult(result, extra) {
  return {
    runId: result.runId,
    orgId: result.orgId,
    mode: result.mode,
    ok: result.ok,
    complete: result.complete,
    blocked: result.blocked,
    skipped: result.skipped,
    unavailable: result.unavailable,
    // WHAT THE APPLY PHASE DID — and the exit code it earned. Kept at the TOP
    // level (and never compacted away) because it is the one field a CI job or
    // an operator has to read: `partial` is not `applied` and is not `failed`.
    applyOutcome: result.applyOutcome ?? null,
    exitCode: exitCodeForResult(result),
    summary: result.summary,
    decisionCount: result.decisions?.length ?? 0,
    decisions: (result.decisions ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      question: d.question,
      options: d.options,
      fanOut: d.fanOut,
      confidence: d.confidence,
      reason: d.reason,
      autoApplyEligibleMembers: d.autoApplyMemberIds?.length ?? 0,
    })),
    openQuestions: result.openQuestions ?? [],
    lever: result.lever,
    apply: result.apply,
    dispositions: result.dispositions,
    idempotency: result.idempotency,
    persisted: result.persisted
      ? {
          packageId: result.persisted.packageId ?? null,
          versionNo: result.persisted.versionNo ?? null,
          created: result.persisted.created ?? null,
        }
      : null,
    lint: result.lint
      ? {
          ok: result.lint.ok ?? null,
          // `blocking` is what stops a persist; `warnings` is the rubric's
          // "flag it so the human decides" outcome. Both are reported in full.
          blocked: result.lint.blocked ?? null,
          blocking: result.lint.blocking ?? [],
          warnings: result.lint.warnings ?? [],
          keeps: result.lint.keeps ?? [],
          ruleCounts: result.lint.ruleCounts ?? null,
          checked: result.lint.checked ?? null,
          skippedRules: result.lint.skippedRules ?? [],
        }
      : null,
    selfCheck: result.selfCheck
      ? {
          passed: result.selfCheck.passed ?? null,
          passes: result.selfCheck.passes ?? null,
          stopReason: result.selfCheck.stopReason ?? null,
          degraded: result.selfCheck.degraded ?? null,
          remedies: result.selfCheck.remedies ?? [],
          briefLines: result.selfCheck.briefLines ?? [],
          errors: result.selfCheck.errors ?? [],
        }
      : null,
    phaseOrder: result.phaseOrder ?? [],
    guards: {
      clusterCalls: result.guards?.cluster?.calls ?? null,
      embedCalls: result.guards?.embed?.calls ?? null,
      labelledTextsEmbedded: result.guards?.embed?.labelledTextsEmbedded ?? null,
    },
    degradations: result.degradations ?? [],
    errors: result.errors ?? [],
    brief: result.brief ?? [],
    ...extra,
  };
}

/**
 * A full report is ~1 MB — mostly per-candidate apply bookkeeping and the
 * package-id lists behind each escalation. `--brief` keeps everything the
 * approval CONVERSATION needs (summary, decisions, guesses, self-check, brief)
 * and replaces the bulk with counts, so a skill can read it without burning its
 * context. Nothing is summarized away silently: every dropped array leaves its
 * length behind, and the full report is still available via `--out`.
 */
function compactReport(report) {
  return {
    ...report,
    apply: report.apply
      ? {
          mode: report.apply.mode,
          wouldApply: report.apply.wouldApply?.length ?? 0,
          applied: report.apply.applied?.length ?? 0,
          alreadyPresent: report.apply.alreadyPresent?.length ?? 0,
          candidates: report.apply.candidates?.length ?? 0,
          skipped: report.apply.skipped?.length ?? 0,
          skipCounts: report.apply.skipCounts ?? null,
          refusedIntents: report.apply.refusedIntents?.length ?? 0,
          unavailable: report.apply.unavailable ?? null,
          errors: report.apply.errors ?? [],
        }
      : null,
    openQuestions: (report.openQuestions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      fanOut: q.packageIds?.length ?? 0,
    })),
    ...(report.wouldApply
      ? { wouldApply: { ...report.wouldApply, links: undefined } }
      : {}),
    // `summary.escalated` repeats every decision WITH its full member-id list;
    // the decisions themselves are already above. Keep the fan-out count.
    summary: report.summary
      ? {
          ...report.summary,
          escalated: (report.summary.escalated ?? []).map((e) => ({
            id: e.id,
            question: e.question,
            fanOut: e.packageIds?.length ?? 0,
          })),
          guesses: report.summary.guesses?.length ?? report.summary.guesses ?? null,
        }
      : null,
    // The rendered "places I guessed" markdown is already inside `brief`; this
    // is its structured twin, so a compact report carries the count + the top
    // ones rather than all 60+ verbatim.
    placesIGuessed: {
      total: report.placesIGuessed?.length ?? 0,
      shown: Math.min(report.placesIGuessed?.length ?? 0, 12),
      guesses: (report.placesIGuessed ?? []).slice(0, 12),
      note: 'Full list in the --out report and rendered in `brief`.',
    },
  };
}

/**
 * The exit code a finished run deserves. See the EXIT CODES block in the header.
 *
 * ORDER MATTERS, and each step is a deliberate precedence:
 *   1. `blocked` beats everything — lint stopped the run before it could write.
 *   2. a PARTIAL apply beats the generic database code, because 6 tells the
 *      operator something 4 does not: rows LANDED and there is state to undo.
 *   3. `!ok` — a genuine failure (a total apply failure, a refused write, or
 *      any fatal run error). The engine owns that verdict; this file trusts it.
 *   4. `unavailable` — a degradation, reported but survivable.
 *
 * `applyOutcome` is optional-chained so a newer runner against an OLDER engine
 * degrades to the pre-existing behaviour instead of throwing.
 */
function exitCodeForResult(result) {
  if (result.blocked) return EXIT.BLOCKED;
  if (result.applyOutcome?.outcome === 'partial') return EXIT.APPLY_PARTIAL;
  if (!result.ok) return EXIT.DATABASE;
  if (result.unavailable) return EXIT.STORAGE;
  return EXIT.OK;
}

/**
 * Say it on STDERR too. stdout carries the JSON report — which is routinely
 * piped to a file or to `jq` — so a failing apply that only appeared there
 * would be invisible to the operator watching the terminal. A partial apply in
 * particular must not scroll past looking like a finished run.
 */
function warnOnApplyOutcome(result) {
  const outcome = result.applyOutcome;
  if (!outcome || !outcome.failure) return;
  const banner =
    outcome.outcome === 'partial'
      ? `PARTIAL APPLY (exit ${EXIT.APPLY_PARTIAL}) — ${outcome.applied} of ${outcome.attempted} ` +
        `evidence link(s) written, ${outcome.failed} FAILED.`
      : `APPLY ${outcome.outcome.toUpperCase()} (exit ${EXIT.DATABASE}) — ${outcome.applied} of ` +
        `${outcome.attempted} evidence link(s) written, ${outcome.failed} FAILED.`;
  try {
    writeSync(2, `\n${banner}\n${outcome.why}\n  undo: run-intake.mjs apply --undo ${result.runId}\n`);
  } catch {
    console.error(banner);
  }
}

// ---------------------------------------------------------------------------
// gather — census + interview state. ZERO deps, no repo needed, NO RULES.
// ---------------------------------------------------------------------------

async function gather(auth, opts) {
  const now = new Date().toISOString();

  let interview = readInterview(auth.orgId);
  if (opts.saveInterview) {
    const raw =
      opts.saveInterview === '-'
        ? readFileSync(0, 'utf-8')
        : existsSync(opts.saveInterview)
          ? readFileSync(opts.saveInterview, 'utf-8')
          : die(EXIT.USAGE, `Interview file not found: ${opts.saveInterview}`);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      die(EXIT.USAGE, `Interview input is not valid JSON: ${e.message}`);
    }
    const answers = parsed?.answers ?? parsed;
    interview = saveInterview(auth.orgId, answers, now);
  }

  // ONE paged pass over the package table. Histograms only — membership,
  // orphanhood and work-target classification are the ENGINE's job, not this
  // script's, so no status list or predicate is encoded here.
  const pkg = await pagedRead(
    auth,
    `packages?org_id=eq.${auth.orgId}&is_deleted=eq.false` +
      '&select=id,status,kind,package_type,area:type_data->>organize_area' +
      '&order=created_at.desc&order=id.asc',
  );
  if (pkg.error) die(EXIT.DATABASE, `Failed to read packages: ${pkg.error}`);

  const tally = (rows, key) => {
    const m = {};
    for (const r of rows) {
      const k = r[key] ?? '(none)';
      m[k] = (m[k] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(m).sort((x, y) => y[1] - x[1]));
  };
  const labelled = pkg.rows.filter((r) => typeof r.area === 'string' && r.area.trim().length > 0).length;

  // Live key results (+ their objectives) — the match lane's targets.
  const krRes = await pagedRead(
    auth,
    `key_results?org_id=eq.${auth.orgId}` +
      '&select=id,title,unit,target_value,measure_source,objective_id,objectives!inner(title,status)' +
      '&order=id.asc',
  );
  const keyResults = (krRes.rows ?? []).map((kr) => {
    const obj = Array.isArray(kr.objectives) ? kr.objectives[0] : kr.objectives;
    return {
      id: kr.id,
      title: kr.title,
      unit: kr.unit,
      targetValue: kr.target_value,
      measureSource: kr.measure_source,
      objectiveId: kr.objective_id,
      objectiveTitle: obj?.title ?? null,
      objectiveStatus: obj?.status ?? null,
    };
  });

  // Existing alignment edges — what is already linked.
  const linkRes = await rest(
    auth,
    `kr_evidence_links?org_id=eq.${auth.orgId}&select=key_result_id`,
    { range: '0-0', count: true },
  );
  const evidenceLinks = {
    total: linkRes.error ? null : linkRes.total,
    unavailable: Boolean(linkRes.error && isMissingRelation(linkRes.error)),
    error: linkRes.error && !isMissingRelation(linkRes.error) ? linkRes.error.message : null,
  };

  // Migration 344 probe — file-only in this repo, so ALWAYS check, never assume.
  const dispRes = await rest(auth, `${DISPOSITION_TABLE}?select=package_id`, { range: '0-0', count: true });
  const dispositionStorage = {
    table: DISPOSITION_TABLE,
    available: !dispRes.error,
    rows: dispRes.error ? null : dispRes.total,
    note: dispRes.error
      ? 'Migration 344 is not applied here. A run still produces a full dry-run brief; ' +
        'dispositions are reported as unavailable rather than written.'
      : null,
  };

  // The plan node this org already has, if any (one per (org, topic_slug)).
  const planRes = await rest(
    auth,
    `packages?org_id=eq.${auth.orgId}&kind=eq.artifact&is_deleted=eq.false` +
      `&type_data->>topic_slug=eq.${PLAN_TOPIC_SLUG}` +
      '&select=id,title,updated_at,type_data&limit=1',
  );
  const planRow = Array.isArray(planRes.data) ? planRes.data[0] : null;
  const storedPlan = planRow
    ? {
        packageId: planRow.id,
        title: planRow.title,
        updatedAt: planRow.updated_at,
        runId: planRow.type_data?.run_id ?? null,
        generatedAt: planRow.type_data?.generated_at ?? null,
        decisionCount: planRow.type_data?.decision_count ?? null,
        corpusSize: planRow.type_data?.corpus_size ?? null,
        covered: planRow.type_data?.covered ?? null,
        clusterCount: planRow.type_data?.cluster_count ?? null,
        partitionOk: planRow.type_data?.partition_ok ?? null,
      }
    : null;

  const repoRoot = findRepoRoot(opts.repo);

  out({
    generatedAt: now,
    mode: auth.mode,
    orgId: auth.orgId,
    packages: {
      // The TRUE total from Prefer: count=exact — never rows.length.
      total: pkg.total,
      read: pkg.rows.length,
      truncated: pkg.truncated,
      pages: pkg.pages,
      byStatus: tally(pkg.rows, 'status'),
      byKind: tally(pkg.rows, 'kind'),
      byPackageType: tally(pkg.rows, 'package_type'),
      organizeArea: {
        labelled,
        unlabelled: pkg.rows.length - labelled,
        // The FREE classification lane: these labels are read, not inferred.
        byArea: tally(pkg.rows.filter((r) => r.area), 'area'),
      },
    },
    keyResults: {
      total: krRes.unavailable ? null : (krRes.total ?? keyResults.length),
      unavailable: krRes.unavailable,
      items: keyResults,
    },
    evidenceLinks,
    dispositionStorage,
    storedPlan,
    interview: interview?._unreadable
      ? { unreadable: true, path: interview.path, error: interview.error }
      : interview
        ? {
            path: interviewPath(auth.orgId),
            version: interview.version,
            answeredAt: interview.answeredAt,
            answers: interview.answers,
            priorRuns: interview.runs ?? [],
            historyVersions: historyCount(auth.orgId),
          }
        : { path: interviewPath(auth.orgId), answers: null, note: 'No interview saved yet — run phase 1.' },
    engine: repoRoot
      ? { available: true, repoRoot, entry: join(repoRoot, 'cascade-web/src/lib/okr-intake/run.ts') }
      : {
          available: false,
          reason:
            'No cascade repo checkout found. `plan` and `apply` load the TypeScript engine from source; ' +
            'pass --repo <path> or set CASCADE_REPO. `gather` needs no repo.',
        },
    nodeVersion: process.versions.node,
  });
}

// ---------------------------------------------------------------------------
// plan — run the engine. DRY BY DEFAULT.
// ---------------------------------------------------------------------------

async function plan(auth, opts) {
  const repoRoot = findRepoRoot(opts.repo);
  if (!repoRoot) {
    die(
      EXIT.ENGINE,
      'No cascade repo checkout found. `plan` loads the OKR-intake engine from ' +
        'cascade-web/src/lib/okr-intake/run.ts — pass --repo <path>, set CASCADE_REPO, or run from the repo. ' +
        'Use `gather` for the census, which needs no repo.',
    );
  }

  const engine = await loadEngine(repoRoot);
  const taxonomy = await import(
    pathToFileURL(join(repoRoot, 'cascade-web/src/lib/okr-intake/taxonomy.ts')).href
  );
  const db = await makeDbClient(repoRoot, auth);

  const stored = opts.interview
    ? JSON.parse(readFileSync(opts.interview, 'utf-8'))
    : readInterview(auth.orgId);
  const answers = stored && !stored._unreadable ? (stored.answers ?? null) : null;

  const input = buildRunInput(engine, taxonomy, auth, answers, {
    // The dry pass is the default. `--persist` writes the PLAN ARTIFACT and
    // the dispositions — it does not write a single alignment edge.
    persist: opts.persist === true,
    // THE LEVER STAYS OFF HERE, unconditionally. Only `apply` can set it.
    enableAutoApply: false,
    ...(opts.runId ? { runId: opts.runId } : {}),
  });

  let result;
  try {
    result = await engine.runOkrIntake(db, input);
  } catch (e) {
    // runOkrIntake documents that it never throws; if it did, say so loudly
    // rather than pretending the pass produced a plan.
    die(EXIT.DATABASE, `runOkrIntake threw (it is documented never to): ${e?.stack ?? e}`);
  }

  const report = summarizeResult(result, {
    lane: 'plan',
    persistRequested: opts.persist === true,
    interviewApplied: Boolean(answers),
    repoRoot,
    wouldApply: {
      note:
        'AUTO-APPLY IS OFF. These are the links the engine WOULD write if you passed ' +
        '`apply --enable-auto-apply`. Nothing was written.',
      // ApplyPassResult.wouldApply is THE SET: on a dry pass it is exactly what
      // an enabled run would have inserted. Show it before offering the lever.
      count: result.apply?.wouldApply?.length ?? 0,
      links: result.apply?.wouldApply ?? [],
      skipCounts: result.apply?.skipCounts ?? null,
      autoApplyEligibleMatches: result.match?.autoApply?.length ?? 0,
      lever: result.lever ?? null,
    },
    // THE "places I guessed on your behalf" section, structured. The rendered
    // markdown is already in `brief` — this is the machine-readable twin.
    placesIGuessed: result.lint?.guesses ?? [],
  });

  // --out always gets the FULL report; stdout gets the compact one on --brief.
  if (opts.out) writeFileSync(opts.out, JSON.stringify(report, null, 2), 'utf-8');
  out(opts.brief ? compactReport(report) : report);

  appendRunLog(auth.orgId, {
    runId: result.runId,
    at: new Date().toISOString(),
    lane: 'plan',
    persisted: Boolean(result.persisted),
    decisions: result.decisions?.length ?? 0,
    complete: result.complete === true,
    skipped: result.skipped === true,
    blocked: result.blocked === true,
    applyOutcome: result.applyOutcome?.outcome ?? null,
  });

  warnOnApplyOutcome(result);
  process.exitCode = exitCodeForResult(result);
}

// ---------------------------------------------------------------------------
// apply — the lever, the ledger, and the undo
// ---------------------------------------------------------------------------

async function apply(auth, opts) {
  const repoRoot = findRepoRoot(opts.repo);
  if (!repoRoot) {
    die(
      EXIT.ENGINE,
      'No cascade repo checkout found. `apply` loads the OKR-intake engine from source — ' +
        'pass --repo <path>, set CASCADE_REPO, or run from the repo.',
    );
  }
  const engine = await loadEngine(repoRoot);
  const taxonomy = await import(
    pathToFileURL(join(repoRoot, 'cascade-web/src/lib/okr-intake/taxonomy.ts')).href
  );
  const db = await makeDbClient(repoRoot, auth);

  if (opts.list) {
    const res = await engine.listAppliedLinks(db, auth.orgId, {
      runId: opts.runId ?? null,
      ...(opts.limit ? { limit: opts.limit } : {}),
    });
    out({ lane: 'apply', action: 'list', runId: opts.runId ?? null, ...res });
    process.exitCode = res.unavailable ? EXIT.STORAGE : res.error ? EXIT.DATABASE : EXIT.OK;
    return;
  }

  if (opts.undo) {
    const res = await engine.undoIntakeRun(db, auth.orgId, opts.undo);
    out({ lane: 'apply', action: 'undo', runId: opts.undo, ...res });
    appendRunLog(auth.orgId, {
      runId: opts.undo,
      at: new Date().toISOString(),
      lane: 'undo',
      removed: res?.data?.removed ?? 0,
    });
    process.exitCode = res.unavailable ? EXIT.STORAGE : res.error ? EXIT.DATABASE : EXIT.OK;
    return;
  }

  if (opts.enableAutoApply !== true) {
    die(
      EXIT.USAGE,
      'Refusing to apply. Auto-apply is OFF by default and the opt-in is explicit:\n' +
        '  run-intake.mjs apply --enable-auto-apply\n\n' +
        'Run `plan` first and show the human what WOULD be applied. The thresholds are judgement, ' +
        'not measurement, and a wrong auto-applied link silently inflates the alignment score this ' +
        'lane exists to make honest. `apply --undo <runId>` reverses a run.',
    );
  }

  const stored = opts.interview
    ? JSON.parse(readFileSync(opts.interview, 'utf-8'))
    : readInterview(auth.orgId);
  const answers = stored && !stored._unreadable ? (stored.answers ?? null) : null;

  const input = buildRunInput(engine, taxonomy, auth, answers, {
    persist: opts.persist !== false,
    enableAutoApply: true,
    ...(opts.suppressHighBand ? { suppressHighBand: true } : {}),
    ...(opts.linkCap ? { linkCap: opts.linkCap } : {}),
    ...(opts.runId ? { runId: opts.runId } : {}),
  });

  let result;
  try {
    result = await engine.runOkrIntake(db, input);
  } catch (e) {
    die(EXIT.DATABASE, `runOkrIntake threw (it is documented never to): ${e?.stack ?? e}`);
  }

  const report = summarizeResult(result, {
    lane: 'apply',
    interviewApplied: Boolean(answers),
    repoRoot,
    undoWith: `run-intake.mjs apply --undo ${result.runId}`,
    placesIGuessed: result.lint?.guesses ?? [],
  });
  if (opts.out) writeFileSync(opts.out, JSON.stringify(report, null, 2), 'utf-8');
  out(opts.brief ? compactReport(report) : report);

  appendRunLog(auth.orgId, {
    runId: result.runId,
    at: new Date().toISOString(),
    lane: 'apply',
    applied: result.apply?.applied?.length ?? 0,
    alreadyPresent: result.apply?.alreadyPresent?.length ?? 0,
    // The run log is what the NEXT pass opens knowing. A partial apply left
    // rows behind, so the count of what failed has to survive into it.
    applyOutcome: result.applyOutcome?.outcome ?? null,
    failed: result.applyOutcome?.failed ?? 0,
    decisions: result.decisions?.length ?? 0,
    complete: result.complete === true,
    blocked: result.blocked === true,
  });

  warnOnApplyOutcome(result);
  process.exitCode = exitCodeForResult(result);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `run-intake.mjs — /cse:okr-intake gather + plan + apply rung

Usage:
  node run-intake.mjs gather [--save-interview <file|->] [--repo <path>]
      Census for the interview and the brief: package totals (Prefer: count=exact,
      paged past the 1000-row cap), status/kind/organize_area histograms, live key
      results, existing evidence-link count, whether migration 344 storage exists,
      the stored plan node, and the persisted interview. Encodes NO rules.
      --save-interview validates and persists phase-1 answers first.

  node run-intake.mjs plan [--persist] [--brief] [--interview <file>] [--out <file>]
                           [--repo <path>] [--run-id <id>]
      Run the engine end to end (quarantine -> corpus -> seed -> match -> cluster
      -> plan -> lint -> self-check). DRY BY DEFAULT: nothing is written unless
      --persist, and even then only the plan artifact + dispositions — never an
      alignment edge. Prints the bounded decisions (~12, ceiling 20) and the brief.
      A full report is ~1 MB: use --brief for the conversation-sized one (bulk
      arrays replaced by their counts) and --out to keep the full one on disk.

  node run-intake.mjs apply --enable-auto-apply [--link-cap N] [--suppress-high-band]
  node run-intake.mjs apply --list [--run-id <id>] [--limit N]
  node run-intake.mjs apply --undo <runId>
      THE LEVER. Auto-apply is OFF by default; --enable-auto-apply is the single
      explicit opt-in and there is no config that turns it on for you. --list shows
      what a run wrote; --undo removes it.

  node run-intake.mjs --help

Interview: persisted at ~/.cascade/okr-intake/<orgId>/interview.json (mode 600),
prior versions kept under history/, and every run appended to runs[] so the next
pass opens knowing what the last one did.

Credentials (same chain as bin/cascade.js): ~/.cascade/auth.json user tokens
(RLS-enforced, run \`cascade login\`), else SUPABASE_SERVICE_ROLE_KEY +
CASCADE_ORG_ID from cwd/.env or ~/.cascade/.env.

ENGINE LANE: \`plan\` and \`apply\` import the TypeScript engine from a repo
CHECKOUT (cascade-web/src/lib/okr-intake/run.ts) using node:module registerHooks
plus Node's built-in type stripping — zero npm dependencies, and zero duplicated
decision logic. They need Node >= 22.18 and --repo/CASCADE_REPO/cwd inside a
checkout. \`gather\` needs neither.

NEVER creates objectives / key_results / initiatives: entity creation stays on
objectiveActions.acceptProposal, which requires auth.getUser(), so this runner
cannot drive accept. Humans accept on /objectives.

EXIT CODES (stable — a CI job may rely on them). Non-zero ALWAYS means "do not
treat this run as a success":
  0  ok. Includes the BENIGN no-write outcomes, which never red a job: a DRY
     pass (auto-apply is OFF by default) and an idempotent no-op (every
     candidate edge was already linked, or none cleared the gates).
  1  usage / credentials
  2  engine unreachable (no repo checkout, or Node too old to strip types)
  3  storage unavailable (migration 344 SECTION 8 file-only) — a DEGRADATION,
     not a failure: nothing written, nothing lost, brief still produced
  4  database / run error — includes an apply that wrote ZERO of what it
     attempted, and an apply REFUSED before writing (the dedup pre-read failed)
  5  output lint BLOCKED the run: nothing persisted, nothing applied
  6  PARTIAL APPLY — some evidence links were written and at least one write
     FAILED ("3 of 10 failed"). Its own code, NOT folded into 4: unlike a total
     failure there is state on disk. \`apply --list --run-id <id>\` shows what
     landed; \`apply --undo <runId>\` removes it.

Every run prints its own verdict as \`applyOutcome\` + \`exitCode\` at the top of
the JSON report, and a failing apply is also announced on stderr.`;

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) die(EXIT.USAGE, `${arg} needs a value.\n\n${USAGE}`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--repo': opts.repo = take(); break;
      case '--interview': opts.interview = take(); break;
      case '--save-interview': opts.saveInterview = take(); break;
      case '--out': opts.out = take(); break;
      case '--run-id': opts.runId = take(); break;
      case '--undo': opts.undo = take(); break;
      case '--limit': opts.limit = Number.parseInt(take(), 10); break;
      case '--link-cap': opts.linkCap = Number.parseInt(take(), 10); break;
      case '--brief': opts.brief = true; break;
      case '--persist': opts.persist = true; break;
      case '--no-persist': opts.persist = false; break;
      case '--enable-auto-apply': opts.enableAutoApply = true; break;
      case '--suppress-high-band': opts.suppressHighBand = true; break;
      case '--list': opts.list = true; break;
      default:
        if (arg.startsWith('--')) die(EXIT.USAGE, `Unknown flag: ${arg}\n\n${USAGE}`);
        opts._.push(arg);
    }
  }
  return opts;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(USAGE);
    return;
  }
  if (!['gather', 'plan', 'apply'].includes(cmd)) {
    die(EXIT.USAGE, `Unknown command: ${cmd}\n\n${USAGE}`);
  }

  const opts = parseArgs(argv.slice(1));
  const auth = await resolveAuth();

  if (cmd === 'gather') return gather(auth, opts);
  if (cmd === 'plan') return plan(auth, opts);
  return apply(auth, opts);
}

/**
 * RUN ONLY WHEN INVOKED AS THE SCRIPT.
 *
 * `node run-intake.mjs …` still behaves exactly as before. The guard exists so
 * the EXIT-CODE CONTRACT can be imported and TESTED — an exit code a CI job is
 * told to rely on has to be checkable, and the alternative (asserting against
 * the source text) proves nothing about the mapping.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((e) => die(EXIT.DATABASE, `Unexpected error: ${e?.stack ?? e}`));
}

/** The exit-code contract, exported for tests. Not part of the CLI surface. */
export { EXIT, exitCodeForResult };
