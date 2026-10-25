/**
 * api-loop.ts — Track B: the Anthropic Computer Use API agent loop.
 *
 * Built now, used someday. Runs the SAME Runbook as Track A WITHOUT the harness MCP:
 *
 *   screencapture → Messages API (tool computer_20251124, beta computer-use-2025-11-24,
 *   model claude-opus-4-8) → parse the returned tool_use action → execute via
 *   native-input.ts → append the new screenshot as a tool_result → loop until the
 *   Runbook's successCriteria are met or a max-step cap is hit.
 *
 * This is a CLIENT-SIDE tool loop: the API returns actions, our harness executes
 * them. There is no built-in per-action human gate — the only permission is OS-level
 * macOS TCC, durable for a signed app.
 *
 * GATED HARD (fail closed): refuses to run unless the lane flag is on AND
 * CASCADE_RUNBOOKS_API_ENABLED is on AND an explicit ANTHROPIC_API_KEY is present
 * (Track B meters as API usage, not Max). See feature-flags.ts.
 *
 * The Anthropic client is dependency-injected via a minimal structural interface
 * (`AnthropicClientLike`) so this compiles + unit-tests against a MOCKED client with
 * no @anthropic-ai/sdk import and no token spend. `createAnthropicClient()` builds a
 * real client (dynamic import) only when actually enabled.
 */

import { trackBGate, type FlagEnv } from './feature-flags';
import {
  resolveInvocation,
  type FrameRef,
  type InvocationResult,
  type RunbookInvocation,
} from './invocation';
import type { NativeInput } from './native-input';
import {
  assembleReceipt,
  persistReceipt,
  type ArtifactCreator,
  type PersistedReceipt,
  type StepOutcome,
} from './receipt';

/** The pinned Computer Use tool contract (do not drift these strings). */
export const COMPUTER_TOOL_TYPE = 'computer_20251124';
export const COMPUTER_USE_BETA = 'computer-use-2025-11-24';
export const MODEL = 'claude-opus-4-8';

/** A computer tool_use action the API can return. */
export interface ComputerAction {
  /** e.g. 'screenshot' | 'left_click' | 'type' | 'key' | 'mouse_move' | 'wait'. */
  readonly action: string;
  /** [x, y] for coordinate actions. */
  readonly coordinate?: readonly [number, number];
  /** text for `type` / key chord for `key`. */
  readonly text?: string;
}

/** A tool_use content block from the model. */
export interface ToolUseBlock {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string; // 'computer'
  readonly input: ComputerAction;
}

/** A text content block from the model. */
export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export type ContentBlock = ToolUseBlock | TextBlock | { readonly type: string };

/** The subset of a Messages API response we consume. */
export interface MessageResponse {
  readonly stop_reason: string; // 'tool_use' | 'end_turn' | ...
  readonly content: readonly ContentBlock[];
}

/** Minimal structural interface over the Anthropic SDK's beta messages create. */
export interface AnthropicClientLike {
  readonly beta: {
    readonly messages: {
      create(params: {
        model: string;
        max_tokens: number;
        betas: readonly string[];
        tools: readonly unknown[];
        messages: readonly unknown[];
      }): Promise<MessageResponse>;
    };
  };
}

/**
 * Judge whether the run has met its success criteria. Injectable so tests can drive
 * it deterministically. Default: the model ending its turn (`end_turn`) counts as
 * done — the model stops acting once the goal is satisfied.
 */
export type SuccessEvaluator = (args: {
  invocation: RunbookInvocation;
  stopReason: string;
  lastText: string;
  frames: readonly FrameRef[];
}) => boolean;

const defaultSuccessEvaluator: SuccessEvaluator = ({ stopReason }) =>
  stopReason === 'end_turn';

export interface ApiLoopOptions {
  /** Injected Anthropic client (mock in tests, real via createAnthropicClient()). */
  readonly client: AnthropicClientLike;
  /** Injected native-input actuation layer. */
  readonly nativeInput: NativeInput;
  /** Display geometry passed to the computer tool. */
  readonly displayWidthPx: number;
  readonly displayHeightPx: number;
  /** Hard cap on actuation steps. */
  readonly maxSteps?: number;
  /** Success judge (default: end_turn = success). */
  readonly successEvaluator?: SuccessEvaluator;
  /** Env for the gate (injectable for tests). */
  readonly env?: FlagEnv;
  /** Optional Cascade artifact creator for the receipt (else local-file fallback). */
  readonly createArtifact?: ArtifactCreator;
}

/** Terminal outcome of an api-loop run. */
export interface ApiLoopOutcome {
  readonly ok: boolean;
  /** Present when the run was refused before any actuation. */
  readonly refusedReason?: string;
  readonly invocation?: RunbookInvocation;
  readonly receipt?: PersistedReceipt;
}

/**
 * Run a Runbook via the Computer Use API loop. Fail-closed gating first; then the
 * client-side action loop; then a persisted filmstrip receipt.
 */
