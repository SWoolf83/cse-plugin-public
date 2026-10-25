/**
 * runbook.test.ts — unit coverage for the run-runbook lane.
 *
 * Proves the security + gating invariants WITHOUT any actuation or token spend:
 *  - unknown slug + invalid params are rejected (fail closed);
 *  - allowed-apps scoping comes only from code;
 *  - the feature flag off short-circuits before any actuation;
 *  - Track-B loop control flow against a MOCKED Anthropic client
 *    (action-in → executor-called → screenshot-back → terminates on success/max-steps);
 *  - Track B refuses with the flag off or no API key.
 */

import { describe, it, expect, vi } from 'vitest';

import { getRunbook, isKnownSlug, RUNBOOKS } from '../runbooks';
import {
  resolveInvocation,
  validateParams,
  type RunbookInvocation,
} from '../invocation';
import { isRunbookLaneEnabled, trackBGate } from '../feature-flags';
import { chordToAppleScript, type NativeInput, type Screenshot } from '../native-input';
import {
  runApiLoop,
  executeAction,
  type AnthropicClientLike,
  type MessageResponse,
  COMPUTER_TOOL_TYPE,
  COMPUTER_USE_BETA,
  MODEL,
} from '../api-loop';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A NativeInput that records calls and never touches the OS. */
function makeSpyNative(): NativeInput & {
  calls: string[];
  shots: number;
} {
  const state = { calls: [] as string[], shots: 0 };
  const shot = (): Screenshot => ({
    path: `/tmp/frame-${state.shots}.png`,
    base64: `frame${state.shots}`,
  });
  return {
    calls: state.calls,
    get shots() {
      return state.shots;
    },
    async openApp(app) {
      state.calls.push(`openApp:${app}`);
    },
    async waitForWindow(app) {
      state.calls.push(`waitForWindow:${app}`);
      return true;
    },
    async key(chord) {
      state.calls.push(`key:${chord}`);
    },
    async type(text) {
      state.calls.push(`type:${text}`);
    },
    async click(x, y) {
      state.calls.push(`click:${x},${y}`);
    },
    async screenshot() {
      const s = shot();
      state.shots++;
      return s;
    },
  };
}

/** A mock Anthropic client that replays a scripted sequence of responses. */
function makeMockClient(script: MessageResponse[]): {
  client: AnthropicClientLike;
  calls: Array<{ model: string; betas: readonly string[]; tools: readonly unknown[]; messages: readonly unknown[] }>;
} {
  const calls: Array<{
    model: string;
    betas: readonly string[];
    tools: readonly unknown[];
    messages: readonly unknown[];
  }> = [];
  let i = 0;
  const client: AnthropicClientLike = {
    beta: {
      messages: {
        async create(params) {
          calls.push({
            model: params.model,
            betas: params.betas,
            tools: params.tools,
            messages: params.messages,
          });
          const resp = script[Math.min(i, script.length - 1)];
          i++;
          return resp;
        },
      },
    },
  };
  return { client, calls };
}

const OFF_ENV = {};
const TRACK_B_ENV = {
  CASCADE_RUNBOOKS_ENABLED: '1',
  CASCADE_RUNBOOKS_API_ENABLED: '1',
  ANTHROPIC_API_KEY: 'sk-test-xxx',
};

// ---------------------------------------------------------------------------
// runbooks.ts — the allowlist
// ---------------------------------------------------------------------------

