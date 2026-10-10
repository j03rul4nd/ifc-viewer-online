// ─── CPU local-inertial solver (the reference) ───────────────────────────────
// The scheme of Bates et al. (2010) with the flux weighting of de Almeida et al.
// (2012), in float64, written for clarity rather than speed. It is the yardstick
// the GPU solvers are tested against: same clock, same step rule, same
// limiter, same boundary treatment — the shaders mirror this file line by line.
//
// One step:
//   1. FLUX on every face, semi-implicit in friction:
//        q⁺ = (q̄ − g·h_f·Δt·∂η/∂x) / (1 + g·Δt·n²·|q| / h_f^(7/3))
//      with η = z + h, h_f = max(η_L, η_R) − max(z_L, z_R) (no flow below hEps),
//      q̄ = θ·q + (1 − θ)·(q_prev + q_next)/2 (de Almeida), n the mean of the two
//      cells. Faces touching an obstacle carry nothing.
//      A FREE edge lets water out only, driven by the bed slope falling outwards
//      (at least freeSlopeMin) — the "normal depth" outlet of LISFLOOD-FP.
//   2. LIMITER: a cell whose outflows would take more than the water it holds
//      has all of them scaled down by h / outflow. Each face has one donor, so
//      the scaling conserves mass exactly and depth never goes negative.
//   3. CONTINUITY: h += Δt/Δx · (in − out) + Δt · rain · rainFactor, then
//      infiltration takes min(h, f(t)·Δt) (Horton, from the step's start time).
//
// The step itself is chosen by nextStepMs (solver-api.ts).

import { effectiveRainArea, initialVolume, validateGrid, type FloodGrid } from './grid'
import { intervalMs, ratesMs, type Hyetograph } from './hyetograph'
import { packDisplay } from './half'
import {
  infiltrationRate, nextStepMs, resolveParams,
  type AdvanceResult, type FieldFrame, type FloodSolver, type FloodStats, type MaxFields, type SolverInit, type SolverParams,
} from './solver-api'

/**
 * Friction of the momentum update q⁺ = b − a·|q|·q⁺, with b the inertial and
 * gravity terms and a = g·Δt·n² / h_f^(7/3).
 *
 * 'bates': |q| from the previous step (Bates et al. 2010):
 *   q⁺ = b / (1 + a·|q_old|).
 * 'implicit': |q⁺| itself, i.e. the root of q⁺·(1 + a·|q⁺|) = b:
 *   q⁺ = 2b / (1 + √(1 + 4a·|b|)).
 * Both have the same steady state (Manning). On shallow, friction-dominated
 * sheet flow — rain on a slope, the case this feature lives on — the lagged
 * form degenerates into q⁺ ≈ C / q_old and oscillates with period two at the
 * usual α = 0.7 (measured: outlet discharge swinging 0.43–1.68× the rain);
 * the implicit root does not.
 */
export function frictionSolve(b: number, a: number, qOld: number, implicit: boolean): number {
  if (!implicit) return b / (1 + a * Math.abs(qOld))
  return (2 * b) / (1 + Math.sqrt(1 + 4 * a * Math.abs(b)))
}

export class CpuInertialSolver implements FloodSolver {
  readonly backend = 'cpu' as const
  readonly grid: FloodGrid
  readonly params: SolverParams
  private readonly hyeto: Hyetograph
  private readonly rates: Float32Array
  private readonly ivMs: number

  private readonly h: Float64Array
  private readonly u: Float64Array
  private readonly v: Float64Array
  private qx: Float64Array
  private qy: Float64Array
  private qxN: Float64Array
  private qyN: Float64Array
  private readonly factor: Float64Array
  private readonly mh: Float64Array
  private readonly mv: Float64Array
  private readonly mt: Float64Array
  private readonly mw: Float64Array
  /** Depth absorbed by the ground so far, per cell (m). */
  private readonly inf: Float64Array

