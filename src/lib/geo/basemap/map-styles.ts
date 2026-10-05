// ─── map-styles ───────────────────────────────────────────────────────────────
// The cartographic style engine for the vector basemap.
//
// A style is NOT a colour theme. It is three layers of decisions:
//
//   Palette  — what every class of thing is painted with.
//   Knobs    — how much the map is allowed to say (label density, POIs,
//              footprints, road weight, text size).
//   Layers   — the ordered list of draw rules: which source layer, which
//              features, from which zoom, with which zoom-dependent widths.
//
// The layer list is built ONCE from (palette, knobs) by `buildLayers`, so the
// six shipped styles share the same cartographic hierarchy — roads widen the
// same way, labels arrive at the same zooms — and differ only where they
// mean to. A new style is a palette and a few knobs; a new kind of thing on
// the map is a new rule here, and every style gets it.
//
// The schema read is OpenMapTiles (what OpenFreeMap serves): layers such as
// `water`, `landcover`, `landuse`, `park`, `building`, `transportation`,
// `transportation_name`, `place`, `poi`, `housenumber`, `boundary`.
//
// Zoom convention: map zoom = level of a 512 px tile (MapLibre's). Widths and
// font sizes are CSS pixels; the painter multiplies by the style pixel scale.

export type MapStyleId = 'standard' | 'light' | 'dark' | 'bim' | 'hybrid' | 'minimal' | 'contrast'

export const MAP_STYLE_IDS: readonly MapStyleId[] = ['standard', 'light', 'dark', 'bim', 'hybrid', 'minimal', 'contrast']

import type { RasterUse } from './raster-sources'

export type Props = Readonly<Record<string, unknown>>

/** A constant, or zoom stops interpolated geometrically (widths double per zoom). */
export type Stops = number | ReadonlyArray<readonly [zoom: number, value: number]>

interface BaseLayer {
  id: string
  /** OpenMapTiles source layer. */
  source: string
  minzoom?: number
  maxzoom?: number
  filter?: (p: Props, z: number) => boolean
}

export interface FillLayer extends BaseLayer {
  type: 'fill'
  color: string | ((p: Props) => string | null)
  opacity?: Stops
  outline?: { color: string; width: Stops; minzoom: number }
}

export interface LineLayer extends BaseLayer {
  type: 'line'
  color: string | ((p: Props) => string | null)
  width: Stops | ((p: Props, z: number) => number)
  opacity?: Stops
  dash?: readonly number[]
  cap?: CanvasLineCap
  /** Features are drawn in ascending key — majors over minors. */
  sortKey?: (p: Props) => number
}

export interface LabelLayer extends BaseLayer {
  type: 'label'
  placement: 'point' | 'line'
  text: (p: Props, lang: string) => string | null
  size: Stops | ((p: Props, z: number) => number)
  weight: number
  color: string | ((p: Props) => string)
  halo: string
  haloWidth: number
  /** Higher wins collisions. */
  priority: (p: Props, z: number) => number
  uppercase?: boolean
  letterSpacing?: number
  italic?: boolean
  /** A marker under point labels (POIs). */
  dot?: (p: Props) => string | null
  /** Most labels this layer may place in one tile at zoom z. */
  maxCount?: (z: number) => number
  /** Same text closer than this (CSS px) is a repeat and dropped. */
  repeatDistance?: number
}

export type StyleLayer = FillLayer | LineLayer | LabelLayer

export interface Palette {
  background: string
  water: string
  waterLine: string
  wood: string
  grass: string
  park: string
  sand: string
  ice: string
  wetland: string
  residential: string
  commercial: string
  industrial: string
  institutional: string
  cemetery: string
  pitch: string
  aeroway: string
  building: string
  buildingOutline: string
  motorway: string
  motorwayCase: string
  primary: string
  primaryCase: string
  secondary: string
  secondaryCase: string
  minor: string
  minorCase: string
  path: string
  rail: string
  boundary: string
  labelCity: string
  labelPlace: string
  labelRoad: string
  labelWater: string
  labelPoi: string
  housenumber: string
  halo: string
  poi: { food: string; shop: string; transport: string; health: string; education: string; leisure: string; other: string }
}

export interface StyleKnobs {
  /** Multiplies how many labels a tile may carry (1 = standard). */
  labelDensity: number
  pois: boolean
  /** Landcover beyond water and parks (wood, grass, sand…). */
  landcover: boolean
  /** Zoom from which building footprints are drawn (Infinity = never). */
  buildingsFrom: number
  roadScale: number
  textScale: number
  /** Road casings — the thin outline that gives roads an edge. */
  casings: boolean
  /** Place names in capitals with tracking — the drawing-sheet look. */
  technicalPlaces: boolean
  /**
   * The ground is a photograph: no land, water, park or footprint fills —
   * only the lines and names that a photo cannot say.
   */
  imagery: boolean
  /**
   * A soft warm halo under the major roads — street lighting seen from above.
   * Only for night-designed styles; on a light map it would read as a stain.
   */
  streetGlow: boolean
}

