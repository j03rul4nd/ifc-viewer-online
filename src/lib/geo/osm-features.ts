// ─── osm-features ─────────────────────────────────────────────────────────────
// Classifying OpenStreetMap elements into the scene layers we render around a
// site: buildings, water, greenery, sand, rock, trees and bridges. PURE — tag reasoning and
// geometry preparation only; meshes are built in `osm-scene.ts` / `building-mesh.ts`.
//
// Why one module and ONE Overpass query for all of it: each extra query is
// another round trip against a shared public service we are trying to be a good
// citizen of. Fetching every layer in a single call and filtering client-side
// costs one request regardless of how many layers the user turns on, and makes
// toggling a layer instant (no refetch) instead of a several-second wait.
//
// HONESTY, same rule as everywhere else in this codebase: OSM is
// volunteer-mapped and wildly uneven. A missing park is not an empty field, and
// a missing tree is not a bare street. The UI reports what was found and never
// implies the absence of data means absence of the thing.

import {
  resolveBuildingHeight, parseLengthM, approximateAreaM2,
  type BuildingHeight,
} from './buildings'
import {
  treeShape, greenTone, greenRoughness, bareTone, bareRoughness, type TreeShape,
} from './feature-variation'

/**
 * Scene layers the user can show or hide independently.
 *
 * `sand` and `rock` are separate kinds rather than shades of `green` because
 * they are not vegetation and do not behave like it: a beach, a dune field and
 * a scree slope each need their own surface treatment, and a site by the sea or
 * under a mountain is exactly the case where the ground around the model is the
 * thing a client is looking at.
 */
export type FeatureKind =
  | 'building' | 'water' | 'green' | 'sand' | 'rock' | 'tree' | 'bridge' | 'road' | 'rail'
  | 'signal'

export const FEATURE_KINDS: readonly FeatureKind[] =
  ['building', 'water', 'green', 'sand', 'rock', 'tree', 'bridge', 'road', 'rail', 'signal']

export interface LatLonPoint { lat: number; lon: number }

export interface OsmFeature {
  id: string
  kind: FeatureKind
  /** `name` as mapped, when there is one. Never invented. */
  name?: string
  /** What the thing IS, in one readable phrase — 'Train station', 'School'. */
  label?: string
  /** Closed ring for area features (buildings, water, green, bridge decks). */
  ring?: LatLonPoint[]
  /** Single position for point features (trees). */
  point?: LatLonPoint
  /** Extrusion heights — meaningful for buildings and bridges. */
  height: BuildingHeight
  /** Deck width in metres for bridges derived from a linear way. */
  widthM?: number
  /** Rendering hints read from tags (roof shape/colour, tree size). */
  style: FeatureStyle
}

export interface FeatureStyle {
  /** '#rrggbb' from `building:colour` / `roof:colour`, when parseable. */
  wallColor?: string
  roofColor?: string
  /** `roof:shape`, normalised to the shapes we can actually build. */
  roofShape: RoofShape
  /** Roof height in metres for non-flat roofs. */
  roofHeightM: number
  /** Canopy radius (trees), metres. */
  crownRadiusM?: number
  /** Canopy silhouette (trees), resolved from `leaf_type`. */
  treeShape?: TreeShape
  /** Rail features: a corridor of track, or a station platform slab. */
  railKind?: 'track' | 'platform'
  /**
   * A marked pedestrian crossing. Rendered as paint on the carriageway rather
   * than as a footpath of its own — which is what it is, and drawing it as a
   * tan strip across the asphalt was plainly wrong.
   */
  crossing?: boolean
  /**
   * How coarse the surface is, 0-1 — a mown pitch vs heath, fine beach sand vs
   * shingle, an ice field vs loose scree. Drives grain size, ripple wavelength
   * and bump strength in the procedural materials. One number instead of a
   * material enum because it has to travel as a per-vertex attribute on a
   * merged geometry, where a whole layer shares ONE material.
   */
  roughness?: number
  /** Overhead line present — drives the catenary masts along a track. */
  electrified?: boolean
  /**
   * Base RGB for a surface, by what it actually is — greenery (forest vs lawn),
   * road (motorway vs footpath), rail (ballast vs platform).
   * Resolved HERE rather than shipping raw tags to the renderer: a
   * neighbourhood is thousands of features, and cloning every tag map across
   * the worker boundary would cost far more than the few numbers we need.
   */
  tone?: [number, number, number]
}

