// ─── lower-envelope ───────────────────────────────────────────────────────────
// BARE GROUND OUT OF A SURFACE MODEL.
//
// The terrarium mosaic is a SURFACE model: the radar return comes off whatever
// it hit first, which in a city is roofs. `terrain-truth` says so in its first
// paragraph and resolves it for POINT queries by taking a low percentile of a
// neighbourhood — "bare ground is the lower envelope of a surface model:
// obstructions only ever add height, so the floor of a neighbourhood is a
// better estimate of it than the middle."
//
// The terrain MESH never had that. It meshed the surface, so every building in
// the raster became a lump of ground — and then the OSM buildings were drawn on
// top of their own radar shadow. The same building twice, once as terrain.
//
// Measured over Lujiazui after the anchor and outlier fixes: the mesh still
// spanned 114 metres in a city that is flat, and the +71 m end of that was
// towers, not landform.
//
// ── Why an opening, and what it costs ─────────────────────────────────────────
//
// A morphological OPENING — erode, then dilate, with the same window — is the
// standard estimator here, and `terrain-truth` already names it as the thing it
// is approximating statistically. Erosion pulls every sample down to the floor
// of its window, which deletes anything narrower than the window; dilation puts
// the floor back up to where the surrounding ground actually is, so a valley
// keeps its shape instead of being smeared outward by the erosion.
//
// The cost is honest and worth stating: a landform NARROWER than the window is
// removed along with the buildings. A 200 m window keeps hills and cuts spires;
// it would also cut a genuine 150 m rock stack. That trade is right for a
// generator whose job is to put a building in a city, and it is the reason the
// window is a parameter rather than a constant buried in the loop.
//
// ── Why separable, with a deque ───────────────────────────────────────────────
//
// A square window is separable: a 2D minimum is a horizontal 1D minimum
// followed by a vertical one. Each 1D pass is O(n) with a monotonic deque
// rather than O(n·r) with a rescan, which matters because this runs on a 768²
// grid inside the terrain worker while the user is waiting for a map.
//
// PURE: numbers in, numbers out. No I/O, no THREE, no tiles.

/**
 * Half-width of the window, metres.
 *
 * Removes anything narrower than twice this. A hundred metres clears the
 * footprint of almost every building including a mall podium, and leaves any
 * landform wider than 200 m untouched.
 */
export const ENVELOPE_RADIUS_M = 100

/** One-dimensional sliding minimum, window `2r+1`, edges clamped. */
export function slidingMin(
  src: Float32Array, dst: Float32Array, width: number, height: number, r: number,
): void {
  slide(src, dst, width, height, r, true)
}

/** One-dimensional sliding maximum, window `2r+1`, edges clamped. */
export function slidingMax(
  src: Float32Array, dst: Float32Array, width: number, height: number, r: number,
): void {
  slide(src, dst, width, height, r, false)
}

/**
 * Row-wise sliding extremum with a monotonic deque.
 *
 * The deque holds indices whose values are monotonically increasing (for a
 * minimum), so its head is always the extremum of the current window and every
 * element is pushed and popped once — O(n) rather than O(n·r).
 */
function slide(
  src: Float32Array, dst: Float32Array,
  width: number, height: number, r: number, wantMin: boolean,
): void {
  if (r <= 0) { dst.set(src); return }
  const deque = new Int32Array(width)

  for (let y = 0; y < height; y++) {
    const row = y * width
    let head = 0
    let tail = 0

    // Prime the window with everything left of the first output column.
    for (let x = 0; x < Math.min(width, r); x++) {
      const v = src[row + x]
      while (tail > head && (wantMin ? src[row + deque[tail - 1]] >= v : src[row + deque[tail - 1]] <= v)) tail--
      deque[tail++] = x
    }

    for (let x = 0; x < width; x++) {
      const add = x + r
      if (add < width) {
        const v = src[row + add]
        while (tail > head && (wantMin ? src[row + deque[tail - 1]] >= v : src[row + deque[tail - 1]] <= v)) tail--
        deque[tail++] = add
      }
      const drop = x - r - 1
      if (drop >= 0 && tail > head && deque[head] === drop) head++
      dst[row + x] = src[row + deque[head]]
    }
  }
}

/** Transpose so a column pass can reuse the row kernel. */
export function transpose(
  src: Float32Array, dst: Float32Array, width: number, height: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) dst[x * height + y] = src[y * width + x]
  }
}

export interface EnvelopeReport {
  /** Window half-width actually used, pixels. */
  radiusPx: number
  /** Mean amount the surface was pulled down, metres. */
  meanDropM: number
  /** Largest amount any sample was pulled down, metres. */
  maxDropM: number
}

/**
 * Replace a surface grid with its lower envelope, in place.
 *
 * `metresPerPixel` converts the window from metres, because the same raster is
 * a different ground distance at every latitude and the window has to mean the
 * same thing about buildings wherever the model is.
 */
export function lowerEnvelope(
  grid: Float32Array, width: number, height: number, metresPerPixel: number,
): EnvelopeReport {
  const radiusPx = Math.max(1, Math.round(ENVELOPE_RADIUS_M / Math.max(0.1, metresPerPixel)))
  if (grid.length !== width * height) return { radiusPx, meanDropM: 0, maxDropM: 0 }

  const a = new Float32Array(grid.length)
  const b = new Float32Array(grid.length)

  // Erode: min horizontally, transpose, min again, transpose back.
  slidingMin(grid, a, width, height, radiusPx)
  transpose(a, b, width, height)
  slidingMin(b, a, height, width, radiusPx)
  transpose(a, b, height, width)

  // Dilate the eroded grid the same way, which is what makes this an OPENING
  // rather than an erosion: without it every valley would be widened by the
  // window and the ground would creep downhill.
  slidingMax(b, a, width, height, radiusPx)
  transpose(a, b, width, height)
  slidingMax(b, a, height, width, radiusPx)
  transpose(a, b, height, width)

  let sum = 0
  let maxDrop = 0
  for (let i = 0; i < grid.length; i++) {
    // An opening can never exceed the original; the guard is against float
    // drift at the edges rather than against the mathematics.
    const v = Math.min(grid[i], b[i])
    const drop = grid[i] - v
    sum += drop
    if (drop > maxDrop) maxDrop = drop
    grid[i] = v
  }

  return { radiusPx, meanDropM: sum / grid.length, maxDropM: maxDrop }
}
