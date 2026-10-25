import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Golden-suite replay harness — canonical self-test (wave 3, quality gate).
//
// Exercises the BLOCK-MERGE path WITHOUT burning LLM calls, via --no-llm over
// pre-recorded fixtures:
//   - fixtures/degraded — the "after" simulates an intentionally-degraded
//     skill: quality pass-rate drops while tokens ALSO drop. Must BLOCK
//     (status "blocked", non-zero exit) despite the token savings.
//   - fixtures/happy    — quality flat, tokens down. Must PASS (exit 0).
//
// Every scorecard number must carry evaluator provenance
// ({ computed: true, inputsHash }) — the harness computes nothing itself.
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const harness = join(repoRoot, 'scripts', 'self-eval-replay.mjs')
const fixtures = join(repoRoot, 'cse', 'skills', 'self-eval', 'golden-suite', 'fixtures')

interface ComputedNumber {
  value: number
  provenance: { computed: true; inputsHash: string }
}

function runHarness(recordedDir: string) {
  const outDir = mkdtempSync(join(tmpdir(), 'self-eval-replay-test-'))
  const res = spawnSync(
    'node',
    [harness, '--no-llm', '--base', repoRoot, '--tuned', repoRoot, '--recorded', recordedDir, '--out', outDir],
    { cwd: repoRoot, encoding: 'utf8', timeout: 120_000 }
  )
  return { res, outDir }
}

function expectProvenance(n: ComputedNumber, inputsHash: string) {
  expect(n.provenance).toEqual({ computed: true, inputsHash })
}

describe('self-eval-replay harness (golden-suite quality gate)', () => {
  it('--help exits 0 and documents block-merge semantics', () => {
    const res = spawnSync('node', [harness, '--help'], { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 })
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('--base')
    expect(res.stdout).toContain('--no-llm')
    expect(res.stdout).toContain('BLOCKED')
    expect(res.stdout).toContain('never merges or releases')
  })

  it('fails loudly without --recorded in --no-llm mode', () => {
    const res = spawnSync('node', [harness, '--no-llm', '--base', repoRoot, '--tuned', repoRoot], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('--recorded')
  })

  it('BLOCKS a degraded tuning (quality regressed) even though tokens dropped — non-zero exit', () => {
    const { res, outDir } = runHarness(join(fixtures, 'degraded'))

    // Non-zero exit, and specifically the "blocked" code (2), not an error (1).
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('BLOCKED')
    expect(res.stderr).toContain('blocks the merge even when token cost dropped')

    const scorecard = JSON.parse(readFileSync(join(outDir, 'scorecard.json'), 'utf8'))
    expect(scorecard.status).toBe('blocked')
    expect(scorecard.mode).toBe('no-llm')
    expect(scorecard.blockedBy).toContain('gate-review')
    expect(scorecard.blockedBy).toContain('suite')

    // Two-metric shape: quality regressed while tokens IMPROVED (dropped).
    const suite = scorecard.suite
    expect(suite.quality.regressed).toBe(true)
    expect(suite.quality.deltaPct.value).toBeLessThan(0)
    expect(suite.tokens.improved).toBe(true)
    expect(suite.tokens.deltaPct.value).toBeLessThan(0)

    // Provenance-gated numbers: every scorecard number carries the evaluator's
    // { computed: true, inputsHash } tag from the gated computed output.
    expect(scorecard.inputsHash).toMatch(/^fnv1a-/)
    for (const n of [suite.quality.before, suite.quality.after, suite.quality.deltaPct, suite.tokens.before, suite.tokens.after, suite.tokens.deltaPct]) {
      expectProvenance(n, scorecard.inputsHash)
    }
    for (const task of scorecard.tasks) {
      expectProvenance(task.quality.before, scorecard.inputsHash)
      expectProvenance(task.tokens.after, scorecard.inputsHash)
    }

    // The degraded gate-review output missed the planted swallowed-error bug.
    const gate = scorecard.tasks.find((t: { id: string }) => t.id === 'gate-review')
    expect(gate.verdict).toBe('quality-regression')
    const swallowCheck = gate.observations.tuned.machineChecks.find(
      (c: { id: string }) => c.id === 'catches-swallowed-error'
    )
    expect(swallowCheck.passed).toBe(false)

    // The evaluator artifacts (SES / rows / computed) were produced and gated.
    const computed = JSON.parse(readFileSync(join(outDir, 'computed.json'), 'utf8'))
    expect(computed.inputsHash).toBe(scorecard.inputsHash)
  })

  it('PASSES a tokens-only improvement with flat quality — exit 0', () => {
    const { res, outDir } = runHarness(join(fixtures, 'happy'))

    expect(res.status).toBe(0)
    expect(res.stdout).toContain('STATUS: PASS')

    const scorecard = JSON.parse(readFileSync(join(outDir, 'scorecard.json'), 'utf8'))
    expect(scorecard.status).toBe('pass')
    expect(scorecard.blockedBy).toEqual([])
    expect(scorecard.suite.quality.regressed).toBe(false)
    expect(scorecard.suite.quality.deltaPct.value).toBe(0)
    expect(scorecard.suite.tokens.improved).toBe(true)
    for (const task of scorecard.tasks) expect(task.verdict).toBe('pass')
  })
})