describe('runbooks registry', () => {
  it('ships exactly the two proof runbooks with declared allowedApps', () => {
    expect(Object.keys(RUNBOOKS).sort()).toEqual(['open-app', 'type-into-notes']);
    expect(getRunbook('open-app')?.allowedApps).toEqual(['Finder']);
    expect(getRunbook('type-into-notes')?.allowedApps).toEqual(['Notes']);
  });

  it('is deep-frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(RUNBOOKS)).toBe(true);
    const rb = getRunbook('open-app')!;
    expect(Object.isFrozen(rb)).toBe(true);
    expect(Object.isFrozen(rb.allowedApps)).toBe(true);
  });

  it('rejects unknown slugs', () => {
    expect(getRunbook('rm-rf-slash')).toBeUndefined();
    expect(isKnownSlug('rm-rf-slash')).toBe(false);
    expect(isKnownSlug('open-app')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// invocation.ts — fail-closed validation (shared by both tracks)
// ---------------------------------------------------------------------------

describe('param validation (fail closed)', () => {
  it('accepts valid params', () => {
    const r = resolveInvocation('open-app', { appName: 'Finder' }, 'cli', 'max_mcp');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.invocation.params).toEqual({ appName: 'Finder' });
      // goal/allowedApps come FROM CODE, not the trigger:
      expect(r.invocation.allowedApps).toEqual(['Finder']);
      expect(r.invocation.tier).toBe('max_mcp');
    }
  });

  it('rejects an unknown slug', () => {
    const r = resolveInvocation('evil', { x: 1 }, 'cli', 'max_mcp');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown runbook slug/i);
  });

  it('rejects a missing required param', () => {
    const r = resolveInvocation('open-app', {}, 'cli', 'max_mcp');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing required param/i);
  });

  it('rejects an unknown (smuggled) param key', () => {
    const rb = getRunbook('open-app')!;
    const v = validateParams(rb, { appName: 'Finder', extraSteps: 'do evil' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/unknown param/i);
  });

  it('rejects a non-string param', () => {
    const rb = getRunbook('type-into-notes')!;
    const v = validateParams(rb, { text: 42 });
    expect(v.ok).toBe(false);
  });

  it('rejects an empty required param and an over-length param', () => {
    const rb = getRunbook('type-into-notes')!;
    expect(validateParams(rb, { text: '' }).ok).toBe(false);
    expect(validateParams(rb, { text: 'x'.repeat(5000) }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// feature-flags.ts — the kill switch
// ---------------------------------------------------------------------------

describe('feature flags (fail closed)', () => {
  it('lane is off unless explicitly "1"/"true"', () => {
    expect(isRunbookLaneEnabled({})).toBe(false);
    expect(isRunbookLaneEnabled({ CASCADE_RUNBOOKS_ENABLED: '0' })).toBe(false);
    expect(isRunbookLaneEnabled({ CASCADE_RUNBOOKS_ENABLED: 'nope' })).toBe(false);
    expect(isRunbookLaneEnabled({ CASCADE_RUNBOOKS_ENABLED: '1' })).toBe(true);
    expect(isRunbookLaneEnabled({ CASCADE_RUNBOOKS_ENABLED: 'TRUE' })).toBe(true);
  });

  it('Track B refuses without lane, enable flag, or key', () => {
    expect(trackBGate({}).reason).toBe('lane_disabled');
    expect(trackBGate({ CASCADE_RUNBOOKS_ENABLED: '1' }).reason).toBe('track_b_disabled');
    expect(
      trackBGate({ CASCADE_RUNBOOKS_ENABLED: '1', CASCADE_RUNBOOKS_API_ENABLED: '1' }).reason,
    ).toBe('missing_api_key');
    expect(trackBGate(TRACK_B_ENV).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// native-input.ts — deterministic primitive mapping (no OS)
// ---------------------------------------------------------------------------

describe('native-input chord mapping', () => {
  it('maps modifiers + special keys to AppleScript', () => {
    expect(chordToAppleScript('cmd+n')).toBe('keystroke "n" using {command down}');
    expect(chordToAppleScript('return')).toBe('key code 36');
    expect(chordToAppleScript('cmd+shift+n')).toBe(
      'keystroke "n" using {command down, shift down}',
    );
  });
});

// ---------------------------------------------------------------------------
// api-loop.ts — Track B control flow against a MOCKED client (no tokens)
// ---------------------------------------------------------------------------

describe('Track B api-loop gating', () => {
  it('refuses before any actuation when the lane flag is off', async () => {
    const native = makeSpyNative();
    const { client, calls } = makeMockClient([]);
    const outcome = await runApiLoop(
      'open-app',
      { appName: 'Finder' },
      { client, nativeInput: native, displayWidthPx: 1440, displayHeightPx: 900, env: OFF_ENV },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.refusedReason).toBe('lane_disabled');
    // No API call, no synthetic input, no screenshot.
    expect(calls.length).toBe(0);
    expect(native.calls.length).toBe(0);
    expect(native.shots).toBe(0);
  });

  it('refuses when enabled but no API key', async () => {
    const native = makeSpyNative();
    const { client, calls } = makeMockClient([]);
    const outcome = await runApiLoop(
      'open-app',
      { appName: 'Finder' },
      {
        client,
        nativeInput: native,
        displayWidthPx: 1440,
        displayHeightPx: 900,
        env: { CASCADE_RUNBOOKS_ENABLED: '1', CASCADE_RUNBOOKS_API_ENABLED: '1' },
      },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.refusedReason).toBe('missing_api_key');
    expect(calls.length).toBe(0);
  });

  it('rejects an unknown slug even when fully enabled (fail closed)', async () => {
    const native = makeSpyNative();
    const { client, calls } = makeMockClient([]);
    const outcome = await runApiLoop(
      'evil',
      {},
      { client, nativeInput: native, displayWidthPx: 1440, displayHeightPx: 900, env: TRACK_B_ENV },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.refusedReason).toMatch(/unknown runbook slug/i);
    expect(calls.length).toBe(0);
  });
});

describe('Track B api-loop control flow (mocked client)', () => {
  it('executes actions, feeds screenshots back, and terminates on success', async () => {
    const native = makeSpyNative();
    // Script: turn 1 → type action; turn 2 → end_turn (success).
    const script: MessageResponse[] = [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Typing the note.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'computer',
            input: { action: 'type', text: 'hello world' },
          },
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
    ];
    const { client, calls } = makeMockClient(script);

    const receiptSpy = vi.fn(async () => ({ id: 'artifact_123' }));

    const outcome = await runApiLoop(
      'type-into-notes',
      { text: 'hello world' },
      {
        client,
        nativeInput: native,
        displayWidthPx: 1440,
        displayHeightPx: 900,
        env: TRACK_B_ENV,
        createArtifact: receiptSpy,
      },
    );

    // Terminated successfully.
    expect(outcome.ok).toBe(true);
    expect(outcome.invocation?.lifecycle).toBe('succeeded');
    // The native executor was called with the scripted action.
    expect(native.calls).toContain('type:hello world');
    // Screenshots: initial + one after the action.
    expect(native.shots).toBeGreaterThanOrEqual(2);

    // The API was called with the pinned contract (tool type, beta, model).
    expect(calls[0].model).toBe(MODEL);
    expect(calls[0].betas).toContain(COMPUTER_USE_BETA);
    expect((calls[0].tools[0] as { type: string }).type).toBe(COMPUTER_TOOL_TYPE);

    // A screenshot tool_result was fed back on the second turn's messages.
    const secondCallMessages = calls[1].messages as Array<{ role: string; content: unknown }>;
    const toolResultTurn = secondCallMessages.find(
      (m) => m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((c) => c.type === 'tool_result'),
    );
    expect(toolResultTurn).toBeTruthy();

    // Receipt persisted as a Cascade artifact.
    expect(receiptSpy).toHaveBeenCalledOnce();
    expect(outcome.receipt?.artifactId).toBe('artifact_123');
  });

  it('terminates at the max-step cap when success is never reached', async () => {
    const native = makeSpyNative();
    // Model always asks for another click; never ends the turn.
    const neverDone: MessageResponse = {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_loop',
          name: 'computer',
          input: { action: 'left_click', coordinate: [10, 10] },
        },
      ],
    };
    const { client, calls } = makeMockClient([neverDone]);

    const outcome = await runApiLoop(
      'open-app',
      { appName: 'Finder' },
      {
        client,
        nativeInput: native,
        displayWidthPx: 1440,
        displayHeightPx: 900,
        env: TRACK_B_ENV,
        maxSteps: 3,
        // Never satisfied.
        successEvaluator: () => false,
      },
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.invocation?.lifecycle).toBe('failed');
    expect(outcome.invocation?.result?.error).toBe('max_steps_or_unmet_criteria');
    // Called exactly maxSteps times, then stopped.
    expect(calls.length).toBe(3);
    // Local-file receipt fallback (no artifact creator provided).
    expect(outcome.receipt?.localPath).toBeTruthy();
  });
});

describe('executeAction mapping', () => {
  it('routes each action to the right native primitive', async () => {
    const native = makeSpyNative();
    expect((await executeAction({ action: 'type', text: 'abc' }, native)).ok).toBe(true);
    expect((await executeAction({ action: 'key', text: 'cmd+n' }, native)).ok).toBe(true);
    expect(
      (await executeAction({ action: 'left_click', coordinate: [5, 6] }, native)).ok,
    ).toBe(true);
    expect(native.calls).toEqual(['type:abc', 'key:cmd+n', 'click:5,6']);
  });

  it('flags an unsupported action without throwing', async () => {
    const native = makeSpyNative();
    const r = await executeAction({ action: 'teleport' }, native);
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/unsupported/i);
  });
});
