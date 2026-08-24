// ─── roof-props ───────────────────────────────────────────────────────────────
// Where the things that stand ON a roof go.
//
// WHY THIS EXISTS. Everything else in the context was fixed by giving surfaces
// better material or better geometry. Roofs could not be fixed that way, because
// the problem with them is not how they are shaded — it is that they are EMPTY.
// A real roof carries a stair overrun, plant, a tank, chimneys; an extruded
// prism carries nothing, and from any camera above eye level that emptiness is
// the single clearest sign the block was generated rather than built.
//
// PURE BY DESIGN, like the rest of this folder's geometry modules: rings and
// heights in, anchor points out. No THREE, no materials, no instancing — the
// scene builder owns all of that, so this file can be reasoned about and tested
// as arithmetic.
//
// It also does NOT re-derive the roof solver from building-mesh. Duplicating
// that logic is how the props end up floating a metre above a roof nobody
// changed: instead a chimney is anchored at the RIDGE height, which is the
// building's own top whatever pitch was chosen, and its base is allowed to sit
// inside the roof — which is where a real chimney's base is.

import { latLonToNormalized, metresToNormalized } from './geo-math'
import { buildingRegion, defaultRoofShape, variate } from './feature-variation'
import type { BuildingRegion } from './feature-variation'
import type { FeatureStyle } from './osm-features'
import type { BuildingHeight } from './buildings'

/** What a roof can carry. One per authored asset in the rooftop kit. */
export type RoofPropKind = 'chimney' | 'hvac' | 'tank' | 'stairbox'

export interface RoofPropBuilding {
  id?: string
  ring: ReadonlyArray<{ lat: number; lon: number }>
  height: BuildingHeight
  style?: FeatureStyle
}

export interface RoofProp {
  kind: RoofPropKind
  /** Normalized position — the same frame every other geo module works in. */
  nx: number
  ny: number
  /** Height above the building's BASE, metres. The caller adds the ground. */
  deckM: number
  /** Radians about +z. */
  yaw: number
  /** Stable per prop, so a tint or a jitter can be seeded from it. */
  id: string
}

export interface RoofPropOptions {
  anchorLat: number
  /** With the latitude, decides which roofscape this is — see BROADLEAF/REGION. */
  anchorLon?: number
  /** Hard cap on the whole patch. Instanced, so this is generous. */
  max?: number
}

/**
 * A flat roof's deck sits below the top of the wall, because the wall carries on
 * past it as a parapet — the same PARAPET_M building-mesh models. Plant standing
 * on the wall top instead of the deck floats visibly at any oblique angle.
 */
const PARAPET_M = 0.9

/** Below this a roof is too small to carry plant of any kind. */
const MIN_ROOF_AREA_M2 = 70
/** A stair overrun implies a stair worth housing — roughly four storeys. */
const MIN_STAIRBOX_HEIGHT_M = 12
/** One packaged unit per this much roof, which is roughly how they are sized. */
const HVAC_PER_M2 = 450
const MAX_HVAC_PER_ROOF = 4
/** More chimneys than this on one house reads as a factory. */
const MAX_CHIMNEYS = 3

const DEFAULT_MAX = 3000

/** Shoelace area of a ring in normalized units. */
function ringArea(pts: ReadonlyArray<{ nx: number; ny: number }>): number {
  let sum = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    sum += (pts[j].nx + pts[i].nx) * (pts[j].ny - pts[i].ny)
  }
  return Math.abs(sum) / 2
}

/** Area-weighted centroid. Falls back to the mean for a degenerate ring. */
function centroid(pts: ReadonlyArray<{ nx: number; ny: number }>): { nx: number; ny: number } {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j].nx * pts[i].ny - pts[i].nx * pts[j].ny
    a += cross
    cx += (pts[j].nx + pts[i].nx) * cross
    cy += (pts[j].ny + pts[i].ny) * cross
  }
  if (Math.abs(a) < 1e-18) {
    const n = pts.length
    return {
      nx: pts.reduce((s, p) => s + p.nx, 0) / n,
      ny: pts.reduce((s, p) => s + p.ny, 0) / n,
    }
  }
  return { nx: cx / (3 * a), ny: cy / (3 * a) }
}

/** Ray-cast point-in-polygon. The guard that keeps a tank off the pavement. */
function inside(pts: ReadonlyArray<{ nx: number; ny: number }>, x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].nx
    const yi = pts[i].ny
    const xj = pts[j].nx
    const yj = pts[j].ny
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * The dominant direction of a footprint, radians.
 *
 * Plant lined up with the building it stands on reads as installed; plant at a
 * deterministic-but-arbitrary yaw reads as dropped. It costs one pass over the
 * edges: the longest edge is the building's own grain almost every time, and
 * where it is not, the roof is round and the answer does not matter.
 */
function grain(pts: ReadonlyArray<{ nx: number; ny: number }>): number {
  let best = -1
  let yaw = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const dx = pts[i].nx - pts[j].nx
    const dy = pts[i].ny - pts[j].ny
    const len = dx * dx + dy * dy
    if (len > best) {
      best = len
      yaw = Math.atan2(dy, dx)
    }
  }
  return yaw
}

