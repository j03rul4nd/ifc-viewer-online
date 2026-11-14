// ─── city-cells-look ──────────────────────────────────────────────────────────
// How a far building looks (WP4): the pure rules the cells worker and the
// cell manager apply on top of the shared mesh builder. Kept apart from
// city-cells (which decides WHICH cells) so each can be tested on its own.
//
// - Tones: in Barcelona, the barri's own facade and roof palettes; elsewhere a
//   roof palette per region. OpenMapTiles hands every building the same few
//   values, so without this the whole city was one terracotta.
// - Heights: 5 m or less is OpenMapTiles' default, not a measurement. It gets
//   the barri's storey count (Barcelona) or the tile's median measured height,
//   capped at the 35 m a guess may never exceed (#502).
// - Landmarks: a tall building is kept whole at the far level.
// - Seating: on a slope the body stands on the HIGHEST ground under it and its
//   skirt reaches down to the LOWEST — nothing floats, nothing is buried.
// - Greenery: cheap canopies seeded inside the tile's parks and woods.

import { typologyAt, fabricHeightM } from './barcelona-fabric'
import { typologyProfile, type RGB } from './barcelona-barris'
import { buildingRegion, hashId, variate, type BuildingRegion } from './feature-variation'
import { MAX_ASSUMED_HEIGHT_M } from './buildings'
import type { Pt } from './city-cells'

/** At or below this, OpenMapTiles' `render_height` is its default, not data. */
export const OMT_DEFAULT_HEIGHT_M = 5
/** A building this tall is a landmark: never dropped, never simplified, far. */
export const LANDMARK_HEIGHT_M = 30

const hex = (c: RGB): string =>
  '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

/**
 * Roof tones per region where no barri says otherwise: four or more each, so a
 * view from a kilometre reads as a city and not as one material.
 */
export const REGION_ROOF_TONES: Readonly<Record<BuildingRegion, readonly RGB[]>> = {
  mediterranean: [[0.66, 0.42, 0.31], [0.62, 0.61, 0.58], [0.84, 0.84, 0.82], [0.55, 0.36, 0.28], [0.45, 0.45, 0.46]],
  'northern-europe': [[0.42, 0.30, 0.26], [0.34, 0.35, 0.38], [0.58, 0.57, 0.55], [0.50, 0.32, 0.27], [0.26, 0.27, 0.29]],
  'east-asia': [[0.28, 0.30, 0.33], [0.55, 0.56, 0.58], [0.78, 0.79, 0.80], [0.36, 0.40, 0.44], [0.62, 0.50, 0.42]],
  'north-america': [[0.36, 0.36, 0.38], [0.62, 0.62, 0.60], [0.82, 0.82, 0.80], [0.46, 0.38, 0.33], [0.28, 0.30, 0.33]],
  generic: [[0.58, 0.40, 0.31], [0.60, 0.60, 0.58], [0.82, 0.82, 0.80], [0.40, 0.40, 0.42], [0.50, 0.44, 0.38]],
}

export interface CellLook {
  heightM: number
  /** '#rrggbb'; absent = the builder's own regional facade tone. */
  wallColor?: string
  roofColor: string
}

/**
 * The median measured height of a tile, for its buildings that have none —
 * the same idea as the district's height prior. null when nothing is measured.
 */
export function tileHeightPrior(heightsM: Iterable<number>): number | null {
  const measured: number[] = []
  for (const h of heightsM) if (Number.isFinite(h) && h > OMT_DEFAULT_HEIGHT_M) measured.push(h)
  if (measured.length === 0) return null
  measured.sort((a, b) => a - b)
  const m = measured[Math.floor(measured.length / 2)]
  return Math.min(MAX_ASSUMED_HEIGHT_M, m)
}

/** Brightness jitter of a picked tone, ±6 %. */
function jittered(c: RGB, id: string, channel: number): RGB {
  const k = 0.94 + variate(id, channel) * 0.12
  return [c[0] * k, c[1] * k, c[2] * k]
}

