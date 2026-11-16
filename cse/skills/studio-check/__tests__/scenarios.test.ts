/**
 * scenarios.test.ts — shape, guardrails and nonce rules for the studio-check scenarios.
 *
 * The denylist and location guards are proven by counter-example: each sentence
 * that must be rejected is its own named test, and every shipped step must pass.
 */

import { describe, it, expect } from 'vitest';

import {
  ALLOWED_APPS,
  NONCE_ALPHABET,
  RAIL_QUESTION,
  buildScenario,
  makeNonce,
  reverseText,
  validateScenario,
  validateScenarioStep,
} from '../scenarios.mjs';
import { getRunbook } from '../../run-runbook/runbooks';

const SMOKE_SURFACES = ['Songs', 'Reels', 'Shots', 'LightCraft', 'PhotoCraft', 'Productions', 'Work'];

function okStep(over: Record<string, unknown> = {}) {
  return {
    id: 'x',
    surface: 'Songs',
    instruction: 'Click "Songs" in the left nav.',
    expectation: 'The Songs page renders.',
    location: 'main panel',
    ...over,
  };
}

describe('scenario shape', () => {
  it('smoke visits every free surface incl. the Work Agents tab, and every shipped step validates', () => {
    const s = buildScenario('smoke', { nonce: 'ABCDEF' });
    const surfaces = new Set(s.steps.map((st: { surface: string }) => st.surface));
    for (const name of SMOKE_SURFACES) expect(surfaces.has(name)).toBe(true);
    expect(s.steps.some((st: { id: string }) => st.id === 'nav-work-agents')).toBe(true);
    expect(validateScenario(s)).toEqual({ ok: true, problems: [] });
  });

  it('smoke creates, renames, re-checks after navigating away, and archives as cleanup', () => {
    const s = buildScenario('smoke', { nonce: 'ABCDEF' });
    const ids = s.steps.map((st: { id: string }) => st.id);
    const order = ['create-production', 'title-production', 'rename-production', 'leave-production', 'return-to-production', 'archive-production'];
    const idx = order.map((id) => ids.indexOf(id));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    const title = s.steps.find((st: { id: string }) => st.id === 'title-production');
    const rename = s.steps.find((st: { id: string }) => st.id === 'rename-production');
    const back = s.steps.find((st: { id: string }) => st.id === 'return-to-production');
    expect(title.typedText).toBe('Harness test ABCDEF');
    expect(rename.typedText).toBe('Harness test ABCDEF renamed');
    expect(back.expectation).toContain('Harness test ABCDEF renamed');
    expect(back.location).toBe('production header');
    expect(s.steps.at(-1).cleanup).toBe(true);
  });

  it('rail starts the assistant before asking, never types the title or nonce, and expects the reversed nonce in the reply', () => {
    const nonce = 'XYZ234';
    const s = buildScenario('rail', { nonce });
    const ids = s.steps.map((st: { id: string }) => st.id);
    expect(ids.indexOf('start-assistant')).toBeLessThan(ids.indexOf('ask-title-backwards'));
    const ask = s.steps.find((st: { id: string }) => st.id === 'ask-title-backwards');
    expect(ask.typedText).toBe(RAIL_QUESTION);
    expect(RAIL_QUESTION).not.toContain(nonce);
    expect(RAIL_QUESTION).not.toContain('Harness test');
    expect(ask.expectation).toContain(reverseText(nonce));
    expect(ask.location).toBe('rail assistant reply');
    expect(s.steps.at(-1).id).toBe('archive-production');
    expect(validateScenario(s).ok).toBe(true);
  });

  it('every step carries id, instruction, expectation and a named location', () => {
    for (const tier of ['smoke', 'rail']) {
      for (const st of buildScenario(tier).steps) {
        expect(typeof st.id).toBe('string');
        expect(st.instruction.length).toBeGreaterThan(0);
        expect(st.expectation.length).toBeGreaterThan(0);
        expect(st.location.length).toBeGreaterThan(0);
      }
    }
  });

  it('unknown tier throws', () => {
    expect(() => buildScenario('everything')).toThrow(/unknown tier/);
  });
});

