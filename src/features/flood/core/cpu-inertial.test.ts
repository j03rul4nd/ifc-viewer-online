// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { CpuInertialSolver } from './cpu-inertial'
import { damBreak, lakeAtRest, rainOnPlane, type FloodCase } from './cases'
import { kinematicEquilibriumTime, kinematicPlaneDepth, ritterDepth } from './analytic'
import { createGrid, effectiveRainArea, inclinedPlaneDemo, blockLayout } from './grid'
import { constantStorm, depthUpToMs, triangularStorm } from './hyetograph'
import { nextStepMs, DEFAULT_PARAMS } from './solver-api'

const run = (c: FloodCase): CpuInertialSolver => {
  const s = new CpuInertialSolver({ grid: c.grid, hyetograph: c.hyetograph, params: c.params })
  s.advanceSync(c.durationS)
  return s
}

describe('the step rule', () => {
  const p = DEFAULT_PARAMS
  it('follows the CFL condition, floored to the millisecond', () => {
    // α·Δx/√(g·h) = 0.7 · 2 / √(9.81 · 1) = 0.44699 s
    expect(nextStepMs(0, 1e9, 1, 2, p, 3_600_000, 1)).toBe(446)
  })
  it('never crosses a rain interval or the stop time, and is capped by dtMax when dry', () => {
    expect(nextStepMs(299_900, 1e9, 0, 2, p, 300_000, 4)).toBe(100)
    expect(nextStepMs(0, 250, 0, 2, p, 300_000, 4)).toBe(250)
    expect(nextStepMs(0, 1e9, 0, 2, p, 300_000, 4)).toBe(10_000)
    expect(nextStepMs(500, 500, 1, 2, p, 300_000, 4)).toBe(0)
  })
  it('stops clamping to rain intervals once the rain is over', () => {
    expect(nextStepMs(1_200_000, 1e9, 0, 2, p, 300_000, 4)).toBe(10_000)
  })
})

describe('lake at rest', () => {
  // CPU-bound (~2 s alone): 30 simulated minutes on 2304 cells, ~4 s under the full suite's parallel load.
  it('stays perfectly still over a bumpy bed with islands and an obstacle', () => {
    const c = lakeAtRest(48)
    const s = run(c)
    const f = s.fieldsSync()
    let maxDh = 0
    let maxV = 0
    for (let k = 0; k < f.h.length; k++) {
      maxDh = Math.max(maxDh, Math.abs(f.h[k] - (c.grid.h0?.[k] ?? 0)))
      maxV = Math.max(maxV, Math.abs(f.u[k]), Math.abs(f.v[k]))
    }
    expect(maxDh).toBe(0)
    expect(maxV).toBe(0)
    const st = s.statsSync()
    expect(st.t).toBe(c.durationS)
    expect(Math.abs(st.massError)).toBeLessThan(1e-12)
  }, 30_000)
})

describe('mass balance', () => {
  // CPU-bound (~3 s alone): 45 simulated minutes on 3000 cells, past 5 s under the full suite's parallel load.
  it('conserves water in a closed basin under rain, to round-off', () => {
    const grid = inclinedPlaneDemo({
      nx: 60, ny: 50, dx: 2, slopeX: 0.01, slopeY: 0.003, roughnessAmplitude: 0.6, seed: 3,
      obstacles: blockLayout(60, 50, 12, 4),
    })
    const s = new CpuInertialSolver({
      grid, hyetograph: triangularStorm(120, 30, 0.4, 5),
      params: { boundary: { west: 'closed', east: 'closed', south: 'closed', north: 'closed' } },
    })
    s.advanceSync(45 * 60)
    const st = s.statsSync()
    expect(st.outflowVolume).toBe(0)
    // The solvers rain at the float32 intensity (what the GPU holds): equal to
    // the exact depth to float32 precision.
    const exact = depthUpToMs(s.hyetograph, 45 * 60_000) * effectiveRainArea(grid)
    expect(Math.abs(st.rainVolume - exact) / exact).toBeLessThan(1e-6)
    expect(Math.abs(st.massError)).toBeLessThan(1e-9)
    const f = s.fieldsSync()
    expect(Math.min(...f.h)).toBeGreaterThanOrEqual(0)
    // The obstacles stayed dry.
    for (let c = 0; c < f.h.length; c++) if (grid.blocked[c]) expect(f.h[c]).toBe(0)
  }, 30_000)

  it('accounts for what leaves through free edges', () => {
    const grid = inclinedPlaneDemo({ nx: 40, ny: 30, dx: 2, slopeX: 0.02 })
    const s = new CpuInertialSolver({
      grid, hyetograph: constantStorm(80, 20, 5),
      params: { boundary: { west: 'closed', east: 'free', south: 'closed', north: 'closed' } },
    })
    s.advanceSync(40 * 60)
    const st = s.statsSync()
    expect(st.outflowVolume).toBeGreaterThan(0.5 * st.rainVolume)
    expect(Math.abs(st.massError)).toBeLessThan(1e-9)
  })

  it('never loses water to the limiter on a steep, nearly dry slope', () => {
    const grid = inclinedPlaneDemo({ nx: 30, ny: 30, dx: 1, slopeX: 0.15, slopeY: 0.08, roughnessAmplitude: 0.3 })
    const s = new CpuInertialSolver({
      grid, hyetograph: constantStorm(200, 10, 1),
      params: { boundary: { west: 'closed', east: 'closed', south: 'closed', north: 'closed' } },
    })
    s.advanceSync(20 * 60)
    expect(Math.abs(s.statsSync().massError)).toBeLessThan(1e-9)
  })
})

