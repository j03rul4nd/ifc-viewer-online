import { describe, it, expect } from 'vitest'
import {
  applyBudget, createFrameWatch, deviceTier, formatTriangles, lowerDetail, LAYER_PRIORITY,
} from './scene-budget'

describe('scene-budget · deviceTier', () => {
  it('reads a workstation as high', () => {
    expect(deviceTier({ deviceMemory: 16, hardwareConcurrency: 16 })).toBe('high')
  })

  it('never treats unknown memory as high-end', () => {
    // Safari and Firefox do not report deviceMemory at all.
    expect(deviceTier({ hardwareConcurrency: 12 })).toBe('mid')
  })

  it('reads a small machine as low', () => {
    expect(deviceTier({ deviceMemory: 4, hardwareConcurrency: 8 })).toBe('low')
    expect(deviceTier({ hardwareConcurrency: 4 })).toBe('low')
  })

  it('caps phones below desktop', () => {
    const phone = { maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' }
    expect(deviceTier({ ...phone, deviceMemory: 4, hardwareConcurrency: 8 })).toBe('low')
    expect(deviceTier({ ...phone, deviceMemory: 8, hardwareConcurrency: 8 })).toBe('mid')
  })
})

describe('scene-budget · applyBudget', () => {
  it('keeps everything that fits', () => {
    const d = applyBudget([
      { key: 'building', triangles: 100 }, { key: 'tree', triangles: 100 },
    ], 1000)
    expect([...d.keep].sort()).toEqual(['building', 'tree'])
    expect(d.skipped).toEqual([])
    expect(d.triangles).toBe(200)
  })

  it('drops by priority, not by the order layers were built', () => {
    // Trees were built first and are huge; the buildings must still win.
    const d = applyBudget([
      { key: 'tree', triangles: 900 }, { key: 'building', triangles: 300 },
    ], 1000)
    expect(d.keep.has('building')).toBe(true)
    expect(d.skipped).toEqual(['tree'])
  })

  it('still admits a small layer after a big one was skipped', () => {
    const d = applyBudget([
      { key: 'building', triangles: 600 },
      { key: 'tree', triangles: 800 },
      { key: 'furniture', triangles: 50 },
    ], 1000)
    expect(d.skipped).toEqual(['tree'])
    expect(d.keep.has('furniture')).toBe(true)
  })

  it('always keeps the most important layer, even alone over budget', () => {
    const d = applyBudget([{ key: 'road', triangles: 5000 }, { key: 'tree', triangles: 10 }], 1000)
    expect(d.keep.has('road')).toBe(true)
    expect(d.skipped).toEqual(['tree'])
  })

  it('ranks invented scenery last', () => {
    expect(LAYER_PRIORITY[LAYER_PRIORITY.length - 1]).toBe('scenery')
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
