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

// Look defaults/validation live in the tiny terrain-look module so the eager
// geoStore can import them without dragging this maths into the entry chunk.
export { DEFAULT_TERRAIN_LOOK, CONTOUR_INTERVALS, clampTerrainLook } from './terrain-look'
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

// ── Bicubic (Catmull-Rom) sampling ──────────────────────────────────────────────

/** Catmull-Rom basis through p1,p2 with p0/p3 as tangent support. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

/**
 * Bicubic sample of a w×h grid at fractional pixel coords (edge-clamped).
 *
 * Why not bilinear: a DEM upsampled bilinearly from ~10-30 m samples to a
 * ~9.5 m vertex grid reads as melted — ridge lines flatten into rounded humps
 * because bilinear is C0 (the surface has a crease at every source sample and
 * no overshoot at all). Catmull-Rom is C1 and preserves local extrema far
 * better, which is exactly what makes ridges and valley floors read as terrain.
 * It can overshoot slightly at cliffs; that is desirable here (sharper scarps)
 * and bounded by the surrounding samples in practice.
 */
export function bicubicSample(grid: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(Math.max(x, 0), w - 1)
  const cy = Math.min(Math.max(y, 0), h - 1)
  const x1 = Math.floor(cx)
  const y1 = Math.floor(cy)
  const fx = cx - x1
  const fy = cy - y1
  const cl = (v: number, max: number): number => Math.min(Math.max(v, 0), max - 1)
  const rows: number[] = []
  for (let m = -1; m <= 2; m++) {
    const yy = cl(y1 + m, h) * w
    rows.push(catmullRom(
      grid[yy + cl(x1 - 1, w)], grid[yy + cl(x1, w)],
      grid[yy + cl(x1 + 1, w)], grid[yy + cl(x1 + 2, w)],
      fx,
    ))
  }
  return catmullRom(rows[0], rows[1], rows[2], rows[3], fy)
}

/**
 * Resample a source height grid to an (n+1)×(n+1) VERTEX grid spanning the full
 * source extent. Same mapping as `sampleHeightGrid`, bicubic kernel.
 */
export function sampleHeightGridBicubic(
  src: ArrayLike<number>, srcW: number, srcH: number, n: number,
): Float32Array {
  const verts = n + 1
  const out = new Float32Array(verts * verts)
  for (let j = 0; j < verts; j++) {
    const sy = (j / n) * srcH - 0.5
    for (let i = 0; i < verts; i++) {
      const sx = (i / n) * srcW - 0.5
      out[j * verts + i] = bicubicSample(src, srcW, srcH, sx, sy)
    }
  }
  return out
}

// ── Synthetic micro-relief ("generated" detail) ─────────────────────────────────
//
// HONESTY NOTE — this is invented geometry, not measurement.
// Terrarium tops out at z15 and most of the world is really ~30 m SRTM, so a
// 9.5 m vertex grid has nothing true to say between samples: it interpolates,
// and interpolation is what makes terrain look like melted wax. We synthesise
// plausible micro-relief to fill that gap, under three self-imposed rules:
//   1. Amplitude is capped by the DEM's own sample spacing (below), so the
//      invention never exceeds the data's genuine uncertainty.
//   2. It is slope-modulated — flat ground (water, plains, plateaus) stays
//      flat, because that is where invented bumps would be obviously wrong.
//      Detail grows where the real surface is already broken.
//   3. It is off by default and the UI must label it as synthetic.
// It is deterministic (hash lattice, no RNG state) so the same site always
// renders identically — a screenshot stays reproducible.

/** Integer hash → [0,1). Deterministic across platforms (no Math.random). */
function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0
  h = (h ^ (h >>> 13)) * 1274126177 | 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smoothstep-interpolated value noise on an integer lattice. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash2(ix, iy, seed)
  const n10 = hash2(ix + 1, iy, seed)
  const n01 = hash2(ix, iy + 1, seed)
  const n11 = hash2(ix + 1, iy + 1, seed)
  const top = n00 + (n10 - n00) * sx
  const bot = n01 + (n11 - n01) * sx
  return (top + (bot - top) * sy) * 2 - 1 // → [-1, 1]
}

/** Octaves of the detail field, in "vertex index" space. */
export const DETAIL_OCTAVES = 4

/**
 * Unit-amplitude synthetic relief for a vertex grid, in metres per unit of the
 * user's detail slider. Returned separately from the real heights so the UI can
 * blend it live (`h = base + detail × amount`) and so the measured DEM is never
 * overwritten — a caller that ignores this array gets exactly today's terrain.
 *
 * `spacingM` sets the amplitude ceiling: micro-relief taller than roughly a
 * quarter of the sample spacing would be inventing landforms the DEM would
 * have resolved, so that is the cap.
 */
