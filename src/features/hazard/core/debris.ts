// ─── debris-flow runout ──────────────────────────────────────────────────────
// From every source cell (P(failure) above a threshold) the flow follows the
// steepest descent (D8) and stops where the line from the source to the front
// gets flatter than the travel angle α (Heim's "Fahrböschung": H / L = tan α),
// or at the edge. Across flats and small counter-slopes (no D8 descent) the
// front keeps its last heading while the energy line allows: that is how a
// flow spreads over its fan. The stop cell is the deposit. Empirical, cheap and
// conservative for channelised flows; the panel says it is indicative.

import { d8Receivers, type Dem } from './terrain'

export interface RunoutOptions {
  /** Sources: cells with P(failure) ≥ this. */
  sourceThreshold: number
  /** Travel angle α in degrees (H/L); 11–15° typical for debris flows. */
  travelAngleDeg: number
  /** Safety cap on path length, cells. */
  maxSteps: number
}

export const DEFAULT_RUNOUT: RunoutOptions = { sourceThreshold: 0.5, travelAngleDeg: 12, maxSteps: 5000 }

export interface Runout {
  /** Number of debris paths crossing each cell. */
  path: Uint16Array
  /** Number of paths depositing in each cell. */
  deposit: Uint16Array
  sources: number
}

export function debrisRunout(
  dem: Dem,
  pFail: Float32Array,
  opts: RunoutOptions = DEFAULT_RUNOUT,
  receivers: Int32Array = d8Receivers(dem),
): Runout {
  const { nx, ny, dx, z } = dem
  const n = z.length
  const path = new Uint16Array(n)
  const deposit = new Uint16Array(n)
  const tanA = Math.tan((opts.travelAngleDeg * Math.PI) / 180)
  let sources = 0
  for (let s = 0; s < n; s++) {
    if (!(pFail[s] >= opts.sourceThreshold)) continue
    sources++
    const z0 = z[s]
    let c = s
    let len = 0
    let steps = 0
    let di = 0
    let dj = 0
    if (path[c] < 65535) path[c]++
    for (;;) {
      if (steps++ >= opts.maxSteps) break
      const ci = c % nx
      const cj = (c - ci) / nx
      let r = receivers[c]
      if (r < 0 && (di || dj)) {
        const ii = ci + di, jj = cj + dj
        r = ii >= 0 && jj >= 0 && ii < nx && jj < ny && !Number.isNaN(z[jj * nx + ii]) ? jj * nx + ii : -1
      }
      if (r < 0) break
      const ri = r % nx
      const rj = (r - ri) / nx
      const diag = ri !== ci && rj !== cj
      const nextLen = len + (diag ? Math.SQRT2 : 1) * dx
      // Reach is spent once the energy line H/L drops below tan α.
      if ((z0 - z[r]) / nextLen < tanA) break
      len = nextLen
      di = ri - ci
      dj = rj - cj
      c = r
      if (path[c] < 65535) path[c]++
    }
    if (deposit[c] < 65535) deposit[c]++
  }
  return { path, deposit, sources }
}