/**
 * Roof shapes we model. OSM has dozens; these three cover the overwhelming
 * majority of tagged buildings, and anything else degrades to `flat` rather
 * than being approximated by a shape that would look wrong.
 */
export type RoofShape = 'flat' | 'gabled' | 'pyramidal'

// ── Tag → kind classification ──────────────────────────────────────────────────

const GREEN_LEISURE = new Set(['park', 'garden', 'pitch', 'golf_course', 'common', 'nature_reserve'])
const GREEN_LANDUSE = new Set([
  'grass', 'forest', 'meadow', 'village_green', 'recreation_ground',
  'allotments', 'orchard', 'vineyard', 'cemetery',
])
const GREEN_NATURAL = new Set(['wood', 'scrub', 'grassland', 'heath', 'wetland'])

/** Loose mineral ground: beaches, dunes, river bars, golf bunkers. */
const SAND_NATURAL = new Set(['beach', 'sand', 'dune', 'shingle', 'mud'])

/** Solid or broken mineral ground, plus permanent ice. */
const ROCK_NATURAL = new Set(['bare_rock', 'rock', 'scree', 'stone', 'glacier'])

/**
 * Road classes worth drawing. Excludes what is not a carriageway (crossings and
 * bus stops are nodes) and what does not exist yet — a proposed motorway drawn
 * as asphalt is a lie about the site.
 */
const ROAD_VALUES = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified',
  'residential', 'living_street', 'service', 'pedestrian', 'footway', 'path',
  'cycleway', 'track', 'steps',
])

/** Rail we draw. Abandoned, disused and proposed alignments are deliberately out. */
const RAIL_VALUES = new Set([
  'rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'monorail',
  'funicular', 'preserved', 'platform',
])

/** Per-class carriageway width when the way carries neither width nor lanes. */
/** Width of a marked crossing band, metres. */
export const CROSSING_BAND_M = 4

const ROAD_DEFAULT_WIDTH: Record<string, number> = {
  motorway: 14, motorway_link: 7, trunk: 12, trunk_link: 7,
  primary: 10, primary_link: 6, secondary: 9, secondary_link: 6,
  tertiary: 8, tertiary_link: 5.5, unclassified: 6.5, residential: 6.5,
  living_street: 5.5, service: 4, pedestrian: 5, footway: 2,
  path: 1.6, cycleway: 2.2, track: 3, steps: 1.6,
}

/**
 * Carriageway width in metres: an explicit `width` wins, else lanes x 3.2 m plus
 * a shoulder on the fast classes, else the per-class default.
 */
export function roadWidth(tags: Record<string, string> | undefined): number {
  const t = tags ?? {}
  const explicit = parseLengthM(t['width'])
  if (explicit && explicit > 0) return Math.min(40, explicit)
  const cls = t['highway'] ?? ''
  const lanes = parseFloat(t['lanes'] ?? '')
  if (Number.isFinite(lanes) && lanes > 0) {
    const shoulder = cls.startsWith('motorway') || cls.startsWith('trunk') ? 2.5 : 0.6
    return Math.min(40, lanes * 3.2 + shoulder)
  }
  return ROAD_DEFAULT_WIDTH[cls] ?? 6
}

/**
 * Rail corridor width: the ballast shoulder, not the 1.435 m gauge — a track
 * occupies about 4.5 m of ground, and `tracks` multiplies it.
 */
