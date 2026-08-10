// ─── ids.worker reply guard ───────────────────────────────────────────────────
// The IDS worker's whole contract is one reply per `check-ids`. The main thread
// has no independent way to notice a missing one: an unhandled rejection inside a
// worker does NOT fire worker.onerror, so the only backstop is the runner's 120 s
// watchdog, which then reports `timeout` — a code that blames the model for a bug
// in the worker.
//
// ids.worker.test.ts covers the reply BEHAVIOUR for the paths a jsdom test can
// drive. This covers the SHAPE of the one path it cannot: `runCheck` is launched
// with `void`, and the risk is not that today's `.catch` regresses but that the
// next async launch gets written without one. Same reasoning as
// post-header-guard.test.ts, which exists because pc-runner made that mistake
// four times in one file.
//
// Lives in scripts/ because a test importing node:fs from under src/ fails
// `tsc -b`, and `npm run build` runs `tsc -b` before vite.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(resolve(ROOT, 'src/workers/ids.worker.ts'), 'utf8')

/** Every `void <expr>` async launch in the file, with what follows it. */
const VOID_LAUNCHES = /void\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(\.catch)?/g

describe('ids.worker reply contract', () => {
  it('finds the file it is guarding', () => {
    // Without this, a rename or refactor turns every assertion below into a pass.
    expect(SRC).toContain('self.onmessage')
    expect(SRC).toContain('runCheck')
  })

  it('catches every promise it launches with void', () => {
    const unguarded = [...SRC.matchAll(VOID_LAUNCHES)].filter((m) => m[2] == null).map((m) => m[0])
    expect(unguarded, [
      'A promise is launched with a bare `void`. If it rejects, the worker posts',
      'nothing, worker.onerror does not fire, and the run dies as a 120 s timeout',
      'with no error anywhere. Add a .catch that posts a typed error.',
    ].join('\n')).toEqual([])
    // Counted, so deleting the launch (rather than guarding it) fails too.
    expect([...SRC.matchAll(VOID_LAUNCHES)]).toHaveLength(1)
  })

  it('answers instead of returning when it refuses a check', () => {
    // The `checkStarted` latch is the one guard that can reject a check-ids the
    // caller is actively awaiting. `if (checkStarted) return` was the original
    // code and left that caller waiting for nothing.
    const latch = SRC.slice(SRC.indexOf('if (checkStarted)'))
    expect(latch).not.toMatch(/^if \(checkStarted\) return/)
    expect(latch.slice(0, 400)).toContain("post({ type: 'error'")
  })

  it('keeps the reply handler unable to fail silently', () => {
    // The .catch handler itself posts. If postMessage is gone, swallowing is the
    // only option left — but it must be an explicit, commented swallow.
    expect(SRC).toMatch(/\} catch \{ \/\* postMessage/)
  })
})