  private tMs = 0
  private stepCount = 0
  private lastDtMs = 0
  private hMaxNow = 0
  private rainDepth = 0
  private outflow = 0
  private readonly rainArea: number
  private readonly v0: number

  constructor(init: SolverInit) {
    const g = validateGrid(init.grid)
    this.grid = g
    this.params = resolveParams(init.params)
    this.hyeto = init.hyetograph
    this.rates = ratesMs(init.hyetograph)
    this.ivMs = intervalMs(init.hyetograph)
    const nc = g.nx * g.ny
    const nf = (g.nx + 1) * (g.ny + 1)
    this.h = new Float64Array(nc)
    if (g.h0) for (let c = 0; c < nc; c++) this.h[c] = g.blocked[c] ? 0 : g.h0[c]
    this.u = new Float64Array(nc)
    this.v = new Float64Array(nc)
    this.qx = new Float64Array(nf)
    this.qy = new Float64Array(nf)
    this.qxN = new Float64Array(nf)
    this.qyN = new Float64Array(nf)
    this.factor = new Float64Array(nc).fill(1)
    this.mh = Float64Array.from(this.h)
    this.mv = new Float64Array(nc)
    this.mt = new Float64Array(nc)
    this.mw = new Float64Array(nc).fill(-1)
    this.inf = new Float64Array(nc)
    for (let c = 0; c < nc; c++) {
      if (this.h[c] > this.hMaxNow) this.hMaxNow = this.h[c]
      if (this.h[c] > this.params.wetThreshold) this.mw[c] = 0
    }
    this.rainArea = effectiveRainArea(g)
    this.v0 = initialVolume(g)
  }

