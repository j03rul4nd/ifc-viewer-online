// ─── storm sweep and critical rainfall ───────────────────────────────────────
// Runs the hazard chain at each step of a cumulative-rain series and reports,
// per exposed element, the first cumulative rain at which it is reached by
// (a) a likely slope failure on its cells, (b) a debris path or deposit, or
// (c) more than a threshold of event runoff. That rain is the element's
// CRITICAL RAINFALL: an input for early-warning thresholds, not a forecast.

import { runoffMm } from './scs-cn'
import { flowAccumulation, d8Receivers, slopeRad, type Dem } from './terrain'
import {
  DEFAULT_SOIL, DEFAULT_WETNESS, failureProbability, sampleSoil,
  wetnessFrom, type SoilDistribution, type WetnessOptions,
} from './infinite-slope'
import { DEFAULT_RUNOUT, debrisRunout, type RunoutOptions } from './debris'

export type ExposedKind = 'housing' | 'school' | 'health' | 'road' | 'other'

export interface ExposedElement {
  id: string
  name: string
  kind: ExposedKind
  /** Grid cells the element covers (a point = 1 cell, a road = its line). */
  cells: number[]
}

export type HazardCause = 'landslide' | 'debris' | 'runoff'

export interface CriticalRain {
  id: string
  /** Cumulative rain (mm) of the first step that reached it; null = never in this storm. */
  rainMm: number | null
  cause: HazardCause | null
}

export interface HazardInput {
  dem: Dem
  /** Curve number per cell (NaN = outside). */
  cn: Float32Array
  /** Cumulative rain at the end of each step, mm, non-decreasing. */
  cumRainMm: number[]
  soil?: SoilDistribution
  wetness?: WetnessOptions
  runout?: RunoutOptions
  samples?: number
  seed?: number
  lambda?: number
  /** P(failure) above which a cell counts as failing for an element. */
  failThreshold?: number
  /** Runoff (mm) above which an element counts as reached by water. */
  runoffThresholdMm?: number
  elements?: ExposedElement[]
  /** Study area: 1 = inside. Outside cells get no slope failure and no sources. */
  mask?: Uint8Array | null
}

export interface HazardStep {
  rainMm: number
  runoffMm: Float32Array
  pFail: Float32Array
  debrisPath: Uint16Array
  debrisDeposit: Uint16Array
}

export interface HazardResult {
  slope: Float32Array
  upslopeArea: Float32Array
  steps: HazardStep[]
  critical: CriticalRain[]
}

export function runHazard(input: HazardInput): HazardResult {
  const { dem, cn, cumRainMm } = input
  const n = dem.z.length
  const soil = input.soil ?? DEFAULT_SOIL
  const lambda = input.lambda ?? 0.2
  const failThreshold = input.failThreshold ?? 0.5
  const runoffThreshold = input.runoffThresholdMm ?? 50
  const runout = { ...DEFAULT_RUNOUT, sourceThreshold: failThreshold, ...input.runout }

  const slope = slopeRad(dem)
  // Failure is only assessed inside the study area; flow still crosses out of it.
  const assessed = input.mask ? slope.map((b, c) => (input.mask![c] ? b : NaN)) : slope
  const receivers = d8Receivers(dem)
  const upslopeArea = flowAccumulation(dem, receivers)
  const samples = sampleSoil(soil, input.samples ?? 200, input.seed ?? 1)

  const steps: HazardStep[] = []
  const elements = input.elements ?? []
  const critical: CriticalRain[] = elements.map((e) => ({ id: e.id, rainMm: null, cause: null }))

  const retained = new Float32Array(n)
  for (const p of cumRainMm) {
    const runoff = new Float32Array(n)
    for (let c = 0; c < n; c++) {
      if (Number.isNaN(cn[c])) { runoff[c] = NaN; continue }
      const q = runoffMm(p, cn[c], lambda)
      runoff[c] = q
      retained[c] = p - q
    }
    const wet = wetnessFrom(retained, upslopeArea, dem.dx, soil.mean.depthM, input.wetness ?? DEFAULT_WETNESS)
    const pFail = failureProbability(assessed, wet, samples)
    const debris = debrisRunout(dem, pFail, runout, receivers)
    steps.push({ rainMm: p, runoffMm: runoff, pFail, debrisPath: debris.path, debrisDeposit: debris.deposit })

    elements.forEach((e, k) => {
      if (critical[k].rainMm !== null) return
      const cause = reachedBy(e.cells, pFail, debris.path, debris.deposit, runoff, failThreshold, runoffThreshold)
      if (cause) critical[k] = { id: e.id, rainMm: p, cause }
    })
  }
  return { slope, upslopeArea, steps, critical }
}

function reachedBy(
  cells: number[],
  pFail: Float32Array,
  path: Uint16Array,
  deposit: Uint16Array,
  runoff: Float32Array,
  failThreshold: number,
  runoffThreshold: number,
): HazardCause | null {
  let debris = false
  let water = false
  for (const c of cells) {
    if (pFail[c] >= failThreshold) return 'landslide'
    if (path[c] > 0 || deposit[c] > 0) debris = true
    if (runoff[c] >= runoffThreshold) water = true
  }
  return debris ? 'debris' : water ? 'runoff' : null
}

/** Even cumulative-rain ladder 0 < … ≤ maxMm, for critical-rain sweeps. */
export function rainLadder(maxMm: number, stepMm: number): number[] {
  const out: number[] = []
  for (let p = stepMm; p <= maxMm + 1e-9; p += stepMm) out.push(Math.round(p * 1000) / 1000)
  return out
}
