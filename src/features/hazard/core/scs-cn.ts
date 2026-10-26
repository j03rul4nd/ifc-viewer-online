// ─── SCS curve number runoff ─────────────────────────────────────────────────
// USDA-NRCS (TR-55 / NEH-630 ch. 10): the depth of rain that becomes runoff
// once the soil's initial abstraction is spent,
//
//   S  = 25400 / CN − 254          potential retention, mm
//   Ia = λ · S                      initial abstraction, mm (λ = 0.2 classic, 0.05 updated)
//   Q  = (P − Ia)² / (P − Ia + S)   for P > Ia, else 0
//
// Q is a function of the CUMULATIVE rain P of the event, so the runoff of one
// time step is Q(P_k) − Q(P_{k−1}); what does not run off (P − Q) infiltrates
// or is held, and feeds the slope model's soil wetness.

export type SoilGroup = 'A' | 'B' | 'C' | 'D'
export type Moisture = 'I' | 'II' | 'III'

export type LandCover =
  | 'forest' | 'shrub' | 'grass' | 'crop' | 'bare' | 'urban' | 'road' | 'water' | 'wetland'

/** CN for antecedent moisture II, TR-55 table 2-2 (fair hydrologic condition). */
const CN_II: Record<LandCover, [number, number, number, number]> = {
  forest: [36, 60, 73, 79],
  shrub: [35, 56, 70, 77],
  grass: [49, 69, 79, 84],
  crop: [67, 78, 85, 89],
  bare: [77, 86, 91, 94],
  urban: [77, 85, 90, 92],
  road: [98, 98, 98, 98],
  water: [100, 100, 100, 100],
  wetland: [78, 78, 78, 78],
}

const GROUP_INDEX: Record<SoilGroup, number> = { A: 0, B: 1, C: 2, D: 3 }

export function curveNumber(cover: LandCover, group: SoilGroup, moisture: Moisture = 'II'): number {
  return adjustMoisture(CN_II[cover][GROUP_INDEX[group]], moisture)
}

/** Chow, Maidment & Mays (1988) eq. 5.5.4–5.5.5: dry (I) and wet (III) conditions. */
export function adjustMoisture(cn: number, moisture: Moisture): number {
  if (moisture === 'II' || cn >= 100) return cn
  return moisture === 'I'
    ? (4.2 * cn) / (10 - 0.058 * cn)
    : (23 * cn) / (10 + 0.13 * cn)
}

export function retentionMm(cn: number): number {
  return cn >= 100 ? 0 : 25400 / cn - 254
}

/** Runoff depth (mm) produced by a cumulative rain P (mm). */
export function runoffMm(pMm: number, cn: number, lambda = 0.2): number {
  if (cn >= 100) return Math.max(0, pMm)
  const s = retentionMm(cn)
  const ia = lambda * s
  if (pMm <= ia) return 0
  const e = pMm - ia
  return (e * e) / (e + s)
}

/** Rain (mm) at which runoff starts: the initial abstraction. */
export const initialAbstractionMm = (cn: number, lambda = 0.2): number => lambda * retentionMm(cn)

/**
 * Per-step runoff and retained (infiltrated + held) depth for a whole grid.
 * `cumRainMm[k]` is the cumulative rain at the END of step k; returns
 * `runoff[k * n + c]` and `retained[k * n + c]` in mm for that step only.
 */
export function stepRunoffGrid(
  cn: Float32Array,
  cumRainMm: ArrayLike<number>,
  lambda = 0.2,
): { runoff: Float32Array; retained: Float32Array } {
  const n = cn.length
  const steps = cumRainMm.length
  const runoff = new Float32Array(n * steps)
  const retained = new Float32Array(n * steps)
  for (let c = 0; c < n; c++) {
    let pPrev = 0
    let qPrev = 0
    for (let k = 0; k < steps; k++) {
      const p = cumRainMm[k]
      const q = runoffMm(p, cn[c], lambda)
      runoff[k * n + c] = q - qPrev
      retained[k * n + c] = p - pPrev - (q - qPrev)
      pPrev = p
      qPrev = q
    }
  }
  return { runoff, retained }
}
