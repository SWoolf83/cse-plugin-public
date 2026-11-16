#!/usr/bin/env node
/**
 * report.mjs — turns a studio-check run's step results into a run report, a
 * findings plan, and a receipt. Plain ESM JS, runnable with bare node.
 *
 * Results JSON (what the skill writes after judging each step):
 *   {
 *     tier: 'smoke' | 'rail', nonce, appBuild, startedAt, finishedAt?,
 *     steps: [{ id, instruction?, expectation, location,
 *               status: 'pass' | 'fail' | 'skipped', seen }]
 *   }
 *
 * Finding identity covers ONLY (tier, step id). The expectation carries the run's
 * nonce, so using it would make the same failure a new finding on every run.
 *   title       = 'Studio check [<tier>/<step id>] failed'
 *   fingerprint = fingerprintFinding('studio-check/<tier>', '<step id>')
 *
 * CLI:
 *   node report.mjs plan <results.json> <open.json>   → findings plan JSON
 *   node report.mjs receipt <results.json>            → receipt JSON
 *   node report.mjs summary <results.json>            → run report JSON
 * open.json is an array of {id, title} for OPEN studio-check findings.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { fingerprintFinding } from './fingerprint.mjs';
import { ALLOWED_APPS } from './scenarios.mjs';

export const TITLE_PREFIX = 'Studio check [';
export const TOPIC_SLUG = 'studio-check';
const TITLE_RE = /^Studio check \[([^/\]]+)\/([^\]]+)\] failed$/;

/** The stable identity of a (tier, step) failure. Never takes the expectation. */
export function findingKey(tier, stepId) {
  return {
    fingerprint: fingerprintFinding(`studio-check/${tier}`, stepId),
    title: `Studio check [${tier}/${stepId}] failed`,
  };
}

/** Parse a finding title back to {tier, stepId}, or null when it is not ours. */
export function parseFindingTitle(title) {
  const m = TITLE_RE.exec(String(title ?? '').trim());
  return m ? { tier: m[1], stepId: m[2] } : null;
}

function stepsOf(results) {
  return Array.isArray(results?.steps) ? results.steps : [];
}

/** A run report: counts plus one row per step. */
export function buildRunReport(results, meta = {}) {
  const tier = meta.tier ?? results?.tier;
  const steps = stepsOf(results).map((s) => ({
    id: s.id,
    status: s.status,
    location: s.location,
    expectation: s.expectation,
    seen: s.seen ?? '',
  }));
  const count = (st) => steps.filter((s) => s.status === st).length;
  const failed = count('fail');
  return {
    tier,
    appBuild: meta.appBuild ?? results?.appBuild ?? 'unknown',
    startedAt: meta.startedAt ?? results?.startedAt ?? null,
    passed: count('pass'),
    failed,
    skipped: count('skipped'),
    ok: failed === 0 && steps.length > 0 && count('skipped') === 0,
    steps,
  };
}

/**
 * The findings plan.
 *   file    — failing steps with no open finding: drafts for cascade_log_finding
 *   skip    — failing steps that already have an open finding (duplicate)
 *   archive — ids of open findings for THIS tier whose step passed this run
 * Steps that did not run (skipped) neither file nor archive anything, and open
 * findings for the other tier are left alone.
 */
export function planFindings(results, openFindings = []) {
  const tier = results?.tier;
  const appBuild = results?.appBuild ?? 'unknown';
  const open = new Map();
  for (const f of Array.isArray(openFindings) ? openFindings : []) {
    const parsed = parseFindingTitle(f?.title);
    if (!parsed || parsed.tier !== tier) continue;
    const list = open.get(parsed.stepId) ?? [];
    list.push(f.id);
    open.set(parsed.stepId, list);
  }

  const plan = { tier, file: [], skip: [], archive: [] };
  for (const s of stepsOf(results)) {
    const key = findingKey(tier, s.id);
    if (s.status === 'fail') {
      const existing = open.get(s.id);
      if (existing && existing.length) {
        plan.skip.push({ stepId: s.id, title: key.title, ids: existing });
      } else {
        plan.file.push({
          stepId: s.id,
          title: key.title,
          fingerprint: key.fingerprint,
          topic_slug: TOPIC_SLUG,
          importance: 'normal',
          no_ladder_target: true,
          description: `The studio-check ${tier} step "${s.id}" failed in Cascade Desktop.`,
          detail: [
            `Step: ${tier}/${s.id}`,
            s.instruction ? `Instruction: ${s.instruction}` : null,
            `Expected (at ${s.location ?? 'unnamed location'}): ${s.expectation ?? ''}`,
            `Seen: ${s.seen ?? '(nothing recorded)'}`,
            `App build: ${appBuild}`,
            `Fingerprint: ${key.fingerprint}`,
          ]
            .filter(Boolean)
            .join('\n'),
        });
      }
    } else if (s.status === 'pass') {
      for (const id of open.get(s.id) ?? []) plan.archive.push(id);
    }
  }
  return plan;
}

/**
 * The receipt — the run-runbook Receipt shape (slug, params, tier, triggerSource,
 * frames, steps, result, assembledAt) plus studio-check fields. Frames are text
 * frames in v1: what was seen at each step's location, no screenshots.
 */
export function buildReceipt(results, meta = {}) {
  const report = buildRunReport(results, meta);
  const at = new Date().toISOString();
  const steps = stepsOf(results);
  return {
    slug: `studio-${report.tier}`,
    runLabel: `Studio check ${report.tier} — ${report.appBuild} — ${report.startedAt ?? at}`,
    studioTier: report.tier,
    appBuild: report.appBuild,
    nonce: results?.nonce ?? null,
    allowedApps: [...ALLOWED_APPS],
    params: {},
    tier: 'max_mcp',
    triggerSource: 'plugin',
    frames: steps.map((s, i) => ({
      index: i,
      caption: `${s.id} @ ${s.location ?? 'unnamed location'}: ${s.seen ?? ''}`,
      capturedAt: s.at ?? at,
    })),
    steps: steps.map((s, i) => ({
      index: i,
      id: s.id,
      action: s.instruction ?? s.id,
      status: s.status,
      ok: s.status === 'pass',
      frameIndex: i,
      expectation: s.expectation,
      location: s.location,
      seen: s.seen ?? '',
    })),
    result: {
      success: report.ok,
      summary: `${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`,
      metCriteria: report.ok ? ['Every scenario step was judged pass from the screen at its named location.'] : [],
      steps: steps.length,
      ...(report.ok ? {} : { error: `${report.failed} step(s) failed` }),
    },
    assembledAt: at,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function invokedDirectly() {
  try {
    return (
      !!process.argv[1] &&
      realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'plan' && a && b) {
      console.log(JSON.stringify(planFindings(readJson(a), readJson(b)), null, 2));
    } else if (cmd === 'receipt' && a) {
      console.log(JSON.stringify(buildReceipt(readJson(a)), null, 2));
    } else if (cmd === 'summary' && a) {
      console.log(JSON.stringify(buildRunReport(readJson(a)), null, 2));
    } else {
      console.error(
        'usage: node report.mjs plan <results.json> <open.json> | receipt <results.json> | summary <results.json>',
      );
      process.exit(2);
    }
  } catch (err) {
    console.error(`report.mjs: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
