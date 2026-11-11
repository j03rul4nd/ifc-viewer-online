// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { hydrographVolume, inflowSeries, volumeFromFlows } from './inflow'
import { createGrid, validateGrid } from './grid'
import { constantStorm } from './hyetograph'
import { CpuInertialSolver } from './cpu-inertial'
import { riverInflow } from './cases'

describe('inflow hydrograph', () => {
  it('holds the volume of the triangle whatever the interval', () => {
    const h = { peakM3s: 12, durationMin: 47, peakAt: 0.3 }
    for (const ivMs of [60_000, 300_000, 420_000]) {
      const f = inflowSeries(h, ivMs)
      expect(volumeFromFlows(f, ivMs, f.length * ivMs)).toBeCloseTo(hydrographVolume(h), 1)
    }
    expect(hydrographVolume(h)).toBeCloseTo(12 * 47 * 60 / 2, 9)
    expect(inflowSeries({ peakM3s: 0, durationMin: 10, peakAt: 0.5 }, 300_000)).toHaveLength(0)
  })

  it('peaks near the peak time', () => {
    const f = inflowSeries({ peakM3s: 10, durationMin: 60, peakAt: 0.3 }, 300_000)
    const k = f.indexOf(Math.max(...f))
    expect(k).toBe(3) // 18 min falls in the fourth 5-min interval
  })
})

describe('inflow in the grid', () => {
  it('lands on open cells only, all of it', () => {
    const g = createGrid(4, 1, 1)
    g.blocked[1] = 1
    g.inflow = Float32Array.from([1, 1, 2, 0])
    validateGrid(g)
    expect(Array.from(g.inflow)).toEqual([1 / 3, 0, 2 / 3, 0].map(Math.fround))
    const bad = createGrid(2, 1, 1)
    bad.blocked[0] = 1
    bad.inflow = Float32Array.from([1, 0])
    expect(() => validateGrid(bad)).toThrow(/no open cell/)
  })
})

describe('inflow in the CPU solver', () => {
  it('stores exactly what entered in a closed basin', () => {
    const g = createGrid(20, 20, 2)
    g.inflow = new Float32Array(400)
    g.inflow[0] = 1
    g.inflow[21] = 1
    const flows = new Float32Array(6).fill(0.5) // 0.5 m³/s for 30 min
    const s = new CpuInertialSolver({
      grid: g, hyetograph: constantStorm(0, 5, 5), inflowM3s: flows,
      params: { boundary: { west: 'closed', east: 'closed', south: 'closed', north: 'closed' } },
    })
    s.advanceSync(45 * 60)
    const st = s.statsSync()
    expect(st.inflowVolume).toBeCloseTo(900, 6)
    expect(st.volume).toBeCloseTo(900, 4)
    expect(Math.abs(st.massError)).toBeLessThan(1e-9)
  })

  it('balances rain, inflow and outflow on the reference case', () => {
    const c = riverInflow(40)
    const s = new CpuInertialSolver({ grid: c.grid, hyetograph: c.hyetograph, params: c.params, inflowM3s: c.inflowM3s })
    s.advanceSync(c.durationS)
    const st = s.statsSync()
    expect(st.inflowVolume).toBeCloseTo(hydrographVolume({ peakM3s: 8, durationMin: 30, peakAt: 0.35 }), 0)
    expect(st.outflowVolume).toBeGreaterThan(0)
    expect(Math.abs(st.massError)).toBeLessThan(1e-9)
  }, 30_000)

  it('refuses a discharge with nowhere to enter', () => {
    const g = createGrid(4, 4, 1)
    expect(() => new CpuInertialSolver({ grid: g, hyetograph: constantStorm(0, 5, 5), inflowM3s: [1] })).toThrow(/grid.inflow/)
  })
})
