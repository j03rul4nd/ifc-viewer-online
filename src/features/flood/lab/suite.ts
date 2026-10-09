// ─── GPU ⇄ CPU parity suite ───────────────────────────────────────────────────
// Runs the reference cases (core/cases.ts) on the CPU solver and on each GPU
// backend this browser has, and checks that the GPU agrees with the CPU to
// float32 precision and keeps the physics checks: the lake stays still, mass
// balances, the plane drains what falls on it. Driven from the lab page and
// from scripts/flood/gpu-suite.mjs in a real Chrome (vitest has no GPU).

import { CpuInertialSolver } from '../core/cpu-inertial'
import { cityDemo, damBreak, lakeAtRest, rainOnPlane, type FloodCase } from '../core/cases'
import type { FloodBackend, FloodSolver } from '../core/solver-api'
import { WebGpuInertialSolver } from '../gpu/webgpu-inertial'
import { WebGl2InertialSolver } from '../gpu/webgl2-inertial'

export interface CaseResult {
  case: string
  backend: FloodBackend
  pass: boolean
  failures: string[]
  metrics: Record<string, number>
  ms: number
}

type GpuSolver = FloodSolver & { faces(): Promise<{ qx: Float32Array; qy: Float32Array }> }

async function makeGpu(backend: FloodBackend, c: FloodCase): Promise<GpuSolver> {
  const init = { grid: cloneGrid(c.grid), hyetograph: c.hyetograph, params: c.params }
  if (backend === 'webgpu') return WebGpuInertialSolver.create(init)
  return WebGl2InertialSolver.create(init)
}

function cloneGrid<T extends FloodCase['grid']>(g: T): T {
  return {
    ...g,
    z: g.z.slice(), blocked: g.blocked.slice(), rainFactor: g.rainFactor.slice(), manning: g.manning.slice(),
    h0: g.h0?.slice(),
  }
}

async function runGpu(s: FloodSolver, untilS: number): Promise<void> {
  for (let guard = 0; guard < 100_000; guard++) {
    const r = await s.advance(untilS, 512)
    if (r.t >= untilS - 1e-6) return
  }
  throw new Error('GPU run did not reach the end time')
}

export async function runCase(c: FloodCase, backend: FloodBackend): Promise<CaseResult> {
  const t0 = performance.now()
  const failures: string[] = []
  const m: Record<string, number> = {}
  const cpu = new CpuInertialSolver({ grid: cloneGrid(c.grid), hyetograph: c.hyetograph, params: c.params })
  cpu.advanceSync(c.durationS)
  const gpu = await makeGpu(backend, c)
  try {
    await runGpu(gpu, c.durationS)
    const [gs, gf] = [await gpu.stats(), await gpu.fields()]
    const cs = cpu.statsSync()
    const cf = cpu.fieldsSync()
    let maxAbs = 0
    let l1 = 0
    let norm = 0
    let maxV = 0
    for (let k = 0; k < cf.h.length; k++) {
      const d = Math.abs(gf.h[k] - cf.h[k])
      if (d > maxAbs) maxAbs = d
      l1 += d
      norm += Math.abs(cf.h[k])
      maxV = Math.max(maxV, Math.abs(gf.u[k]), Math.abs(gf.v[k]))
    }
    m.tGpu = gs.t
    m.tCpu = cs.t
    m.stepsGpu = gs.steps
    m.stepsCpu = cs.steps
    m.maxAbsDh = maxAbs
    m.relL1 = norm > 0 ? l1 / norm : l1
    m.massErrorGpu = gs.massError
    m.massErrorCpu = cs.massError
    m.volumeGpu = gs.volume
    m.volumeCpu = cs.volume
    m.maxSpeedGpu = maxV
    if (Math.abs(gs.t - c.durationS) > 1e-6) failures.push(`GPU stopped at ${gs.t} s, not ${c.durationS} s`)

    const check = (ok: boolean, msg: string): void => { if (!ok) failures.push(msg) }
    switch (c.id) {
      case 'lake-at-rest': {
        let dh0 = 0
        for (let k = 0; k < gf.h.length; k++) dh0 = Math.max(dh0, Math.abs(gf.h[k] - (c.grid.h0?.[k] ?? 0)))
        m.maxDhFromStart = dh0
        check(dh0 < 1e-6, `lake moved: max |Δh| = ${dh0}`)
        check(maxV < 1e-6, `lake moved: max |v| = ${maxV}`)
        check(Math.abs(gs.massError) < 1e-6, `mass error ${gs.massError}`)
        break
      }
      case 'dam-break':
        check(m.relL1 < 2e-3, `differs from CPU: relative L1 ${m.relL1}`)
        check(Math.abs(gs.massError) < 1e-5, `mass error ${gs.massError}`)
        break
      case 'rain-on-plane': {
        const nx = c.grid.nx
        const W = nx + 1
        const R = c.hyetograph.intensityMmH[0] / 3_600_000
        const L = nx * c.grid.dx
        const q = (await gpu.faces()).qx[W + nx]
        m.outletOverRain = q / (R * L)
        check(Math.abs(m.outletOverRain - 1) < 0.01, `outlet discharge ${m.outletOverRain}× the rain`)
        check(m.relL1 < 1e-3, `differs from CPU: relative L1 ${m.relL1}`)
        check(Math.abs(gs.massError) < 1e-4, `mass error ${gs.massError}`)
        break
      }
      default:
        check(m.relL1 < 2e-2, `differs from CPU: relative L1 ${m.relL1}`)
        check(Math.abs(gs.massError) < 1e-4, `mass error ${gs.massError}`)
        check(Math.abs(gs.volume - cs.volume) / Math.max(cs.volume, 1e-9) < 1e-3, `volume ${gs.volume} vs CPU ${cs.volume}`)
    }
  } finally {
    gpu.dispose()
  }
  return { case: c.id, backend, pass: failures.length === 0, failures, metrics: m, ms: Math.round(performance.now() - t0) }
}

export const SUITE_CASES = (): FloodCase[] => [lakeAtRest(64), damBreak(400, 0.5), rainOnPlane(100, 1, 0.01, 0.03, 50, 60), cityDemo(96, 2, 90, 30)]

export async function runSuite(backends: FloodBackend[]): Promise<CaseResult[]> {
  const out: CaseResult[] = []
  for (const c of SUITE_CASES()) {
    for (const b of backends) {
      try {
        out.push(await runCase(c, b))
      } catch (err) {
        out.push({ case: c.id, backend: b, pass: false, failures: [(err as Error)?.message ?? String(err)], metrics: {}, ms: 0 })
      }
    }
  }
  return out
}
