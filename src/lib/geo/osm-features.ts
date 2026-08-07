// ─── osm-features ─────────────────────────────────────────────────────────────
// Classifying OpenStreetMap elements into the scene layers we render around a
// site: buildings, water, greenery, trees and bridges. PURE — tag reasoning and
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

/** Scene layers the user can show or hide independently. */
export type FeatureKind = 'building' | 'water' | 'green' | 'tree' | 'bridge'

export const FEATURE_KINDS: readonly FeatureKind[] = ['building', 'water', 'green', 'tree', 'bridge']

export interface LatLonPoint { lat: number; lon: number }

export interface OsmFeature {
  id: string
  kind: FeatureKind
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
const GREEN_NATURAL = new Set(['wood', 'scrub', 'grassland', 'heath'])
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

  if (
    GREEN_LEISURE.has(t['leisure'] ?? '') ||
    GREEN_LANDUSE.has(t['landuse'] ?? '') ||
    GREEN_NATURAL.has(t['natural'] ?? '')
  ) return 'green'

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
export const MIN_AREA_M2: Record<Exclude<FeatureKind, 'tree'>, number> = {
  building: 8,
  water: 40,
  green: 60,
  bridge: 10,
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

    // Trees are nodes.
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

      const ring = closeRing(pts, kind)
      if (ring) out.push({ id: `w${el.id}`, kind, ring, height, style })
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
  const min = kind === 'tree' ? 0 : MIN_AREA_M2[kind]
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
    area('["natural"~"^(wood|scrub|grassland|heath)$"]'),
    area('["man_made"="bridge"]'),
    `way["bridge"]["highway"](${b});`,
    `way["bridge"]["railway"](${b});`,
    `node["natural"="tree"](${b});`,
    ');',
    `out geom ${maxElements};`,
  ].join('')
}

/** Count features per layer — for the "what did we find?" panel readout. */
export function countByKind(features: ReadonlyArray<OsmFeature>): Record<FeatureKind, number> {
  const counts = { building: 0, water: 0, green: 0, tree: 0, bridge: 0 }
  for (const f of features) counts[f.kind]++
  return counts
}
