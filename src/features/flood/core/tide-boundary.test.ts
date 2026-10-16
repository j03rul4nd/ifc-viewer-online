import { describe, expect, it } from 'vitest'
import { CpuInertialSolver } from './cpu-inertial'
import { createGrid } from './grid'
import { tideLevelAt } from './solver-api'

/** A 40 × 4 strip, 2 m cells: sea in the first 4 columns, a beach rising 5 cm per cell. */
function beach() {
  const g = createGrid(40, 4, 2, 0.03)
  g.sea = new Uint8Array(40 * 4)
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 40; i++) {
      const c = j * 40 + i
      g.z[c] = i < 4 ? 0 : (i - 3) * 0.05
      if (i < 4) g.sea[c] = 1
    }
  }
  return g
}
const dry = { intervalS: 300, intensityMmH: [0] }
const closed = { boundary: { west: 'closed', east: 'closed', south: 'closed', north: 'closed' } as const }

describe('tideLevelAt', () => {
  it('interpolates and holds the last value', () => {
    const t = { intervalMs: 1000, levels: [0, 1, 0.5] }
    expect(tideLevelAt(t, 500)).toBeCloseTo(0.5)
    expect(tideLevelAt(t, 1500)).toBeCloseTo(0.75)
    expect(tideLevelAt(t, 9000)).toBe(0.5)
    expect(tideLevelAt(null, 0)).toBeNaN()
  })
})

describe('sea cells held at the tide', () => {
  it('a rising tide floods the beach and a falling one drains it, with the balance closed by the sea', () => {
    // 0.2 m → 1.0 m over 20 min, then back to 0.2 m by 40 min.
    const tide = { intervalMs: 20 * 60_000, levels: [0.2, 1.0, 0.2] }
    const g = beach()
    g.h0 = new Float32Array(40 * 4)
    for (let c = 0; c < g.h0.length; c++) if (g.sea![c]) g.h0[c] = 0.2
    const s = new CpuInertialSolver({ grid: g, hyetograph: dry, params: closed, tide })

    s.advanceSync(20 * 60)
    const high = s.statsSync()
    // At +1.0 m the water reaches the cell whose bed is 0.95 m (i = 22) and beyond up to ~1 m.
    const f = s.fieldsSync()
    expect(f.h[22]).toBeGreaterThan(0.01)
    expect(f.h[35]).toBe(0)
    expect(f.h[0]).toBeCloseTo(1.0, 5)
    expect(high.seaVolume).toBeGreaterThan(0)
    expect(Math.abs(high.massError)).toBeLessThan(1e-9)

    s.advanceSync(60 * 60)
    const low = s.statsSync()
    const f2 = s.fieldsSync()
    expect(f2.h[0]).toBeCloseTo(0.2, 5)
    // The beach drains back towards the sea as the tide goes out.
    expect(f2.h[15]).toBeLessThan(f.h[15] * 0.5)
    expect(low.seaVolume).toBeLessThan(high.seaVolume)
    expect(Math.abs(low.massError)).toBeLessThan(1e-9)
  })

  it('without a tide the sea mask does nothing', () => {
    const g = beach()
    const s = new CpuInertialSolver({ grid: g, hyetograph: dry, params: closed })
    s.advanceSync(600)
    expect(s.statsSync().seaVolume).toBe(0)
    expect(s.statsSync().volume).toBe(0)
  })
})

describe('the tidal-beach parity case', () => {
  it('closes the balance on the CPU and moves water on and off the land', async () => {
    const { tidalBeach } = await import('./cases')
    const c = tidalBeach(40)
    const s = new CpuInertialSolver({ grid: c.grid, hyetograph: c.hyetograph, params: c.params, tide: c.tide })
    s.advanceSync(20 * 60)
    const mid = s.statsSync()
    s.advanceSync(c.durationS)
    const end = s.statsSync()
    expect(Math.abs(mid.massError)).toBeLessThan(1e-9)
    expect(Math.abs(end.massError)).toBeLessThan(1e-9)
    expect(end.seaVolume).toBeLessThan(mid.seaVolume)
  })
})
