#!/usr/bin/env node
/**
 * write-proposals.mjs — the deterministic persistence (and gather) rung for
 * /cse:okr-backfill.
 *
 * PROPOSALS ONLY. This script NEVER writes live `objectives`, `key_results`,
 * or `kr_evidence_links` rows. Every write goes to the `okr_proposals`
 * steering queue (migration 292_kr_evidence_edges.sql) with status 'draft'
 * (forced — input status is ignored). The steering-queue accept path on
 * /objectives is the ONLY route to live entities.
 *
 * Zero npm dependencies (plain fetch against PostgREST/GoTrue) so it runs
 * from the installed plugin directory (~/.claude/plugins/...), where no
 * node_modules exists. The credential chain mirrors bin/cascade.js exactly:
 *
 *   1. User mode  — ~/.cascade/auth.json tokens (refresh via GoTrue when
 *                   expired, persisted back with mode 600); org/user ids from
 *                   the JWT claims. RLS-enforced.
 *   2. Admin mode — SUPABASE_SERVICE_ROLE_KEY (+ CASCADE_ORG_ID, optional
 *                   CASCADE_USER_ID) from cwd/.env or ~/.cascade/.env.
 *
 * Modes:
 *   gather            Print the clustering context JSON to stdout: top-level
 *                     bundles (+ sampled package titles), live key results,
 *                     recent top-level packages, existing evidence pairs.
 *                     Mirrors cascade-web/src/lib/objectives/krInference.ts.
 *   write <file|->    Insert draft proposals into okr_proposals from a JSON
 *                     file (or stdin with '-'). Validates EVERY row against
 *                     the payload contracts first and inserts in ONE batch —
 *                     an invalid row or a failed insert means ZERO writes.
 *
 * Exit codes: 0 ok · 1 usage/credential error · 2 validation error (no
 * writes) · 3 steering-queue storage missing (migration 292 unapplied) ·
 * 4 other database error.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// .env loader — identical behavior to bin/cascade.js (cwd/.env then global)
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
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

// Caps mirrored from krInference.ts (deterministic prompt size).
const MAX_BUNDLES = 150;
const SAMPLE_PACKAGE_TITLES_PER_BUNDLE = 5;
const MAX_KRS = 100;
const MAX_EVIDENCE_PACKAGES = 100;
const ID_CHUNK = 200;

const MISSING_TABLE_MESSAGE =
  'Steering queue storage not available — run migration 292 (292_kr_evidence_edges.sql) first';

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

/**
 * Resolve auth exactly like bin/cascade.js: user tokens first (RLS-enforced),
 * then service-role admin mode, else fail with the same guidance.
 */
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
      if (!refreshed) {
        die(1, 'Session expired or invalid. Run `cascade login` again.');
      }
      writeAuthTokens(refreshed.access_token, refreshed.refresh_token);
      access = refreshed.access_token;
      claims = decodeJwtPayload(access);
    }
    return {
      mode: 'user',
      apikey: SUPABASE_ANON_KEY,
      accessToken: access,
      orgId: claims.org_id,
      userId: claims.sub,
    };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const orgId = process.env.CASCADE_ORG_ID;
    if (!orgId) {
      die(1, 'Missing CASCADE_ORG_ID. Set it in .env or ~/.cascade/.env (required in admin mode).');
    }
    return {
      mode: 'admin',
      apikey: serviceKey,
      accessToken: serviceKey,
      orgId,
      userId: process.env.CASCADE_USER_ID || null,
    };
  }

  die(1, 'Not authenticated. Run `cascade login` or set SUPABASE_SERVICE_ROLE_KEY.');
}

// ---------------------------------------------------------------------------
// PostgREST helper
// ---------------------------------------------------------------------------

async function rest(auth, method, path, { body, headers } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: auth.apikey,
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = data && typeof data === 'object' ? data : { message: String(data || res.statusText) };
    return { data: null, error: { code: err.code, message: err.message || res.statusText, status: res.status } };
  }
  return { data, error: null };
}

