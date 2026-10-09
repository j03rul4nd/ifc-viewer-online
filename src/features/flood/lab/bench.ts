// ─── benchmark ────────────────────────────────────────────────────────────────
// Throughput of each GPU backend on the city demo at several grid sizes: steps
// per second, milliseconds per step and simulated seconds per wall second
// (×real time), after a warm-up batch (pipeline compilation, first upload).

import { cityDemo } from '../core/cases'
import type { FloodBackend, FloodSolver } from '../core/solver-api'
import { WebGpuInertialSolver } from '../gpu/webgpu-inertial'
import { WebGl2InertialSolver } from '../gpu/webgl2-inertial'

export interface BenchRow {
  backend: FloodBackend
  power: 'low-power' | 'high-performance'
  device: string
  n: number
  cells: number
  steps: number
  wallS: number
  simS: number
  stepsPerSecond: number
  msPerStep: number
  speedup: number
  meanDtS: number
  massError: number
}

export interface BenchOptions {
  sizes?: number[]
  backends?: FloodBackend[]
  powers?: Array<'low-power' | 'high-performance'>
  /** Wall time per measurement, s. */
  seconds?: number
}

export async function runBench(o: BenchOptions = {}): Promise<BenchRow[]> {
  const sizes = o.sizes ?? [250, 500, 1000]
  const backends = o.backends ?? ['webgpu', 'webgl2']
  const powers = o.powers ?? ['low-power', 'high-performance']
  const seconds = o.seconds ?? 4
  const rows: BenchRow[] = []
  for (const backend of backends) {
    for (const power of powers) {
      for (const n of sizes) {
        const c = cityDemo(n, 2, 90, 45)
        let s: FloodSolver
        let device = ''
        if (backend === 'webgpu') {
          const w = await WebGpuInertialSolver.create({ grid: c.grid, hyetograph: c.hyetograph, params: c.params }, { powerPreference: power })
          device = [w.adapter.vendor, w.adapter.architecture, w.adapter.description].filter(Boolean).join(' ')
          s = w
        } else {
          const w = await WebGl2InertialSolver.create({ grid: c.grid, hyetograph: c.hyetograph, params: c.params }, { powerPreference: power })
          device = w.renderer
          s = w
        }
        try {
          // Warm-up: wet the grid a little so the CFL step is representative of
          // a storm. Batches sized to the steps actually needed: steps past the
          // stop time are no-ops but still cost a dispatch each.
          const tw = performance.now()
          for (let r = await s.advance(600, 64); r.t < 600 - 1e-3; r = await s.advance(600, Math.min(1024, Math.ceil((600 - r.t) / Math.max(r.dt, 0.05)) + 1))) { /* warm up */ }
          console.log(`[bench] ${backend} ${power} ${n}²: warm-up ${Math.round(performance.now() - tw)} ms`)
          let batch = 32
          const st0 = await s.stats()
          const t0 = performance.now()
          let steps = 0
          while (performance.now() - t0 < seconds * 1000) {
            const tb = performance.now()
            const r = await s.advance(c.durationS, batch)
            steps += r.steps
            const ms = performance.now() - tb
            if (ms < 40 && batch < 2048) batch *= 2
            if (r.t >= c.durationS - 1e-3) break
          }
          const wallS = (performance.now() - t0) / 1000
          const st1 = await s.stats()
          console.log(`[bench] ${backend} ${power} ${n}²: ${steps} steps in ${wallS.toFixed(2)} s`)
          const simS = st1.t - st0.t
          rows.push({
            backend, power, device, n, cells: n * n, steps, wallS, simS,
            stepsPerSecond: steps / wallS,
            msPerStep: (wallS * 1000) / Math.max(steps, 1),
            speedup: simS / wallS,
            meanDtS: simS / Math.max(steps, 1),
            massError: st1.massError,
          })
        } finally {
          s.dispose()
        }
      }
    }
  }
  return rows
}
