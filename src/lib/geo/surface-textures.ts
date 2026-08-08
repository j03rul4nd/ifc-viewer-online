// ─── surface-textures ─────────────────────────────────────────────────────────
// Tileable PBR detail maps for the ground families, baked once at runtime.
//
// WHY BAKE AT ALL, HAVING GONE PROCEDURAL. Two reasons, and neither is about
// looks in a still frame:
//
//   1. FILTERING. Fine detail evaluated per fragment has no mipmaps, so at map
//      distance it aliases into shimmer. The previous fix faded every noise
//      layer out at its own Nyquist limit — correct, but it means the detail
//      simply disappears when you zoom out. A texture gets real mipmaps and
//      anisotropic filtering: the detail AVERAGES instead of vanishing, which
//      is what keeps a hillside looking like grass from 800 m up.
//   2. COST. The fine octaves were most of the fragment budget. Three texture
//      fetches replace roughly twenty noise evaluations.
//
// WHY NOT SHIP IMAGE FILES. Same answer as before: megabytes of download, a
// licence to track, and colour that cannot follow the site. Baking the same
// noise the shader used to evaluate keeps every one of those properties and
// costs a few milliseconds once.
//
// WHAT IS IN THE MAP. One RGBA texture per family, which is one fetch:
//   R,G  — tangent-space normal XY (Z is reconstructed; it is always positive)
//   B    — roughness
//   A    — albedo detail, a multiplier around 1
// The TONE stays on the vertex colour, so a forest and a lawn still share this
// texture and differ by what OSM says they are.
//
// The noise is PERIODIC — its lattice wraps at the tile edge — so the map tiles
// seamlessly. Repetition is then hidden at sample time by hex-tiling; see
// surface-shaders. Both halves are needed: a seamless tile still repeats.

import * as THREE from 'three'

/**
 * The families that get a baked detail map.
 *
 * Water is here too, even though it animates: the map is a WAVE FIELD sampled
 * twice at different scales and scroll rates, which is the standard way to do
 * real-time water and is both cheaper and better filtered than evaluating noise
 * per fragment. Un-mipmapped waves shimmer badly the moment a river is more
 * than a hundred metres away.
 */
export type TextureFamily = 'grass' | 'shrub' | 'sand' | 'rock' | 'water' | 'asphalt'

/**
 * Texels per side. 256 covers the tile below at ~1.6 cm/texel, which is finer
 * than anything the camera can resolve on a building site — and every doubling
 * costs four times the bake.
 */
const SIZE = 256

/** Ground distance the tile spans, metres, before hex-tiling scatters it. */
export const TILE_M = 4

// ── Periodic value noise ───────────────────────────────────────────────────────

/** Integer hash → [0,1). Deterministic across platforms (no Math.random). */
function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0
  h = ((h ^ (h >>> 13)) * 1274126177) | 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Value noise whose lattice WRAPS at `period`.
 *
 * The wrap is the whole reason this exists rather than reusing the noise in
 * terrain-sampling: without it the two edges of the tile carry unrelated values
 * and every tile boundary is a visible seam.
 */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const wrap = (v: number): number => ((v % period) + period) % period
  const x0 = wrap(ix)
  const y0 = wrap(iy)
  const x1 = wrap(ix + 1)
  const y1 = wrap(iy + 1)
  const n00 = hash2(x0, y0, seed)
  const n10 = hash2(x1, y0, seed)
  const n01 = hash2(x0, y1, seed)
  const n11 = hash2(x1, y1, seed)
  const top = n00 + (n10 - n00) * sx
  const bot = n01 + (n11 - n01) * sx
  return top + (bot - top) * sy
}

/**
 * Periodic fbm with a DIFFERENT cell count per axis, so features come out
 * stretched. Grass blades are the reason it exists: a lawn is not isotropic
 * mush, it is fine streaks lying roughly one way, and isotropic noise can never
 * produce that however many octaves it gets.
 */
function periodicFbmAniso(
  u: number, v: number, cellsU: number, cellsV: number, octaves: number, seed: number,
): number {
  let sum = 0
  let amp = 0.5
  let cu = cellsU
  let cv = cellsV
  for (let o = 0; o < octaves; o++) {
    // Each axis wraps at its own period, which is what keeps the tile seamless
    // even though the lattice is no longer square.
    const ix = Math.floor(u * cu)
    const iy = Math.floor(v * cv)
    const fx = u * cu - ix
    const fy = v * cv - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const wrapU = (k: number): number => ((k % cu) + cu) % cu
    const wrapV = (k: number): number => ((k % cv) + cv) % cv
    const n00 = hash2(wrapU(ix), wrapV(iy), seed + o * 17)
    const n10 = hash2(wrapU(ix + 1), wrapV(iy), seed + o * 17)
    const n01 = hash2(wrapU(ix), wrapV(iy + 1), seed + o * 17)
    const n11 = hash2(wrapU(ix + 1), wrapV(iy + 1), seed + o * 17)
    const top = n00 + (n10 - n00) * sx
    const bot = n01 + (n11 - n01) * sx
    sum += amp * (top + (bot - top) * sy)
    cu *= 2
    cv *= 2
    amp *= 0.5
  }
  return sum
}