// PostgREST surfaces a missing table as PGRST205 ("Could not find the table
// ... in the schema cache"), NOT the raw Postgres 42P01 — match both. Same
// for missing columns: PGRST204 / "Could not find the ... column" vs 42703.
const isMissingTable = (error) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  /could not find the table/i.test(error?.message ?? '');
const isMissingColumn = (error) =>
  error?.code === '42703' ||
  error?.code === 'PGRST204' ||
  /could not find the .* column|column .* does not exist/i.test(error?.message ?? '');

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function die(code, message) {
  console.error(message);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// gather — the clustering context (mirrors krInference.ts fetches)
// ---------------------------------------------------------------------------

async function gather(auth) {
  // 1. Top-level, non-archived bundles. Tolerate parent_bundle_id missing
  //    (migration 292 unapplied → 42703) by falling back to all non-archived.
  let bundlesRes = await rest(
    auth,
    'GET',
    `bundles?org_id=eq.${auth.orgId}&status=neq.archived&parent_bundle_id=is.null` +
      `&order=created_at.desc&limit=${MAX_BUNDLES}&select=id,title,status,package_ids`
  );
  if (bundlesRes.error && isMissingColumn(bundlesRes.error)) {
    bundlesRes = await rest(
      auth,
      'GET',
      `bundles?org_id=eq.${auth.orgId}&status=neq.archived` +
        `&order=created_at.desc&limit=${MAX_BUNDLES}&select=id,title,status,package_ids`
    );
  }
  if (bundlesRes.error) die(4, `Failed to fetch bundles: ${bundlesRes.error.message}`);
  const bundles = bundlesRes.data ?? [];

  // 2. Sampled package titles per bundle (chunked .in() lookups).
  const sampleIds = new Set();
  for (const b of bundles) {
    for (const pid of (b.package_ids ?? []).slice(0, SAMPLE_PACKAGE_TITLES_PER_BUNDLE)) {
      sampleIds.add(pid);
    }
  }
  const titleById = new Map();
  for (const ids of chunk([...sampleIds], ID_CHUNK)) {
    const { data, error } = await rest(
      auth,
      'GET',
      `packages?id=in.(${ids.join(',')})&select=id,title`
    );
    if (error) die(4, `Failed to fetch package titles: ${error.message}`);
    for (const row of data ?? []) titleById.set(row.id, row.title);
  }

  // 3. Existing live KRs with their objectives' titles (for evidence links).
  const krRes = await rest(
    auth,
    'GET',
    `key_results?org_id=eq.${auth.orgId}&limit=${MAX_KRS}` +
      `&select=id,title,unit,target_value,measure_source,objective_id,objectives!inner(title,status)`
  );
  if (krRes.error && !isMissingTable(krRes.error)) {
    die(4, `Failed to fetch key results: ${krRes.error.message}`);
  }
  const keyResults = (krRes.data ?? []).map((kr) => {
    const obj = Array.isArray(kr.objectives) ? kr.objectives[0] : kr.objectives;
    return {
      id: kr.id,
      title: kr.title,
      unit: kr.unit,
      targetValue: kr.target_value,
      measureSource: kr.measure_source,
      objectiveId: kr.objective_id,
      objectiveTitle: obj?.title ?? 'Unknown objective',
      objectiveStatus: obj?.status ?? null,
    };
  });

  // 4. Recent top-level packages (tolerate parent_package_id missing → all).
  let pkgRes = await rest(
    auth,
    'GET',
    `packages?org_id=eq.${auth.orgId}&parent_package_id=is.null` +
      `&order=created_at.desc&limit=${MAX_EVIDENCE_PACKAGES}&select=id,title,status`
  );
  if (pkgRes.error && isMissingColumn(pkgRes.error)) {
    pkgRes = await rest(
      auth,
      'GET',
      `packages?org_id=eq.${auth.orgId}` +
        `&order=created_at.desc&limit=${MAX_EVIDENCE_PACKAGES}&select=id,title,status`
    );
  }
  if (pkgRes.error) die(4, `Failed to fetch packages: ${pkgRes.error.message}`);

  // 5. Existing evidence pairs — already-linked (kr, work) pairs are skipped
  //    by the skill. 42P01 (migration 292 unapplied) → treated as none.
  let existingEvidenceLinks = [];
  const linksRes = await rest(
    auth,
    'GET',
    `kr_evidence_links?org_id=eq.${auth.orgId}&select=key_result_id,package_id,bundle_id`
  );
  if (linksRes.error && !isMissingTable(linksRes.error)) {
    die(4, `Failed to fetch evidence links: ${linksRes.error.message}`);
  }
  if (!linksRes.error) existingEvidenceLinks = linksRes.data ?? [];

  const out = {
    mode: auth.mode,
    orgId: auth.orgId,
    steeringQueueAvailable: !isMissingTable(linksRes.error),
    bundles: bundles.map((b) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      packageCount: (b.package_ids ?? []).length,
      packageIds: b.package_ids ?? [],
      samplePackageTitles: (b.package_ids ?? [])
        .slice(0, SAMPLE_PACKAGE_TITLES_PER_BUNDLE)
        .map((id) => titleById.get(id))
        .filter(Boolean),
    })),
    keyResults,
    recentPackages: pkgRes.data ?? [],
    existingEvidenceLinks: existingEvidenceLinks.map((l) => ({
      keyResultId: l.key_result_id,
      packageId: l.package_id,
      bundleId: l.bundle_id,
    })),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// write — validate against the payload contracts, insert in ONE batch
// ---------------------------------------------------------------------------

const KINDS = new Set(['objective', 'initiative', 'evidence_link']);

/** Validate one proposal; returns an error string or null. */
function validateProposal(p, i) {
  const at = `proposals[${i}]`;
  if (!p || typeof p !== 'object') return `${at}: not an object`;
  if (!KINDS.has(p.kind)) return `${at}: kind must be objective | initiative | evidence_link`;
  const pl = p.payload;
  if (!pl || typeof pl !== 'object') return `${at}: missing payload object`;

  const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
  const isStrArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);
  const xorTarget = (o) => isStr(o.packageId) !== isStr(o.bundleId); // exactly one

  if (p.kind === 'objective') {
    // ObjectiveProposalPayload
    if (!isStr(pl.title)) return `${at}: objective payload.title required`;
    if (!Array.isArray(pl.keyResults) || pl.keyResults.length < 1 || pl.keyResults.length > 4) {
      return `${at}: objective payload.keyResults must have 1-4 entries`;
    }
    for (let k = 0; k < pl.keyResults.length; k++) {
      const kr = pl.keyResults[k];
      if (!kr || !isStr(kr.title)) return `${at}.keyResults[${k}]: title required`;
      if (kr.targetValue !== undefined && typeof kr.targetValue !== 'number') {
        return `${at}.keyResults[${k}]: targetValue must be numeric`;
      }
      if (kr.evidence !== undefined) {
        if (!Array.isArray(kr.evidence)) return `${at}.keyResults[${k}]: evidence must be an array`;
        for (let e = 0; e < kr.evidence.length; e++) {
          if (!xorTarget(kr.evidence[e])) {
            return `${at}.keyResults[${k}].evidence[${e}]: exactly one of packageId | bundleId required`;
          }
        }
      }
    }
    if (!isStrArray(pl.clusterBundleIds)) return `${at}: objective payload.clusterBundleIds required`;
  } else if (p.kind === 'initiative') {
    // InitiativeProposalPayload
    if (!isStr(pl.title)) return `${at}: initiative payload.title required`;
    if (!isStrArray(pl.memberBundleIds)) return `${at}: initiative payload.memberBundleIds required`;
    if (pl.existingBundleId !== undefined) {
      if (!isStr(pl.existingBundleId)) return `${at}: existingBundleId must be a non-empty string`;
      if (!pl.memberBundleIds.includes(pl.existingBundleId)) {
        return `${at}: existingBundleId must be one of memberBundleIds`;
      }
    }
  } else {
    // EvidenceLinkProposalPayload
    if (!isStr(pl.keyResultId)) return `${at}: evidence_link payload.keyResultId required`;
    if (!xorTarget(pl)) return `${at}: evidence_link payload needs exactly one of packageId | bundleId`;
  }

  if (p.confidence !== undefined && p.confidence !== null) {
    if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) {
      return `${at}: confidence must be a number in [0,1]`;
    }
  }
  return null;
}