describe('rain on an inclined plane', () => {
  it('reaches the kinematic-wave steady state: outflow = rain, depth profile within 1%', () => {
    const L = 100
    const n = 0.03
    const S = 0.01
    const mmH = 50
    const R = mmH / 3_600_000
    const c = rainOnPlane(L, 1, S, n, mmH, 60)
    expect(kinematicEquilibriumTime(L, n, R, S)).toBeLessThan(c.durationS / 4)
    const s = run(c)
    const nx = c.grid.nx
    const W = nx + 1
    // Discharge per unit width leaving at the outlet (middle row) = R·L.
    const qOut = s.facesSync().qx[1 * W + nx]
    expect(qOut / (R * L)).toBeGreaterThan(0.99)
    expect(qOut / (R * L)).toBeLessThan(1.01)
    // Depth profile, away from the divide where the diffusive term matters.
    const f = s.fieldsSync()
    let worst = 0
    for (let i = 10; i < nx - 1; i++) {
      const x = (i + 1) * c.grid.dx // the water collected by cell i's downstream face
      const exact = kinematicPlaneDepth(x, n, R, S)
      worst = Math.max(worst, Math.abs(f.h[nx + i] - exact) / exact)
    }
    expect(worst).toBeLessThan(0.01)
    expect(Math.abs(s.statsSync().massError)).toBeLessThan(1e-9)
  })

  const outletSwing = (params: Record<string, unknown>, dx: number): number => {
    const R = 50 / 3_600_000
    const c = rainOnPlane(100, dx, 0.01, 0.03, 50, 60)
    const s = new CpuInertialSolver({ grid: c.grid, hyetograph: c.hyetograph, params: { ...c.params, ...params } })
    const W = c.grid.nx + 1
    let lo = Infinity
    let hi = -Infinity
    for (let t = 2400; t <= 3600; t += 120) {
      s.advanceSync(t)
      const q = s.facesSync().qx[W + c.grid.nx] / (R * 100)
      lo = Math.min(lo, q)
      hi = Math.max(hi, q)
    }
    return hi - lo
  }

  it('stays steady on shallow sheet flow with large cells and α up to 0.9 (implicit friction)', () => {
    expect(outletSwing({ alpha: 0.9 }, 1)).toBeLessThan(0.01)
    expect(outletSwing({ alpha: 0.7 }, 5)).toBeLessThan(0.01)
  })

  it('the lagged friction of Bates (2010) oscillates on that same flow — why it is not the default', () => {
    expect(outletSwing({ alpha: 0.7, friction: 'bates' }, 1)).toBeGreaterThan(0.3)
  })
})

describe('dam break (Ritter)', () => {
  it('keeps the undisturbed reservoir, mass and positivity; the front lags Ritter as the scheme predicts', () => {
    const c = damBreak(400, 0.5)
    const s = run(c)
    const f = s.fieldsSync()
    const nx = c.grid.nx
    const x0 = (nx / 2) * c.grid.dx
    const c0 = Math.sqrt(9.81)
    let err = 0
    let norm = 0
    let front = 0
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * c.grid.dx
      const exact = ritterDepth(x, c.durationS, x0, 1)
      const h = f.h[nx + i]
      err += Math.abs(h - exact)
      norm += exact
      if (h > 1e-3) front = (i + 1) * c.grid.dx
      // Upstream of the rarefaction head (x < x0 − c0·t) nothing has moved yet.
      if (x < x0 - c0 * c.durationS - 5) expect(Math.abs(h - 1)).toBeLessThan(1e-3)
    }
    expect(Math.min(...f.h)).toBeGreaterThanOrEqual(0)
    expect(Math.abs(s.statsSync().massError)).toBeLessThan(1e-12)
    // The local-inertial equations drop advection, so over a DRY bed the
    // rarefaction becomes a bore: a ~0.58 m plateau whose front travels about
    // half as far as Ritter's 2·√(g·h0)·t (measured: 26 m vs 75 m in 12 s, the
    // same for θ 0.8–1 and α 0.3–0.7). This is the scheme's documented limit
    // for supercritical flow, not a bug — and why the solver sits behind an
    // interface a shock-capturing scheme can replace.
    expect(front - x0).toBeGreaterThan(0.2 * 2 * c0 * c.durationS)
    expect(front - x0).toBeLessThan(1.05 * 2 * c0 * c.durationS)
    expect(err / norm).toBeLessThan(0.2)
  })
})

describe('maxima and arrival times', () => {
  it('records the peak depth, when it happened and when each cell first got wet', () => {
    const grid = createGrid(10, 3, 1, 0.03)
    for (let j = 0; j < 3; j++) for (let i = 0; i < 10; i++) grid.z[j * 10 + i] = (10 - i) * 0.01
    const s = new CpuInertialSolver({
      grid, hyetograph: constantStorm(300, 10, 10),
      params: { wetThreshold: 0.005, boundary: { west: 'closed', east: 'closed', south: 'closed', north: 'closed' } },
    })
    s.advanceSync(30 * 60)
    const m = s.maxFieldsSync()
    const f = s.fieldsSync()
    for (let c = 0; c < 30; c++) {
      expect(m.hMax[c]).toBeGreaterThanOrEqual(f.h[c] - 1e-7)
      if (m.hMax[c] > 0.005) {
        expect(m.tWet[c]).toBeGreaterThan(0)
        expect(m.tPeak[c]).toBeGreaterThanOrEqual(m.tWet[c])
      }
    }
  })
})
