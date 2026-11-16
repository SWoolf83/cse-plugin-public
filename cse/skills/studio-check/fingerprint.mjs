/**
 * fingerprint.mjs — a pinned plain-JS copy of the fleet finding fingerprint
 * (packages/substrate-core/src/fleet/fingerprint.ts), so the installed plugin can
 * compute it with bare node. Parity is asserted against
 * packages/substrate-core/tests/fleet/fingerprint-vectors.json in report.test.ts.
 *
 *   fingerprint = sha256hex(path + "\n" + normalise(text))
 *   normalise   = collapse every whitespace run to one space, trim, lowercase
 */

import { createHash } from 'node:crypto';

/** Collapse whitespace runs to a single space, trim, lowercase. */
export function normaliseFindingText(text) {
  return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** sha256 hex of `path + '\n' + normaliseFindingText(text)`. `path` is used verbatim. */
export function fingerprintFinding(path, text) {
  return createHash('sha256')
    .update(String(path) + '\n' + normaliseFindingText(text), 'utf8')
    .digest('hex');
}
