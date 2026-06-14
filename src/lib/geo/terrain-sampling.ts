// ─── terrain-sampling ─────────────────────────────────────────────────────────
// PURE sampling / shading / zoom math for the 3D terrain patch
// (docs/TERRAIN_3D_IMPROVEMENT_PLAN.md §3 D2-D5). No three.js, no DOM — this
// module is imported by BOTH the terrain worker and vitest, like georef-ladder.
//
// Conventions:
//   • Height grids are row-major, row 0 = NORTH edge (matches PNG rows and
//     PlaneGeometry vertex order, which starts at +y).
//   • Bilinear coordinates are in "pixel index" space: pixel k's sample point
//     sits at coordinate k (integers hit pixels exactly); callers convert
//     tile-fraction positions with `frac × size − 0.5`.

import { groundResolution } from './geo-math'

export const TERRAIN_TILE_DIM = 256
/** Terrarium tiles exist up to z15 (tilezen/joerd data-sources.md). */
export const TERRARIUM_MAX_ZOOM = 15

// ── Bilinear sampling ───────────────────────────────────────────────────────────

/** Bilinear sample of a w×h grid at fractional pixel coords (clamped). */
export function bilinearSample(grid: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(Math.max(x, 0), w - 1)
  const cy = Math.min(Math.max(y, 0), h - 1)
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const fx = cx - x0
  const fy = cy - y0
  const top = grid[y0 * w + x0] * (1 - fx) + grid[y0 * w + x1] * fx
  const bot = grid[y1 * w + x0] * (1 - fx) + grid[y1 * w + x1] * fx
  return top * (1 - fy) + bot * fy
}

/**
 * Resample a source height grid (srcW×srcH, e.g. the unified 768² patch) to an
 * (n+1)×(n+1) VERTEX grid spanning the full source extent, bilinearly.
 * Vertex (i,j) maps to source coordinate (i/n·srcW − 0.5, j/n·srcH − 0.5):
 * the patch borders land half a pixel outside the outermost sample centres,
 * which the clamp handles (flat extrapolation, invisible at 1-px scale).
 */
export function sampleHeightGrid(
  src: ArrayLike<number>, srcW: number, srcH: number, n: number,
): Float32Array {
  const verts = n + 1
  const out = new Float32Array(verts * verts)
  for (let j = 0; j < verts; j++) {
    const sy = (j / n) * srcH - 0.5
    for (let i = 0; i < verts; i++) {
      const sx = (i / n) * srcW - 0.5
      out[j * verts + i] = bilinearSample(src, srcW, srcH, sx, sy)
    }
  }
  return out
}

// ── Normals + baked shading ─────────────────────────────────────────────────────

/**
 * Per-vertex normals from a (verts×verts) height grid via central differences
 * (one-sided at borders). Spacing = metres between adjacent vertices.
 * Output frame matches the planar tile space: X east, Y north, Z up —
 * identical to the terrain PlaneGeometry's local axes. Row 0 is the NORTH
 * edge, so +Y derivative runs OPPOSITE to the row index.
 * Returns Float32Array of length verts²×3.
 */
export function computeNormals(heights: ArrayLike<number>, verts: number, spacingM: number): Float32Array {
  const out = new Float32Array(verts * verts * 3)
  const h = (i: number, j: number): number =>
    heights[Math.min(Math.max(j, 0), verts - 1) * verts + Math.min(Math.max(i, 0), verts - 1)]
  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const dxDen = (i === 0 || i === verts - 1 ? 1 : 2) * spacingM
      const dyDen = (j === 0 || j === verts - 1 ? 1 : 2) * spacingM
      const dhdx = (h(i + 1, j) - h(i - 1, j)) / dxDen
      // Row index grows SOUTH; +Y (north) derivative is the negation.
      const dhdyNorth = (h(i, j - 1) - h(i, j + 1)) / dyDen
      const len = Math.hypot(dhdx, dhdyNorth, 1)
      const o = (j * verts + i) * 3
      out[o] = -dhdx / len
      out[o + 1] = -dhdyNorth / len
      out[o + 2] = 1 / len
    }
  }
  return out
}

// Fixed shading light (tile-local frame: X east, Y north, Z up) — loosely
// matches the scene key light so relief reads consistently with the theme.
const SHADE_L = (() => {
  const len = Math.hypot(-0.4, 0.5, 0.75)
  return { x: -0.4 / len, y: 0.5 / len, z: 0.75 / len }
})()
/** Default ambient for imagery drapes (subtle — imagery has its own shading). */
export const SHADE_AMBIENT_IMAGERY = 0.55
/** Stronger contrast for the imagery-less "shaded relief" style. */
export const SHADE_AMBIENT_RELIEF = 0.3

