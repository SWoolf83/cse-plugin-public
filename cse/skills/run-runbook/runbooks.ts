/**
 * runbooks.ts — the frozen, in-code Runbook allowlist.
 *
 * SECURITY BOUNDARY (instructions-as-data): a trigger ever only names a Runbook
 * `slug` + typed `params`. A Runbook's goal, guardrails, allowed apps, and success
 * criteria live HERE, in code — never in a trigger. This is the single source of
 * truth shared by BOTH execution tracks:
 *   - Track A: the /cse:run-runbook skill driving the harness computer-use MCP
 *              (attended, Max Plan).
 *   - Track B: the Anthropic Computer Use API loop (api-loop.ts, off by default).
 *
 * Any slug not present in this registry, and any params that fail the Runbook's
 * declared paramSchema, are rejected BEFORE any actuation (fail closed). App
 * scoping / request_access only ever uses a Runbook's declared `allowedApps`.
 */

/** A single typed parameter in a Runbook's param schema. */
export interface ParamSpec {
  /** Only 'string' is supported today; kept explicit so the schema is validatable. */
  readonly type: 'string';
  /** Whether the param must be present + non-empty. */
  readonly required: boolean;
  /** Human description of the param (used in prompts / receipts). */
  readonly description: string;
  /** Optional hard cap on string length (defense-in-depth against huge inputs). */
  readonly maxLength?: number;
}

/** A Runbook's param schema: param name → spec. */
export type ParamSchema = Readonly<Record<string, ParamSpec>>;

/** A vetted unit of intent. Defined in code; a trigger only references it by slug. */
export interface Runbook {
  /** Stable, human-typable identifier (kebab-case). Immutable once shipped. */
  readonly slug: string;
  /** Human-readable title for receipts / UI. */
  readonly title: string;
  /** Typed, validatable parameter schema. */
  readonly paramSchema: ParamSchema;
  /**
   * The ONLY apps this Runbook is ever allowed to touch. request_access (Track A)
   * and app scoping (Track B) MUST derive from this list — never from a trigger.
   */
  readonly allowedApps: readonly string[];
  /** What the run is trying to accomplish (fed to the executor as the goal). */
  readonly goal: string;
  /** Hard constraints the executor must respect (surfaced in the goal prompt). */
  readonly guardrails: readonly string[];
  /** Objective, checkable criteria that mean the run succeeded. */
  readonly successCriteria: readonly string[];
}

/**
 * The two proof Runbooks. Both are scoped so no app outside `allowedApps` is ever
 * needed to satisfy the goal.
 */
const REGISTRY = {
  'open-app': {
    slug: 'open-app',
    title: 'Open an application',
    paramSchema: {
      appName: {
        type: 'string',
        required: true,
        description: 'The exact name of the application to bring to the foreground.',
        maxLength: 120,
      },
    },
    // Finder is the actuation surface used to launch/foreground an app on macOS.
    allowedApps: ['Finder'],
    goal:
      'Open the application named by the `appName` param and confirm its main window is frontmost.',
    guardrails: [
      'Only open the single application named in `appName`.',
      'Do not type into, click within, or otherwise modify the opened app — opening is the whole task.',
      'Do not touch any app other than the ones in allowedApps and the target app itself.',
    ],
    successCriteria: [
      'The application named in `appName` is running and its window is frontmost.',
    ],
  },
  'type-into-notes': {
    slug: 'type-into-notes',
    title: 'Type text into Notes',
    paramSchema: {
      text: {
        type: 'string',
        required: true,
        description: 'The literal text to type into a new Notes note.',
        maxLength: 2000,
      },
    },
    allowedApps: ['Notes'],
    goal:
      'In the Notes app, create/select a note and type the literal `text` param into it.',
    guardrails: [
      'Only interact with the Notes app.',
      'Type the text verbatim; do not summarize, translate, or edit it.',
      'Do not delete or modify existing notes beyond adding the requested text.',
    ],
    successCriteria: [
      'The Notes app is frontmost and contains a note whose body includes the exact `text`.',
    ],
  },
} as const;

/** The frozen public registry. Deep-frozen so it cannot be mutated at runtime. */
export const RUNBOOKS: Readonly<Record<string, Runbook>> = deepFreeze(REGISTRY);

/** All known Runbook slugs (the allowlist). */
export type RunbookSlug = keyof typeof REGISTRY;

/**
 * Resolve a slug to its Runbook. Returns `undefined` for any unknown slug — the
 * caller MUST fail closed on undefined (no actuation for unknown slugs).
 */
export function getRunbook(slug: string): Runbook | undefined {
  return Object.prototype.hasOwnProperty.call(RUNBOOKS, slug)
    ? RUNBOOKS[slug]
    : undefined;
}

/** True iff `slug` is in the allowlist. */
export function isKnownSlug(slug: string): boolean {
  return getRunbook(slug) !== undefined;
}

/** Recursively freeze an object graph (arrays + nested objects included). */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        deepFreeze(value);
      }
    }
    Object.freeze(obj);
  }
  return obj;
}
