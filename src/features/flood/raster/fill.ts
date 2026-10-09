// ─── hole filling ─────────────────────────────────────────────────────────────
// A terrain assembled from several sources has holes: under a building the IFC
// terrain is usually cut away, an imported DEM stops at its tile edge. The
// solver needs an elevation everywhere, so holes take the value of the nearest
// known cell (breadth-first from every known cell at once), then a few passes
// of averaging inside the filled region smooth the seams the nearest-value
// rule leaves. Known cells are never changed. Pure.

/** Fills NaN cells in place. Returns how many were filled (0 when none were known: nothing to fill from). */
export function fillHoles(z: Float32Array, nx: number, ny: number, smoothPasses = 4): number {
  const n = nx * ny
  const known = new Uint8Array(n)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  for (let c = 0; c < n; c++) {
    if (Number.isFinite(z[c])) {
      known[c] = 1
      queue[tail++] = c
    }
  }
  if (tail === 0 || tail === n) return 0
  const seen = known.slice()
  while (head < tail) {
    const c = queue[head++]
    const i = c % nx
    const j = (c - i) / nx
    const v = z[c]
    const visit = (d: number): void => {
      if (seen[d]) return
      seen[d] = 1
      z[d] = v
      queue[tail++] = d
    }
    if (i > 0) visit(c - 1)
    if (i < nx - 1) visit(c + 1)
    if (j > 0) visit(c - nx)
    if (j < ny - 1) visit(c + nx)
  }
  const filled = n - known.reduce((a, b) => a + b, 0)
  // Smooth only the filled cells (Jacobi passes of the 4-neighbour mean).
  const tmp = new Float32Array(n)
  for (let p = 0; p < smoothPasses; p++) {
    tmp.set(z)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        if (known[c]) continue
        let s = 0
        let k = 0
        if (i > 0) { s += tmp[c - 1]; k++ }
        if (i < nx - 1) { s += tmp[c + 1]; k++ }
        if (j > 0) { s += tmp[c - nx]; k++ }
        if (j < ny - 1) { s += tmp[c + nx]; k++ }
        z[c] = s / k
      }
    }
  }
  return filled
}