export async function runApiLoop(
  slug: string,
  rawParams: Readonly<Record<string, unknown>>,
  options: ApiLoopOptions,
): Promise<ApiLoopOutcome> {
  // 1. HARD GATE — flag + explicit enable + explicit API key. Refuse before anything.
  const gate = trackBGate(options.env);
  if (!gate.allowed) {
    return { ok: false, refusedReason: gate.reason };
  }

  // 2. Resolve + validate the invocation (fail closed on unknown slug / bad params).
  const resolved = resolveInvocation(slug, rawParams, 'daemon', 'computer_use_api');
  if (!resolved.ok) {
    return { ok: false, refusedReason: resolved.error };
  }
  const invocation = resolved.invocation;
  invocation.lifecycle = 'running';

  const maxSteps = options.maxSteps ?? 25;
  const evaluate = options.successEvaluator ?? defaultSuccessEvaluator;
  const { client, nativeInput } = options;

  const tools = [
    {
      type: COMPUTER_TOOL_TYPE,
      name: 'computer',
      display_width_px: options.displayWidthPx,
      display_height_px: options.displayHeightPx,
    },
  ];

  const steps: StepOutcome[] = [];
  let frameIndex = 0;

  // Seed the conversation with the goal + guardrails + success criteria + first frame.
  const firstFrame = await nativeInput.screenshot();
  invocation.frames.push({
    index: frameIndex,
    path: firstFrame.path,
    base64: firstFrame.base64,
    caption: 'initial screen',
    capturedAt: new Date().toISOString(),
  });

  const messages: unknown[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: buildGoalPrompt(invocation),
        },
        imageBlock(firstFrame.base64),
      ],
    },
  ];

  let lastText = '';
  let success = false;
  let stepCount = 0;

  for (let turn = 0; turn < maxSteps; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      betas: [COMPUTER_USE_BETA],
      tools,
      messages,
    });

    lastText = extractText(response.content) || lastText;

    // Record the assistant turn verbatim so the conversation stays well-formed.
    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(isToolUse);

    if (toolUses.length === 0) {
      // Model produced no action this turn. Judge and stop.
      success = evaluate({
        invocation,
        stopReason: response.stop_reason,
        lastText,
        frames: invocation.frames,
      });
      break;
    }

    // Execute each requested action; feed back a fresh screenshot per tool_use.
    const toolResults: unknown[] = [];
    for (const tu of toolUses) {
      stepCount++;
      const { ok, note } = await executeAction(tu.input, nativeInput);
      const frame = await nativeInput.screenshot();
      frameIndex++;
      invocation.frames.push({
        index: frameIndex,
        path: frame.path,
        base64: frame.base64,
        caption: `after ${describeAction(tu.input)}`,
        capturedAt: new Date().toISOString(),
      });
      steps.push({
        index: stepCount,
        action: describeAction(tu.input),
        ok,
        frameIndex,
        note,
      });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: [imageBlock(frame.base64)],
        is_error: !ok,
      });
    }

    messages.push({ role: 'user', content: toolResults });

    // Success check after this actuation round.
    if (
      evaluate({
        invocation,
        stopReason: response.stop_reason,
        lastText,
        frames: invocation.frames,
      })
    ) {
      success = true;
      break;
    }
  }

  const result: InvocationResult = {
    success,
    summary: success
      ? `Runbook "${invocation.slug}" completed via Computer Use API in ${stepCount} steps.`
      : `Runbook "${invocation.slug}" did not meet success criteria within ${maxSteps} steps.`,
    metCriteria: success ? invocation.successCriteria : [],
    steps: stepCount,
    error: success ? undefined : 'max_steps_or_unmet_criteria',
  };
  invocation.lifecycle = success ? 'succeeded' : 'failed';
  invocation.result = result;

  const receipt = await persistReceipt(assembleReceipt(invocation, steps, result), {
    createArtifact: options.createArtifact,
  });

  return { ok: success, invocation, receipt };
}

/** Build the goal prompt from the Runbook's in-code goal/guardrails/criteria. */
export function buildGoalPrompt(invocation: RunbookInvocation): string {
  const params = Object.entries(invocation.params)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');
  return [
    `Goal: ${invocation.goal}`,
    `Params:\n${params}`,
    `Guardrails:\n${invocation.guardrails.map((g) => `  - ${g}`).join('\n')}`,
    `Success criteria:\n${invocation.successCriteria.map((c) => `  - ${c}`).join('\n')}`,
    'Use the computer tool to accomplish the goal. Only touch the allowed apps. Stop when the success criteria are met.',
  ].join('\n\n');
}

/** Execute one parsed action against the native-input layer. */
export async function executeAction(
  action: ComputerAction,
  native: NativeInput,
): Promise<{ ok: boolean; note?: string }> {
  try {
    switch (action.action) {
      case 'screenshot':
        // The per-tool_use screenshot below covers this; nothing extra to do.
        return { ok: true };
      case 'left_click':
      case 'double_click':
      case 'right_click':
      case 'middle_click':
      case 'mouse_move':
        if (action.coordinate) {
          await native.click(action.coordinate[0], action.coordinate[1]);
          return { ok: true };
        }
        return { ok: false, note: `${action.action} without coordinate` };
      case 'type':
        await native.type(action.text ?? '');
        return { ok: true };
      case 'key':
        await native.key(action.text ?? '');
        return { ok: true };
      case 'wait':
        return { ok: true };
      default:
        return { ok: false, note: `unsupported action "${action.action}"` };
    }
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

function describeAction(a: ComputerAction): string {
  if (a.coordinate) return `${a.action} [${a.coordinate[0]},${a.coordinate[1]}]`;
  if (a.text !== undefined) return `${a.action} "${a.text}"`;
  return a.action;
}

function isToolUse(block: ContentBlock): block is ToolUseBlock {
  return (block as ToolUseBlock).type === 'tool_use';
}

function extractText(content: readonly ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => (b as TextBlock).type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

function imageBlock(base64: string): unknown {
  return {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: base64 },
  };
}

/**
 * Build a REAL Anthropic client — only call this when Track B is actually enabled.
 * Uses a dynamic import so @anthropic-ai/sdk is never loaded (or required to be
 * installed) unless a live run is requested.
 */
export async function createAnthropicClient(apiKey: string): Promise<AnthropicClientLike> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('@anthropic-ai/sdk');
  const Anthropic = mod.default ?? mod.Anthropic;
  return new Anthropic({ apiKey }) as AnthropicClientLike;
}