/**
 * Whether this building's roof is flat.
 *
 * Same rule building-mesh applies, and imported from the same helper rather than
 * restated: a tagged `roof:shape` is the mapper's answer and wins; otherwise what
 * the building IS decides. Getting this wrong does not misplace a prop slightly,
 * it puts a chimney on an office block and an air handler on a cottage.
 */
function isFlat(style: FeatureStyle | undefined, region: BuildingRegion): boolean {
  const stated = style?.roofTagged === true || (style?.roofShape ?? 'flat') !== 'flat'
  // Region matters: an untagged temple is pyramidal in east Asia and gabled
  // everywhere else, and dropping it here would put plant on a pagoda.
  const shape = stated
    ? (style?.roofShape ?? 'flat')
    : defaultRoofShape({ use: style?.use, region })
  return shape === 'flat'
}

/** Does this roofscape carry water tanks? A regional silhouette, not a roll. */
function tanksHere(region: BuildingRegion): boolean {
  return region === 'mediterranean' || region === 'generic'
}

/**
 * Anchors for everything standing on the roofs of a patch of buildings.
 *
 * Deterministic per building id, like every other variation in this folder — a
 * roofscape that reshuffles between two screenshots is useless for the thing
 * this whole mode exists for.
 */
export function roofPropAnchors(
  buildings: ReadonlyArray<RoofPropBuilding>,
  opts: RoofPropOptions,
): RoofProp[] {
  const mToN = metresToNormalized(opts.anchorLat)
  const region = opts.anchorLon === undefined
    ? 'generic'
    : buildingRegion(opts.anchorLat, opts.anchorLon)
  const max = opts.max ?? DEFAULT_MAX
  const out: RoofProp[] = []

  for (const b of buildings) {
    if (out.length >= max) break
    if (!b.ring || b.ring.length < 3) continue

    const pts = b.ring.map((p) => latLonToNormalized(p.lat, p.lon))
    const areaM2 = ringArea(pts) / (mToN * mToN)
    if (areaM2 < MIN_ROOF_AREA_M2) continue

    const topM = b.height?.heightM ?? 0
    if (topM <= 0) continue
    const id = b.id ?? `${pts[0].nx.toFixed(7)},${pts[0].ny.toFixed(7)}`
    const c = centroid(pts)
    const yaw = grain(pts)
    const flat = isFlat(b.style, region)

    // A spot inside the roof, offset from the centre along the building's own
    // grain. Anything that lands outside the ring is DROPPED rather than pulled
    // back to the centroid: an L-shaped block would otherwise stack its whole
    // kit on one point, which looks worse than a bare wing.
    const spot = (alongM: number, acrossM: number): { nx: number; ny: number } | null => {
      const nx = c.nx + Math.cos(yaw) * alongM * mToN - Math.sin(yaw) * acrossM * mToN
      const ny = c.ny + Math.sin(yaw) * alongM * mToN + Math.cos(yaw) * acrossM * mToN
      return inside(pts, nx, ny) ? { nx, ny } : null
    }
    const push = (kind: RoofPropKind, at: { nx: number; ny: number } | null, deckM: number,
                  seed: string): void => {
      if (!at || out.length >= max) return
      out.push({ kind, nx: at.nx, ny: at.ny, deckM, yaw, id: `${id}#${seed}` })
    }

    if (!flat) {
      // A pitched roof gets chimneys, anchored at the ridge. Their base sitting
      // inside the roof is correct — see the header.
      const n = Math.min(MAX_CHIMNEYS, 1 + Math.floor(areaM2 / 180))
      for (let i = 0; i < n; i++) {
        // Spread along the ridge, never on it end-to-end: a chimney at the gable
        // is a real thing, a chimney past it is floating in air.
        const along = (i - (n - 1) / 2) * Math.sqrt(areaM2) * 0.34
        push('chimney', spot(along, 0), topM, `ch${i}`)
      }
      continue
    }

    // Flat roof: the deck, not the wall top.
    const deckM = Math.max(0, topM - PARAPET_M)
    const reach = Math.sqrt(areaM2) * 0.26

    if (topM >= MIN_STAIRBOX_HEIGHT_M && areaM2 >= 120) {
      push('stairbox', spot(-reach * (0.5 + variate(id, 51) * 0.5), 0), deckM, 'stair')
    }

    const units = Math.min(MAX_HVAC_PER_ROOF, Math.floor(areaM2 / HVAC_PER_M2))
    for (let i = 0; i < units; i++) {
      const along = reach * (0.25 + (i / Math.max(1, units)) * 0.9)
      const across = (i % 2 === 0 ? 1 : -1) * reach * 0.35
      push('hvac', spot(along, across), deckM, `hv${i}`)
    }

    // Tanks are regional and never crowd the plant: one, off to a side.
    if (tanksHere(region) && areaM2 >= 90 && variate(id, 52) < 0.45) {
      push('tank', spot(reach * 0.1, -reach * 0.75), deckM, 'tank')
    }
  }

  return out
}
