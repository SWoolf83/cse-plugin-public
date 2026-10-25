/**
 * native-input.ts — deterministic native synthetic-input primitives.
 *
 * This is the actuation layer Track B (api-loop.ts) drives: it turns parsed
 * Computer-Use-API actions into real OS input. There is NO LLM here — pure,
 * deterministic primitives.
 *
 * IMPLEMENTATION CHOICE (documented per spec):
 *   The production target is a **bundled, signed native sidecar** invoked as the
 *   Cascade desktop app's OWN child process, so its macOS TCC grants (Accessibility
 *   + Screen Recording) sit on ONE stable, signed identity and persist durably
 *   across rebuilds — the same durable-TCC property the signed menu-bar helper buys
 *   (see MEMORY: signed-apps-tcc-remote-control-loop). We deliberately did NOT take
 *   a hard dependency on an in-process binding like nut.js: nut.js ships prebuilt
 *   native `.node` addons whose code-signing identity we don't control, which would
 *   fragment the TCC grant and bloat the plugin. Instead this module defines the
 *   primitive INTERFACE (`NativeInput`) plus a default macOS backend built from
 *   OS-native tools (`open`, `screencapture`, `osascript`/System Events) invoked
 *   through an injectable command runner — so tests mock the runner, and the signed
 *   sidecar can later replace the backend behind the same interface without touching
 *   any caller.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** A captured screenshot frame. */
export interface Screenshot {
  /** Local PNG path. */
  readonly path: string;
  /** Base64 PNG payload (for feeding back as a Computer-Use tool_result). */
  readonly base64: string;
}

/** The deterministic primitive surface both native paths can drive. */
export interface NativeInput {
  /** Launch / foreground an application by name. */
  openApp(appName: string): Promise<void>;
  /** Wait until an app's window is frontmost (polls up to timeoutMs). */
  waitForWindow(appName: string, timeoutMs?: number): Promise<boolean>;
  /** Press a key chord, e.g. "cmd+n", "return", "escape". */
  key(chord: string): Promise<void>;
  /** Type literal text. */
  type(text: string): Promise<void>;
  /** Click at absolute screen coordinates. */
  click(x: number, y: number): Promise<void>;
  /** Capture the screen to a PNG frame. */
  screenshot(): Promise<Screenshot>;
}

/**
 * Injectable command runner: runs argv and resolves stdout, rejects on non-zero
 * exit. The default uses child_process.spawn; tests pass a mock.
 */
export type CommandRunner = (
  cmd: string,
  args: readonly string[],
) => Promise<string>;

const defaultRunner: CommandRunner = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args as string[], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.trim()}`)),
    );
  });

export interface MacNativeInputOptions {
  /** Command runner (injectable for tests). */
  readonly run?: CommandRunner;
  /** Directory for captured frames. Defaults to os.tmpdir()/cascade-runbook-frames. */
  readonly frameDir?: string;
  /** Sleep fn (injectable for tests). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Reader for a captured frame's bytes (injectable for tests). */
  readonly readFrame?: (p: string) => Promise<Buffer>;
}

/** Map a chord like "cmd+n" to an AppleScript System Events keystroke command. */
export function chordToAppleScript(chord: string): string {
  const parts = chord.split('+').map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  const modMap: Record<string, string> = {
    cmd: 'command down',
    command: 'command down',
    ctrl: 'control down',
    control: 'control down',
    alt: 'option down',
    option: 'option down',
    shift: 'shift down',
  };
  const using = mods
    .map((m) => modMap[m])
    .filter((m): m is string => Boolean(m));
  const usingClause = using.length ? ` using {${using.join(', ')}}` : '';

  // Named special keys go through `key code`; single chars through `keystroke`.
  const specialKeyCodes: Record<string, number> = {
    return: 36,
    enter: 36,
    tab: 48,
    space: 49,
    escape: 53,
    esc: 53,
    delete: 51,
  };
  if (Object.prototype.hasOwnProperty.call(specialKeyCodes, key)) {
    return `key code ${specialKeyCodes[key]}${usingClause}`;
  }
  const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `keystroke "${escaped}"${usingClause}`;
}

/** Escape a string for embedding inside an AppleScript double-quoted literal. */
function escapeAppleScript(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Default macOS backend. Deterministic; every action is one OS-native command.
 * Replaceable by the signed sidecar behind the same `NativeInput` interface.
 */
export function createMacNativeInput(options: MacNativeInputOptions = {}): NativeInput {
  const run = options.run ?? defaultRunner;
  const frameDir = options.frameDir ?? path.join(os.tmpdir(), 'cascade-runbook-frames');
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const readFrame = options.readFrame ?? ((p: string) => fs.readFile(p));

  return {
    async openApp(appName: string): Promise<void> {
      await run('open', ['-a', appName]);
    },

    async waitForWindow(appName: string, timeoutMs = 5000): Promise<boolean> {
      const deadline = Date.now() + timeoutMs;
      const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
      while (Date.now() < deadline) {
        try {
          const front = (await run('osascript', ['-e', script])).trim();
          if (front.toLowerCase() === appName.toLowerCase()) return true;
        } catch {
          // ignore transient errors while the app launches
        }
        await sleep(150);
      }
      return false;
    },

    async key(chord: string): Promise<void> {
      const cmd = chordToAppleScript(chord);
      await run('osascript', ['-e', `tell application "System Events" to ${cmd}`]);
    },

    async type(text: string): Promise<void> {
      await run('osascript', [
        '-e',
        `tell application "System Events" to keystroke "${escapeAppleScript(text)}"`,
      ]);
    },

    async click(x: number, y: number): Promise<void> {
      // System Events has no direct coordinate click; use `cliclick`-style semantics
      // via an AppleScript click at {x, y}. The signed sidecar will do this natively.
      await run('osascript', [
        '-e',
        `tell application "System Events" to click at {${Math.round(x)}, ${Math.round(y)}}`,
      ]);
    },

    async screenshot(): Promise<Screenshot> {
      await fs.mkdir(frameDir, { recursive: true });
      const file = path.join(frameDir, `frame-${Date.now()}.png`);
      // -x = no capture sound.
      await run('screencapture', ['-x', file]);
      const bytes = await readFrame(file);
      return { path: file, base64: bytes.toString('base64') };
    },
  };
}