/** Parse + validate the input fully BEFORE any credential/network work. */
function loadAndValidateProposals(source) {
  let raw;
  if (source === '-') {
    raw = readFileSync(0, 'utf-8'); // stdin
  } else {
    if (!existsSync(source)) die(1, `Input file not found: ${source}`);
    raw = readFileSync(source, 'utf-8');
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    die(2, `Input is not valid JSON: ${e.message}`);
  }
  const proposals = Array.isArray(input) ? input : input?.proposals;
  if (!Array.isArray(proposals) || proposals.length === 0) {
    die(2, 'Input must be a JSON array of proposals, or { "proposals": [...] }');
  }

  // Validate EVERYTHING before writing ANYTHING — no partial writes.
  const errors = proposals.map(validateProposal).filter(Boolean);
  if (errors.length > 0) {
    die(2, `Validation failed — nothing was written:\n  ${errors.join('\n  ')}`);
  }

  return proposals;
}

async function writeProposals(auth, proposals) {
  const rows = proposals.map((p) => ({
    org_id: auth.orgId,
    kind: p.kind,
    status: 'draft', // forced — drafts only; the steering queue accept path is the only route to live entities
    payload: p.payload,
    rationale: typeof p.rationale === 'string' ? p.rationale : null,
    confidence: typeof p.confidence === 'number' ? p.confidence : null,
    created_by: auth.userId,
  }));

  // ONE batch insert (single PostgREST statement) — all rows or none.
  const { data, error } = await rest(auth, 'POST', 'okr_proposals?select=id,kind', {
    body: rows,
    headers: { Prefer: 'return=representation' },
  });
  if (error) {
    if (isMissingTable(error)) die(3, MISSING_TABLE_MESSAGE);
    die(4, `Insert failed (nothing was written): ${error.message}`);
  }

  const byKind = {};
  for (const row of data ?? []) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
  process.stdout.write(
    JSON.stringify(
      {
        inserted: (data ?? []).length,
        byKind,
        proposalIds: (data ?? []).map((r) => r.id),
        status: 'draft',
        review: 'Open /objectives → Steering queue to accept, edit, or reject.',
      },
      null,
      2
    ) + '\n'
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `write-proposals.mjs — /cse:okr-backfill gather + steering-queue persistence rung

Usage:
  node write-proposals.mjs gather            Print clustering context JSON (top-level
                                             bundles + sampled package titles, live key
                                             results, recent packages, existing evidence
                                             pairs) for the org resolved from credentials.
  node write-proposals.mjs write <file|->    Insert draft proposals into okr_proposals
                                             from a JSON file ('-' = stdin). Input:
                                             [{ kind, payload, rationale?, confidence? }]
                                             or { "proposals": [...] }. status is forced
                                             to 'draft'; validated up front and inserted
                                             in ONE batch — invalid input writes NOTHING.
  node write-proposals.mjs --help            This help.

Credentials (same chain as bin/cascade.js): ~/.cascade/auth.json user tokens
(RLS-enforced, run \`cascade login\`), else SUPABASE_SERVICE_ROLE_KEY +
CASCADE_ORG_ID from cwd/.env or ~/.cascade/.env.

NEVER writes live objectives / key_results / kr_evidence_links — proposals only.
Exit codes: 0 ok · 1 usage/credentials · 2 validation (no writes) · 3 migration
292 missing · 4 database error.`;

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(USAGE);
    return;
  }

  if (cmd === 'gather') {
    const auth = await resolveAuth();
    await gather(auth);
    return;
  }

  if (cmd === 'write') {
    const source = args[1];
    if (!source) die(1, 'write mode needs a JSON file path or - for stdin.\n\n' + USAGE);
    // Parse + validate FIRST (exit 2, zero network) — then authenticate + insert.
    const proposals = loadAndValidateProposals(source);
    const auth = await resolveAuth();
    await writeProposals(auth, proposals);
    return;
  }

  die(1, `Unknown command: ${cmd}\n\n${USAGE}`);
}

main().catch((e) => die(4, `Unexpected error: ${e?.message ?? e}`));