/** Periodic fbm in TILE units (0..1 across the tile). */
function periodicFbm(
  u: number, v: number, baseCells: number, octaves: number, seed: number,
): number {
  let sum = 0
  let amp = 0.5
  let cells = baseCells
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(u * cells, v * cells, cells, seed + o * 17)
    cells *= 2
    amp *= 0.5
  }
  return sum
}

// ── Per-family height fields ───────────────────────────────────────────────────

/**
 * What each family's surface DOES, as a height field in tile coordinates.
 * Everything else — normals, roughness, albedo — is derived from it, which is
 * what keeps the three channels agreeing with one another.
 */
const HEIGHT: Record<TextureFamily, (u: number, v: number) => number> = {
  // Grass is three things at once, and it needed all three to stop reading as
  // green gravel: tussocks you could step between, clumps, and BLADES — fine,
  // stretched, and the whole reason the anisotropic variant above exists.
  grass: (u, v) => {
    const tussock = periodicFbm(u, v, 5, 3, 11)
    const clumps = periodicFbm(u, v, 14, 3, 23)
    // Blades lie roughly one way and are about eight times longer than wide.
    const blades = periodicFbmAniso(u, v, 10, 80, 2, 29)
    return tussock * 0.34 + clumps * 0.30 + blades * 0.36
  },

  // Shrubs: rounded MASSES, not tufts. A bush is a dome of foliage with deep
  // shade between it and the next one, which is the opposite of grass — grass
  // is dense everywhere and varies gently, scrub is lumpy with real gaps.
  shrub: (u, v) => {
    const masses = periodicFbm(u, v, 4, 2, 43)
    // Doming pushes mid values up toward the crown and leaves the gaps deep,
    // so the field reads as separate bushes rather than a rolling surface.
    const domed = 1 - Math.pow(1 - Math.min(1, Math.max(0, masses * 1.35)), 2.2)
    const leaves = periodicFbm(u, v, 26, 3, 57)
    return domed * 0.72 + leaves * 0.28
  },

  // Wind ripples: a directional wave, bent by a slower drift, plus grain.
  sand: (u, v) => {
    const drift = periodicFbm(u, v, 4, 3, 31)
    // The cycle counts per axis MUST be whole numbers, or the wave does not
    // close on itself and the tile carries a hard seam. An arbitrary bearing
    // (0.86, 0.51) gave 5.16 cycles across and left a visible line down every
    // beach. 5 by 3 is the same direction to the eye and actually wraps.
    const phase = (u * 5 + v * 3) * Math.PI * 2 + drift * 5
    const ripple = Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6)
    return ripple * 0.62 + periodicFbm(u, v, 24, 2, 37) * 0.38
  },

  // Fractures: ridged noise, which is what reads as broken stone rather than
  // as lumps. Two scales — joints, and the blocks between them.
  rock: (u, v) => {
    const ridged = (cells: number, seed: number): number =>
      1 - Math.abs(periodicFbm(u, v, cells, 3, seed) * 2 - 1)
    return ridged(6, 41) * 0.6 + ridged(16, 53) * 0.4
  },

  // A wave field: several crossing swells plus chop. Every wave has WHOLE cycle
  // counts per axis, without which it does not close on itself and the tile
  // carries a seam — the same trap the sand ripples fell into.
  water: (u, v) => {
    // (cyclesU, cyclesV, amplitude). Crossing directions at incommensurate
    // ratios are what stop it reading as corduroy.
    // ONE dominant long swell with shorter waves riding it, rather than four of
    // similar size — an even mix averages into a rippled sheet, and what makes
    // water read as water is a single direction the eye can follow.
    const waves: Array<[number, number, number]> = [
      [1, 0, 0.46], [2, 1, 0.24], [1, -3, 0.16], [4, 3, 0.09], [-5, 2, 0.05],
    ]
    let h = 0
    for (const [ku, kv, amp] of waves) {
      // Sharpened hard: a real swell has broad rounded troughs and tight
      // crests, and that asymmetry is what the glitter path forms along.
      h += amp * Math.pow(0.5 + 0.5 * Math.sin((u * ku + v * kv) * Math.PI * 2), 1.9)
    }
    return h * 0.82 + periodicFbm(u, v, 16, 3, 61) * 0.18
  },

  // Asphalt: aggregate. A road surface is chippings in bitumen, and what makes
  // it read as one from a car's height is the fine speckle catching the light,
  // not any large-scale pattern. A slower field on top gives the patching and
  // wear that stop it being a uniform grey ribbon.
  asphalt: (u, v) =>
    periodicFbm(u, v, 48, 2, 71) * 0.66 + periodicFbm(u, v, 6, 3, 83) * 0.34,
}

