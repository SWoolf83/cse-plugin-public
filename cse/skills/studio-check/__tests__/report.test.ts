/**
 * report.test.ts — fingerprint parity with substrate-core, cross-nonce stability,
 * and the file / skip / archive findings plan.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { fingerprintFinding } from '../fingerprint.mjs';
import { buildReceipt, buildRunReport, findingKey, parseFindingTitle, planFindings } from '../report.mjs';
import { buildScenario } from '../scenarios.mjs';
import { isRunbookLaneEnabled } from '../flag.mjs';
import { isRunbookLaneEnabled as tsFlag } from '../../run-runbook/feature-flags';

const VECTORS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../packages/substrate-core/tests/fleet/fingerprint-vectors.json', import.meta.url)),
    'utf8',
  ),
) as Array<{ path: string; text: string; fingerprint: string }>;

type Step = { id: string; expectation: string; location: string; instruction: string };

function results(tier: string, statuses: Record<string, 'pass' | 'fail' | 'skipped'>, nonce = 'ABCDEF') {
  const s = buildScenario(tier, { nonce });
  return {
    tier,
    nonce,
    appBuild: '0.1.25 (5700)',
    startedAt: '2026-11-16T10:00:00Z',
    steps: s.steps.map((st: Step) => ({
      ...st,
      status: statuses[st.id] ?? 'pass',
      seen: statuses[st.id] === 'fail' ? 'an error screen' : 'as expected',
    })),
  };
}

describe('fingerprint', () => {
  it('matches every substrate-core fleet vector', () => {
    expect(VECTORS.length).toBeGreaterThan(0);
    for (const v of VECTORS) expect(fingerprintFinding(v.path, v.text)).toBe(v.fingerprint);
  });

  it('same (tier, step) → same fingerprint; different step or tier → different', () => {
    expect(findingKey('smoke', 'nav-songs')).toEqual(findingKey('smoke', 'nav-songs'));
    expect(findingKey('smoke', 'nav-songs').fingerprint).not.toBe(findingKey('smoke', 'nav-reels').fingerprint);
    expect(findingKey('smoke', 'archive-production').fingerprint).not.toBe(
      findingKey('rail', 'archive-production').fingerprint,
    );
  });

  it('is stable across runs with different nonces (fingerprint and title per step)', () => {
    for (const tier of ['smoke', 'rail']) {
      const a = buildScenario(tier, { nonce: 'ABCDEF' });
      const b = buildScenario(tier, { nonce: 'XYZ234' });
      expect(a.steps.map((s: Step) => s.id)).toEqual(b.steps.map((s: Step) => s.id));
      // The expectations DO differ (they carry the nonce) — identity must not.
      expect(JSON.stringify(a.steps)).not.toEqual(JSON.stringify(b.steps));
      for (let i = 0; i < a.steps.length; i++) {
        expect(findingKey(tier, a.steps[i].id)).toEqual(findingKey(tier, b.steps[i].id));
      }
      const planA = planFindings(results(tier, { [a.steps[0].id]: 'fail' }, 'ABCDEF'), []);
      const planB = planFindings(results(tier, { [a.steps[0].id]: 'fail' }, 'XYZ234'), []);
      expect(planA.file[0].title).toBe(planB.file[0].title);
      expect(planA.file[0].fingerprint).toBe(planB.file[0].fingerprint);
      expect(planA.file[0].title).toBe(`Studio check [${tier}/${a.steps[0].id}] failed`);
    }
  });

  it('title round-trips through the parser', () => {
    expect(parseFindingTitle(findingKey('rail', 'ask-title-backwards').title)).toEqual({
      tier: 'rail',
      stepId: 'ask-title-backwards',
    });
    expect(parseFindingTitle('Something else entirely')).toBeNull();
  });
});

describe('planFindings', () => {
  it('files a new finding for a fresh failure', () => {
    const plan = planFindings(results('smoke', { 'nav-reels': 'fail' }), []);
    expect(plan.file).toHaveLength(1);
    expect(plan.file[0]).toMatchObject({
      title: 'Studio check [smoke/nav-reels] failed',
      topic_slug: 'studio-check',
      importance: 'normal',
      no_ladder_target: true,
    });
    expect(plan.file[0].detail).toContain('an error screen');
    expect(plan.file[0].detail).toContain('0.1.25 (5700)');
    expect(plan.skip).toEqual([]);
    expect(plan.archive).toEqual([]);
  });

  it('skips a duplicate when the same step already has an open finding', () => {
    const open = [{ id: 'f-1', title: 'Studio check [smoke/nav-reels] failed' }];
    const plan = planFindings(results('smoke', { 'nav-reels': 'fail' }, 'QRSTUV'), open);
    expect(plan.file).toEqual([]);
    expect(plan.skip).toEqual([{ stepId: 'nav-reels', title: 'Studio check [smoke/nav-reels] failed', ids: ['f-1'] }]);
  });

  it('archives an open finding when its step passes', () => {
    const open = [
      { id: 'f-1', title: 'Studio check [smoke/nav-reels] failed' },
      { id: 'f-2', title: 'Studio check [rail/nav-reels] failed' },
      { id: 'f-3', title: 'Unrelated finding' },
    ];
    const plan = planFindings(results('smoke', {}), open);
    expect(plan.archive).toEqual(['f-1']);
  });

  it('a skipped step neither files nor archives', () => {
    const open = [{ id: 'f-1', title: 'Studio check [smoke/nav-reels] failed' }];
    const plan = planFindings(results('smoke', { 'nav-reels': 'skipped', 'nav-songs': 'skipped' }), open);
    expect(plan).toMatchObject({ file: [], skip: [], archive: [] });
  });

  it('an all-pass run with no open findings is an empty plan', () => {
    expect(planFindings(results('rail', {}), [])).toEqual({ tier: 'rail', file: [], skip: [], archive: [] });
  });
});

describe('report + receipt', () => {
  it('counts steps and marks the run ok only when nothing failed or skipped', () => {
    expect(buildRunReport(results('smoke', {})).ok).toBe(true);
    const r = buildRunReport(results('smoke', { 'nav-songs': 'fail' }));
    expect(r.ok).toBe(false);
    expect(r.failed).toBe(1);
  });

  it('receipt carries the run steps, allowedApps and the run-runbook receipt fields', () => {
    const rec = buildReceipt(results('rail', { 'ask-title-backwards': 'fail' }));
    expect(rec.slug).toBe('studio-rail');
    expect(rec.allowedApps).toEqual(['Cascade Desktop']);
    expect(rec.steps.length).toBe(buildScenario('rail').steps.length);
    expect(rec.result.success).toBe(false);
    for (const k of ['params', 'tier', 'triggerSource', 'frames', 'steps', 'result', 'assembledAt']) {
      expect(rec).toHaveProperty(k);
    }
  });
});

describe('flag.mjs', () => {
  it('agrees with feature-flags.ts on every value', () => {
    for (const v of [undefined, '', '0', 'nope', 'yes', '1', 'true', 'TRUE', ' 1 ']) {
      const env = { CASCADE_RUNBOOKS_ENABLED: v };
      expect(isRunbookLaneEnabled(env)).toBe(tsFlag(env));
    }
  });
});