  /** One step; false when there was nothing left to do before tStopMs. */
  step(tStopMs: number): boolean {
    const g = this.grid
    const p = this.params
    const { nx, ny, dx, z, blocked, manning: nm, rainFactor } = g
    const dtMs = nextStepMs(this.tMs, tStopMs, this.hMaxNow, dx, p, this.ivMs, this.rates.length)
    if (dtMs === 0) return false
    const dt = dtMs / 1000
    const idx = Math.floor(this.tMs / this.ivMs)
    const rate = idx < this.rates.length ? this.rates[idx] : 0
    const { h, qx, qy, qxN, qyN, factor } = this
    const W = nx + 1
    const G = p.g
    const th = p.theta
    const free = p.boundary
    const implicit = p.friction === 'implicit'

    // 1. Fluxes.
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const f = j * W + i
        // x face west of cell (i, j)
        if (j < ny) {
          let q = 0
          if (i === 0 || i === nx) {
            const west = i === 0
            if (west ? free.west === 'free' : free.east === 'free') {
              const ci = west ? 0 : nx - 1
              const c = j * nx + ci
              const hc = h[c]
              if (!blocked[c] && hc > p.hEps) {
                let slope = p.freeSlopeMin
                if (nx >= 2) {
                  const inner = j * nx + (west ? 1 : nx - 2)
                  slope = Math.max((z[inner] - z[c]) / dx, p.freeSlopeMin)
                }
                const sign = west ? -1 : 1
                const qo = Math.max(sign * qx[f], 0)
                const n = nm[c]
                q = sign * frictionSolve(qo + G * hc * dt * slope, (G * dt * n * n) / Math.pow(hc, 7 / 3), qo, implicit)
              }
            }
          } else {
            const L = j * nx + i - 1
            const R = L + 1
            if (!blocked[L] && !blocked[R]) {
              const eL = z[L] + h[L]
              const eR = z[R] + h[R]
              const hf = Math.max(eL, eR) - Math.max(z[L], z[R])
              if (hf > p.hEps) {
                const qOld = qx[f]
                const qBar = th * qOld + (1 - th) * 0.5 * (qx[f - 1] + qx[f + 1])
                const n = 0.5 * (nm[L] + nm[R])
                const slope = (eR - eL) / dx
                q = frictionSolve(qBar - G * hf * dt * slope, (G * dt * n * n) / Math.pow(hf, 7 / 3), qOld, implicit)
              }
            }
          }
          qxN[f] = q
        }
        // y face south of cell (i, j)
        if (i < nx) {
          let q = 0
          if (j === 0 || j === ny) {
            const south = j === 0
            if (south ? free.south === 'free' : free.north === 'free') {
              const cj = south ? 0 : ny - 1
              const c = cj * nx + i
              const hc = h[c]
              if (!blocked[c] && hc > p.hEps) {
                let slope = p.freeSlopeMin
                if (ny >= 2) {
                  const inner = (south ? 1 : ny - 2) * nx + i
                  slope = Math.max((z[inner] - z[c]) / dx, p.freeSlopeMin)
                }
                const sign = south ? -1 : 1
                const qo = Math.max(sign * qy[f], 0)
                const n = nm[c]
                q = sign * frictionSolve(qo + G * hc * dt * slope, (G * dt * n * n) / Math.pow(hc, 7 / 3), qo, implicit)
              }
            }
          } else {
            const B = (j - 1) * nx + i
            const T = B + nx
            if (!blocked[B] && !blocked[T]) {
              const eB = z[B] + h[B]
              const eT = z[T] + h[T]
              const hf = Math.max(eB, eT) - Math.max(z[B], z[T])
              if (hf > p.hEps) {
                const qOld = qy[f]
                const qBar = th * qOld + (1 - th) * 0.5 * (qy[f - W] + qy[f + W])
                const n = 0.5 * (nm[B] + nm[T])
                const slope = (eT - eB) / dx
                q = frictionSolve(qBar - G * hf * dt * slope, (G * dt * n * n) / Math.pow(hf, 7 / 3), qOld, implicit)
              }
            }
          }
          qyN[f] = q
        }
      }
    }

    // 2. Limiter: how much of each cell's water the outflows may take.
    const k = dt / dx
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        const f = j * W + i
        const out = (Math.max(-qxN[f], 0) + Math.max(qxN[f + 1], 0) + Math.max(-qyN[f], 0) + Math.max(qyN[f + W], 0)) * k
        factor[c] = out > h[c] ? h[c] / out : 1
      }
    }

    // 3. Scale each face by its donor's factor; count what leaves the grid.
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const f = j * W + i
        if (j < ny) {
          const q = qxN[f]
          if (q !== 0) {
            const donor = q > 0 ? (i > 0 ? j * nx + i - 1 : -1) : (i < nx ? j * nx + i : -1)
            const s = donor >= 0 ? q * factor[donor] : 0
            qxN[f] = s
            if (i === 0 || i === nx) this.outflow += Math.abs(s) * dt * dx
          }
        }
        if (i < nx) {
          const q = qyN[f]
          if (q !== 0) {
            const donor = q > 0 ? (j > 0 ? (j - 1) * nx + i : -1) : (j < ny ? j * nx + i : -1)
            const s = donor >= 0 ? q * factor[donor] : 0
            qyN[f] = s
            if (j === 0 || j === ny) this.outflow += Math.abs(s) * dt * dx
          }
        }
      }
    }

    // 4. Continuity, velocities, maxima; then the ground takes its share
    // (never more than the water there).
    const tEnd = (this.tMs + dtMs) / 1000
    const loss = infiltrationRate(p.infiltration, this.tMs / 1000) * dt
    let hm = 0
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        if (blocked[c]) continue
        const f = j * W + i
        const qL = qxN[f]
        const qR = qxN[f + 1]
        const qB = qyN[f]
        const qT = qyN[f + W]
        let hn = h[c] + k * (qL - qR + qB - qT) + dt * rate * rainFactor[c]
        if (hn < 0) hn = 0
        if (loss > 0) {
          const l = Math.min(hn, loss)
          hn -= l
          this.inf[c] += l
        }
        h[c] = hn
        let uc = 0
        let vc = 0
        if (hn > p.hEps) {
          uc = (0.5 * (qL + qR)) / hn
          vc = (0.5 * (qB + qT)) / hn
        }
        this.u[c] = uc
        this.v[c] = vc
        if (hn > this.mh[c]) {
          this.mh[c] = hn
          this.mt[c] = tEnd
        }
        if (hn > p.wetThreshold) {
          const sp = Math.hypot(uc, vc)
          if (sp > this.mv[c]) this.mv[c] = sp
          if (this.mw[c] < 0) this.mw[c] = tEnd
        }
        if (hn > hm) hm = hn
      }
    }
    this.hMaxNow = hm
    this.qx = qxN
    this.qy = qyN
    this.qxN = qx
    this.qyN = qy
    this.tMs += dtMs
    this.lastDtMs = dtMs
    this.stepCount++
    this.rainDepth += rate * dt
    return true
  }

  advanceSync(tStopS: number, maxSteps = Infinity): AdvanceResult {
    const stop = Math.round(tStopS * 1000)
    let n = 0
    while (n < maxSteps && this.step(stop)) n++
    return { t: this.tMs / 1000, steps: n, dt: this.lastDtMs / 1000 }
  }

  async advance(tStopS: number, maxSteps: number): Promise<AdvanceResult> {
    return this.advanceSync(tStopS, maxSteps)
  }

  statsSync(): FloodStats {
    const g = this.grid
    const p = this.params
    let vol = 0
    let wet = 0
    let vMax = 0
    let infd = 0
    for (let c = 0; c < this.h.length; c++) {
      const hc = this.h[c]
      vol += hc
      infd += this.inf[c]
      if (hc > p.wetThreshold) {
        wet++
        const sp = Math.hypot(this.u[c], this.v[c])
        if (sp > vMax) vMax = sp
      }
    }
    const a = g.dx * g.dx
    const volume = vol * a
    const rainVolume = this.rainDepth * this.rainArea
    const infiltratedVolume = infd * a
    const denom = Math.max(rainVolume + this.v0, 1e-12)
    return {
      t: this.tMs / 1000,
      dt: this.lastDtMs / 1000,
      steps: this.stepCount,
      hMax: this.hMaxNow,
      vMax,
      volume,
      floodedArea: wet * a,
      rainVolume,
      outflowVolume: this.outflow,
      infiltratedVolume,
      initialVolume: this.v0,
      massError: (volume + this.outflow + infiltratedVolume - rainVolume - this.v0) / denom,
    }
  }

  async stats(): Promise<FloodStats> {
    return this.statsSync()
  }

  fieldsSync(): FieldFrame {
    return {
      t: this.tMs / 1000, nx: this.grid.nx, ny: this.grid.ny,
      h: Float32Array.from(this.h), u: Float32Array.from(this.u), v: Float32Array.from(this.v),
    }
  }

  async fields(): Promise<FieldFrame> {
    return this.fieldsSync()
  }

  maxFieldsSync(): MaxFields {
    return {
      nx: this.grid.nx, ny: this.grid.ny,
      hMax: Float32Array.from(this.mh), vMax: Float32Array.from(this.mv),
      tPeak: Float32Array.from(this.mt), tWet: Float32Array.from(this.mw),
    }
  }

  async maxFields(): Promise<MaxFields> {
    return this.maxFieldsSync()
  }

  async displayFrame(): Promise<Uint16Array> {
    return packDisplay(this.h, this.u, this.v, this.mh)
  }

  /** Face fluxes, for tests (qx west of each cell, qy south of it). */
  facesSync(): { qx: Float64Array; qy: Float64Array } {
    return { qx: this.qx, qy: this.qy }
  }

  get hyetograph(): Hyetograph {
    return this.hyeto
  }

  dispose(): void { /* nothing to release */ }
}