/**
 * Physical relief of each family's fine detail, METRES peak to trough.
 *
 * This has to be a real length, not a knob. The normal comes from the SLOPE of
 * the height field, and slope is metres per metre — differentiating a unit-less
 * field per texel (which is what this did first) produced a map with a total
 * range of 20 values out of 255, i.e. visually flat, no matter what the
 * multiplier was set to.
 */
const RELIEF_M: Record<TextureFamily, number> = {
  grass: 0.055, sand: 0.03, rock: 0.28,
  // A shrub mass stands the better part of a metre proud of the gaps between.
  shrub: 0.45,
  // The map carries the SHAPE of the waves; how steep the water actually is
  // gets set in the shader, per layer. Baking it gently instead (0.02 m, the
  // physically honest figure for a swell) put the whole normal inside two or
  // three byte values and the water came out mirror-flat.
  water: 0.9,
  // Same reasoning: real chippings stand a centimetre proud, which quantizes to
  // nothing. The map fills its byte range and the shader dials it back.
  asphalt: 0.5,
}

/** Roughness range per family: (smoothest, roughest). Crests are smoother. */
const ROUGHNESS: Record<TextureFamily, [number, number]> = {
  grass: [0.86, 1.0],
  // Leaves have a waxy cuticle: a shrub crown catches noticeably more light
  // than the matte shade underneath it.
  shrub: [0.62, 0.98],
  sand: [0.72, 0.94],
  rock: [0.62, 0.92],
  // Unused — the water material derives roughness from its own foam and chop.
  water: [0.02, 0.06],
  // Bitumen is matte, but polished by traffic where the aggregate stands proud.
  asphalt: [0.68, 0.95],
}

/**
 * How much the albedo swings with the height field, ± around 1 — applied in the
 * SHADER, not here. The map stores the normalized field at full byte precision
 * and the artistic amount stays adjustable without a re-bake.
 */
export const ALBEDO_SWING: Record<TextureFamily, number> =
  { grass: 0.30, shrub: 0.46, sand: 0.22, rock: 0.34, water: 0, asphalt: 0.16 }

// ── Baking ─────────────────────────────────────────────────────────────────────

const cache = new Map<TextureFamily, THREE.DataTexture>()

/**
 * The detail map for one family, baked on first use and shared thereafter.
 *
 * Cached at module scope because these are immutable, a megabyte each, and
 * every layer and the terrain all want the same three.
 */
export function surfaceTexture(family: TextureFamily): THREE.DataTexture {
  const hit = cache.get(family)
  if (hit) return hit

  const height = HEIGHT[family]
  const reliefM = RELIEF_M[family]
  const [roughLo, roughHi] = ROUGHNESS[family]

  // Height first, then read it back for the derivatives — computing the field
  // three times per texel would triple a bake that is already the slow part.
  const h = new Float32Array(SIZE * SIZE)
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = height(x / SIZE, y / SIZE)
      h[y * SIZE + x] = v
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  // Stretch to fill [0,1]. Value-noise fbm naturally occupies a narrow band
  // around its mean, so without this the map would use a fraction of the byte
  // range and every channel would come out washed out.
  const span = hi - lo > 1e-6 ? hi - lo : 1
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / span

  const texelM = TILE_M / SIZE
  const data = new Uint8Array(SIZE * SIZE * 4)
  const at = (x: number, y: number): number =>
    h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      // Central differences, wrapped — the wrap is what keeps the normals
      // continuous across the tile seam, not just the heights. Divided by the
      // texel's own size so the result is a true slope, in metres per metre.
      const dx = ((at(x + 1, y) - at(x - 1, y)) / (2 * texelM)) * reliefM
      const dy = ((at(x, y + 1) - at(x, y - 1)) / (2 * texelM)) * reliefM
      const inv = 1 / Math.hypot(dx, dy, 1)

      const value = h[i]
      // Crevices are rougher than crests: dirt and shadow collect in them.
      const rough = roughHi + (roughLo - roughHi) * value

      const o = i * 4
      data[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255)
      data[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255)
      data[o + 2] = Math.round(rough * 255)
      // The field itself, at full precision. The shader decides how far to
      // swing the albedo with it.
      data[o + 3] = Math.round(value * 255)
    }
  }

  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Mipmaps are the entire filtering argument for baking this at all.
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  // Packed data, not a picture: no sRGB decode.
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  cache.set(family, texture)
  return texture
}

/** Drop the shared maps. Only for teardown in tests — nothing else owns them. */
export function disposeSurfaceTextures(): void {
  for (const [, t] of cache) t.dispose()
  cache.clear()
}
