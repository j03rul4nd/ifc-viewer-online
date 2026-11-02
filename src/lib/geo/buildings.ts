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

import type { HeightPrior } from './height-prior'

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
  /**
   * Where the number came from: a `height` tag, a storey count, or nothing at
   * all. `estimated` cannot tell the last two apart, and they deserve opposite
   * treatment — a counted 7 storeys is a fact about the front of a plot, a
   * prior's 20 m is a guess about all of it.
   */
  basis?: 'height' | 'levels' | 'guess'
  /**
   * WHO said so — the provenance `basis` cannot carry. A `height` from a
   * surveyor and one OpenMapTiles invented are both `basis: 'height'`; a guess
   * from the district's own buildings and the global constant are both
   * `'guess'`. Every stage that rewrites a height stamps itself here, so any
   * building can answer "where does this number come from".
   */
  source?: HeightSource
}

/** Where a building's height came from, best first. See `BuildingHeight.source`. */
export type HeightSource =
  | 'osm'           // tagged in OpenStreetMap
  | 'overture'      // the Overture Maps footprint feed
  | 'openmaptiles'  // the vector-tile fallback's render height
  | 'fabric'        // a regional typology rule (Barcelona's barris)
  | 'rule'          // a placement rule (a kiosk on a square, a park pavilion)
  | 'prior'         // the median of this district's measured buildings
  | 'default'       // a global per-type constant

/**
 * Tag a pseudo-element carries to say which feed made it. Not an OSM key:
 * the leading underscore keeps it out of every real namespace.
 */
export const DATA_SOURCE_TAG = '_src'

/** The feed a tag set came from, `osm` unless a converter said otherwise. */
export function dataSourceOf(t: Record<string, string>): HeightSource {
  const s = t[DATA_SOURCE_TAG]
  return s === 'overture' || s === 'openmaptiles' ? s : 'osm'
}

/**
 * Metres a counted roof storey adds, when the district has not measured one.
 * Lower than a full storey: an attic is under a slope.
 */
export const ROOF_LEVEL_M = 2.6

/**
 * Resolve a building's height from OSM tags, most trustworthy source first:
 * `height` (surveyed) → `building:levels` (counted) → a type-aware default.
 *
 * OSM heights are metres by convention but files carry units anyway ("12 m",
 * "40'"), so parsing is deliberately forgiving about a trailing unit and
 * rejects anything it cannot read rather than guessing a number out of it.
 */
export function resolveBuildingHeight(
  tags: Record<string, string> | undefined,
  prior?: HeightPrior | null,
  areaM2?: number,
): BuildingHeight {
  const t = tags ?? {}

  const explicit = parseLengthM(t['height'])
  // `building:min_height` is the older spelling and still common on parts.
  const minExplicit = parseLengthM(t['min_height']) ?? parseLengthM(t['building:min_height']) ?? 0
  // A height fused in from another feed says so on its own tag; see
  // overture-footprints `fuseOvertureAttributes`.
  const source: HeightSource = t['_src:height'] === 'overture' ? 'overture' : dataSourceOf(t)

  if (explicit !== null && explicit > 0) {
    return {
      heightM: Math.min(explicit, MAX_BUILDING_HEIGHT_M),
      minHeightM: Math.max(0, Math.min(minExplicit, explicit - 0.5)),
      // A `height` is not automatically a SURVEYED height. Mappers say so when
      // they guessed, and in the Lujiazui patch 57 of the 137 buildings that
      // carry a height — 42% of them — are tagged `note:height=estimated`.
      // Reporting those as measured is precisely the quiet fiction the audit
      // and the confidence overlay exist to prevent, and the person who put the
      // number there already told us not to.
      estimated: heightIsFlaggedEstimated(t),
      basis: 'height',
      source,
    }
  }

  const levels = parseLevels(t['building:levels'])
  // `min_level` is the Simple-3D-Buildings key on parts; `building:min_level`
  // the outline's. Same meaning, both seen in the wild.
  const minLevels = parseLevels(t['building:min_level']) ?? parseLevels(t['min_level']) ?? 0
  // `building:levels` counts the storeys UNDER the roof; an attic or a pitched
  // roof's storeys are `roof:levels`, and leaving them out drew every
  // Haussmann block a mansard short.
  const roofLevels = parseLevels(t['roof:levels']) ?? 0
  if (levels !== null && levels > 0) {
    // Metres per storey is REGIONAL and the constant never said so. Measured on
    // buildings carrying both a height and a storey count, Barcelona runs
    // 3.14 m and Shanghai 4.42 m against one hardcoded 3.2 — so a 30-storey
    // Lujiazui tower tagged only by storey count came out 37 m short. Ask the
    // district first; it answers only where enough buildings state both.
    const perStorey = prior?.storeyHeightFor(t['building'] ?? t['building:part'])
      ?? DEFAULT_STOREY_HEIGHT_M
    const h = Math.min(levels * perStorey + roofLevels * Math.min(perStorey, ROOF_LEVEL_M), MAX_BUILDING_HEIGHT_M)
    return {
      heightM: h,
      minHeightM: Math.max(0, Math.min(minLevels * perStorey, h - 0.5)),
      // A level count IS data, but the metres are still not surveyed.
      estimated: true,
      basis: 'levels',
      source,
    }
  }

  // Nothing is tagged. Before falling back to a global constant, ask what the
  // rest of THIS patch measures — an untagged `building=yes` gets 8 m, which in
  // Lujiazui is the 15th percentile of the district's own surveyed buildings.
  // The prior declines wherever the evidence is thin or the type is one whose
  // height does not depend on where it stands; see `height-prior`.
  const local = prior && areaM2 !== undefined
    ? prior.heightFor(t['building'] ?? t['building:part'], areaM2)
    : null

  return {
    heightM: Math.min(local ?? defaultHeightForType(t['building']), MAX_BUILDING_HEIGHT_M),
    minHeightM: 0,
    // Still a guess, and still says so. The prior moves the fallback from
    // "wrong everywhere" to "typical of here"; it does not make it surveyed.
    estimated: true,
    basis: 'guess',
    source: local != null ? 'prior' : 'default',
  }
}