describe('allowedApps parity with runbooks.ts', () => {
  it('ALLOWED_APPS equals the registered allowedApps for studio-smoke and studio-rail', () => {
    expect(ALLOWED_APPS).toEqual(['Cascade Desktop']);
    expect([...ALLOWED_APPS]).toEqual([...getRunbook('studio-smoke')!.allowedApps]);
    expect([...ALLOWED_APPS]).toEqual([...getRunbook('studio-rail')!.allowedApps]);
    expect(buildScenario('smoke').allowedApps).toEqual([...ALLOWED_APPS]);
  });
});

describe('guards', () => {
  it('denylist: rejects "Click Generate video"', () => {
    expect(validateScenarioStep(okStep({ instruction: 'Click Generate video' })).join()).toMatch(/denylist/);
  });

  it('denylist: rejects "click SIGN OUT"', () => {
    expect(validateScenarioStep(okStep({ instruction: 'click SIGN OUT' })).join()).toMatch(/denylist/);
  });

  it('denylist: rejects "Upscale with Topaz"', () => {
    expect(validateScenarioStep(okStep({ instruction: 'Upscale with Topaz' })).join()).toMatch(/denylist/);
  });

  it('denylist: applies to typedText too (log out, ElevenLabs)', () => {
    expect(validateScenarioStep(okStep({ typedText: 'please log out' })).join()).toMatch(/typedText hits the denylist/);
    expect(validateScenarioStep(okStep({ typedText: 'use ElevenLabs' })).join()).toMatch(/denylist/);
  });

  it('denylist: every shipped step passes', () => {
    for (const tier of ['smoke', 'rail']) {
      for (const st of buildScenario(tier).steps) expect(validateScenarioStep(st)).toEqual([]);
    }
  });

  it('location: rejects a rail expectation located in "your message"', () => {
    const rail = buildScenario('rail', { nonce: 'ABCDEF' });
    const ask = rail.steps.find((st: { id: string }) => st.id === 'ask-title-backwards');
    expect(validateScenarioStep({ ...ask, location: 'your message' }).join()).toMatch(/own message/);
  });

  it('location: rejects an expectation with no location', () => {
    expect(validateScenarioStep(okStep({ location: '' })).join()).toMatch(/does not name a location/);
    expect(validateScenarioStep(okStep({ location: undefined })).join()).toMatch(/does not name a location/);
  });
});

describe('nonce', () => {
  it('nonce: is 6 characters from an alphabet with no look-alikes', () => {
    for (const ch of '0O1lI') expect(NONCE_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 200; i++) {
      const n = makeNonce();
      expect(n).toMatch(/^[A-Z2-9]{6}$/);
      for (const ch of n) expect(NONCE_ALPHABET).toContain(ch);
    }
  });

  it('nonce: is fresh per build', () => {
    const seen = new Set(Array.from({ length: 50 }, () => buildScenario('rail').nonce));
    expect(seen.size).toBeGreaterThan(45);
  });
});

describe('denylist — unicode folding (review round)', () => {
  const bad = ['Click Sign‑out', 'Click Sign​out', 'click Log off', 'Click ＳＩＧＮ ＯＵＴ', 'Generate video now'];
  for (const instruction of bad) {
    it(`denylist rejects ${JSON.stringify(instruction)}`, () => {
      expect(validateScenarioStep({ id: 'x', instruction, expectation: 'e', location: 'main panel' }).length).toBeGreaterThan(0);
    });
  }
  it('archive step names the exact throwaway title', () => {
    const smoke = buildScenario('smoke', { nonce: 'ABCDEF' });
    const rail = buildScenario('rail', { nonce: 'ABCDEF' });
    expect(smoke.steps.find((s: { id: string }) => s.id === 'archive-production').instruction).toContain('"Harness test ABCDEF renamed"');
    expect(rail.steps.find((s: { id: string }) => s.id === 'archive-production').instruction).toContain('"Harness test ABCDEF"');
  });
});
