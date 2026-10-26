// ─── shallow landslides: infinite slope + Monte Carlo ────────────────────────
// Factor of safety of a soil layer of VERTICAL thickness z over a planar slip
// surface parallel to the ground (Skempton & DeLory 1957; Hammond et al. 1992):
//
//   FS = [c + (γ − m·γw) · z · cos²β · tan φ] / (γ · z · sin β · cos β)
//
// c  effective cohesion of soil + roots, kPa      φ  friction angle
// γ  soil unit weight, kN/m³                     γw water, 9.81 kN/m³
// m  saturated fraction of the layer, 0–1        β  slope angle
//
// Parameters are uncertain, so P(failure) = P(FS < 1) is estimated by Monte
// Carlo. The SAME parameter samples are used for every cell (one soil unit,
// uncertain properties): that keeps the map spatially coherent and turns the
// per-cell work into a tight loop. Samples come from a seeded PRNG, so a run is
// reproducible.

export const GAMMA_W = 9.81

export interface SoilParams {
  cohesionKPa: number
  frictionDeg: number
  unitWeightKNm3: number
  depthM: number
}

/** Mean and coefficient of variation of each parameter (normal, truncated > 0). */
export interface SoilDistribution {
  mean: SoilParams
  cov: SoilParams
}

export function factorOfSafety(beta: number, m: number, p: SoilParams): number {
  const sin = Math.sin(beta)
  if (sin <= 1e-6) return Infinity
  const cos = Math.cos(beta)
  const z = p.depthM
  const resisting = p.cohesionKPa
    + (p.unitWeightKNm3 - m * GAMMA_W) * z * cos * cos * Math.tan((p.frictionDeg * Math.PI) / 180)
  return resisting / (p.unitWeightKNm3 * z * sin * cos)
}

/** mulberry32: tiny, fast, good enough for sampling. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

export function sampleSoil(dist: SoilDistribution, count: number, seed = 1): SoilParams[] {
  const rand = seededRandom(seed)
  const draw = (mean: number, cov: number, min: number): number => {
    for (let k = 0; k < 20; k++) {
      const v = mean * (1 + cov * normal(rand))
      if (v > min) return v
    }
    return Math.max(mean, min)
  }
  const out: SoilParams[] = []
  for (let s = 0; s < count; s++) {
    out.push({
      cohesionKPa: draw(dist.mean.cohesionKPa, dist.cov.cohesionKPa, 0),
      frictionDeg: Math.min(60, draw(dist.mean.frictionDeg, dist.cov.frictionDeg, 1)),
      unitWeightKNm3: draw(dist.mean.unitWeightKNm3, dist.cov.unitWeightKNm3, GAMMA_W + 1),
      depthM: draw(dist.mean.depthM, dist.cov.depthM, 0.1),
    })
  }
  return out
}

/** Typical residual / colluvial soils on Andean-type slopes; editable in the UI. */
export const DEFAULT_SOIL: SoilDistribution = {
  mean: { cohesionKPa: 5, frictionDeg: 32, unitWeightKNm3: 18, depthM: 1.5 },
  cov: { cohesionKPa: 0.4, frictionDeg: 0.1, unitWeightKNm3: 0.05, depthM: 0.3 },
}

/**
 * Probability of failure per cell for the current wetness. `beta` in radians,
 * `wetness` = m per cell (0–1). NaN slope → NaN probability.
 */
export function failureProbability(
  beta: Float32Array,
  wetness: Float32Array,
  samples: SoilParams[],
): Float32Array {
  const n = beta.length
  const out = new Float32Array(n)
  // Precompute per-sample constants: FS = (c + (γ − mγw) z cos²β tanφ) / (γ z sinβ cosβ)
  const S = samples.length
  const c = new Float64Array(S), tz = new Float64Array(S), g = new Float64Array(S), gz = new Float64Array(S)
  for (let s = 0; s < S; s++) {
    const p = samples[s]
    c[s] = p.cohesionKPa
    tz[s] = p.depthM * Math.tan((p.frictionDeg * Math.PI) / 180)
    g[s] = p.unitWeightKNm3
    gz[s] = p.unitWeightKNm3 * p.depthM
  }
  for (let i = 0; i < n; i++) {
    const b = beta[i]
    if (Number.isNaN(b)) { out[i] = NaN; continue }
    const sin = Math.sin(b)
    if (sin <= 1e-6) continue
    const cos = Math.cos(b)
    const cos2 = cos * cos
    const sc = sin * cos
    const mw = wetness[i] * GAMMA_W
    let fails = 0
    for (let s = 0; s < S; s++) {
      if (c[s] + (g[s] - mw) * tz[s] * cos2 < gz[s] * sc) fails++
    }
    out[i] = fails / S
  }
  return out
}

export interface WetnessOptions {
  /** Saturated fraction before the storm (antecedent moisture). */
  initial: number
  /** Drainable porosity of the soil, 0–1: water depth that saturates 1 m of soil. */
  drainablePorosity: number
  /** Upslope length at which lateral inflow doubles the infiltrated water, m. */
  referenceLengthM: number
  /** Cap on the lateral concentration factor. */
  maxConcentration: number
}

export const DEFAULT_WETNESS: WetnessOptions = {
  initial: 0.2,
  drainablePorosity: 0.15,
  referenceLengthM: 60,
  maxConcentration: 4,
}

/**
 * Saturated fraction of the layer after `retainedMm` of rain has entered the
 * soil. Hollows (large specific upslope area a/b) collect subsurface flow from
 * above, so their water table rises faster: the infiltrated depth is scaled by
 * 1 + (a/b) / L_ref, capped. A deliberate simplification of SHALSTAB/TRIGRS
 * that keeps the run interactive; documented as such in the panel.
 */
export function wetnessFrom(
  retainedMm: Float32Array,
  upslopeArea: Float32Array,
  dx: number,
  depthM: number,
  opts: WetnessOptions = DEFAULT_WETNESS,
): Float32Array {
  const n = retainedMm.length
  const out = new Float32Array(n)
  const capacityM = depthM * opts.drainablePorosity
  for (let i = 0; i < n; i++) {
    const specific = upslopeArea[i] / dx
    const k = Math.min(opts.maxConcentration, 1 + specific / opts.referenceLengthM)
    out[i] = Math.min(1, opts.initial + (retainedMm[i] / 1000) * k / capacityM)
  }
  return out
}
