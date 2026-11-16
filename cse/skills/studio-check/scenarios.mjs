#!/usr/bin/env node
/**
 * scenarios.mjs — the code-defined test scenarios for /cse:studio-check.
 *
 * Plain ESM JavaScript, no build step, no imports outside node: builtins, so an
 * installed plugin copy runs it with bare `node`.
 *
 * Two tiers:
 *   smoke — visit every free Creator Studio surface; create, rename, re-check and
 *           archive one throwaway production.
 *   rail  — create the same throwaway production, start its assistant, and ask the
 *           rail's Claude for the production's title written backwards WITHOUT
 *           typing the title or the nonce. Pass only when the reversed nonce shows
 *           in the rail assistant's reply.
 *
 * Every step names WHERE its expectation is judged (`location`). That location is
 * never the user's own typed message: text the harness typed itself proves nothing.
 *
 * Step shape:
 *   { id, surface, instruction, typedText?, keys?, expectation, location, cleanup? }
 *   - instruction: clicks only, plus typing `typedText` verbatim (and pressing
 *     `keys`, e.g. Return to commit a field). Nothing else.
 *   - cleanup: true marks steps that MUST run even after an earlier failure.
 *
 * CLI:  node scenarios.mjs <smoke|rail>   → prints {tier, nonce, allowedApps, steps} JSON
 *       exits 2 on an unknown tier, 3 if a built scenario fails validation.
 */

import { randomInt } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The ONLY app a studio-check run may touch. Mirrors runbooks.ts (test-asserted). */
export const ALLOWED_APPS = Object.freeze(['Cascade Desktop']);

export const TIERS = Object.freeze(['smoke', 'rail']);

/** Nonce alphabet: no look-alikes (no 0/O, 1/l/I). */
export const NONCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const NONCE_LENGTH = 6;

/** A fresh 6-character nonce from the look-alike-free alphabet. */
export function makeNonce() {
  let out = '';
  for (let i = 0; i < NONCE_LENGTH; i++) {
    out += NONCE_ALPHABET[randomInt(NONCE_ALPHABET.length)];
  }
  return out;
}

export function productionTitle(nonce) {
  return `Harness test ${nonce}`;
}

export function reverseText(s) {
  return Array.from(s).reverse().join('');
}

/** The question asked in the rail. Contains neither the title nor the nonce. */
export const RAIL_QUESTION =
  'What is the exact title of this production? Reply with only that title written backwards.';

/**
 * Paid generation and sign-out. Matched case-insensitively against a step's
 * instruction AND its typedText.
 */
export const DENYLIST = Object.freeze([
  /\bgenerat(e|es|ed|ing)\b[^.]{0,40}\b(images?|videos?|audio|voices?|music)\b/i,
  /\brender\b[^.]{0,20}\bwith\s+ai\b/i,
  /\bupscal(e|es|ed|ing)\b/i,
  /\btopaz\b/i,
  /\bsora\b/i,
  /\bveo\b/i,
  /\beleven\s*labs\b/i,
  /\bsign[\s-]*(out|off)\b/i,
  /\blog[\s-]*(out|off)\b/i,
]);

/**
 * Fold text before the denylist runs: NFKC (full-width letters, ligatures),
 * zero-width characters removed, every Unicode dash/hyphen and space variant
 * mapped to its ASCII form. So "Sign\u2011out" and "Sign\u200bout" are caught.
 */
export function foldForDenylist(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '')
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ');
}

