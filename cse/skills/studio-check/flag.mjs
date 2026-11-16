#!/usr/bin/env node
/**
 * flag.mjs — the run-runbook lane kill switch, in plain JS for bare node.
 *
 * Same rule as cse/skills/run-runbook/feature-flags.ts isRunbookLaneEnabled():
 * enabled ONLY when CASCADE_RUNBOOKS_ENABLED is "1" or "true" (case-insensitive,
 * trimmed). Anything else — unset, empty, "0", "yes" — is disabled (fail closed).
 *
 * CLI: `node flag.mjs` exits 0 when enabled, 1 when disabled (and prints why).
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isRunbookLaneEnabled(env = process.env) {
  const value = env.CASCADE_RUNBOOKS_ENABLED;
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true';
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
  if (isRunbookLaneEnabled()) {
    console.log('Runbook lane enabled (CASCADE_RUNBOOKS_ENABLED is on).');
    process.exit(0);
  }
  console.log(
    'Runbook lane is disabled: CASCADE_RUNBOOKS_ENABLED is not set to 1. ' +
      'To enable it, start Claude Code with CASCADE_RUNBOOKS_ENABLED=1 in the environment.',
  );
  process.exit(1);
}
