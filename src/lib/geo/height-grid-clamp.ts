// ─── height-grid-clamp ────────────────────────────────────────────────────────
// ONE BAD PIXEL IS A TWO-HUNDRED-METRE CRATER.
//
// `terrain-truth` already says the thing this module enforces: "the DEM is a
// witness, not an oracle". It says it for POINT queries — where a road is
// draped, where a quay sits — and nothing outside it may call the raw sampler.
//
// The terrain MESH never went through it. The worker decodes nine terrarium
// tiles into one grid and meshes the numbers exactly as they arrive.
//
// ── What that costs, measured ─────────────────────────────────────────────────
//
// Decoded the z15 terrarium tile over Lujiazui, 65 536 samples:
//
//   min −101.8   p1 −5.8   median 8.9   p99 56.4   max 108.7
//   samples below −20 m: 62, which is 0.1 %
//
// So the raster is almost entirely sane and carries a fraction of a per cent of
// rubbish — voids, water artefacts, edge pixels. Rendered raw in a city that is
// flat at about 4 m, that fraction produced a mesh spanning −218 to +72 metres.
// Worse than the source, because the bicubic resample used to build the grid
// RINGS at a discontinuity and throws the overshoot into the neighbours: a
// single void pixel becomes a crater tens of metres across.
//
// Everything draped on it goes along. Measured in the same scene: roads from
// −101 to +30, greenery down to −197, and the Huangpu's own polygon levelled
// into a hole at −48, which is why a district defined by its river bend
// rendered without any visible water at all.
//
// ── Why percentiles and not a fixed band ──────────────────────────────────────
//
// A constant like "reject below −50 m" is wrong in both directions: it deletes
// real terrain in the Dead Sea basin and passes rubbish in the Andes. The grid
// describes its own plausible range, and an interpercentile band around it
// adapts to whatever landscape was fetched. It is the same trade `terrain-truth`
// makes when it takes a low percentile rather than a minimum — keep the
// envelope, spend one sample on robustness.
//
// PURE: numbers in, numbers out. No I/O, no THREE, no tiles.

/**
 * Percentile pair that defines "what this landscape looks like".
 *
 * Deliberately not 0/100: the whole point is that the extremes are the
 * untrustworthy part.
 */
export const LOW_PCT = 0.01
export const HIGH_PCT = 0.99

/**
 * How far past the interpercentile range a sample may still be real, as a
 * multiple of that range.
 *
 * Generous. A summit or a gorge genuinely sits outside the middle 98 % of its
 * own map, and clipping real relief to make a statistic tidy would be the
 * opposite of the point. What this rejects is the value that is not merely
 * extreme but unrelated — a void, a decode artefact, a no-data sentinel.
 */
export const OUTLIER_SLACK = 1.0

/**
 * Smallest band worth allowing, metres.
 *
 * A genuinely flat grid has an interpercentile range near zero, and a band
 * proportional to it would clamp the landscape to a plane and delete the very
 * relief the terrain patch exists to show. Below this the grid is flat enough
 * that only gross outliers can be told apart from it anyway.
 */
export const MIN_BAND_M = 30

export interface ClampReport {
  loM: number
  hiM: number
  /** How many samples were outside the band. */
  clamped: number
  /** Share of the grid that was clamped, 0..1. */
  share: number
}

/** Percentile of a COPY of the data — the caller's array is not reordered. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length
  if (n === 0) return 0
  const sorted = Array.from(values as ArrayLike<number>).filter(Number.isFinite)
  if (sorted.length === 0) return 0
  sorted.sort((a, b) => a - b)
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))
  return sorted[i]
}

/**
 * Clamp a height grid into the band its own distribution describes.
 *
 * Mutates in place: the grid is a Float32Array of up to 590 000 samples handed
 * straight to a mesh builder, and copying it to be tidy would cost more than
 * the whole operation.
 *
 * Non-finite samples are pulled to the low edge rather than left as NaN — a NaN
 * vertex poisons its normals and every triangle that touches it, and a hole in
 * the ground reads far worse than a flat patch.
 */
export function clampHeightGrid(heights: Float32Array): ClampReport {
  if (heights.length === 0) return { loM: 0, hiM: 0, clamped: 0, share: 0 }

  const lo = percentile(heights, LOW_PCT)
  const hi = percentile(heights, HIGH_PCT)
  const band = Math.max(MIN_BAND_M, hi - lo)
  const loM = lo - band * OUTLIER_SLACK
  const hiM = hi + band * OUTLIER_SLACK

  let clamped = 0
  for (let i = 0; i < heights.length; i++) {
    const v = heights[i]
    if (!Number.isFinite(v)) { heights[i] = loM; clamped++; continue }
    if (v < loM) { heights[i] = loM; clamped++ }
    else if (v > hiM) { heights[i] = hiM; clamped++ }
  }

  return { loM, hiM, clamped, share: clamped / heights.length }
}

/**
 * How far a sample must sit from its own neighbours to be called speckle, metres.
 *
 * Measured over Lujiazui after the clamp and the lower envelope: 101 samples of
 * 148 225 below −30 m, scattered as runs of four or five pixels across most of
 * the grid. That is not a crater, it is salt-and-pepper — isolated DEM voids
 * that individually pass any distributional test because there are so few of
 * them.
 *
 * Twenty-five metres across one pixel is, at this raster's ~4 m spacing, a
 * six-to-one slope. Real ground does that at a sea cliff and almost nowhere
 * else, and even there the replacement is the local median — a neighbouring
 * real height, not an invention.
 */
export const SPECKLE_THRESHOLD_M = 25

/**
 * Replace isolated spikes and pits with their local median, in place.
 *
 * A MEDIAN AND NOT A MORPHOLOGICAL CLOSING, which is what a hole seems to ask
 * for. A closing fills every depression narrower than its window, so it cannot
 * tell a void from a valley and would flatten real ones to remove fake ones.
 * A median only moves a sample that disagrees with the majority of its own
 * three-by-three neighbourhood, so terrain that is merely steep survives it
 * bit for bit — and the threshold means terrain that is merely steep is not
 * even examined.
 *
 * Run BEFORE the clamp and the envelope: the clamp's percentiles are cleaner
 * without the speckle in them, and the envelope's erosion would otherwise smear
 * a one-pixel pit across its whole window.
 */
export function despeckleHeightGrid(
  grid: Float32Array, width: number, height: number,
): { replaced: number } {
  if (grid.length !== width * height) return { replaced: 0 }
  const src = Float32Array.from(grid)
  const window: number[] = []
  let replaced = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      window.length = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          const v = src[yy * width + xx]
          if (Number.isFinite(v)) window.push(v)
        }
      }
      if (window.length < 5) continue
      window.sort((a, b) => a - b)
      const median = window[window.length >> 1]
      const here = src[y * width + x]
      if (!Number.isFinite(here) || Math.abs(here - median) > SPECKLE_THRESHOLD_M) {
        grid[y * width + x] = median
        replaced++
      }
    }
  }
  return { replaced }
}
