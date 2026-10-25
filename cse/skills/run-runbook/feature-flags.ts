/**
 * feature-flags.ts — the kill switch for the whole run-runbook lane.
 *
 * Mirrors the repo's existing fail-closed env-var flag pattern (e.g.
 * `GITHUB_SYNC_ENABLED` in src/daemon/github-sync.ts, and the retired
 * CASCADE_DAEMON_MODE / CLOUD_EXECUTION_ENABLED daemon guards). This module lives in
 * the cse plugin skills, not cascade-web, so a DB-backed org flag isn't reachable
 * here — an env-var flag is the documented, in-plugin analog. See README.md.
 *
 * Two levels of gating:
 *   1. LANE FLAG  — `CASCADE_RUNBOOKS_ENABLED` gates BOTH tracks. Off ⇒ the whole
 *      lane is inert: no request_access, no API call, no synthetic input.
 *   2. TRACK B    — additionally requires `CASCADE_RUNBOOKS_API_ENABLED` AND an
 *      explicit `ANTHROPIC_API_KEY` (Track B meters as API usage, not Max).
 *
 * All checks FAIL CLOSED: a flag counts as enabled ONLY for the exact strings
 * "1" or "true" (case-insensitive). Unset, empty, or anything else ⇒ disabled.
 */

/** Environment shape the flag checks read from (injectable for tests). */
export type FlagEnv = Readonly<Record<string, string | undefined>>;

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * The lane flag. When false, /cse:run-runbook is inert and no track may actuate.
 * Flipping this off instantly disables everything.
 */
export function isRunbookLaneEnabled(env: FlagEnv = process.env): boolean {
  return truthy(env.CASCADE_RUNBOOKS_ENABLED);
}

/** Result of the Track-B gate, with a machine-readable reason when refused. */
export interface TrackBGate {
  readonly allowed: boolean;
  readonly reason?:
    | 'lane_disabled'
    | 'track_b_disabled'
    | 'missing_api_key';
}

/**
 * Track B (Computer Use API loop) gate. Requires, in order:
 *   1. the lane flag on,
 *   2. the explicit Track-B enable flag on,
 *   3. an explicit ANTHROPIC_API_KEY.
 * Any miss ⇒ refused (fail closed). Track B never runs on the Max Plan credentials.
 */
export function trackBGate(env: FlagEnv = process.env): TrackBGate {
  if (!isRunbookLaneEnabled(env)) return { allowed: false, reason: 'lane_disabled' };
  if (!truthy(env.CASCADE_RUNBOOKS_API_ENABLED)) {
    return { allowed: false, reason: 'track_b_disabled' };
  }
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.trim().length === 0) {
    return { allowed: false, reason: 'missing_api_key' };
  }
  return { allowed: true };
}
