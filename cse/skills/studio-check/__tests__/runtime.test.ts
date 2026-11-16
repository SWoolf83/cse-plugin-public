/**
 * runtime.test.ts — SKILL.md's node commands work from an installed plugin copy.
 *
 * Copies cse/ to a temp dir with no repo around it, sets CLAUDE_PLUGIN_ROOT to that
 * copy, and runs with bare `node` (no vitest transforms) the exact command lines
 * SKILL.md documents. A command SKILL.md drops or renames fails the
 * "SKILL.md still documents" test, so the two cannot drift silently.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CSE_SRC = fileURLToPath(new URL('../../../', import.meta.url));
const SKILL_MD = readFileSync(fileURLToPath(new URL('../SKILL.md', import.meta.url)), 'utf8');

const SC = '${CLAUDE_PLUGIN_ROOT}/skills/studio-check';
const CMD_FLAG = `node "${SC}/flag.mjs"`;
const CMD_SCENARIO = `node "${SC}/scenarios.mjs" smoke`;
const CMD_RECEIPT = `node "${SC}/report.mjs" receipt "$RUN_DIR/results.json"`;
const CMD_PLAN = `node "${SC}/report.mjs" plan "$RUN_DIR/results.json" "$RUN_DIR/open.json"`;

let root: string;
let plugin: string;
let runDir: string;

/** Run a SKILL.md command line through a shell, exactly as written, with bare node. */
function run(cmd: string, extraEnv: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CLAUDE_PLUGIN_ROOT: plugin,
    RUN_DIR: runDir,
    ...extraEnv,
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return spawnSync('/bin/sh', ['-c', cmd], { cwd: root, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'studio-check-runtime-'));
  plugin = join(root, 'cse');
  cpSync(CSE_SRC, plugin, {
    recursive: true,
    // The vendored MCP bundle is irrelevant here and large; skip it.
    filter: (src) => !src.includes('node_modules') && !src.includes('/mcp/'),
  });
  runDir = join(root, 'run');
  mkdirSync(runDir);
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('installed-copy runtime (bare node)', () => {
  it('the copy has no repo around it', () => {
    expect(existsSync(join(root, 'package.json'))).toBe(false);
    expect(existsSync(join(root, '.git'))).toBe(false);
    expect(existsSync(join(plugin, 'skills', 'studio-check', 'scenarios.mjs'))).toBe(true);
  });

  it('SKILL.md still documents every command exercised here', () => {
    for (const c of [CMD_FLAG, CMD_SCENARIO, CMD_RECEIPT, CMD_PLAN]) expect(SKILL_MD).toContain(c);
  });

  it('flag check: exits 0 with CASCADE_RUNBOOKS_ENABLED=1 and non-zero without', () => {
    expect(run(CMD_FLAG, { CASCADE_RUNBOOKS_ENABLED: '1' }).status).toBe(0);
    const off = run(CMD_FLAG, { CASCADE_RUNBOOKS_ENABLED: undefined });
    expect(off.status).not.toBe(0);
    expect(off.stdout).toContain('CASCADE_RUNBOOKS_ENABLED=1');
    expect(run(CMD_FLAG, { CASCADE_RUNBOOKS_ENABLED: '0' }).status).not.toBe(0);
  });

  it('scenario build prints valid JSON steps for both tiers', () => {
    for (const tier of ['smoke', 'rail']) {
      const r = run(CMD_SCENARIO.replace(/ smoke$/, ` ${tier}`));
      expect(r.status, r.stderr).toBe(0);
      const s = JSON.parse(r.stdout);
      expect(s.tier).toBe(tier);
      expect(s.allowedApps).toEqual(['Cascade Desktop']);
      expect(Array.isArray(s.steps) && s.steps.length > 0).toBe(true);
      for (const st of s.steps) expect(typeof st.location).toBe('string');
    }
    expect(run(CMD_SCENARIO.replace(/ smoke$/, ' bogus')).status).toBe(2);
  });

  it('plan and receipt run on sample results + open findings', () => {
    const scen = JSON.parse(run(CMD_SCENARIO).stdout);
    const results = {
      tier: 'smoke',
      nonce: scen.nonce,
      appBuild: '0.1.25 (6694)',
      startedAt: '2026-11-16T10:00:00Z',
      steps: scen.steps.map((st: { id: string }, i: number) => ({
        ...st,
        status: i === 1 ? 'fail' : 'pass',
        seen: i === 1 ? 'error screen' : 'as expected',
      })),
    };
    const failingId = scen.steps[1].id;
    writeFileSync(join(runDir, 'results.json'), JSON.stringify(results));
    writeFileSync(
      join(runDir, 'open.json'),
      JSON.stringify([{ id: 'open-1', title: `Studio check [smoke/${scen.steps[0].id}] failed` }]),
    );

    const plan = run(CMD_PLAN);
    expect(plan.status, plan.stderr).toBe(0);
    const p = JSON.parse(plan.stdout);
    expect(p.file.map((f: { title: string }) => f.title)).toEqual([`Studio check [smoke/${failingId}] failed`]);
    expect(p.archive).toEqual(['open-1']);

    const rec = run(CMD_RECEIPT);
    expect(rec.status, rec.stderr).toBe(0);
    const r = JSON.parse(rec.stdout);
    expect(r.allowedApps).toEqual(['Cascade Desktop']);
    expect(r.steps.map((s: { id: string }) => s.id)).toEqual(scen.steps.map((s: { id: string }) => s.id));
    expect(r.result.success).toBe(false);
  });
});