export interface MapStyle {
  id: MapStyleId
  /** Whether the style reads as dark — UI chrome over it should adapt. */
  dark: boolean
  palette: Palette
  knobs: StyleKnobs
  layers: readonly StyleLayer[]
  /** Public raster sources mixed into every tile (raster-sources.ts). */
  rasters: readonly RasterUse[]
}

// ── Zoom functions ─────────────────────────────────────────────────────────────

/**
 * Value of `v` at zoom `z`. Between two positive stops the interpolation is
 * geometric: a road 4 px wide at z14 and 16 px at z16 is 8 px at z15, which is
 * what keeps its on-screen width steady when the tile engine swaps a tile for
 * its four children. Linear would make every LOD switch a visible jump.
 */
export function zoomValue(v: Stops, z: number): number {
  if (typeof v === 'number') return v
  if (v.length === 0) return 0
  if (z <= v[0][0]) return v[0][1]
  const last = v[v.length - 1]
  if (z >= last[0]) return last[1]
  for (let i = 1; i < v.length; i++) {
    const [z1, v1] = v[i]
    if (z > z1) continue
    const [z0, v0] = v[i - 1]
    const t = (z - z0) / (z1 - z0)
    if (v0 > 0 && v1 > 0) return v0 * Math.pow(v1 / v0, t)
    return v0 + (v1 - v0) * t
  }
  return last[1]
}

// ── Road hierarchy ─────────────────────────────────────────────────────────────

/** Draw order of road classes, minor first. Also the label priority. */
const ROAD_RANK: Readonly<Record<string, number>> = {
  path: 1, track: 2, service: 3, minor: 4, tertiary: 5, secondary: 6, primary: 7, trunk: 8, motorway: 9,
}

/** Fill widths (CSS px) per class — the backbone of the road hierarchy. */
const ROAD_WIDTH: Readonly<Record<string, Stops>> = {
  motorway: [[5, 0.6], [9, 1.6], [12, 3.2], [14, 6], [16, 13], [18, 34], [20, 90]],
  trunk: [[5, 0.5], [9, 1.4], [12, 2.8], [14, 5.5], [16, 12], [18, 30], [20, 80]],
  primary: [[7, 0.5], [10, 1.2], [12, 2.4], [14, 5], [16, 11], [18, 28], [20, 72]],
  secondary: [[9, 0.5], [12, 1.8], [14, 4], [16, 9], [18, 22], [20, 60]],
  tertiary: [[10, 0.5], [12, 1.4], [14, 3.4], [16, 8], [18, 20], [20, 54]],
  minor: [[12, 0.4], [14, 1.8], [16, 5], [18, 14], [20, 40]],
  service: [[13, 0.4], [15, 1.2], [16, 2.6], [18, 8], [20, 24]],
  track: [[13, 0.4], [16, 1.4], [18, 3], [20, 6]],
  path: [[14, 0.4], [16, 1.1], [18, 2], [20, 4]],
}

/** Zoom a road class first appears at. */
const ROAD_MINZOOM: Readonly<Record<string, number>> = {
  motorway: 5, trunk: 5, primary: 7, secondary: 9, tertiary: 10, minor: 12, service: 13, track: 13, path: 14,
}

function roadClass(p: Props): string {
  const c = String(p.class ?? '')
  // OpenMapTiles marks link roads with ramp=1 on the parent class.
  return c in ROAD_RANK ? c : ''
}

function isRoad(p: Props, z: number): boolean {
  const c = roadClass(p)
  return c !== '' && z >= (ROAD_MINZOOM[c] ?? 99)
}

function roadWidth(p: Props, z: number, scale: number): number {
  const c = roadClass(p)
  const w = zoomValue(ROAD_WIDTH[c] ?? 1, z)
  // Ramps are narrower than their class — a link, not the road itself.
  return (Number(p.ramp) === 1 ? w * 0.7 : w) * scale
}

function casingExtra(z: number): number {
  return zoomValue([[10, 0.5], [14, 0.9], [17, 1.6], [20, 2.6]], z)
}

// ── Names ──────────────────────────────────────────────────────────────────────

/**
 * Name in the viewer's language when OSM has one, else the local name. Local
 * is the right fallback for a site map: the street sign says the local name,
 * and that is what a site team will match against.
 */
