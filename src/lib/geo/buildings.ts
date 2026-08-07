// ─── buildings ────────────────────────────────────────────────────────────────
// Surrounding-context buildings for map mode: OpenStreetMap footprints
// extruded onto the terrain, so a model reads as standing in a real place
// instead of floating on an aerial photo. PURE — parsing and height reasoning
// only; the mesh is built in geo-system where three.js lives.
//
// SOURCE DECISION — Overpass API, not a third-party 3D-tile service.
//   • Overpass serves canonical OSM data under ODbL with the attribution we
//     already display. A free "3D buildings" tile proxy would be a second
//     undocumented dependency that can disappear or change terms without us
//     noticing, for data we can get from the source.
//   • Usage discipline that keeps this inside acceptable use: ONE query per
//     user-initiated build (never per tile, never on camera movement), a bbox
//     no larger than the terrain patch, a hard timeout, and results cached per
//     site for the session. This is a small interactive query — the pattern
//     Overpass is for — not an automated bulk scan.
//   • It is optional garnish: every failure path degrades to "no buildings",
//     never to a broken map.
//
// HONESTY — heights are mostly estimated. Few OSM buildings carry a surveyed
// `height`; most carry `building:levels`, and many carry neither. Estimated
// heights are flagged per building so the UI can say so, because a skyline
// that looks measured but is not would be exactly the kind of quiet fiction
// this codebase avoids elsewhere.

/** Metres per storey when only a level count is known. */
export const DEFAULT_STOREY_HEIGHT_M = 3.2

/** Fallback height for a footprint with no height information at all. */
export const DEFAULT_BUILDING_HEIGHT_M = 8

/** Ignore slivers — mapping noise, and they render as z-fighting confetti. */
export const MIN_FOOTPRINT_AREA_M2 = 8

/** Upper sanity bound; taller than any real building means bad data. */
export const MAX_BUILDING_HEIGHT_M = 830

export interface BuildingHeight {
  heightM: number
  /** Base of the building above ground (bridges, buildings on podiums). */
  minHeightM: number
  /** True when the height was inferred rather than read from the data. */
  estimated: boolean
}

/**
 * Resolve a building's height from OSM tags, most trustworthy source first:
 * `height` (surveyed) → `building:levels` (counted) → a type-aware default.
 *
 * OSM heights are metres by convention but files carry units anyway ("12 m",
 * "40'"), so parsing is deliberately forgiving about a trailing unit and
 * rejects anything it cannot read rather than guessing a number out of it.
 */
export function resolveBuildingHeight(tags: Record<string, string> | undefined): BuildingHeight {
  const t = tags ?? {}

  const explicit = parseLengthM(t['height'])
  const minExplicit = parseLengthM(t['min_height']) ?? 0

  if (explicit !== null && explicit > 0) {
    return {
      heightM: Math.min(explicit, MAX_BUILDING_HEIGHT_M),
      minHeightM: Math.max(0, Math.min(minExplicit, explicit - 0.5)),
      estimated: false,
    }
  }

  const levels = parseLevels(t['building:levels'])
  const minLevels = parseLevels(t['building:min_level']) ?? 0
  if (levels !== null && levels > 0) {
    const h = Math.min(levels * DEFAULT_STOREY_HEIGHT_M, MAX_BUILDING_HEIGHT_M)
    return {
      heightM: h,
      minHeightM: Math.max(0, Math.min(minLevels * DEFAULT_STOREY_HEIGHT_M, h - 0.5)),
      // A level count IS data, but the metres are our assumption.
      estimated: true,
    }
  }

  return {
    heightM: defaultHeightForType(t['building']),
    minHeightM: 0,
    estimated: true,
  }
}

/** Length in metres from an OSM value, tolerating a unit suffix. */
export function parseLengthM(raw: string | undefined): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Feet with an optional inches part: 40', 40'6"
  const feet = /^(\d+(?:\.\d+)?)'\s*(?:(\d+(?:\.\d+)?)")?$/.exec(trimmed)
  if (feet) {
    const ft = parseFloat(feet[1]) + (feet[2] ? parseFloat(feet[2]) / 12 : 0)
    return Number.isFinite(ft) ? ft * 0.3048 : null
  }
  const m = /^(-?\d+(?:\.\d+)?)\s*(m|metre|metres|meter|meters)?$/i.exec(trimmed)
  if (!m) return null
  const value = parseFloat(m[1])
  return Number.isFinite(value) ? value : null
}

/** Storey count; rejects fractions and nonsense but tolerates "3.5" → 3.5. */
export function parseLevels(raw: string | undefined): number | null {
  if (!raw) return null
  const value = parseFloat(raw.trim())
  if (!Number.isFinite(value) || value < 0 || value > 200) return null
  return value
}

/**
 * Heights for footprints with nothing else to go on. These are deliberately
 * modest: a too-short block reads as a placeholder, a too-tall one invents a
 * skyline that isn't there.
 */
function defaultHeightForType(type: string | undefined): number {
  switch ((type ?? '').toLowerCase()) {
    case 'garage':
    case 'garages':
    case 'shed':
    case 'hut':
    case 'carport':
    case 'roof':
      return 3
    case 'house':
    case 'detached':
    case 'bungalow':
      return 6
    case 'church':
    case 'cathedral':
    case 'chapel':
      return 14
    case 'industrial':
    case 'warehouse':
    case 'hangar':
      return 10
    case 'apartments':
    case 'residential':
      return 12
    default:
      return DEFAULT_BUILDING_HEIGHT_M
  }
}