export function railWidth(tags: Record<string, string> | undefined): number {
  const t = tags ?? {}
  const explicit = parseLengthM(t['width'])
  if (explicit && explicit > 0) return Math.min(60, explicit)
  const tracks = parseFloat(t['tracks'] ?? '')
  const n = Number.isFinite(tracks) && tracks > 0 ? tracks : 1
  const light = t['railway'] === 'tram' || t['railway'] === 'subway'
  return Math.min(60, n * (light ? 3.2 : 4.5))
}

/** Asphalt darkens with importance; unpaved ways go warm. */
const ROAD_TONES: Record<string, [number, number, number]> = {
  motorway: [0.30, 0.30, 0.33], trunk: [0.32, 0.32, 0.35],
  primary: [0.35, 0.35, 0.38], secondary: [0.37, 0.37, 0.40],
  tertiary: [0.39, 0.39, 0.41], unclassified: [0.41, 0.41, 0.43],
  residential: [0.41, 0.41, 0.43], living_street: [0.43, 0.43, 0.45],
  service: [0.44, 0.44, 0.46], pedestrian: [0.50, 0.47, 0.44],
  footway: [0.52, 0.46, 0.39], path: [0.50, 0.44, 0.36],
  cycleway: [0.36, 0.36, 0.44], track: [0.47, 0.43, 0.34],
  steps: [0.50, 0.46, 0.42],
}

/** Road-marking white, worn — the same paint as the centre line. */
const CROSSING_TONE: [number, number, number] = [0.82, 0.80, 0.72]

/**
 * A marked pedestrian crossing. `crossing=no` and unmarked crossings are
 * excluded: painting stripes where there is no paint would be inventing a
 * traffic control that is not there.
 */
export function isCrossing(tags: Record<string, string> | undefined): boolean {
  const t = tags ?? {}
  const marked = new Set(['marked', 'zebra', 'traffic_signals', 'uncontrolled'])
  if (t['footway'] === 'crossing' || t['cycleway'] === 'crossing' || t['highway'] === 'crossing') {
    const kind = t['crossing'] ?? t['crossing:markings'] ?? ''
    // An untagged footway=crossing is marked far more often than not; an
    // explicit "unmarked" or "no" is a statement and is honoured.
    if (kind === 'unmarked' || kind === 'no') return false
    return kind === '' || marked.has(kind) || t['crossing:markings'] === 'yes'
  }
  return false
}

export function roadTone(tags: Record<string, string> | undefined): [number, number, number] {
  const cls = (tags?.['highway'] ?? '').replace(/_link$/, '')
  return ROAD_TONES[cls] ?? [0.41, 0.41, 0.43]
}

const WATER_LANDUSE = new Set(['reservoir', 'basin'])

/**
 * Classify an element from its tags. Order matters and encodes precedence:
 * a bridge carrying a road over a river is a bridge, and a building on a
 * bridge is still a building.
 */
export function classifyFeature(tags: Record<string, string> | undefined): FeatureKind | null {
  const t = tags ?? {}

  // Buildings win over everything — a boathouse in a park is a building.
  const building = t['building']
  if (building && building !== 'no') return 'building'

  if (t['natural'] === 'tree') return 'tree'

  // A surveyed junction control. Only the signals themselves — a crossing node
  // that merely REFERS to signals is part of that crossing, not a mast.
  if (t['highway'] === 'traffic_signals') return 'signal'

  // Bridges: either mapped as an area (man_made=bridge) or as a way carrying
  // bridge=yes. The linear case is far more common, which is why it is here
  // and not treated as an edge case.
  if (t['man_made'] === 'bridge') return 'bridge'
  if (t['bridge'] && t['bridge'] !== 'no' && (t['highway'] || t['railway'])) return 'bridge'

  if (
    t['natural'] === 'water' ||
    t['waterway'] === 'riverbank' ||
    t['water'] !== undefined ||
    WATER_LANDUSE.has(t['landuse'] ?? '')
  ) return 'water'

  // Bare ground before greenery: a dune tagged as part of a nature reserve is
  // still sand, and a golf bunker sits inside a green golf course.
  if (SAND_NATURAL.has(t['natural'] ?? '') || t['landuse'] === 'sand' || t['golf'] === 'bunker') {
    return 'sand'
  }
  if (ROCK_NATURAL.has(t['natural'] ?? '') || t['landuse'] === 'quarry') return 'rock'

  if (
    GREEN_LEISURE.has(t['leisure'] ?? '') ||
    GREEN_LANDUSE.has(t['landuse'] ?? '') ||
    GREEN_NATURAL.has(t['natural'] ?? '')
  ) return 'green'

  // Rail before road: a tramway down a street is rail infrastructure, and a
  // station platform is not a footpath.
  if (RAIL_VALUES.has(t['railway'] ?? '')) return 'rail'
  if (t['public_transport'] === 'platform' && t['railway'] !== undefined) return 'rail'

  if (ROAD_VALUES.has(t['highway'] ?? '')) return 'road'

  return null
}