/**
 * Did the mapper flag their own height as a guess?
 *
 * `note:height` and `source:height` are where they say so, and `source` carries
 * it too when the whole object was estimated. Matched as a substring because the
 * values in the wild are compound — `estimation;Bing` is a real one — and
 * because a false positive here only costs a building its "surveyed" badge,
 * while a false negative presents somebody's guess as a survey.
 */
export function heightIsFlaggedEstimated(t: Record<string, string>): boolean {
  const notes = [t['note:height'], t['source:height'], t['height:source'], t['source']]
  return notes.some((v) => /estimat/i.test(v ?? ''))
}

/**
 * The error Overpass reports inside a 200 response, or null when there is none.
 *
 * OVERPASS SIGNALS FAILURE WITH SUCCESS. A busy server, a server-side timeout or
 * an exhausted rate limit all come back as **HTTP 200** with a normal-looking
 * JSON body: `elements: []` and a `remark` explaining what went wrong. Checking
 * `res.ok` therefore passes, the parse yields zero features, and the caller
 * cannot tell "Overpass is overloaded" from "nothing is mapped here".
 *
 * That distinction is the whole point, because the two answers get opposite
 * treatment: genuine emptiness is cached so a toggle never re-asks for the same
 * nothing, while a failure must not be cached at all. Conflating them means one
 * unlucky moment poisons the neighbourhood for the rest of the session — the
 * map stays blank and retrying does nothing, which is exactly what it did.
 *
 * A `remark` on a response that DID return elements is a warning about a partial
 * result, not a failure; the elements are real and are kept.
 */
export function overpassRemarkError(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const body = json as { remark?: unknown; elements?: unknown }
  const remark = typeof body.remark === 'string' ? body.remark.trim() : ''
  if (remark === '') return null
  const empty = !Array.isArray(body.elements) || body.elements.length === 0
  return empty ? remark : null
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
    case 'palace':
      // Three piani nobili and a cornice — the Parlament de Catalunya, the
      // Palau Reial. The 8 m generic made them bungalows.
      return 16
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

/**
 * Overpass mirrors, in order of preference. One host is not enough: when the
 * main one is down the map falls back to vector tiles, which carry no OSM ids
 * or monument tags, so landmarks, arches and detailed parks silently vanish.
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const

/** The mirror that last answered: no point waiting on a dead one twice. */
let preferredMirror = 0

export function resetOverpassMirrorForTest(): void { preferredMirror = 0 }

/**
 * One Overpass query, across the mirrors, within one time budget. An attempt
 * gets half of what is left (the last gets all of it), so a mirror that hangs
 * cannot use up the budget of the ones behind it.
 */
export async function fetchOverpassWithMirrors(query: string, budgetMs: number): Promise<unknown> {
  const deadline = Date.now() + budgetMs
  const n = OVERPASS_ENDPOINTS.length
  let lastError: unknown = new Error('Overpass: no mirror tried')
  for (let i = 0; i < n; i++) {
    const index = (preferredMirror + i) % n
    const left = deadline - Date.now()
    if (left <= 0) break
    // AbortController rather than a bare race: a hung request must actually be
    // cancelled, not merely ignored while it keeps the connection open.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), i === n - 1 ? left : left / 2)
    try {
      const res = await fetch(OVERPASS_ENDPOINTS[index], {
        method: 'POST',
        // Overpass expects the QL in a form body; this is the documented shape.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      })
      // 429/504 are Overpass telling us it is busy, so another mirror may answer.
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
      const json: unknown = await res.json()
      // A busy Overpass answers 200 with an empty body and a `remark`. Treated
      // as success it becomes "nothing is mapped here", which the caller CACHES.
      const remark = overpassRemarkError(json)
      if (remark) throw new Error(`Overpass: ${remark}`)
      preferredMirror = index
      return json
    } catch (err) {
      lastError = err
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

export const BUILDINGS_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'

/**
 * Shown only while footprints from the shipped extract are actually on screen.
 *
 * Attribution follows USE, not availability: a district with no Overture
 * buildings left after de-duplication credits nobody, because it is drawing
 * nobody's data.
 */
export const OVERTURE_ATTRIBUTION = '© Overture Maps Foundation'

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
    `relation["building"](${s},${w},${n},${e});`,
    // SIMPLE 3D BUILDINGS — the layer with the heights in it.
    //
    // Measured over Lujiazui, the Oriental Pearl and the Shanghai World
    // Financial Center: 156 `building` outlines of which 22 carry a height,
    // fourteen per cent, so 83 blocks of one of the densest business districts
    // on earth fell through to an eight-metre fallback. In the same box there
    // are 132 `building:part` ways and 98 of them carry a height. The data was
    // there the whole time and this query never asked for it.
    //
    // Parts also fix the SHAPE: a tower is modelled as podium, shaft and crown
    // rather than as one prism, which is what made a skyline of flat boxes.
    `way["building:part"](${s},${w},${n},${e});`,
    `relation["building:part"](${s},${w},${n},${e}););`,
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
