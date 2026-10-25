/**
 * invocation.ts — the shared, typed Runbook-invocation contract.
 *
 * This is the reuse seam. Every trigger — the CLI trigger now, and future
 * phone/pwa/plugin/daemon triggers — produces the SAME RunbookInvocation object,
 * and BOTH execution tracks (Track A skill, Track B api-loop.ts) consume it.
 *
 * Fail-closed param validation lives here: a slug must be in the code registry and
 * its params must satisfy the Runbook's declared paramSchema, or the invocation is
 * rejected before any actuation.
 */

import { getRunbook, type Runbook } from './runbooks';

/** Where the invocation originated. Only `cli` is wired today; the rest are deferred. */
export type TriggerSource = 'cli' | 'phone' | 'pwa' | 'plugin' | 'daemon';

/**
 * Which actuation engine runs the Runbook:
 *  - `max_mcp`             → Track A: harness computer-use MCP, attended, Max Plan.
 *  - `computer_use_api`    → Track B: Anthropic Computer Use API loop, API-billed.
 *  - `native_deterministic`→ pure native-input execution, no LLM (future/testing).
 */
export type Tier = 'max_mcp' | 'computer_use_api' | 'native_deterministic';

/** Lifecycle of an invocation from creation to terminal state. */
export type Lifecycle =
  | 'pending' // created, not yet validated
  | 'validating' // params being checked against the registry
  | 'rejected' // failed validation / feature flag / gating — never actuated
  | 'running' // actuation in progress
  | 'succeeded' // success criteria met
  | 'failed'; // actuated but did not meet success criteria / errored

/** Validated params: param name → the validated string value. */
export type ValidatedParams = Readonly<Record<string, string>>;

/** A single filmstrip frame reference captured during a run. */
export interface FrameRef {
  /** 0-based ordinal within the run. */
  readonly index: number;
  /** Local path to the captured PNG, when persisted to disk. */
  readonly path?: string;
  /** Base64 PNG payload, when carried in-memory (e.g. Track B tool_result). */
  readonly base64?: string;
  /** What this frame is showing (e.g. "after open_app Finder"). */
  readonly caption: string;
  /** ISO timestamp the frame was captured. */
  readonly capturedAt: string;
}

/** Terminal result of an invocation. */
export interface InvocationResult {
  readonly success: boolean;
  /** Human summary of the outcome. */
  readonly summary: string;
  /** Which of the Runbook's success criteria were judged met. */
  readonly metCriteria: readonly string[];
  /** Number of actuation steps taken. */
  readonly steps: number;
  /** Reason the run failed / was rejected, if applicable. */
  readonly error?: string;
}

/** The shared invocation object. Produced by any trigger, consumed by any track. */
export interface RunbookInvocation {
  readonly slug: string;
  readonly params: ValidatedParams;
  readonly triggerSource: TriggerSource;
  readonly tier: Tier;
  readonly allowedApps: readonly string[];
  readonly goal: string;
  readonly guardrails: readonly string[];
  readonly successCriteria: readonly string[];
  lifecycle: Lifecycle;
  frames: FrameRef[];
  result?: InvocationResult;
}

/** Discriminated result of param validation — fail closed. */
export type ValidationOutcome =
  | { readonly ok: true; readonly params: ValidatedParams }
  | { readonly ok: false; readonly error: string };

/**
 * Validate raw params against a Runbook's declared schema. FAIL CLOSED:
 *  - reject any param key not declared in the schema (no smuggled instructions),
 *  - reject a missing/empty required param,
 *  - reject a non-string value,
 *  - reject a string over the declared maxLength.
 */
export function validateParams(
  runbook: Runbook,
  rawParams: Readonly<Record<string, unknown>>,
): ValidationOutcome {
  const schema = runbook.paramSchema;

  // Reject unknown params outright — the schema is the whole contract.
  for (const key of Object.keys(rawParams)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) {
      return { ok: false, error: `Unknown param "${key}" for runbook "${runbook.slug}"` };
    }
  }

  const validated: Record<string, string> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const provided = Object.prototype.hasOwnProperty.call(rawParams, name)
      ? rawParams[name]
      : undefined;

    if (provided === undefined || provided === null) {
      if (spec.required) {
        return { ok: false, error: `Missing required param "${name}"` };
      }
      continue;
    }

    if (typeof provided !== 'string') {
      return { ok: false, error: `Param "${name}" must be a string` };
    }
    if (spec.required && provided.trim().length === 0) {
      return { ok: false, error: `Param "${name}" must not be empty` };
    }
    if (spec.maxLength !== undefined && provided.length > spec.maxLength) {
      return {
        ok: false,
        error: `Param "${name}" exceeds maxLength ${spec.maxLength}`,
      };
    }
    validated[name] = provided;
  }

  return { ok: true, params: Object.freeze(validated) };
}

/** Discriminated result of resolving a full invocation. */
export type ResolveOutcome =
  | { readonly ok: true; readonly invocation: RunbookInvocation }
  | { readonly ok: false; readonly error: string };

/**
 * Resolve a (slug, rawParams, triggerSource, tier) into a validated
 * RunbookInvocation, pulling goal/guardrails/allowedApps/successCriteria FROM CODE.
 * FAIL CLOSED on unknown slug or invalid params — nothing downstream should ever
 * receive an invocation for an unknown slug or unvalidated params.
 */
export function resolveInvocation(
  slug: string,
  rawParams: Readonly<Record<string, unknown>>,
  triggerSource: TriggerSource,
  tier: Tier,
): ResolveOutcome {
  const runbook = getRunbook(slug);
  if (!runbook) {
    return { ok: false, error: `Unknown runbook slug "${slug}"` };
  }

  const validation = validateParams(runbook, rawParams);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const invocation: RunbookInvocation = {
    slug: runbook.slug,
    params: validation.params,
    triggerSource,
    tier,
    // Everything below is copied FROM CODE — never from the trigger.
    allowedApps: runbook.allowedApps,
    goal: runbook.goal,
    guardrails: runbook.guardrails,
    successCriteria: runbook.successCriteria,
    lifecycle: 'validating',
    frames: [],
  };

  return { ok: true, invocation };
}