export function nameOf(p: Props, lang: string): string | null {
  const own = p[`name:${lang}`]
  if (typeof own === 'string' && own) return own
  const local = p.name
  if (typeof local === 'string' && local) return local
  const latin = p['name:latin']
  return typeof latin === 'string' && latin ? latin : null
}

// ── Places ─────────────────────────────────────────────────────────────────────

const PLACE: Readonly<Record<string, { minzoom: number; size: Stops; weight: number; priority: number }>> = {
  country: { minzoom: 2, size: [[2, 11], [6, 16]], weight: 600, priority: 1000 },
  state: { minzoom: 4, size: [[4, 10], [8, 13]], weight: 500, priority: 900 },
  city: { minzoom: 4, size: [[4, 11], [8, 15], [12, 20], [15, 24]], weight: 600, priority: 800 },
  town: { minzoom: 8, size: [[8, 10.5], [12, 14], [15, 18]], weight: 600, priority: 700 },
  village: { minzoom: 11, size: [[11, 10.5], [14, 13], [16, 15]], weight: 500, priority: 600 },
  suburb: { minzoom: 12, size: [[12, 10.5], [15, 13], [17, 15]], weight: 500, priority: 550 },
  quarter: { minzoom: 13, size: [[13, 10], [16, 12.5]], weight: 500, priority: 520 },
  neighbourhood: { minzoom: 14, size: [[14, 10], [17, 12.5]], weight: 500, priority: 500 },
  hamlet: { minzoom: 13, size: [[13, 10], [16, 12]], weight: 500, priority: 480 },
}

// ── POI categories ─────────────────────────────────────────────────────────────

const POI_GROUP: Readonly<Record<string, keyof Palette['poi']>> = {
  restaurant: 'food', fast_food: 'food', cafe: 'food', bar: 'food', beer: 'food', ice_cream: 'food', bakery: 'food',
  shop: 'shop', grocery: 'shop', clothing_store: 'shop', alcohol_shop: 'shop', jewelry: 'shop', furniture: 'shop',
  railway: 'transport', bus: 'transport', ferry_terminal: 'transport', airport: 'transport', parking: 'transport',
  bicycle_rental: 'transport', fuel: 'transport', harbor: 'transport', car: 'transport',
  hospital: 'health', doctors: 'health', pharmacy: 'health', dentist: 'health', veterinary: 'health',
  school: 'education', college: 'education', library: 'education', kindergarten: 'education', university: 'education',
  park: 'leisure', garden: 'leisure', playground: 'leisure', stadium: 'leisure', museum: 'leisure',
  theatre: 'leisure', cinema: 'leisure', attraction: 'leisure', sports: 'leisure', swimming: 'leisure',
}

/** Most POI labels a tile may carry — few and important first, never a carpet. */
function poiBudget(z: number): number {
  return z < 15 ? 0 : z < 16 ? 8 : z < 17 ? 16 : z < 18 ? 28 : 40
}

// ── Layer builder ──────────────────────────────────────────────────────────────

const LANDCOVER_COLOR = (pal: Palette) => (p: Props): string | null => {
  switch (p.class) {
    case 'wood': return pal.wood
    case 'grass': case 'farmland': return pal.grass
    case 'sand': return pal.sand
    case 'ice': return pal.ice
    case 'wetland': return pal.wetland
    default: return null
  }
}

const LANDUSE_COLOR = (pal: Palette) => (p: Props): string | null => {
  switch (p.class) {
    case 'residential': case 'suburb': case 'neighbourhood': return pal.residential
    case 'commercial': case 'retail': return pal.commercial
    case 'industrial': case 'garages': case 'railway': return pal.industrial
    case 'school': case 'university': case 'college': case 'hospital': case 'kindergarten': return pal.institutional
    case 'cemetery': return pal.cemetery
    case 'pitch': case 'stadium': case 'playground': return pal.pitch
    default: return null
  }
}

function roadFill(pal: Palette) {
  return (p: Props): string => {
    const c = roadClass(p)
    if (c === 'motorway' || c === 'trunk') return pal.motorway
    if (c === 'primary') return pal.primary
    if (c === 'secondary' || c === 'tertiary') return pal.secondary
    if (c === 'path' || c === 'track') return pal.path
    return pal.minor
  }
}

function roadCase(pal: Palette) {
  return (p: Props): string | null => {
    const c = roadClass(p)
    if (c === 'path' || c === 'track') return null
    if (c === 'motorway' || c === 'trunk') return pal.motorwayCase
    if (c === 'primary') return pal.primaryCase
    if (c === 'secondary' || c === 'tertiary') return pal.secondaryCase
    return pal.minorCase
  }
}

