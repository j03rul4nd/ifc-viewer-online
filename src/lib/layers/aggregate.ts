// ─── aggregate ────────────────────────────────────────────────────────────────
// Thousands of points, read from far away. Two summaries, both computed in the
// scene's metric plan (x, z), both pure:
//
//   HEXBIN  — cells of a fixed size, each holding count / sum / mean / min /
//             max of a field; coloured along a ramp. Reads as "where are the
//             chargers full", "where is traffic heavy".
//   HEATMAP — a density grid: every point splats a Gaussian; the result is a
//             colour+alpha image to lay on the ground. Reads as "where it is".
//
// No three.js here: vector-mesh turns cells into meshes and the grid into a
// texture.

import { rampColor, type Aggregation } from './style-groups'

export interface PlanSample {
  x: number
  z: number
  /** Value of the aggregated field for this feature (NaN = absent). */
  value: number
  /** Ground height under the point, for draping the cells. */
  y: number
}

export interface HexCell {
  /** Centre, scene metres. */
  cx: number
  cz: number
  y: number
  count: number
  value: number
  /** Normalised 0..1 along the ramp. */
  t: number
  rgb: [number, number, number]
}

const SQRT3 = Math.sqrt(3)

/**
 * Axial coordinates of the pointy-top hex of `size` (centre-to-corner) that
 * contains (x, z). Standard cube-rounding, so cells never overlap or gap.
 */
export function hexOf(x: number, z: number, size: number): { q: number; r: number } {
  const q = ((SQRT3 / 3) * x - (1 / 3) * z) / size
  const r = ((2 / 3) * z) / size
  let rx = Math.round(q), rz = Math.round(r)
  const ry = Math.round(-q - r)
  const dx = Math.abs(rx - q), dy = Math.abs(ry - (-q - r)), dz = Math.abs(rz - r)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy <= dz) rz = -rx - ry
  return { q: rx, r: rz }
}

export function hexCenter(q: number, r: number, size: number): { x: number; z: number } {
  return { x: size * SQRT3 * (q + r / 2), z: size * 1.5 * r }
}

export function hexbin(samples: PlanSample[], agg: Aggregation): HexCell[] {
  // cellM is the flat-to-flat width a user reads as "cell size".
  const size = Math.max(1, agg.cellM) / SQRT3
  const cells = new Map<string, { q: number; r: number; n: number; nv: number; sum: number; min: number; max: number; ys: number }>()
  for (const s of samples) {
    const { q, r } = hexOf(s.x, s.z, size)
    const key = `${q},${r}`
    let c = cells.get(key)
    if (!c) { c = { q, r, n: 0, nv: 0, sum: 0, min: Infinity, max: -Infinity, ys: 0 }; cells.set(key, c) }
    c.n++
    c.ys += s.y
    if (Number.isFinite(s.value)) {
      c.nv++; c.sum += s.value
      if (s.value < c.min) c.min = s.value
      if (s.value > c.max) c.max = s.value
    }
  }
  const out: HexCell[] = []
  for (const c of cells.values()) {
    let v: number
    if (!agg.field || agg.fn === 'count') v = c.n
    else if (c.nv === 0) continue
    else v = agg.fn === 'sum' ? c.sum : agg.fn === 'mean' ? c.sum / c.nv : agg.fn === 'min' ? c.min : c.max
    const { x, z } = hexCenter(c.q, c.r, size)
    out.push({ cx: x, cz: z, y: c.ys / c.n, count: c.n, value: v, t: 0, rgb: [0, 0, 0] })
  }
  colorize(out, agg)
  return out
}

function colorize(cells: HexCell[], agg: Aggregation): void {
  let lo = Infinity, hi = -Infinity
  for (const c of cells) { if (c.value < lo) lo = c.value; if (c.value > hi) hi = c.value }
  for (const c of cells) {
    c.t = agg.absolute ? c.value : hi > lo ? (c.value - lo) / (hi - lo) : 1
    c.rgb = rampColor(agg.ramp, c.t)
  }
}

/** The six corners of a hex cell (pointy-top), scene plan. */
export function hexCorners(cx: number, cz: number, cellM: number): Array<{ x: number; z: number }> {
  const size = Math.max(1, cellM) / SQRT3
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30)
    return { x: cx + size * Math.cos(a), z: cz + size * Math.sin(a) }
  })
}

// ── Heatmap ────────────────────────────────────────────────────────────────────

export interface HeatGrid {
  /** Scene bounds the image covers. */
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  width: number
  height: number
  /** RGBA, row 0 = minZ. */
  rgba: Uint8ClampedArray
  y: number
}

/**
 * Density image: each sample splats a Gaussian of σ = cellM/2 metres, weighted
 * by its value (or 1 for counts). Colour from the ramp, alpha rising with
 * density so empty ground stays visible underneath.
 */
export function heatGrid(samples: PlanSample[], agg: Aggregation, maxPx = 512): HeatGrid | null {
  if (samples.length === 0) return null
  const sigma = Math.max(1, agg.cellM / 2)
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, ys = 0
  for (const s of samples) {
    if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x
    if (s.z < minZ) minZ = s.z; if (s.z > maxZ) maxZ = s.z
    ys += s.y
  }
  const pad = sigma * 3
  minX -= pad; minZ -= pad; maxX += pad; maxZ += pad
  const span = Math.max(maxX - minX, maxZ - minZ)
  // Pixel size: fine enough to show σ, capped so a city-wide layer stays cheap.
  const px = Math.max(span / maxPx, sigma / 3)
  const width = Math.max(2, Math.ceil((maxX - minX) / px))
  const height = Math.max(2, Math.ceil((maxZ - minZ) / px))
  const grid = new Float32Array(width * height)
  const rPx = Math.ceil((sigma * 3) / px)
  const inv2s2 = 1 / (2 * (sigma / px) ** 2)
  for (const s of samples) {
    const w = !agg.field || agg.fn === 'count' ? 1 : Number.isFinite(s.value) ? s.value : 0
    if (w === 0) continue
    const gx = (s.x - minX) / px, gz = (s.z - minZ) / px
    const x0 = Math.max(0, Math.floor(gx - rPx)), x1 = Math.min(width - 1, Math.ceil(gx + rPx))
    const z0 = Math.max(0, Math.floor(gz - rPx)), z1 = Math.min(height - 1, Math.ceil(gz + rPx))
    for (let z = z0; z <= z1; z++) {
      const dz = z - gz
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx
        grid[z * width + x] += w * Math.exp(-(dx * dx + dz * dz) * inv2s2)
      }
    }
  }
  let peak = 0
  for (let i = 0; i < grid.length; i++) if (grid[i] > peak) peak = grid[i]
  const rgba = new Uint8ClampedArray(width * height * 4)
  if (peak > 0) {
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i] / peak
      if (t < 0.02) continue
      const [r, g, b] = rampColor(agg.ramp, agg.absolute ? grid[i] : t)
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b
      rgba[i * 4 + 3] = Math.round(255 * Math.min(1, Math.sqrt(t)) * agg.opacity)
    }
  }
  return { minX, minZ, maxX, maxZ, width, height, rgba, y: ys / samples.length }
}