/** One building's tones and height. `prior` from tileHeightPrior. */
export function cellLook(id: string, lat: number, lon: number, heightM: number, prior: number | null): CellLook {
  const guess = heightM <= OMT_DEFAULT_HEIGHT_M
  const typ = typologyAt(lat, lon)
  if (typ) {
    const p = typologyProfile(typ)
    const roof = p.roof.tones[hashId(`${id}#roof`) % p.roof.tones.length]
    const wall = p.facadePalette[hashId(`${id}#wall`) % p.facadePalette.length]
    return {
      heightM: guess ? Math.min(MAX_ASSUMED_HEIGHT_M, fabricHeightM(id, typ)) : heightM,
      wallColor: hex(jittered(wall, id, 31)),
      roofColor: hex(jittered(roof, id, 32)),
    }
  }
  const tones = REGION_ROOF_TONES[buildingRegion(lat, lon)]
  let h = heightM
  if (guess && prior !== null) {
    const roll = variate(id, 33)
    h = Math.min(MAX_ASSUMED_HEIGHT_M, Math.max(OMT_DEFAULT_HEIGHT_M, prior + (roll < 0.25 ? -3 : roll > 0.75 ? 3 : 0)))
  }
  return { heightM: h, roofColor: hex(jittered(tones[hashId(`${id}#roof`) % tones.length], id, 32)) }
}

/**
 * Seat one building of a cell on the ground. `pos` holds x, y local to
 * `origin` (normalized) and z in scene units, with the builder's ground at
 * z = 0: vertices below it are the skirt. The body is lifted to the highest
 * ground sampled under the footprint's base, the skirt lowered to the lowest.
 * Returns the [min, max] ground sampled, or null when there was none.
 */
export function seatBuilding(
  pos: Float32Array, a: number, b: number, origin: { x: number; y: number },
  groundZ: (nx: number, ny: number) => number, maxSamples = 12,
): [number, number] | null {
  if (b <= a) return null
  let minZ = Infinity
  for (let v = a; v < b; v++) if (pos[v * 3 + 2] < minZ) minZ = pos[v * 3 + 2]
  // The base ring: every vertex at the lowest z (walls repeat each corner).
  const base: number[] = []
  for (let v = a; v < b; v++) if (pos[v * 3 + 2] === minZ) base.push(v)
  const step = Math.max(1, Math.ceil(base.length / maxSamples))
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < base.length; i += step) {
    const v = base[i]
    const z = groundZ(origin.x + pos[v * 3], origin.y + pos[v * 3 + 1])
    if (!Number.isFinite(z)) continue
    if (z < lo) lo = z
    if (z > hi) hi = z
  }
  if (lo === Infinity) return null
  const skirt = minZ < 0
  for (let v = a; v < b; v++) {
    const i = v * 3 + 2
    pos[i] = skirt && pos[i] === minZ ? Math.min(lo, pos[i] + hi) : pos[i] + hi
  }
  return [lo, hi]
}

/** Point in a polygon with holes (even-odd), tile units. */
function inside(p: Pt, outer: readonly Pt[], holes: readonly (readonly Pt[])[]): boolean {
  const inRing = (r: readonly Pt[]): boolean => {
    let c = false
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i].y > p.y) !== (r[j].y > p.y)
        && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) c = !c
    }
    return c
  }
  return inRing(outer) && !holes.some(inRing)
}

/**
 * Tree positions inside green polygons: a grid of `spacing` (tile units) with
 * a deterministic jitter, inside the given box, at most `max`. Same input, same
 * trees — a rebuilt cell does not reshuffle its park.
 */
export function seedTrees(
  polys: ReadonlyArray<{ outer: readonly Pt[]; holes: ReadonlyArray<readonly Pt[]> }>,
  spacing: number, box: { x0: number; y0: number; x1: number; y1: number }, max: number,
): Pt[] {
  const out: Pt[] = []
  if (max <= 0 || spacing <= 0) return out
  for (const poly of polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of poly.outer) {
      if (p.x < x0) x0 = p.x
      if (p.x > x1) x1 = p.x
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
    }
    x0 = Math.max(x0, box.x0); y0 = Math.max(y0, box.y0); x1 = Math.min(x1, box.x1); y1 = Math.min(y1, box.y1)
    if (x0 >= x1 || y0 >= y1) continue
    for (let gy = Math.floor(y0 / spacing); gy * spacing < y1; gy++) {
      for (let gx = Math.floor(x0 / spacing); gx * spacing < x1; gx++) {
        const key = `${gx},${gy}`
        const p = { x: (gx + 0.15 + variate(key, 41) * 0.7) * spacing, y: (gy + 0.15 + variate(key, 42) * 0.7) * spacing }
        if (p.x < box.x0 || p.x >= box.x1 || p.y < box.y0 || p.y >= box.y1) continue
        if (!inside(p, poly.outer, poly.holes)) continue
        out.push(p)
        if (out.length >= max) return out
      }
    }
  }
  return out
}
