// ─── post-header guard ────────────────────────────────────────────────────────
// pc-runner has four callbacks that run AFTER the header watchdog is cleared.
// All four were originally written as a bare `void promise.then(...)`, and all
// four were wrong the same way: a throw inside one produced an unhandled
// rejection and nothing else — `finish()` never ran, so the load never settled,
// the worker was never terminated, and the cloud sat at `status: 'parsing'` with
// a spinner for the rest of the session. No error reached the user, because no
// error path ran.
//
// The behaviour is covered by pc-runner.test.ts. This covers the SHAPE, because
// the real risk was never that the fix regresses — it is that a FIFTH call site
// gets written the old way. Four identical mistakes in one file is a pattern,
// not an accident.
//
// Lives in scripts/ rather than beside what it guards, for the reason 5a2fb07
// wrote down: a test importing node:fs from under src/ fails `tsc -b`, and
// `npm run build` runs `tsc -b` before vite.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(resolve(ROOT, 'src/lib/pointcloud/pc-runner.ts'), 'utf8')

const BARE = /void\s+georefPromise\s*\.then/g
const GUARDED = /guardPostHeader\(georefPromise/g
const ANY_THEN = /georefPromise\s*\.then/g

describe('pc-runner post-header callbacks', () => {
  it('finds the file it is guarding', () => {
    // Without this, a rename turns every assertion below into a pass.
    expect(SRC).toContain('guardPostHeader')
    expect(SRC).toContain('georefPromise')
  })

  it('leaves no bare void behind', () => {
    const message = [
      'A post-header callback uses a bare `void`. It fires after the header',
      'watchdog is cleared, so a throw inside it hangs the load with no error',
      'anywhere and no way for the user to tell. Wrap it in guardPostHeader.',
    ].join('\n')
    expect(SRC.match(BARE) ?? [], message).toEqual([])
  })

  it('guards every one of them', () => {
    // Counted rather than merely present: deleting three calls and keeping one
    // would otherwise satisfy the check above.
    const guarded = (SRC.match(GUARDED) ?? []).length
    const total = (SRC.match(ANY_THEN) ?? []).length
    expect(guarded, 'every georefPromise.then must be guarded').toBe(total)
    expect(total, 'expected four post-header callbacks').toBe(4)
  })

  it('keeps the failure handler unable to fail', () => {
    // onFail is finish(): store writes plus worker.terminate(). If that throws,
    // the recovery path must not become a second unhandled rejection.
    expect(SRC).toMatch(/try \{ onFail\(\) \} catch/)
  })
})