export function buildLayers(pal: Palette, k: StyleKnobs): StyleLayer[] {
  const rs = k.roadScale
  const ts = k.textScale
  const fill = roadFill(pal)
  const casing = roadCase(pal)
  const roadSort = (p: Props) => ROAD_RANK[roadClass(p)] ?? 0
  const brunnel = (p: Props) => String(p.brunnel ?? '')
  const notPath = (p: Props) => roadClass(p) !== 'path' && roadClass(p) !== 'track'

  const layers: StyleLayer[] = []

  // ── Ground ────────────────────────────────────────────────────────────────
  if (k.landcover) {
    layers.push({ id: 'landcover', type: 'fill', source: 'landcover', color: LANDCOVER_COLOR(pal), opacity: [[6, 0.6], [12, 1]] })
    layers.push({ id: 'landuse', type: 'fill', source: 'landuse', minzoom: 10, color: LANDUSE_COLOR(pal), opacity: [[10, 0.5], [13, 1]] })
  }
  if (!k.imagery) layers.push({
    id: 'park', type: 'fill', source: 'park', color: pal.park, opacity: [[6, 0.5], [11, 1]],
  })
  if (!k.imagery) layers.push({ id: 'water', type: 'fill', source: 'water', color: pal.water })
  layers.push({
    id: 'waterway', type: 'line', source: 'waterway', minzoom: 8, color: pal.waterLine,
    width: (p, z) => zoomValue(p.class === 'river' ? [[8, 0.6], [12, 1.6], [16, 6], [20, 24]] : [[12, 0.4], [16, 1.6], [20, 5]], z),
    cap: 'round',
  })
  if (k.landcover) {
    layers.push({
      id: 'aeroway', type: 'fill', source: 'aeroway', minzoom: 11, color: pal.aeroway,
      filter: (p) => p.class === 'runway' || p.class === 'apron' || p.class === 'taxiway',
    })
  }

  // ── Buildings: footprints the IFC model and the OSM extrusions sit on ─────
  if (Number.isFinite(k.buildingsFrom) && !k.imagery) {
    layers.push({
      id: 'building', type: 'fill', source: 'building', minzoom: k.buildingsFrom, color: pal.building,
      opacity: [[k.buildingsFrom, 0.4], [k.buildingsFrom + 1.5, 1]],
      outline: { color: pal.buildingOutline, width: [[15, 0.5], [18, 1], [20, 1.6]], minzoom: 15 },
    })
  }

  // ── Tunnels: under everything else that moves ─────────────────────────────
  if (k.casings) {
    layers.push({
      id: 'tunnel-case', type: 'line', source: 'transportation', minzoom: 12, color: casing,
      filter: (p, z) => brunnel(p) === 'tunnel' && isRoad(p, z) && notPath(p),
      width: (p, z) => roadWidth(p, z, rs) + 2 * casingExtra(z), dash: [3, 2], opacity: 0.6, sortKey: roadSort,
    })
  }
  layers.push({
    id: 'tunnel', type: 'line', source: 'transportation', minzoom: 12, color: fill,
    filter: (p, z) => brunnel(p) === 'tunnel' && isRoad(p, z),
    width: (p, z) => roadWidth(p, z, rs), opacity: 0.55, sortKey: roadSort, cap: 'butt',
  })

  // ── Street light: a wide, faint amber halo under the major roads ─────────
  if (k.streetGlow) {
    layers.push({
      id: 'road-glow', type: 'line', source: 'transportation', minzoom: 10,
      color: 'rgba(255,170,70,0.16)',
      filter: (p, z) => {
        const c = roadClass(p)
        return brunnel(p) !== 'tunnel' && (c === 'motorway' || c === 'trunk' || c === 'primary' || (c === 'secondary' && z >= 14))
      },
      // Three times the road: light spills well past the kerb.
      width: (p, z) => roadWidth(p, z, rs) * 3 + 4,
      sortKey: roadSort, cap: 'round',
    })
  }

  // ── Surface roads: all casings, then all fills — so junctions merge ───────
  if (k.casings) {
    layers.push({
      id: 'road-case', type: 'line', source: 'transportation', color: casing,
      filter: (p, z) => brunnel(p) !== 'tunnel' && brunnel(p) !== 'bridge' && isRoad(p, z) && notPath(p) && z >= 11,
      width: (p, z) => roadWidth(p, z, rs) + 2 * casingExtra(z), sortKey: roadSort, cap: 'round',
    })
  }
  layers.push({
    id: 'road', type: 'line', source: 'transportation', color: fill,
    filter: (p, z) => brunnel(p) !== 'tunnel' && brunnel(p) !== 'bridge' && isRoad(p, z),
    width: (p, z) => roadWidth(p, z, rs), sortKey: roadSort, cap: 'round',
  })
  layers.push({
    id: 'path', type: 'line', source: 'transportation', minzoom: 15, color: pal.path,
    filter: (p) => (roadClass(p) === 'path' || roadClass(p) === 'track') && brunnel(p) !== 'tunnel',
    width: (p, z) => roadWidth(p, z, 1), dash: [2, 1.6], cap: 'butt',
  })
  layers.push({
    id: 'rail', type: 'line', source: 'transportation', minzoom: 10, color: pal.rail,
    filter: (p) => (p.class === 'rail' || p.class === 'transit') && brunnel(p) !== 'tunnel',
    width: [[10, 0.6], [14, 1.2], [18, 2.4]], dash: [4, 2.5], cap: 'butt',
  })

  // ── Bridges: drawn last so they pass over what they cross ─────────────────
  if (k.casings) {
    layers.push({
      id: 'bridge-case', type: 'line', source: 'transportation', minzoom: 12, color: casing,
      filter: (p, z) => brunnel(p) === 'bridge' && isRoad(p, z) && notPath(p),
      width: (p, z) => roadWidth(p, z, rs) + 2 * casingExtra(z) + 1, sortKey: roadSort, cap: 'butt',
    })
  }
  layers.push({
    id: 'bridge', type: 'line', source: 'transportation', minzoom: 12, color: fill,
    filter: (p, z) => brunnel(p) === 'bridge' && isRoad(p, z),
    width: (p, z) => roadWidth(p, z, rs), sortKey: roadSort, cap: 'butt',
  })

  // ── Administrative boundaries ─────────────────────────────────────────────
  layers.push({
    id: 'boundary', type: 'line', source: 'boundary', color: pal.boundary,
    filter: (p) => Number(p.maritime) !== 1 && (Number(p.admin_level) === 2 || Number(p.admin_level) === 4),
    width: (p, z) => zoomValue(Number(p.admin_level) === 2 ? [[2, 0.6], [8, 1.4], [14, 2.2]] : [[4, 0.4], [10, 1], [14, 1.4]], z),
    dash: [5, 2.5], opacity: [[2, 0.7], [16, 0.45]], cap: 'butt',
  })

  // ── Labels: lowest priority layers first; collisions decide the rest ──────
  layers.push({
    id: 'water-name', type: 'label', placement: 'point', source: 'water_name',
    text: nameOf, size: (_p, z) => zoomValue([[8, 11], [14, 13]], z) * ts, weight: 500, italic: true,
    color: pal.labelWater, halo: pal.halo, haloWidth: 1.4, priority: () => 300,
    letterSpacing: 0.4,
  })
  layers.push({
    id: 'waterway-name', type: 'label', placement: 'line', source: 'waterway', minzoom: 13,
    filter: (p) => p.class === 'river' || p.class === 'canal',
    text: nameOf, size: 11 * ts, weight: 500, italic: true,
    color: pal.labelWater, halo: pal.halo, haloWidth: 1.4, priority: () => 250, repeatDistance: 300,
  })
  layers.push({
    id: 'road-name', type: 'label', placement: 'line', source: 'transportation_name',
    filter: (p, z) => {
      const c = roadClass(p)
      const from = c === 'motorway' || c === 'trunk' || c === 'primary' ? 13
        : c === 'secondary' || c === 'tertiary' ? 14 : c === 'minor' ? 15 : c === 'service' ? 17 : 99
      return z >= from
    },
    text: (p, lang) => nameOf(p, lang) ?? (typeof p.ref === 'string' ? p.ref : null),
    size: (p, z) => zoomValue(roadClass(p) === 'minor' || roadClass(p) === 'service' ? [[15, 10], [18, 12]] : [[13, 10.5], [18, 13]], z) * ts,
    weight: 500, color: pal.labelRoad, halo: pal.halo, haloWidth: 1.6,
    priority: (p) => 200 + (ROAD_RANK[roadClass(p)] ?? 0) * 10, repeatDistance: 260,
    maxCount: (z) => Math.round((z < 15 ? 10 : z < 17 ? 18 : 30) * k.labelDensity),
  })
  if (k.pois) {
    layers.push({
      id: 'poi', type: 'label', placement: 'point', source: 'poi', minzoom: 15,
      filter: (p, z) => Number(p.rank ?? 99) <= (z < 16 ? 6 : z < 17 ? 14 : 40),
      text: nameOf, size: 10.5 * ts, weight: 500,
      color: pal.labelPoi, halo: pal.halo, haloWidth: 1.4,
      // A bus stop does not orient anyone; a station, a park or a school does.
      priority: (p) => 100 - Math.min(60, Number(p.rank ?? 60)) - (p.class === 'bus' ? 45 : 0),
      dot: (p) => pal.poi[POI_GROUP[String(p.class)] ?? 'other'],
      maxCount: (z) => Math.round(poiBudget(z) * k.labelDensity),
    })
  }
  layers.push({
    id: 'housenumber', type: 'label', placement: 'point', source: 'housenumber', minzoom: 18,
    text: (p) => (typeof p.housenumber === 'string' ? p.housenumber : null),
    size: 9.5 * ts, weight: 500, color: pal.housenumber, halo: pal.halo, haloWidth: 1.2,
    priority: () => 50, maxCount: () => Math.round(60 * k.labelDensity),
  })
  layers.push({
    id: 'place', type: 'label', placement: 'point', source: 'place',
    filter: (p, z) => {
      const d = PLACE[String(p.class)]
      return !!d && z >= d.minzoom && z <= (p.class === 'country' ? 9 : p.class === 'state' ? 10 : 18)
    },
    text: nameOf,
    size: (p, z) => zoomValue(PLACE[String(p.class)]?.size ?? 11, z) * ts * (k.technicalPlaces ? 0.85 : 1),
    weight: 600,
    uppercase: k.technicalPlaces,
    letterSpacing: k.technicalPlaces ? 1.6 : 0.2,
    color: (p) => (p.class === 'city' || p.class === 'country' || p.class === 'town' ? pal.labelCity : pal.labelPlace),
    halo: pal.halo, haloWidth: 2,
    // Rank orders places of one class (lower = bigger); class orders across.
    priority: (p) => (PLACE[String(p.class)]?.priority ?? 0) - Math.min(30, Number(p.rank ?? 30)),
    maxCount: (z) => Math.round((z < 10 ? 12 : 8) * Math.max(0.5, k.labelDensity)),
  })
  return layers
}

