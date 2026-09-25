import { describe, it, expect } from 'vitest'
import {
  budgetGate, createFrameWatch, formatTriangles, lowerDetail, TRIANGLE_BUDGET,
} from './scene-budget'

describe('scene-budget · budgetGate', () => {
  it('admits what fits and refuses what does not', () => {
    const gate = budgetGate(1000)
    expect(gate.admit(400)).toBe(true)
    expect(gate.admit(500)).toBe(true)
    expect(gate.admit(200)).toBe(false) // would reach 1100
    expect(gate.used).toBe(900)
  })

  it('still admits a small layer after a big one was refused', () => {
    const gate = budgetGate(1000)
    gate.admit(600)
    expect(gate.admit(800)).toBe(false)
    expect(gate.admit(50)).toBe(true)
  })

  it('always admits the first layer of an empty scene, even over budget', () => {
    const gate = budgetGate(1000)
    expect(gate.admit(5000)).toBe(true)
    expect(gate.admit(10)).toBe(false)
  })

  it('counts what is already standing (a partial build)', () => {
    const gate = budgetGate(1000, 950)
    expect(gate.admit(100)).toBe(false)
    expect(gate.admit(40)).toBe(true)
  })

  it('gives every device tier a budget, smallest for the weakest', () => {
    expect(TRIANGLE_BUDGET.low).toBeLessThan(TRIANGLE_BUDGET.mid)
    expect(TRIANGLE_BUDGET.mid).toBeLessThan(TRIANGLE_BUDGET.high)
  })
})

describe('scene-budget · frame watch', () => {
  /** Feed `seconds` of frames at `fps`, starting at `t0`. Returns the verdicts. */
  function run(watch: ReturnType<typeof createFrameWatch>, t0: number, seconds: number, fps: number) {
    const out = []
    const step = 1000 / fps
    let t = t0
    for (let i = 0; i < seconds * fps; i++) {
      t += step
      const v = watch.sample(t)
      if (v) out.push(v)
    }
    return { verdicts: out, t }
  }

  it('reports the frame rate once per window', () => {
    const w = createFrameWatch()
    const { verdicts } = run(w, 0, 3, 60)
    expect(verdicts.length).toBeGreaterThanOrEqual(2)
    for (const v of verdicts) expect(v.fps).toBeGreaterThanOrEqual(58)
    expect(verdicts.every((v) => !v.slow)).toBe(true)
  })

  it('flips to slow only after the rate STAYS low', () => {
    const w = createFrameWatch({ slowWindows: 3 })
    const a = run(w, 0, 2, 12)
    expect(a.verdicts.some((v) => v.slow)).toBe(false)
    const b = run(w, a.t, 3, 12)
    expect(b.verdicts[b.verdicts.length - 1].slow).toBe(true)
  })

  it('recovers with hysteresis', () => {
    const w = createFrameWatch({ slowWindows: 2 })
    const a = run(w, 0, 4, 10)
    expect(a.verdicts[a.verdicts.length - 1].slow).toBe(true)
    // 24 fps sits between the two thresholds: not slow enough to count, not
    // fast enough to recover.
    const b = run(w, a.t, 3, 24)
    expect(b.verdicts[b.verdicts.length - 1].slow).toBe(true)
    const c = run(w, b.t, 3, 60)
    expect(c.verdicts[c.verdicts.length - 1].slow).toBe(false)
  })

  it('ignores a hidden-tab gap instead of reading it as a slow scene', () => {
    const w = createFrameWatch({ slowWindows: 1 })
    const a = run(w, 0, 2, 60)
    // Ten seconds with no frames at all, then healthy frames again.
    const b = run(w, a.t + 10_000, 2, 60)
    expect(b.verdicts.every((v) => !v.slow)).toBe(true)
  })

  it('ignores frames during a pause (shader compile after a rebuild)', () => {
    const w = createFrameWatch({ slowWindows: 1 })
    w.pause(3000)
    const a = run(w, 0, 3, 5)
    expect(a.verdicts).toEqual([])
  })
})

describe('scene-budget · helpers', () => {
  it('steps the detail ladder down and stops at the bottom', () => {
    expect(lowerDetail('showcase')).toBe('detailed')
    expect(lowerDetail('detailed')).toBe('simple')
    expect(lowerDetail('simple')).toBeNull()
  })

  it('formats triangle counts at panel scale', () => {
    expect(formatTriangles(845)).toBe('845')
    expect(formatTriangles(1234)).toBe('1.2 k')
    expect(formatTriangles(56_789)).toBe('57 k')
    expect(formatTriangles(1_234_567)).toBe('1.2 M')
  })
})