/**
 * Baked hillshade factor for a normal (multiplies the drape's vertex RGB).
 * Range [ambient, 1]: never black. Baking into vertex colours avoids
 * double-shading map imagery with the scene's dynamic lights (plan D5).
 * `exaggeration` scales the surface gradient (recovered from the normal) so
 * the shading matches a vertically exaggerated mesh.
 */
export function shadeFromNormal(
  nx: number, ny: number, nz: number,
  ambient = SHADE_AMBIENT_IMAGERY,
  exaggeration = 1,
): number {
  let x = nx, y = ny, z = nz
  if (exaggeration !== 1 && nz > 1e-6) {
    // normal ∝ (−dh/dx, −dh/dy, 1) → scaling heights by k scales the gradient.
    const gx = (nx / nz) * exaggeration
    const gy = (ny / nz) * exaggeration
    const len = Math.hypot(gx, gy, 1)
    x = gx / len; y = gy / len; z = 1 / len
  }
  const ndotl = Math.max(0, x * SHADE_L.x + y * SHADE_L.y + z * SHADE_L.z)
  return ambient + (1 - ambient) * ndotl
}

// ── Hypsometric tint (terrain style 'hypsometric') ──────────────────────────────

// Classic atlas-style elevation ramp, low → high.
const HYPSO_STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: 0.0,  r: 0.16, g: 0.42, b: 0.25 }, // valley green
  { t: 0.3,  r: 0.50, g: 0.63, b: 0.35 }, // light green
  { t: 0.55, r: 0.69, g: 0.56, b: 0.35 }, // tan
  { t: 0.8,  r: 0.54, g: 0.44, b: 0.39 }, // brown
  { t: 1.0,  r: 0.91, g: 0.91, b: 0.91 }, // near-white peaks
]

/** Elevation fraction t ∈ [0,1] → linear-ramp RGB (clamped). */
export function hypsometricColor(t: number): { r: number; g: number; b: number } {
  const c = Math.min(Math.max(t, 0), 1)
  for (let i = 1; i < HYPSO_STOPS.length; i++) {
    if (c <= HYPSO_STOPS[i].t) {
      const a = HYPSO_STOPS[i - 1]
      const b = HYPSO_STOPS[i]
      const f = (c - a.t) / (b.t - a.t)
      return {
        r: a.r + (b.r - a.r) * f,
        g: a.g + (b.g - a.g) * f,
        b: a.b + (b.b - a.b) * f,
      }
    }
  }
  const last = HYPSO_STOPS[HYPSO_STOPS.length - 1]
  return { r: last.r, g: last.g, b: last.b }
}

// ── Zoom selection (plan D3) ────────────────────────────────────────────────────

/**
 * Terrain DEM zoom for a placement: z15 by default (3×3 patch ≈ 3.7 km at the
 * equator — ample for buildings), z14 for large models (patch must wrap the
 * site) or high latitudes (mercator tiles shrink by cos φ).
 */
export function terrainZoomFor(lat: number, modelSpanM: number | null): number {
  let z = TERRARIUM_MAX_ZOOM
  if ((modelSpanM ?? 0) > 1500 || Math.abs(lat) > 60) z = 14
  return z
}

/**
 * Imagery drape zoom (plan D4): DEM zoom + offset, clamped to the provider's
 * maxZoom. OSM-policy providers get +1 (≤36 child fetches per patch); others
 * +2. Offset is decided HERE so the worker stays policy-agnostic.
 */
export function imageryZoomFor(terrainZoom: number, providerId: string, providerMaxZoom: number): number {
  const offset = providerId === 'osm' || providerId === 'opentopomap' ? 1 : 2
  return Math.max(terrainZoom, Math.min(terrainZoom + offset, providerMaxZoom))
}

/**
 * Slippy-tile range covered by the 3×3 patch centred on (cx, cy) at
 * terrainZoom, expressed at imageryZoom. startX/startY is the north-west
 * child; count is tiles per side (3 · 2^Δz).
 */
export function imageryTileRange(
  cx: number, cy: number, terrainZoom: number, imageryZoom: number,
): { startX: number; startY: number; count: number } {
  const scale = Math.pow(2, imageryZoom - terrainZoom)
  return {
    startX: (cx - 1) * scale,
    startY: (cy - 1) * scale,
    count: 3 * scale,
  }
}

/** Metres between adjacent terrain vertices for an n-segment 3-tile patch. */
export function vertexSpacingM(lat: number, zoom: number, n: number): number {
  return (3 * groundResolution(lat, zoom) * TERRAIN_TILE_DIM) / n
}