/** A location that points at the user's own message (or the composer). */
const OWN_MESSAGE_LOCATION =
  /\b(your|my|user'?s?|own|sent|typed)\b[^,.]{0,20}\b(message|prompt|input|text)\b|\bcomposer\b|\binput box\b|\bchat input\b/i;

/**
 * Validate one step. Returns a list of human-readable problems (empty = valid).
 */
export function validateScenarioStep(step) {
  const problems = [];
  if (!step || typeof step !== 'object') return ['step is not an object'];
  const id = typeof step.id === 'string' && step.id.trim() ? step.id : '(no id)';
  if (id === '(no id)') problems.push('step has no id');
  if (typeof step.instruction !== 'string' || !step.instruction.trim()) {
    problems.push(`${id}: no instruction`);
  }
  if (typeof step.expectation !== 'string' || !step.expectation.trim()) {
    problems.push(`${id}: no expectation`);
  }
  for (const field of ['instruction', 'typedText']) {
    const text = step[field];
    if (typeof text !== 'string') continue;
    const folded = foldForDenylist(text);
    for (const re of DENYLIST) {
      if (re.test(folded)) {
        problems.push(`${id}: ${field} hits the denylist (${re.source}): "${text}"`);
      }
    }
  }
  if (typeof step.location !== 'string' || !step.location.trim()) {
    problems.push(`${id}: expectation does not name a location`);
  } else if (OWN_MESSAGE_LOCATION.test(step.location)) {
    problems.push(`${id}: location is the user's own message ("${step.location}")`);
  }
  if (step.keys !== undefined) {
    const ok =
      Array.isArray(step.keys) &&
      step.keys.every((k) => typeof k === 'string' && /^(Return|Escape|Tab)$/.test(k));
    if (!ok) problems.push(`${id}: keys may only be Return, Escape or Tab`);
  }
  return problems;
}

/** Validate a whole scenario. Returns {ok, problems}. */
export function validateScenario(scenario) {
  const problems = [];
  if (!scenario || !Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    return { ok: false, problems: ['scenario has no steps'] };
  }
  const seen = new Set();
  for (const step of scenario.steps) {
    if (seen.has(step.id)) problems.push(`duplicate step id ${step.id}`);
    seen.add(step.id);
    problems.push(...validateScenarioStep(step));
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const MAIN = 'main panel';
const HEADER = 'production header';

function navStep(id, label, extra = '') {
  return {
    id,
    surface: label,
    instruction: `Click "${label}" in the left nav.${extra ? ' ' + extra : ''}`,
    expectation: `The ${label} page renders its heading and content: no error screen, no endless spinner, no blank panel.`,
    location: MAIN,
  };
}

/** Create a throwaway production and title it "Harness test <nonce>". */
function createProductionSteps(title) {
  return [
    navStep('open-productions', 'Productions'),
    {
      id: 'create-production',
      surface: 'Productions',
      instruction: 'Click the "New production" button.',
      expectation: 'A new production opens, showing its title in the header.',
      location: HEADER,
    },
    {
      id: 'title-production',
      surface: 'Productions',
      instruction:
        'Click the production title in the header to edit it, triple-click the title field to select its text, type the step text, then press Return.',
      typedText: title,
      keys: ['Return'],
      expectation: `The production header shows the title "${title}".`,
      location: HEADER,
    },
  ];
}

function archiveStep(title) {
  return {
    id: 'archive-production',
    surface: 'Productions',
    instruction: `Open the throwaway production titled "${title}" (created by this run; no other production) and click "Archive" in its header.`,
    expectation: 'The header button now reads "Unarchive" (the production is archived).',
    location: HEADER,
    cleanup: true,
  };
}

function smokeSteps(nonce) {
  const title = productionTitle(nonce);
  const renamed = `${title} renamed`;
  return [
    navStep('nav-songs', 'Songs'),
    navStep('nav-reels', 'Reels'),
    navStep('nav-shots', 'Shots'),
    navStep('nav-lightcraft', 'LightCraft'),
    navStep('nav-photocraft', 'PhotoCraft'),
    navStep('nav-work', 'Work'),
    {
      id: 'nav-work-agents',
      surface: 'Work',
      instruction: 'Click the "Agents" tab on the Work page.',
      expectation: 'The Agents tab renders its content: no error screen, no blank panel.',
      location: MAIN,
    },
    ...createProductionSteps(title),
    {
      id: 'rename-production',
      surface: 'Productions',
      instruction:
        'Click the production title in the header, triple-click the title field to select its text, type the step text, then press Return.',
      typedText: renamed,
      keys: ['Return'],
      expectation: `The production header shows the title "${renamed}".`,
      location: HEADER,
    },
    navStep('leave-production', 'Songs'),
    {
      id: 'return-to-production',
      surface: 'Productions',
      instruction: `Click "Productions" in the left nav, then click the card titled "${renamed}".`,
      expectation: `The production header still shows the renamed title "${renamed}".`,
      location: HEADER,
    },
    archiveStep(renamed),
  ];
}

function railSteps(nonce) {
  const title = productionTitle(nonce);
  return [
    ...createProductionSteps(title),
    {
      id: 'start-assistant',
      surface: 'Productions',
      instruction: 'Click "Start the assistant" on the production page.',
      expectation: 'The assistant rail opens beside the production with a message box ready.',
      location: 'assistant rail',
    },
    {
      id: 'ask-title-backwards',
      surface: 'Productions',
      instruction:
        'Click the message box in the assistant rail, type the step text, then press Return. Wait for the reply to finish.',
      typedText: RAIL_QUESTION,
      keys: ['Return'],
      expectation: `The assistant's reply contains "${reverseText(nonce)}" (the nonce written backwards; the full reversed title is "${reverseText(title)}").`,
      location: 'rail assistant reply',
    },
    archiveStep(title),
  ];
}

/**
 * Build a tier's scenario. `nonce` is optional (a fresh one is made).
 * Throws on an unknown tier.
 */
export function buildScenario(tier, { nonce = makeNonce() } = {}) {
  if (!TIERS.includes(tier)) throw new Error(`unknown tier "${tier}" (expected smoke|rail)`);
  const steps = tier === 'smoke' ? smokeSteps(nonce) : railSteps(nonce);
  return {
    tier,
    nonce,
    title: productionTitle(nonce),
    allowedApps: [...ALLOWED_APPS],
    steps,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

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

const isMain = invokedDirectly();
if (isMain) {
  const tier = process.argv[2];
  if (!TIERS.includes(tier)) {
    console.error(`usage: node scenarios.mjs <smoke|rail>  (got "${tier ?? ''}")`);
    process.exit(2);
  }
  const scenario = buildScenario(tier);
  const v = validateScenario(scenario);
  if (!v.ok) {
    console.error('scenario failed validation:\n' + v.problems.join('\n'));
    process.exit(3);
  }
  console.log(JSON.stringify(scenario, null, 2));
}
