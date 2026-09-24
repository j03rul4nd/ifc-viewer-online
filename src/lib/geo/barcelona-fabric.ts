// ─── barcelona-fabric ─────────────────────────────────────────────────────────
// What Barcelona's buildings look like, barri by barri, where OpenStreetMap
// does not say.
//
// The map data is thin exactly where the city is most recognisable. Measured
// in the Consell de Cent × Enric Granados box: 815 of 841 building outlines
// carry no `height`, 597 carry no storey count either, and the height prior
// gives all of those one number for the whole patch. The result was a city
// with the right footprints and nobody's skyline: every barri the same height,
// the same colour, and the Eixample's blocks filled in solid.
//
// Two things are applied here, both only to what the data leaves open:
//
//   1. A storey count from the barri's TYPOLOGY for buildings whose height is a
//      pure guess — PB+6 in the Eixample, PB+4 in the Gòtic, PB+2 in Gràcia's
//      old village streets — varied by a storey either way, per building, so a
//      street has the ragged cornice line real streets have.
//   2. The perimeter-block split (see `perimeter-blocks`): where the barri's
//      fabric is Cerdà's grid, a deep plot keeps its height only to the
//      buildable depth, and its back is the ground-floor interior of the block.
//
// A surveyed `height`, a counted `building:levels` on a building:part, a tagged
// colour or material: all of those still win. This module fills blanks.

import { barriAt, isBarcelona, typologyProfile, type UrbanTypology } from './barcelona-barris'
import { splitPerimeterBlocks } from './perimeter-blocks'
import { variate } from './feature-variation'
import type { FacadeTypology } from './building-mesh'
import type { OsmFeature, LatLonPoint, BuildingUse } from './osm-features'
import type { BuildingHeight } from './buildings'

interface FabricBuilding {
  id?: string
  ring: ReadonlyArray<LatLonPoint>
  holes?: ReadonlyArray<ReadonlyArray<LatLonPoint>>
  height: BuildingHeight
  style?: OsmFeature['style']
  isBuildingPart?: boolean
  interior?: boolean
  pavilion?: boolean
}

/** Uses whose height follows the street's fabric rather than their own brief. */
const FABRIC_USES = new Set<BuildingUse | undefined>(['apartments', 'retail', 'generic', undefined])
/** Below this a building is a kiosk, a shed or a stair head: the prior knows better. */
const MIN_FABRIC_AREA_M2 = 70

function areaM2(ring: ReadonlyArray<LatLonPoint>): number {
  const k = 111_320
  const kc = k * Math.cos((ring[0].lat * Math.PI) / 180)
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j].lon * kc + ring[i].lon * kc) * (ring[j].lat * k - ring[i].lat * k)
  }
  return Math.abs(s) / 2
}

/** The barri's typology at a point, or null outside the city's barris. */
export function typologyAt(lat: number, lon: number): UrbanTypology | null {
  if (!isBarcelona(lat, lon)) return null
  return barriAt(lat, lon)?.typology ?? null
}

/**
 * A storey count for a building nobody measured: the fabric's default, one
 * storey up or down by a deterministic draw, inside the fabric's range.
 */
export function fabricHeightM(id: string, t: UrbanTypology): number {
  const p = typologyProfile(t)
  const roll = variate(id, 21)
  const delta = roll < 0.22 ? -1 : roll > 0.8 ? 1 : 0
  const storeys = Math.max(p.storeys.min, Math.min(p.storeys.max, p.storeys.default + delta))
  // Floor-to-floor for every level, plus the terrace parapet.
  return p.groundFloorHeightM + (storeys - 1) * p.upperStoreyHeightM + p.roof.parapetHeightM
}

/**
 * Apply the barri's fabric to a set of building footprints.
 *
 * `features` is the whole scene: open ground (a mapped garden, a playground,
 * a square) inside a block interior stays open rather than being roofed.
 */