// ── Style from tags ────────────────────────────────────────────────────────────

/** Named colours OSM uses often enough to be worth resolving. */
const NAMED_COLORS: Record<string, string> = {
  white: '#f2f2f0', black: '#2a2a2a', grey: '#8a8a8a', gray: '#8a8a8a',
  red: '#a5433a', brown: '#7a5a44', green: '#4a6b46', blue: '#4a6080',
  yellow: '#d8c27a', orange: '#c88a4a', beige: '#ddd0b6', cream: '#e8dfc8',
  silver: '#b8bcc0', copper: '#7a5c3e', slate: '#5a6068', terracotta: '#a8623f',
}

/** Parse an OSM colour value: '#rrggbb', '#rgb' or a common colour name. */
export function parseOsmColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
  if (hex) {
    const h = hex[1]
    return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`
  }
  return NAMED_COLORS[v]
}

/** Normalise `roof:shape` to a shape we can actually build. */
export function parseRoofShape(raw: string | undefined): RoofShape {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'gabled':
    case 'hipped':      // close enough at this scale; both read as a ridge
    case 'half-hipped':
    case 'gambrel':
      return 'gabled'
    case 'pyramidal':
    case 'dome':        // a pyramid reads better than a flat cap
    case 'conical':
      return 'pyramidal'
    default:
      return 'flat'
  }
}

/**
 * Resolve rendering style from tags. Roof height comes from `roof:height` when
 * tagged, otherwise a modest default that reads as a roof without inventing a
 * storey — and it is always subtracted from the wall height, never added, so a
 * surveyed total height stays the total height.
 */
export function resolveFeatureStyle(
  kind: FeatureKind, tags: Record<string, string> | undefined,
): FeatureStyle {
  const t = tags ?? {}
  if (kind === 'tree') {
    const crown = parseLengthM(t['diameter_crown'])
    return {
      roofShape: 'flat',
      roofHeightM: 0,
      // Half the crown diameter; a sane default when untagged.
      crownRadiusM: crown && crown > 0 ? crown / 2 : 3,
      treeShape: treeShape(t),
    }
  }

  if (kind === 'green') {
    return {
      roofShape: 'flat', roofHeightM: 0,
      tone: greenTone(t), roughness: greenRoughness(t),
    }
  }

  if (kind === 'sand' || kind === 'rock') {
    return {
      roofShape: 'flat', roofHeightM: 0,
      tone: bareTone(kind, t), roughness: bareRoughness(kind, t),
    }
  }

  if (kind === 'road') {
    if (isCrossing(t)) {
      return { roofShape: 'flat', roofHeightM: 0, crossing: true, tone: CROSSING_TONE }
    }
    return { roofShape: 'flat', roofHeightM: 0, tone: roadTone(t) }
  }

  if (kind === 'rail') {
    const platform = t['railway'] === 'platform' || t['public_transport'] === 'platform'
    const power = (t['electrified'] ?? '').toLowerCase()
    return {
      roofShape: 'flat', roofHeightM: 0,
      railKind: platform ? 'platform' : 'track',
      // `electrified=no` is a real, common answer and must not read as yes.
      electrified: !platform && power !== '' && power !== 'no',
      // Ballast is warm grey; a platform is paler concrete.
      tone: platform ? [0.52, 0.51, 0.52] : [0.40, 0.37, 0.33],
    }
  }

  const roofShape = parseRoofShape(t['roof:shape'])
  const tagged = parseLengthM(t['roof:height'])
  return {
    wallColor: parseOsmColor(t['building:colour'] ?? t['colour']),
    roofColor: parseOsmColor(t['roof:colour']),
    roofShape,
    roofHeightM: roofShape === 'flat' ? 0 : (tagged && tagged > 0 ? tagged : 3),
  }
}

// ── Overpass parsing ───────────────────────────────────────────────────────────

interface OverpassGeom { lat: number; lon: number }

interface OverpassEl {
  type: string
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: OverpassGeom[]
  members?: Array<{ type: string; role: string; geometry?: OverpassGeom[] }>
}

/** Smallest area worth drawing, m² — below this it is mapping noise. */
export const MIN_AREA_M2: Record<Exclude<FeatureKind, 'tree' | 'signal'>, number> = {
  building: 8,
  water: 40,
  green: 60,
  sand: 40,
  // Mountain polygons are enormous; anything smaller than this is a boulder
  // somebody mapped, not ground worth drawing.
  rock: 120,
  bridge: 10,
  // Linear ways carry a width instead of an area; only platforms are polygons.
  road: 0,
  rail: 4,
}

/**
 * Parse a mixed Overpass response into typed features.
 *
 * Linear ways tagged as bridges are kept as their raw centreline plus a width;
 * the buffering into a deck polygon happens at mesh time where the metric frame
 * is available.
 */
export function parseOsmFeatures(json: unknown): OsmFeature[] {
  const elements = (json as { elements?: unknown })?.elements
  if (!Array.isArray(elements)) return []

  const out: OsmFeature[] = []
  for (const raw of elements) {
    const el = raw as OverpassEl
    if (!el || typeof el !== 'object') continue
    const kind = classifyFeature(el.tags)
    if (!kind) continue

    const style = resolveFeatureStyle(kind, el.tags)
    const height = resolveBuildingHeight(el.tags)

    // Trees and signals are nodes.
    if (kind === 'signal') {
      if (el.type !== 'node' || !Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue
      out.push({
        id: `n${el.id}`, kind, point: { lat: el.lat!, lon: el.lon! },
        height: { heightM: 3.4, minHeightM: 0, estimated: true }, style,
      })
      continue
    }

    if (kind === 'tree') {
      if (el.type !== 'node' || !Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue
      out.push({
        id: `n${el.id}`, kind, point: { lat: el.lat!, lon: el.lon! },
        height: treeHeight(el.tags), style,
      })
      continue
    }

    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const pts = el.geometry.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
      if (pts.length < 2) continue
      const closed = isClosed(pts)

      // A bridge tagged on an open way is a centreline: keep it as-is with a
      // width, and let the mesh stage buffer it into a deck.
      if (kind === 'bridge' && !closed) {
        out.push({
          id: `w${el.id}`, kind, ring: pts, height,
          widthM: bridgeWidth(el.tags), style,
        })
        continue
      }

      // Roads and track are centrelines with a width. Closed ones exist (a
      // roundabout, a loop of track) and are still ribbons, not areas — only a
      // platform is a real polygon.
      if ((kind === 'road' || kind === 'rail') && style.railKind !== 'platform') {
        out.push({
          id: `w${el.id}`, kind, ring: pts, height,
          widthM: style.crossing
            // The painted band, not the 2 m footway the way is tagged as.
            ? CROSSING_BAND_M
            : kind === 'road' ? roadWidth(el.tags) : railWidth(el.tags),
          style,
        })
        continue
      }

      const ring = closeRing(pts, kind)
      if (ring) {
        out.push({
          id: `w${el.id}`, kind, ring, height, style,
          name: el.tags?.['name'], label: featureLabel(el.tags),
        })
      }
      continue
    }

    if (el.type === 'relation' && Array.isArray(el.members)) {
      let part = 0
      for (const m of el.members) {
        if (m?.role !== 'outer' || !Array.isArray(m.geometry)) continue
        const pts = m.geometry.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
        const ring = closeRing(pts, kind)
        if (ring) out.push({ id: `r${el.id}-${part++}`, kind, ring, height, style })
      }
    }
  }
  return out
}

function isClosed(pts: OverpassGeom[]): boolean {
  if (pts.length < 4) return false
  const a = pts[0]
  const b = pts[pts.length - 1]
  return Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lon - b.lon) < 1e-12
}

/** Strip the duplicate closing vertex and reject areas too small to matter. */
function closeRing(pts: OverpassGeom[], kind: FeatureKind): LatLonPoint[] | null {
  if (pts.length < 3) return null
  const ring = isClosed(pts) ? pts.slice(0, -1) : pts
  if (ring.length < 3) return null
  const min = kind === 'tree' || kind === 'signal' ? 0 : MIN_AREA_M2[kind]
  if (approximateAreaM2(ring) < min) return null
  return ring
}

/**
 * Deck width for a bridge from its way tags: an explicit `width`, else lanes ×
 * 3.5 m plus a margin, else a default that reads correctly for a minor road.
 */
export function bridgeWidth(tags: Record<string, string> | undefined): number {
  const t = tags ?? {}
  const explicit = parseLengthM(t['width'])
  if (explicit && explicit > 0) return Math.min(60, explicit)
  const lanes = parseFloat(t['lanes'] ?? '')
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(60, lanes * 3.5 + 1.5)
  if (t['railway']) return 8
  return 7
}

/** Tree height: tagged, else a plausible mature street tree. */
function treeHeight(tags: Record<string, string> | undefined): BuildingHeight {
  const h = parseLengthM((tags ?? {})['height'])
  return {
    heightM: h && h > 0 ? Math.min(80, h) : 8,
    minHeightM: 0,
    estimated: !(h && h > 0),
  }
}

// ── Query ──────────────────────────────────────────────────────────────────────

/**
 * One Overpass query covering every layer.
 *
 * Trees are nodes; everything else is ways and relations. `nwr` would be
 * shorter but pulls node duplicates of every area, so the classes are listed
 * explicitly. Keeping this to a single query is what makes layer toggles
 * instant and keeps us to one request per site.
 */
export function buildFeaturesQuery(
  bbox: { south: number; west: number; north: number; east: number },
  timeoutS = 30,
  maxElements = 6000,
): string {
  const b = `${bbox.south.toFixed(6)},${bbox.west.toFixed(6)},${bbox.north.toFixed(6)},${bbox.east.toFixed(6)}`
  const area = (sel: string): string => `way${sel}(${b});relation${sel}(${b});`
  return [
    `[out:json][timeout:${timeoutS}];`,
    '(',
    area('["building"]'),
    area('["natural"="water"]'),
    area('["waterway"="riverbank"]'),
    area('["landuse"~"^(reservoir|basin)$"]'),
    area('["leisure"~"^(park|garden|pitch|golf_course|nature_reserve)$"]'),
    area('["landuse"~"^(grass|forest|meadow|village_green|recreation_ground|allotments|orchard|vineyard|cemetery)$"]'),
    area('["natural"~"^(wood|scrub|grassland|heath|wetland)$"]'),
    area('["natural"~"^(beach|sand|dune|shingle|mud)$"]'),
    area('["natural"~"^(bare_rock|rock|scree|stone|glacier)$"]'),
    area('["landuse"~"^(sand|quarry)$"]'),
    area('["golf"="bunker"]'),
    area('["man_made"="bridge"]'),
    `way["bridge"]["highway"](${b});`,
    `way["bridge"]["railway"](${b});`,
    `node["natural"="tree"](${b});`,
    `node["highway"="traffic_signals"](${b});`,
    `way["highway"](${b});`,
    `way["railway"](${b});`,
    area('["railway"="platform"]'),
    ');',
    `out geom ${maxElements};`,
  ].join('')
}

/**
 * What a feature IS, in words a person reads rather than a tag.
 *
 * Order matters: the most specific answer wins, because "Station" is a more
 * useful thing to be told than "Building". Anything unmapped returns undefined
 * rather than a guess — a building we know nothing about must say nothing, not
 * "Building" over and over.
 */
export function featureLabel(tags: Record<string, string> | undefined): string | undefined {
  const t = tags ?? {}

  // Transport first: on a site next to a station, that is the one landmark
  // everyone in the room is orienting by.
  if (t['railway'] === 'station' || t['building'] === 'train_station') return 'Train station'
  if (t['railway'] === 'halt') return 'Railway halt'
  if (t['railway'] === 'platform' || t['public_transport'] === 'platform') return 'Platform'
  if (t['railway'] === 'subway_entrance') return 'Metro entrance'
  if (t['aeroway'] === 'terminal') return 'Airport terminal'

  const amenity = t['amenity'] ?? ''
  const AMENITY: Record<string, string> = {
    school: 'School', university: 'University', college: 'College',
    kindergarten: 'Kindergarten', hospital: 'Hospital', clinic: 'Clinic',
    doctors: 'Medical centre', pharmacy: 'Pharmacy', police: 'Police station',
    fire_station: 'Fire station', townhall: 'Town hall', courthouse: 'Courthouse',
    library: 'Library', theatre: 'Theatre', cinema: 'Cinema', museum: 'Museum',
    place_of_worship: 'Place of worship', restaurant: 'Restaurant', cafe: 'Café',
    bank: 'Bank', post_office: 'Post office', parking: 'Car park',
    community_centre: 'Community centre', bus_station: 'Bus station',
  }
  if (AMENITY[amenity]) return AMENITY[amenity]

  if (t['shop']) return 'Shop'
  if (t['office']) return 'Office'
  if (t['tourism'] === 'hotel') return 'Hotel'
  if (t['tourism'] === 'museum') return 'Museum'
  if (t['leisure'] === 'sports_centre') return 'Sports centre'
  if (t['leisure'] === 'stadium') return 'Stadium'

  const BUILDING: Record<string, string> = {
    apartments: 'Apartments', residential: 'Residential', house: 'House',
    detached: 'House', terrace: 'Terraced housing', dormitory: 'Halls of residence',
    hotel: 'Hotel', commercial: 'Commercial', retail: 'Retail', office: 'Office',
    industrial: 'Industrial', warehouse: 'Warehouse', civic: 'Civic building',
    government: 'Government building', school: 'School', university: 'University',
    hospital: 'Hospital', church: 'Church', cathedral: 'Cathedral',
    mosque: 'Mosque', synagogue: 'Synagogue', temple: 'Temple',
    chapel: 'Chapel', stadium: 'Stadium', garage: 'Garage', garages: 'Garages',
    parking: 'Car park', train_station: 'Train station', transportation: 'Transport building',
    construction: 'Under construction', roof: 'Canopy', greenhouse: 'Greenhouse',
  }
  const building = t['building'] ?? ''
  if (BUILDING[building]) return BUILDING[building]

  return undefined
}

/** Count features per layer — for the "what did we find?" panel readout. */
export function countByKind(features: ReadonlyArray<OsmFeature>): Record<FeatureKind, number> {
  const counts = {
    building: 0, water: 0, green: 0, sand: 0, rock: 0,
    tree: 0, bridge: 0, road: 0, rail: 0, signal: 0 }
  for (const f of features) counts[f.kind]++
  return counts
}