// ── The six styles ────────────────────────────────────────────────────────────

const POI_STANDARD = {
  food: '#d9822b', shop: '#9b6bc6', transport: '#3b82c4', health: '#d64545',
  education: '#8a6d3b', leisure: '#3f9a5a', other: '#7a828c',
}

const STANDARD: Palette = {
  background: '#f1f0ec', water: '#a8cbe0', waterLine: '#93bcd6',
  wood: '#c9dcbd', grass: '#dbe7cf', park: '#d3e6c5', sand: '#eee5cd', ice: '#f5f8fa', wetland: '#d5e3d8',
  residential: '#eae8e3', commercial: '#efe4e1', industrial: '#e6e3eb', institutional: '#ede6d8',
  cemetery: '#d8e2cf', pitch: '#cde3c2', aeroway: '#e1e1e8',
  building: '#dcd7cf', buildingOutline: '#c4bdb2',
  motorway: '#f3c487', motorwayCase: '#cf9555', primary: '#fbe2a1', primaryCase: '#d3b36f',
  secondary: '#ffffff', secondaryCase: '#cbc4b8', minor: '#ffffff', minorCase: '#d6d0c6',
  path: '#a99b88', rail: '#a29d95', boundary: '#8f84a8',
  labelCity: '#1d2127', labelPlace: '#3c424a', labelRoad: '#545a62', labelWater: '#46769a',
  labelPoi: '#545c66', housenumber: '#7d7368', halo: 'rgba(255,255,255,0.92)',
  poi: POI_STANDARD,
}