export function barcelonaFabric<T extends FabricBuilding>(
  footprints: ReadonlyArray<T>,
  features: ReadonlyArray<OsmFeature>,
  anchorLat: number,
): Array<T & { interior?: boolean; pavilion?: boolean }> {
  const typologyCache = new Map<string, UrbanTypology | null>()
  const typOf = (p: LatLonPoint): UrbanTypology | null => {
    // Cached on a ~50 m grid: a barri boundary is never finer than a street.
    const k = `${(p.lat * 2000) | 0},${(p.lon * 1500) | 0}`
    if (!typologyCache.has(k)) typologyCache.set(k, typologyAt(p.lat, p.lon))
    return typologyCache.get(k)!
  }

  // 0. PAVILIONS. A building inside a park is not the street's fabric. The
  // Ciutadella measured it: the 1888 terraces flanking the Cascada
  // (way 135115884, no height) came out as a six-storey block of flats with
  // balconies wrapped round the fountain. A park building keeps a plain
  // facade, and an unheighted one of no particular brief is a pavilion — one
  // tall storey. A palace, a museum or a chapel keeps its own prior: the
  // Parlament and the Castell dels Tres Dragons stand in the same park.
  const parks = parkIndex(features)
  const heightedIn = footprints.map((b) => {
    if (b.isBuildingPart || !parks(b.ring)) return b
    const guessed = b.height.basis === 'guess'
      && (!OWN_BRIEF_USES.has(b.style?.use) || areaM2(b.ring) < PAVILION_MAX_OWN_BRIEF_M2)
    return {
      ...b,
      pavilion: true,
      height: guessed ? { ...b.height, heightM: Math.min(b.height.heightM, PAVILION_HEIGHT_M) } : b.height,
    }
  })

  // 1. Heights from the fabric, for guesses only.
  const heighted = heightedIn.map((b) => {
    if ((b as { pavilion?: boolean }).pavilion) return b
    if (b.height.basis !== 'guess' || b.isBuildingPart || !b.id) return b
    if (!FABRIC_USES.has(b.style?.use)) return b
    if (areaM2(b.ring) < MIN_FABRIC_AREA_M2) return b
    const t = typOf(b.ring[0])
    if (!t) return b
    return { ...b, height: { ...b.height, heightM: fabricHeightM(b.id, t) } }
  })

  // 2. The block interiors.
  const open = openGroundIndex(features)
  const split = splitPerimeterBlocks(heighted, anchorLat, (lat, lon) => {
    const t = typOf({ lat, lon })
    const block = t ? typologyProfile(t).cerdaBlock : null
    return block ? { depthM: block.buildableDepthM, interiorHeightM: block.interiorGroundFloorHeightM } : null
  }, open)
  return split.buildings
}

/** A park pavilion nobody measured: one tall storey and a cornice. */
const PAVILION_HEIGHT_M = 9
/** Park buildings whose height the use prior answers better than a pavilion. */
const OWN_BRIEF_USES = new Set<BuildingUse | undefined>(['civic', 'temple', 'tower'])
/** ...unless it is kiosk-sized: a park's toy library is not a town hall. */
const PAVILION_MAX_OWN_BRIEF_M2 = 300

/** True when a footprint's centre lies inside a mapped park or garden. */
function parkIndex(features: ReadonlyArray<OsmFeature>): (ring: ReadonlyArray<LatLonPoint>) => boolean {
  const polys = features
    .filter((f) => f.kind === 'green' && f.style.cover === 'park' && f.ring && f.ring.length >= 3)
    .map((f) => {
      let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity
      for (const p of f.ring!) {
        if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat
        if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon
      }
      return { ring: f.ring!, s, w, n, e }
    })
  return (ring) => {
    let lat = 0, lon = 0
    for (const p of ring) { lat += p.lat; lon += p.lon }
    lat /= ring.length; lon /= ring.length
    return polys.some((p) => lat >= p.s && lat <= p.n && lon >= p.w && lon <= p.e && inside(lat, lon, p.ring))
  }
}

/**
 * Ground the data says is open: parks, gardens, playgrounds, pitches, squares
 * and water. A point test with a bbox prefilter per polygon.
 */
function openGroundIndex(features: ReadonlyArray<OsmFeature>): (lat: number, lon: number) => boolean {
  const polys: Array<{ ring: ReadonlyArray<LatLonPoint>; s: number; w: number; n: number; e: number }> = []
  for (const f of features) {
    if (!f.ring || f.ring.length < 3) continue
    const open = f.kind === 'green' || f.kind === 'water'
      || (f.kind === 'road' && f.widthM === undefined && f.style.roadClass !== 'vehicular')
    if (!open) continue
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity
    for (const p of f.ring) {
      if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat
      if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon
    }
    polys.push({ ring: f.ring, s, w, n, e })
  }
  return (lat, lon) => polys.some((p) => lat >= p.s && lat <= p.n && lon >= p.w && lon <= p.e && inside(lat, lon, p.ring))
}

function inside(lat: number, lon: number, ring: ReadonlyArray<LatLonPoint>): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.lat > lat) !== (b.lat > lat) && lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) hit = !hit
  }
  return hit
}

const facadeCache = new Map<UrbanTypology, FacadeTypology>()

/** The procedural facade's parameters for the fabric at a point. */
export function barcelonaFacadeAt(lat: number, lon: number): FacadeTypology | null {
  const t = typologyAt(lat, lon)
  if (!t) return null
  let f = facadeCache.get(t)
  if (!f) {
    const p = typologyProfile(t)
    f = {
      palette: p.facadePalette,
      roofTones: p.roof.tones,
      groundFloorM: p.groundFloorHeightM,
      storeyM: p.upperStoreyHeightM,
      bayM: p.bayM,
      windowWidthM: p.windowWidthM,
      shutterTone: p.shutterTone,
      balconyProbability: p.balcony.probability,
    }
    facadeCache.set(t, f)
  }
  return f
}