// ── Overpass response parsing ──────────────────────────────────────────────────

/** Minimal shape of what we read from an Overpass `out geom` response. */
export interface OverpassElement {
  type: string
  id: number
  tags?: Record<string, string>
  /** Present with `out geom` on ways. */
  geometry?: Array<{ lat: number; lon: number }>
  /** Present on relations (multipolygons). */
  members?: Array<{
    type: string
    role: string
    geometry?: Array<{ lat: number; lon: number }>
  }>
}

export interface BuildingFootprint {
  id: string
  /** Closed ring in WGS84, first point NOT repeated at the end. */
  ring: Array<{ lat: number; lon: number }>
  height: BuildingHeight
}

/**
 * Parse an Overpass JSON response into footprints.
 *
 * Handles ways directly and takes the OUTER rings of multipolygon relations;
 * inner rings (courtyards) are dropped rather than punched out — a solid block
 * where a courtyard exists is a far smaller lie than a missing building, and
 * hole support would need the triangulator to accept them.
 */
export function parseOverpassBuildings(json: unknown): BuildingFootprint[] {
  const elements = (json as { elements?: unknown })?.elements
  if (!Array.isArray(elements)) return []

  const out: BuildingFootprint[] = []
  for (const raw of elements) {
    const el = raw as OverpassElement
    if (!el || typeof el !== 'object') continue
    const height = resolveBuildingHeight(el.tags)

    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const ring = normalizeRing(el.geometry)
      if (ring) out.push({ id: `w${el.id}`, ring, height })
      continue
    }

    if (el.type === 'relation' && Array.isArray(el.members)) {
      let part = 0
      for (const member of el.members) {
        if (member?.role !== 'outer' || !Array.isArray(member.geometry)) continue
        const ring = normalizeRing(member.geometry)
        if (ring) out.push({ id: `r${el.id}-${part++}`, ring, height })
      }
    }
  }
  return out
}

/**
 * Drop the duplicated closing vertex and reject rings too small to be a
 * building. Returns null when the ring is unusable.
 */
function normalizeRing(
  geometry: Array<{ lat: number; lon: number }>,
): Array<{ lat: number; lon: number }> | null {
  const pts = geometry.filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
  )
  if (pts.length < 4) return null // a closed triangle is 4 points

  const first = pts[0]
  const last = pts[pts.length - 1]
  const closed = Math.abs(first.lat - last.lat) < 1e-12 && Math.abs(first.lon - last.lon) < 1e-12
  const ring = closed ? pts.slice(0, -1) : pts
  if (ring.length < 3) return null
  if (approximateAreaM2(ring) < MIN_FOOTPRINT_AREA_M2) return null
  return ring
}

/**
 * Shoelace area in m², using a local equirectangular approximation around the
 * ring's own latitude. Exact enough to reject slivers, which is all it is for.
 */
export function approximateAreaM2(ring: ReadonlyArray<{ lat: number; lon: number }>): number {
  if (ring.length < 3) return 0
  const latRad = (ring[0].lat * Math.PI) / 180
  const mPerDegLat = 111_132
  const mPerDegLon = 111_320 * Math.cos(latRad)
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += (a.lon * mPerDegLon) * (b.lat * mPerDegLat) - (b.lon * mPerDegLon) * (a.lat * mPerDegLat)
  }
  return Math.abs(sum) / 2
}

// ── Query construction ─────────────────────────────────────────────────────────

/** Overpass endpoint. Kept as a constant so it is one line to repoint. */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

export const BUILDINGS_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'

/**
 * Overpass QL for every building in a bbox, geometry inlined.
 *
 * `[out:json][timeout:N]` bounds server work; `out geom` avoids a second
 * round-trip for node coordinates. Relations are included so large or
 * courtyard buildings do not vanish, and the result is capped so a dense city
 * centre cannot return tens of megabytes.
 */
export function buildOverpassQuery(
  bbox: { south: number; west: number; north: number; east: number },
  timeoutS = 25,
  maxElements = 4000,
): string {
  const s = bbox.south.toFixed(6)
  const w = bbox.west.toFixed(6)
  const n = bbox.north.toFixed(6)
  const e = bbox.east.toFixed(6)
  return [
    `[out:json][timeout:${timeoutS}];`,
    `(way["building"](${s},${w},${n},${e});`,
    `relation["building"](${s},${w},${n},${e}););`,
    `out geom ${maxElements};`,
  ].join('')
}

/**
 * Bounding box of a square patch centred on a point.
 * `halfSizeM` is half the patch side in metres.
 */
export function bboxAround(
  lat: number, lon: number, halfSizeM: number,
): { south: number; west: number; north: number; east: number } {
  const dLat = halfSizeM / 111_132
  const cos = Math.cos((lat * Math.PI) / 180)
  // Guard the poles: cos → 0 would make the longitude span infinite.
  const dLon = halfSizeM / (111_320 * Math.max(0.01, cos))
  return {
    south: Math.max(-85, lat - dLat),
    north: Math.min(85, lat + dLat),
    west: Math.max(-180, lon - dLon),
    east: Math.min(180, lon + dLon),
  }
}