const LIGHT: Palette = {
  ...STANDARD,
  background: '#f6f6f3', water: '#d2e0e9', waterLine: '#c3d5e1',
  wood: '#e3ebdc', grass: '#e9efe1', park: '#e4ecdc', sand: '#f2eee2', wetland: '#e3ebe4',
  residential: '#f1f0ed', commercial: '#f2eeec', industrial: '#efeef1', institutional: '#f2eee6',
  cemetery: '#e5ebdf', pitch: '#e1ebd9', aeroway: '#ececef',
  building: '#e8e5e0', buildingOutline: '#d6d2cb',
  motorway: '#f2e0c4', motorwayCase: '#dcc39d', primary: '#f7ecd2', primaryCase: '#e0cfa8',
  secondary: '#ffffff', secondaryCase: '#dcd8d1', minor: '#ffffff', minorCase: '#e2dfd9',
  path: '#c3b9ab', rail: '#bdb9b3', boundary: '#b1a9c2',
  labelCity: '#3a3f46', labelPlace: '#5a6069', labelRoad: '#6e737a', labelWater: '#6e93ad',
  labelPoi: '#6c737c', housenumber: '#958c82',
}

const DARK: Palette = {
  background: '#14171c', water: '#0d2131', waterLine: '#16344c',
  wood: '#17241b', grass: '#19251c', park: '#18281d', sand: '#24221c', ice: '#1d2228', wetland: '#16231f',
  residential: '#191c21', commercial: '#1d1b22', industrial: '#1a1c24', institutional: '#1f1d1a',
  cemetery: '#182219', pitch: '#18291c', aeroway: '#1e2027',
  building: '#252930', buildingOutline: '#31363f',
  motorway: '#7a5a34', motorwayCase: '#3b2c1c', primary: '#5b4f36', primaryCase: '#2e281c',
  // Warm-grey streets: sodium-lit, the way a city reads after dark.
  secondary: '#4a4234', secondaryCase: '#1d1c1a', minor: '#3a352d', minorCase: '#1b1a18',
  path: '#4a4f58', rail: '#4b4f57', boundary: '#6d6585',
  labelCity: '#e6e9ee', labelPlace: '#b9c0ca', labelRoad: '#9ca4af', labelWater: '#6f9cc0',
  labelPoi: '#a2aab5', housenumber: '#7f8792', halo: 'rgba(14,17,21,0.92)',
  poi: { food: '#e09a4f', shop: '#b48ad8', transport: '#5aa2e0', health: '#e26b6b', education: '#b8996a', leisure: '#5fb57a', other: '#8c949e' },
}