export function synthesizeDetail(
  heights: ArrayLike<number>, verts: number, spacingM: number, seed = 1,
): Float32Array {
  const out = new Float32Array(verts * verts)
  const amplitude = spacingM * 0.25
  const h = (i: number, j: number): number =>
    heights[Math.min(Math.max(j, 0), verts - 1) * verts + Math.min(Math.max(i, 0), verts - 1)]

  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      // Local steepness (rise over run) drives how much detail is plausible.
      const dhdx = (h(i + 1, j) - h(i - 1, j)) / (2 * spacingM)
      const dhdy = (h(i, j - 1) - h(i, j + 1)) / (2 * spacingM)
      const slope = Math.hypot(dhdx, dhdy)
      // 0 on dead-flat ground, saturating to 1 around a 45° slope.
      const weight = Math.min(1, slope)

      let sum = 0
      let amp = 1
      let freq = 1 / 16 // first octave ≈ one bump per 16 vertices
      let norm = 0
      for (let o = 0; o < DETAIL_OCTAVES; o++) {
        sum += valueNoise(i * freq, j * freq, seed + o) * amp
        norm += amp
        amp *= 0.5
        freq *= 2
      }
      out[j * verts + i] = (sum / norm) * amplitude * weight
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

// ── Configurable sun + multi-directional hillshade ──────────────────────────────

export interface SunDirection {
  /** Compass bearing the light comes FROM, degrees clockwise from north. */
  azimuthDeg: number
  /** Height above the horizon, degrees (0 = grazing, 90 = overhead). */
  altitudeDeg: number
}

/**
 * Cartographic default: light from the north-west at 45°. It is the convention
 * every printed relief map uses, because a light from below-right triggers the
 * crater illusion — hills read as pits.
 */
export const DEFAULT_SUN: SunDirection = { azimuthDeg: 315, altitudeDeg: 45 }

/** Sun direction → unit vector in the tile-local frame (X east, Y north, Z up). */
export function sunVector(sun: SunDirection): { x: number; y: number; z: number } {
  const az = (sun.azimuthDeg * Math.PI) / 180
  const alt = (sun.altitudeDeg * Math.PI) / 180
  const horizontal = Math.cos(alt)
  return {
    // Azimuth is the bearing the light comes from: 0° = north (+Y), 90° = east (+X).
    x: horizontal * Math.sin(az),
    y: horizontal * Math.cos(az),
    z: Math.sin(alt),
  }
}

/**
 * Relative weights of the four auxiliary lights in the Swiss-style blend, as
 * offsets from the primary azimuth. A single light renders every slope facing
 * away from it as one flat dark mass, which erases all structure on the shadow
 * side; spreading secondary lights around the primary keeps that side readable
 * while the primary still sets the overall direction. This is the standard
 * multi-directional (Imhof) hillshade, not an invention.
 */
const MULTI_LIGHTS: ReadonlyArray<{ offsetDeg: number; weight: number }> = [
  { offsetDeg: 0, weight: 0.45 },
  { offsetDeg: -60, weight: 0.2 },
  { offsetDeg: 60, weight: 0.2 },
  { offsetDeg: 180, weight: 0.15 },
]

/**
 * Hillshade factor in [ambient, 1] for a surface normal.
 *
 * `softness` (0-1) crossfades from a single hard light (0, classic relief with
 * strong dark faces) to the full multi-directional blend (1, every slope
 * legible). Exaggeration rescales the recovered gradient so shading matches a
 * vertically stretched mesh.
 */
export function hillshade(
  nx: number, ny: number, nz: number,
  sun: SunDirection = DEFAULT_SUN,
  ambient = SHADE_AMBIENT_IMAGERY,
  exaggeration = 1,
  softness = 0.5,
): number {
  let x = nx, y = ny, z = nz
  if (exaggeration !== 1 && nz > 1e-6) {
    const gx = (nx / nz) * exaggeration
    const gy = (ny / nz) * exaggeration
    const len = Math.hypot(gx, gy, 1)
    x = gx / len; y = gy / len; z = 1 / len
  }

  const primary = sunVector(sun)
  const hard = Math.max(0, x * primary.x + y * primary.y + z * primary.z)

  let soft = 0
  let totalWeight = 0
  for (const light of MULTI_LIGHTS) {
    const v = sunVector({ azimuthDeg: sun.azimuthDeg + light.offsetDeg, altitudeDeg: sun.altitudeDeg })
    soft += Math.max(0, x * v.x + y * v.y + z * v.z) * light.weight
    totalWeight += light.weight
  }
  soft /= totalWeight

  const s = Math.min(1, Math.max(0, softness))
  const ndotl = hard * (1 - s) + soft * s
  return ambient + (1 - ambient) * ndotl
}

// ── Sky-view factor (ambient occlusion for terrain) ─────────────────────────────

/** Compass directions scanned for the horizon search. */
const SVF_DIRECTIONS = 8

/**
 * Per-vertex sky-view factor in [0,1]: the fraction of the sky dome not blocked
 * by surrounding terrain. 1 = an exposed ridge, lower = a shut-in valley floor.
 *
 * This is what a plain hillshade cannot express. Hillshade only asks which way
 * a face is tilted, so a valley floor and a plateau of identical slope shade
 * identically and the terrain reads as embossed rather than solid. Darkening by
 * sky visibility restores depth — it is the same reason ambient occlusion
 * transformed real-time rendering.
 *
 * Computed by scanning `SVF_DIRECTIONS` azimuths outward to `radiusSamples`
 * vertices, tracking the maximum horizon angle in each. Cost is
 * O(verts² · directions · radius); it depends only on geometry, so it is
 * computed once in the worker and reused for every look change.
 */
export function skyViewFactor(
  heights: ArrayLike<number>, verts: number, spacingM: number, radiusSamples = 12,
): Float32Array {
  const out = new Float32Array(verts * verts)
  const dirs: Array<{ dx: number; dy: number }> = []
  for (let d = 0; d < SVF_DIRECTIONS; d++) {
    const a = (d / SVF_DIRECTIONS) * Math.PI * 2
    dirs.push({ dx: Math.cos(a), dy: Math.sin(a) })
  }

  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const h0 = heights[j * verts + i]
      let visible = 0
      for (const { dx, dy } of dirs) {
        let maxTan = 0
        for (let r = 1; r <= radiusSamples; r++) {
          const si = Math.round(i + dx * r)
          const sj = Math.round(j + dy * r)
          if (si < 0 || sj < 0 || si >= verts || sj >= verts) break
          const dh = heights[sj * verts + si] - h0
          if (dh > 0) {
            const tan = dh / (r * spacingM)
            if (tan > maxTan) maxTan = tan
          }
        }
        // Sky fraction above the horizon in this direction: 1 at a flat
        // horizon, → 0 as the blocking angle approaches vertical.
        visible += 1 - Math.atan(maxTan) / (Math.PI / 2)
      }
      out[j * verts + i] = visible / SVF_DIRECTIONS
    }
  }
  return out
}

