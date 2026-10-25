/**
 * receipt.ts — assembles + persists a filmstrip receipt for a Runbook run.
 *
 * Every run of EITHER track produces one receipt: ordered screenshots + per-step
 * outcomes + the final result, persisted durably so the run is auditable after the
 * fact. Persists as a Cascade artifact when a creator is provided; falls back to a
 * local JSON file when offline / no creator.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  FrameRef,
  InvocationResult,
  RunbookInvocation,
  Tier,
  TriggerSource,
} from './invocation';

/** One step's outcome in the filmstrip. */
export interface StepOutcome {
  readonly index: number;
  /** What was attempted (e.g. "open_app Finder", "left_click [420,180]"). */
  readonly action: string;
  readonly ok: boolean;
  /** Index of the frame captured after this step, if any. */
  readonly frameIndex?: number;
  readonly note?: string;
}

/** The assembled receipt object. */
export interface Receipt {
  readonly slug: string;
  readonly params: Readonly<Record<string, string>>;
  readonly tier: Tier;
  readonly triggerSource: TriggerSource;
  readonly frames: readonly FrameRef[];
  readonly steps: readonly StepOutcome[];
  readonly result: InvocationResult;
  readonly assembledAt: string;
}

/** Assemble a receipt from an invocation + the step outcomes gathered during the run. */
export function assembleReceipt(
  invocation: RunbookInvocation,
  steps: readonly StepOutcome[],
  result: InvocationResult,
): Receipt {
  return {
    slug: invocation.slug,
    params: invocation.params,
    tier: invocation.tier,
    triggerSource: invocation.triggerSource,
    frames: invocation.frames,
    steps,
    result,
    assembledAt: new Date().toISOString(),
  };
}

/**
 * A minimal Cascade artifact creator. Kept structural so this module has no hard
 * dependency on the MCP client — the caller injects a real creator (or nothing).
 */
export type ArtifactCreator = (input: {
  title: string;
  kind: string;
  content: unknown;
}) => Promise<{ id: string }>;

/** Where the receipt ended up. */
export interface PersistedReceipt {
  /** Cascade artifact id, when persisted online. */
  readonly artifactId?: string;
  /** Local file path, when persisted to disk (offline fallback). */
  readonly localPath?: string;
}

export interface PersistOptions {
  /** When provided, persist as a Cascade artifact (preferred). */
  readonly createArtifact?: ArtifactCreator;
  /** Directory for the local-file fallback. Defaults to os.tmpdir()/cascade-runbook-receipts. */
  readonly fallbackDir?: string;
}

/**
 * Persist a receipt. Prefers a Cascade artifact; on absence or failure, writes a
 * local JSON file so the run is never lost. Always resolves (never throws) so a
 * persistence hiccup can't mask the run's own result.
 */
export async function persistReceipt(
  receipt: Receipt,
  options: PersistOptions = {},
): Promise<PersistedReceipt> {
  const title = `Runbook receipt — ${receipt.slug} (${receipt.result.success ? 'ok' : 'failed'})`;

  if (options.createArtifact) {
    try {
      const created = await options.createArtifact({
        title,
        kind: 'runbook_receipt',
        content: receipt,
      });
      return { artifactId: created.id };
    } catch {
      // fall through to local persistence
    }
  }

  const dir =
    options.fallbackDir ?? path.join(os.tmpdir(), 'cascade-runbook-receipts');
  const file = path.join(
    dir,
    `${receipt.slug}-${Date.now()}.json`,
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(receipt, null, 2), 'utf8');
  return { localPath: file };
}