// BIM: the map as a site plan. Hue is reserved for the model and the issues on
// it, so roads say their rank by WIDTH, not colour; footprints are crisp and
// pale like a drawing's context layer; nothing commercial competes with it.
const BIM: Palette = {
  background: '#eef0f2', water: '#c8d5df', waterLine: '#b5c6d3',
  wood: '#dde3dc', grass: '#e2e7e0', park: '#dce4dc', sand: '#e9e8e3', ice: '#f3f5f7', wetland: '#dde5e2',
  residential: '#eaecef', commercial: '#eaebee', industrial: '#e7e9ed', institutional: '#e9eaec',
  cemetery: '#dfe5de', pitch: '#dbe4da', aeroway: '#e4e7eb',
  building: '#e1e5e9', buildingOutline: '#aab3bd',
  motorway: '#dde2e8', motorwayCase: '#8f9aa6', primary: '#f7f8fa', primaryCase: '#9ea8b3',
  secondary: '#ffffff', secondaryCase: '#b4bcc5', minor: '#ffffff', minorCase: '#c4cad2',
  path: '#a6afb9', rail: '#8e98a3', boundary: '#8c96a3',
  labelCity: '#2f3a46', labelPlace: '#4b5664', labelRoad: '#5d6874', labelWater: '#5f7f97',
  labelPoi: '#5d6874', housenumber: '#7b8692', halo: 'rgba(238,240,242,0.94)',
  poi: { food: '#7b8692', shop: '#7b8692', transport: '#4f7fa8', health: '#7b8692', education: '#7b8692', leisure: '#7b8692', other: '#7b8692' },
}

const MINIMAL: Palette = {
  ...LIGHT,
  background: '#f4f4f2', water: '#dde5ea', waterLine: '#d0dbe2', park: '#e8ede4',
  building: '#ebe9e6', buildingOutline: '#dedbd6',
  motorway: '#ffffff', motorwayCase: '#d9d6d0', primary: '#ffffff', primaryCase: '#dedbd5',
  secondaryCase: '#e4e1db', minorCase: '#e8e5e0',
  labelCity: '#4a4f56', labelPlace: '#6b7078', labelRoad: '#80858c',
}

// High contrast: WCAG-minded — text ≥ 7:1 over its halo, roads outlined in
// black so they survive colour-vision deficiencies and glare on site tablets.
const CONTRAST: Palette = {
  background: '#ffffff', water: '#4f97d4', waterLine: '#2f7bbf',
  wood: '#79bf73', grass: '#a6d89f', park: '#86c97f', sand: '#f2e2a6', ice: '#ffffff', wetland: '#9ccfb5',
  residential: '#f3f3f3', commercial: '#f6eaea', industrial: '#ececf5', institutional: '#f6f0e0',
  cemetery: '#a9d3a0', pitch: '#9fd498', aeroway: '#e0e0e0',
  building: '#c8c8c8', buildingOutline: '#000000',
  motorway: '#ffcc00', motorwayCase: '#000000', primary: '#ffe57a', primaryCase: '#000000',
  secondary: '#ffffff', secondaryCase: '#000000', minor: '#ffffff', minorCase: '#3a3a3a',
  path: '#000000', rail: '#000000', boundary: '#5b2a86',
  labelCity: '#000000', labelPlace: '#000000', labelRoad: '#000000', labelWater: '#003a70',
  labelPoi: '#000000', housenumber: '#000000', halo: '#ffffff',
  poi: { food: '#b34700', shop: '#6a1b9a', transport: '#0047ab', health: '#b00020', education: '#5d4037', leisure: '#1b5e20', other: '#000000' },
}