/**
 * Apply a sky-view factor as a darkening multiplier. `strength` 0 disables it
 * entirely (factor 1); 1 applies the raw factor. Floored so deep valleys never
 * go fully black.
 */
export function occlusionFactor(svf: number, strength: number): number {
  const s = Math.min(1, Math.max(0, strength))
  const clamped = Math.min(1, Math.max(0, svf))
  return Math.max(0.35, 1 - (1 - clamped) * s)
}

// ── Slope tint + contour lines ──────────────────────────────────────────────────

/** Steepness ramp: green (flat) → yellow → orange → red (cliff). */
const SLOPE_STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: 0.0, r: 0.35, g: 0.62, b: 0.42 },
  { t: 0.35, r: 0.85, g: 0.83, b: 0.42 },
  { t: 0.7, r: 0.86, g: 0.55, b: 0.28 },
  { t: 1.0, r: 0.74, g: 0.27, b: 0.24 },
]

/** Ramp a normalised steepness t ∈ [0,1] to RGB. */
export function slopeColor(t: number): { r: number; g: number; b: number } {
  return rampColor(SLOPE_STOPS, t)
}

/**
 * Steepness of a surface normal as a fraction of `maxDeg` (default 45°, past
 * which everything reads as "cliff"). Independent of exaggeration on purpose:
 * the slope readout must stay a true measurement of the terrain.
 */
export function slopeFraction(nz: number, maxDeg = 45): number {
  const clamped = Math.min(1, Math.max(0, nz))
  const deg = (Math.acos(clamped) * 180) / Math.PI
  return Math.min(1, deg / maxDeg)
}

/**
 * Darkening factor for a contour line at `intervalM` spacing, 1 away from a
 * line and dropping to `depth` on it.
 *
 * The line is widened by the local gradient so it stays roughly constant on
 * screen instead of smearing across whole plateaus and vanishing on cliffs —
 * the standard trick for analytic contours (equivalent to dividing by the
 * derivative). `gradientM` is the height change per vertex.
 */
export function contourFactor(
  heightM: number, intervalM: number, gradientM: number, depth = 0.55,
): number {
  if (!(intervalM > 0)) return 1
  const phase = heightM / intervalM
  const distance = Math.abs(phase - Math.round(phase)) // [0, 0.5] intervals from a line
  // Half-width in interval units, from the per-vertex height change.
  const halfWidth = Math.min(0.35, Math.max(0.02, Math.abs(gradientM) / intervalM))
  if (distance >= halfWidth) return 1
  const t = distance / halfWidth // 0 on the line → 1 at its edge
  return depth + (1 - depth) * (t * t * (3 - 2 * t))
}

function rampColor(
  stops: Array<{ t: number; r: number; g: number; b: number }>, t: number,
): { r: number; g: number; b: number } {
  const c = Math.min(Math.max(t, 0), 1)
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i].t) {
      const a = stops[i - 1]
      const b = stops[i]
      const f = (c - a.t) / (b.t - a.t)
      return { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f }
    }
  }
  const last = stops[stops.length - 1]
  return { r: last.r, g: last.g, b: last.b }
}
/** Default ambient for imagery drapes (subtle — imagery has its own shading). */
export const SHADE_AMBIENT_IMAGERY = 0.55
/** Stronger contrast for the imagery-less "shaded relief" style. */
export const SHADE_AMBIENT_RELIEF = 0.3

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
  return rampColor(HYPSO_STOPS, t)
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