const BASE_KNOBS: StyleKnobs = {
  labelDensity: 1, pois: true, landcover: true, buildingsFrom: 14, roadScale: 1, textScale: 1,
  casings: true, technicalPlaces: false, imagery: false, streetGlow: false,
}

// Hybrid: PNOA orthophoto under our roads and names. Roads go translucent
// white with a dark edge so they read on asphalt and on fields alike; names
// carry a dark halo, which survives any photograph.
const HYBRID: Palette = {
  ...DARK,
  background: '#3d4238',
  motorway: 'rgba(255,214,140,0.85)', motorwayCase: 'rgba(20,20,20,0.55)',
  primary: 'rgba(255,240,200,0.8)', primaryCase: 'rgba(20,20,20,0.5)',
  secondary: 'rgba(255,255,255,0.7)', secondaryCase: 'rgba(20,20,20,0.45)',
  minor: 'rgba(255,255,255,0.55)', minorCase: 'rgba(20,20,20,0.35)',
  path: 'rgba(255,255,255,0.6)', rail: 'rgba(230,230,230,0.8)', boundary: 'rgba(230,210,255,0.8)',
  labelCity: '#ffffff', labelPlace: '#f2f2f2', labelRoad: '#ffffff', labelWater: '#cfe6ff',
  labelPoi: '#ffffff', housenumber: '#ffffff', halo: 'rgba(0,0,0,0.75)',
}

/**
 * Shaded relief computed in the browser from open elevation, multiplied onto
 * the ground fills under the roads — the depth Mapbox's Outdoors and every
 * good topographic map have. Not in BIM (a plan is flat on purpose), Hybrid
 * (the photograph already has its shadows) or Dark/Contrast (a multiply wash
 * on dark ground is invisible, and contrast must stay clean).
 */
const RELIEF = (opacity: number): RasterUse => ({ source: 'hillshade', placement: 'relief', opacity, blend: 'multiply' })

const DEFS: Readonly<Record<MapStyleId, { palette: Palette; knobs: StyleKnobs; dark: boolean; rasters?: RasterUse[] }>> = {
  standard: { palette: STANDARD, knobs: BASE_KNOBS, dark: false, rasters: [RELIEF(0.55)] },
  light: { palette: LIGHT, knobs: { ...BASE_KNOBS, labelDensity: 0.8 }, dark: false, rasters: [RELIEF(0.38)] },
  dark: { palette: DARK, knobs: { ...BASE_KNOBS, streetGlow: true }, dark: true },
  bim: {
    palette: BIM,
    knobs: { ...BASE_KNOBS, labelDensity: 0.6, pois: false, buildingsFrom: 14, technicalPlaces: true },
    dark: false,
    // The legal plot under the model: what a site plan starts from. Spain
    // only (Catastro); elsewhere the style is simply without it.
    rasters: [{ source: 'cadastre', placement: 'over', opacity: 0.7 }],
  },
  hybrid: {
    palette: HYBRID,
    knobs: { ...BASE_KNOBS, labelDensity: 0.7, pois: false, landcover: false, imagery: true, roadScale: 0.8 },
    dark: true,
    rasters: [{ source: 'pnoa', placement: 'under', opacity: 1 }],
  },
  minimal: {
    palette: MINIMAL,
    knobs: { ...BASE_KNOBS, labelDensity: 0.45, pois: false, landcover: false, buildingsFrom: 16, casings: false, roadScale: 0.85 },
    dark: false,
    rasters: [RELIEF(0.3)],
  },
  contrast: {
    palette: CONTRAST,
    knobs: { ...BASE_KNOBS, labelDensity: 0.75, textScale: 1.15, roadScale: 1.15 },
    dark: false,
  },
}

const cache = new Map<MapStyleId, MapStyle>()

export function isMapStyleId(v: unknown): v is MapStyleId {
  return typeof v === 'string' && (MAP_STYLE_IDS as readonly string[]).includes(v)
}

/** The built style (layers are built once per id and shared). */
export function getMapStyle(id: MapStyleId): MapStyle {
  let s = cache.get(id)
  if (!s) {
    const d = DEFS[id]
    s = { id, dark: d.dark, palette: d.palette, knobs: d.knobs, layers: buildLayers(d.palette, d.knobs), rasters: d.rasters ?? [] }
    cache.set(id, s)
  }
  return s
}
