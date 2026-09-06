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
import {
  readVerticalTags, type VerticalTags, type FunctionalType,
} from './vertical'
import { buildSeaPolygons, type CoastlineBbox } from './coastline'
import { assembleMultipolygon } from './multipolygon'
import { partitionBuildingParts } from './building-parts'

export type FeatureKind =
  | 'building' | 'water' | 'green' | 'sand' | 'rock' | 'tree' | 'bridge' | 'road' | 'rail'
  | 'signal' | 'pier'

export const FEATURE_KINDS: readonly FeatureKind[] =
  ['building', 'water', 'green', 'sand', 'rock', 'tree', 'bridge', 'road', 'rail', 'signal',
   'pier']

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
  /**
   * WHERE THIS SITS VERTICALLY, read from the tags.
   *
   * Present on linear infrastructure — the only things that climb, dive or
   * cross. It is deliberately SEPARATE from `kind`: a road on a bridge is still
   * a road, and this says how it is carried. See `vertical.ts` for why that
   * separation had to exist before any of this could be drawn correctly.
   */
  vertical?: VerticalTags
  /** What the way is FOR, which decides its clearances and its maximum grade. */
  functional?: FunctionalType
  /**
   * True for a `building:part` — a VOLUME of a building rather than a building.
   *
   * Kept because the two must be told apart after classification: a part
   * supersedes the outline it sits in, and an outline that has parts must not
   * also be extruded. See `building-parts`.
   */
  isBuildingPart?: boolean
  /**
   * THE SEA, as opposed to any other water.
   *
   * The distinction is a DATUM, not a label. Inland water sits at its own local
   * level and the only thing that knows that level is the terrain under it, so
   * a lake is levelled against the DEM. The sea does not work that way: it sits
   * at the sea datum by definition, everywhere, and the DEM is the worst
   * possible witness to where that is — over a harbour the raster is measuring
   * moored ships and terminal roofs, and reads metres above open water a few
   * metres away.
   *
   * Levelling the sea against the DEM is what dropped the sea surface below the
   * datum the quays are built on, which is what left every quay's underside
   * hanging in the air. See `waterLevelM` in osm-scene.
   */
  isSea?: boolean
}

export interface FeatureStyle {
  /** '#rrggbb' from `building:colour` / `roof:colour`, when parseable. */
  wallColor?: string
  roofColor?: string
  /**
   * What the building is for. Drives palette, proportion and roof — the levers
   * that stop a whole neighbourhood reading as one extruded material. Resolved
   * from tags here so the tags themselves never cross the worker boundary.
   */
  use?: BuildingUse
  /** `roof:shape`, normalised to the shapes we can actually build. */
  roofShape: RoofShape
  /**
   * A monument whose form is stated by its tag and cannot be extruded from the
   * outline — see `monumentShape`. Overrides walls and roof entirely.
   */
  monument?: 'arch'
  /**
   * True when `roof:shape` was actually present. Without this, "the mapper says
   * flat" and "nobody said anything" are the same value, and the renderer has
   * no way to know whether it is allowed to infer a pitch from what the building
   * IS — which is the only way most of the world gets a roof, since barely a few
   * per cent of buildings carry the tag.
   */
  roofTagged?: boolean
  /** Roof height in metres for non-flat roofs. */
  roofHeightM: number
  /** Canopy radius (trees), metres. */
  crownRadiusM?: number
  /** Canopy silhouette (trees), resolved from `leaf_type`. */
  treeShape?: TreeShape
  /** Rail features: a corridor of track, or a station platform slab. */
  railKind?: 'track' | 'platform'
  /**
   * A walkable DECK, or a rubble MOLE.
   *
   * A pier and a quay are surfaces people stand on; a breakwater and a groyne
   * are armour, higher out of the water and never walked. One height and one
   * tone for both would make a marina look like a sea wall.
   */
  pierKind?: 'deck' | 'mole' | 'quay'
  /**
   * What the way is PAVED IN, when the survey says so.
   *
   * Kept alongside `tone` rather than folded into it: a colour is one decision
   * this answers, and grain, reflectance and the detail tile are others that
   * will want the same fact rather than a second guess at it.
   */
  surface?: SurfaceMaterial
  /**
   * A marked pedestrian crossing. Rendered as paint on the carriageway rather
   * than as a footpath of its own — which is what it is, and drawing it as a
   * tan strip across the asphalt was plainly wrong.
   */
  crossing?: boolean
  /**
   * Mapped lane count on a carriageway. Width already accounts for it, but the
   * MARKINGS cannot be inferred from width alone — a 12 m one-way slip road and
   * a 12 m four-lane avenue are the same ribbon and want different paint.
   */
  lanes?: number
  /** Traffic runs one way only — so there is no centre line to divide it. */
  oneway?: boolean
  /**
   * `junction=roundabout|circular`. Distinct from `oneway`, which a roundabout
   * also implies: this one says the way is a RING, and a ring has a centre that
   * has to be surfaced or the basemap shows through it.
   */
  roundabout?: boolean
  /**
   * Carriageway, footpath or track. Decides which NETWORK the way is solved in
   * as well as how it is surfaced — see RoadClass.
   */
  roadClass?: RoadClass
  /**
   * What is growing on a patch of greenery — see GreenCover. Absent on
   * everything that is not `kind === 'green'`.
   */
  cover?: GreenCover
  /** Which species that cover grows, for the seeded canopy. */
  coverShape?: TreeShape
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

/**
 * What a building is FOR, in the few categories that change how it looks.
 *
 * Not a taxonomy of OSM's `building` key — that has hundreds of values and
 * almost none of them change a facade. These are the ones that do: a house is
 * small, low and pitched wherever you are; a temple has a deep dark roof and a
 * palette nothing else shares; a shed is corrugated metal; a tower block is
 * glazed. Everything unrecognised is `generic`, which is honest — `building=yes`
 * is the most common value in the database and it tells us nothing.
 *
 * The point of resolving this HERE is that the tags never cross the worker
 * boundary. One short enum travels instead of a map of strings per building, on
 * a payload that is routinely two and a half thousand buildings.
 */
export type BuildingUse =
  | 'house' | 'apartments' | 'tower' | 'temple' | 'shrine'
  | 'industrial' | 'retail' | 'civic' | 'shed' | 'generic'

const USE_BY_BUILDING: Record<string, BuildingUse> = {
  house: 'house', detached: 'house', semidetached_house: 'house',
  terrace: 'house', bungalow: 'house', hut: 'shed', cabin: 'house',
  farm: 'house', static_caravan: 'house', houseboat: 'house',

  apartments: 'apartments', residential: 'apartments', dormitory: 'apartments',

  temple: 'temple', shrine: 'shrine', pagoda: 'temple',
  church: 'temple', chapel: 'temple', cathedral: 'temple',
  mosque: 'temple', synagogue: 'temple', monastery: 'temple',

  industrial: 'industrial', warehouse: 'industrial', factory: 'industrial',
  manufacture: 'industrial', hangar: 'industrial', silo: 'industrial',
  storage_tank: 'industrial',

  retail: 'retail', commercial: 'retail', shop: 'retail',
  supermarket: 'retail', kiosk: 'retail', office: 'tower',

  civic: 'civic', public: 'civic', government: 'civic', hospital: 'civic',
  school: 'civic', university: 'civic', college: 'civic', museum: 'civic',
  train_station: 'civic', stadium: 'civic', sports_hall: 'civic',

  shed: 'shed', garage: 'shed', garages: 'shed', carport: 'shed',
  greenhouse: 'shed', roof: 'shed', service: 'shed',
}

/** `amenity` and `historic` answer for a building the `building` key does not. */
const USE_BY_AMENITY: Record<string, BuildingUse> = {
  place_of_worship: 'temple', townhall: 'civic', school: 'civic',
  hospital: 'civic', university: 'civic', college: 'civic', library: 'civic',
  marketplace: 'retail',
}

/**
 * What a building is for, from its tags.
 *
 * Order encodes precedence: an explicit `building` value is the mapper's own
 * answer and wins; `amenity` fills in for the very common
 * `building=yes` + `amenity=place_of_worship`; and a Shinto shrine is
 * distinguished from a Buddhist temple through `religion`, because the two look
 * nothing alike and OSM does carry the difference.
 */
export function buildingUse(tags: Record<string, string> | undefined): BuildingUse {
  const t = tags ?? {}
  const raw = (t['building'] ?? '').toLowerCase()
  let use = USE_BY_BUILDING[raw] ?? USE_BY_AMENITY[(t['amenity'] ?? '').toLowerCase()]

  if (!use && (t['historic'] ?? '').toLowerCase() === 'temple') use = 'temple'
  if (!use) use = 'generic'

  if (use === 'temple' || use === 'shrine') {
    const religion = (t['religion'] ?? '').toLowerCase()
    if (religion === 'shinto') return 'shrine'
    if (religion === 'buddhist' || religion === 'taoist') return 'temple'
  }
  return use
}

// ── Tag → kind classification ──────────────────────────────────────────────────

const GREEN_LEISURE = new Set(['park', 'garden', 'pitch', 'golf_course', 'common', 'nature_reserve'])
const GREEN_LANDUSE = new Set([
  'grass', 'forest', 'meadow', 'village_green', 'recreation_ground',
  'allotments', 'orchard', 'vineyard', 'cemetery',
])
const GREEN_NATURAL = new Set(['wood', 'scrub', 'grassland', 'heath', 'wetland'])

/**
 * What is GROWING on a patch of greenery, as distinct from what colour it is.
 *
 * The tone helpers already say a forest is darker than a lawn. This says the
 * forest has trees ON it — which is the difference between a wooded hillside and
 * a dark green carpet, and it was the single biggest thing missing from the map.
 * Until this existed the only trees in the scene were `natural=tree` nodes, so a
 * `landuse=forest` polygon rendered as flat baize: measured on a Kyoto site, 205
 * greenery polygons against 555 mapped tree nodes, and the wooded slopes east of
 * the city were moquette.
 *
 * Five classes, because they need five genuinely different treatments:
 *   forest  — closed canopy, trees touching, ground barely visible.
 *   shrub   — scrub and heath: low, dense, no trunk worth drawing.
 *   orchard — planted in ROWS. A grid reads as agriculture instantly, and
 *             scattering an orchard is the tell that nobody looked at the tag.
 *   park    — specimen trees over mown grass, well spaced.
 *   bare    — a pitch, a lawn, a meadow. Grass, and that is all.
 */
export type GreenCover = 'forest' | 'shrub' | 'orchard' | 'park' | 'bare'

/** Nominal spacing between stems per cover class, metres. */
export const COVER_SPACING_M: Record<GreenCover, number> = {
  // Not real forestry density — a managed wood is hundreds of stems a hectare
  // and no browser will draw that. This is the spacing at which crowns of the
  // size OSM implies MEET, which is what the eye reads as "closed canopy".
  forest: 9,
  shrub: 5,
  orchard: 7,
  park: 18,
  bare: 0,
}

/** Canopy radius and height per class, metres, before per-tree variation. */
export const COVER_TREE_SIZE: Record<GreenCover, { radiusM: number; heightM: number }> = {
  forest: { radiusM: 4.5, heightM: 14 },
  shrub: { radiusM: 1.6, heightM: 2.2 },
  orchard: { radiusM: 2.6, heightM: 5 },
  park: { radiusM: 5.0, heightM: 12 },
  bare: { radiusM: 0, heightM: 0 },
}

/**
 * What grows here, from the tags.
 *
 * `bare` is the default rather than `park`: inventing trees over a sports pitch
 * or a cemetery lawn is a worse error than leaving a genuine park thin, because
 * one is a plausible omission and the other is a statement about the site that
 * is simply false.
 */
export function greenCover(tags: Record<string, string> | undefined): GreenCover {
  const t = tags ?? {}
  const landuse = (t['landuse'] ?? '').toLowerCase()
  const natural = (t['natural'] ?? '').toLowerCase()
  const leisure = (t['leisure'] ?? '').toLowerCase()

  if (natural === 'wood' || landuse === 'forest') return 'forest'
  if (natural === 'scrub' || natural === 'heath') return 'shrub'
  if (landuse === 'orchard' || landuse === 'vineyard') return 'orchard'
  if (leisure === 'park' || leisure === 'garden' || leisure === 'nature_reserve') return 'park'
  if (leisure === 'common' || landuse === 'village_green') return 'park'
  // grass, meadow, pitch, golf_course, cemetery, allotments, grassland, wetland.
  return 'bare'
}

/**
 * Which species a patch of greenery grows, WHEN THE TAGS SAY SO — and
 * `undefined` when they do not.
 *
 * The absence is the point. This used to answer 'broadleaf' for everything
 * untagged, and almost nothing is tagged: measured over a 1.4 km box on Kyoto,
 * 8 289 of 8 292 seeded trees came out broadleaf, on hillsides that are sugi
 * and hinoki plantation. That is the same mistake the facade palette made —
 * one European default applied to the whole planet — and it costs more here,
 * because a whole wood of one silhouette is precisely the uniformity the
 * seeding exists to break.
 *
 * So the guess moves to where the site's coordinates are known, and this
 * function is left saying only what the data says. See `coverSpeciesMix`.
 */
export function coverTreeShape(
  cover: GreenCover, tags: Record<string, string> | undefined,
): TreeShape | undefined {
  const t = tags ?? {}
  const leaf = (t['leaf_type'] ?? '').toLowerCase()
  if (leaf === 'needleleaved') return 'needleleaf'
  if (leaf === 'broadleaved') return 'broadleaf'
  // A vineyard is columnar rows. This one IS from the tags — `landuse=vineyard`
  // says what is planted, so it belongs here and not in the regional guess.
  if (cover === 'orchard' && (t['landuse'] ?? '') === 'vineyard') return 'columnar'
  return undefined
}

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
  const base = ROAD_DEFAULT_WIDTH[cls] ?? 6
  // A FOOTWAY ON A BRIDGE IS NOT A GARDEN PATH.
  //
  // The 2 m default is a park path: the width of somewhere one person walks
  // and another squeezes past. A footway carrying `bridge=yes` is a built
  // structure with an abutment at each end and something underneath it, and
  // nobody builds one of those 2 m wide.
  //
  // It matters here because the survey does not say. Over Lujiazui — 137
  // layered ways around the Oriental Pearl, 31 of them elevated footways
  // linking the malls — NOT ONE carries a `width`. Every deck in that district
  // was drawn at the park-path default, which is why a public walkway three
  // storeys up read as a service catwalk.
  //
  // Still a fallback, and a wider one is still a guess. But an explicit `width`
  // continues to win outright above, so this only ever fills a silence, and it
  // fills it with the kind of thing that actually gets built.
  if (ELEVATED_DECK_MIN_WIDTH_M[cls] !== undefined && isElevated(t)) {
    return Math.max(base, ELEVATED_DECK_MIN_WIDTH_M[cls])
  }
  return base
}

/** True where the tags put a way clear of the ground on a structure. */
function isElevated(t: Record<string, string>): boolean {
  const bridge = t['bridge']
  if (bridge && bridge !== 'no') return true
  const layer = Number.parseInt(t['layer'] ?? '', 10)
  return Number.isFinite(layer) && layer > 0
}

/**
 * Least width a class is built to once it is carried on a structure, metres.
 *
 * Only the classes whose ground default is a personal-scale path: a road keeps
 * its carriageway width on a viaduct, because that is what it is for.
 */
const ELEVATED_DECK_MIN_WIDTH_M: Record<string, number> = {
  footway: 5, path: 4, cycleway: 4, steps: 2.4, pedestrian: 6,
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

/**
 * What a way is PAVED IN, from `surface=*`.
 *
 * SEMANTIC EVIDENCE: `surface` states the material directly, which `highway`
 * only ever proxied. Measured on the benchmark harbour, 93 of 311 elements —
 * 30 % — carry it, and 36 of those are `paving_stones` against 40 `asphalt`:
 * close to half the paved ground in the box is stone, and every metre of it was
 * being drawn as tarmac. That is the difference between a seafront promenade
 * and a service road, and it was thrown away at parse time.
 *
 * Closed set on purpose. OSM's surface vocabulary has a long tail of values
 * nobody can render distinctly, and an unrecognised one returns undefined so
 * the class default stands rather than a guess.
 */
export type SurfaceMaterial =
  | 'asphalt' | 'concrete' | 'paving_stones' | 'sett' | 'cobblestone'
  | 'gravel' | 'compacted' | 'ground' | 'sand' | 'grass' | 'wood' | 'metal'

const SURFACE_ALIASES: Record<string, SurfaceMaterial> = {
  asphalt: 'asphalt', chipseal: 'asphalt', bitumen: 'asphalt',
  concrete: 'concrete', 'concrete:plates': 'concrete', 'concrete:lanes': 'concrete',
  paving_stones: 'paving_stones', paved: 'concrete', bricks: 'paving_stones',
  brick: 'paving_stones', paving_stones_lanes: 'paving_stones',
  sett: 'sett', cobblestone: 'cobblestone', unhewn_cobblestone: 'cobblestone',
  gravel: 'gravel', fine_gravel: 'gravel', pebblestone: 'gravel',
  compacted: 'compacted', ground: 'ground', dirt: 'ground', earth: 'ground',
  mud: 'ground', unpaved: 'compacted',
  sand: 'sand', grass: 'grass', wood: 'wood', metal: 'metal',
}

/** Normalise `surface=*` to something the renderer can actually draw. */
export function normalizeSurface(raw: string | undefined): SurfaceMaterial | undefined {
  if (!raw) return undefined
  return SURFACE_ALIASES[raw.trim().toLowerCase()]
}

/**
 * Colour per material.
 *
 * ASPHALT IS DELIBERATELY ABSENT. `ROAD_TONES` below is already an asphalt
 * ramp — it darkens with importance, because a trunk road really is blacker
 * than a lane — so a way that says `surface=asphalt` is confirming the default,
 * not overriding it. Every other value genuinely leaves that ramp.
 */
const SURFACE_TONES: Partial<Record<SurfaceMaterial, [number, number, number]>> = {
  concrete:       [0.52, 0.52, 0.51],
  paving_stones:  [0.55, 0.52, 0.48],
  sett:           [0.44, 0.42, 0.40],
  cobblestone:    [0.46, 0.43, 0.40],
  gravel:         [0.52, 0.48, 0.42],
  compacted:      [0.50, 0.46, 0.40],
  ground:         [0.44, 0.38, 0.31],
  sand:           [0.72, 0.65, 0.50],
  grass:          [0.38, 0.46, 0.30],
  wood:           [0.46, 0.35, 0.24],
  metal:          [0.46, 0.47, 0.50],
}

/**
 * Grain per material, on the same scale as ROAD_CLASS_ROUGHNESS.
 *
 * The class table guesses this from what a way is FOR; the surface tag says
 * what it is MADE OF, which is the thing roughness is actually about.
 */
export const SURFACE_ROUGHNESS: Record<SurfaceMaterial, number> = {
  asphalt: 0.22, metal: 0.15, concrete: 0.30, wood: 0.40,
  paving_stones: 0.55, grass: 0.60, sand: 0.65, compacted: 0.70,
  sett: 0.72, ground: 0.75, cobblestone: 0.80, gravel: 0.85,
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

/**
 * What KIND of way this is, beyond how wide it is.
 *
 * OSM files a footpath and a motorway under the same `highway` key, and until
 * this existed the renderer took it literally: a 1.6 m path was buffered,
 * kerbed, surfaced and — worst of all — solved for junctions as though it were
 * a carriageway. Two things came out of that. A footway looked like a road in
 * miniature, and, far more damaging, a footway ENDING on an avenue split that
 * avenue in two and created a three-armed junction whose outer arms are nearly
 * antiparallel — the exact configuration whose border intersection lands
 * hundreds of metres away and drags tens of metres of asphalt with it.
 *
 * The class is what lets the mesh stage keep the two networks apart, and what
 * gives each its own surface instead of one tin of asphalt for everything.
 */
export type RoadClass = 'vehicular' | 'pedestrian' | 'track'

/** Ways people walk or cycle on. Not carriageways, whatever the tag says. */
const PEDESTRIAN_HIGHWAYS = new Set([
  'footway', 'path', 'steps', 'pedestrian', 'cycleway', 'corridor', 'bridleway',
])

/**
 * What class a way belongs to. `track` is its own answer rather than being
 * lumped in with either: it carries vehicles, so calling it a footpath is
 * wrong, but it is unpaved and three metres wide, so putting it in the road
 * network alongside a trunk reintroduces the very junction it should not make.
 */
/**
 * What a linear feature is FOR — the axis the vertical model reasons on.
 *
 * Kept next to `roadClass` because it is the same distinction seen from the
 * vertical side: a footway and an avenue want different clearances under them
 * and can be built to wildly different gradients, and a railway is stricter
 * than either.
 */
export function functionalType(
  kind: FeatureKind, cls: RoadClass | undefined,
): FunctionalType {
  if (kind === 'rail') return 'railway'
  if (kind === 'water') return 'water'
  return cls === 'pedestrian' ? 'pedestrian' : 'road'
}

export function roadClass(tags: Record<string, string> | undefined): RoadClass {
  const cls = (tags?.['highway'] ?? '').toLowerCase()
  if (cls === 'track') return 'track'
  return PEDESTRIAN_HIGHWAYS.has(cls) ? 'pedestrian' : 'vehicular'
}

/**
 * How coarse each class of way reads, 0-1 — feeds the same `aRough` attribute
 * the ground layers use. Asphalt is fine and near-uniform; paving slabs and
 * gravel are not, and drawing a farm track with motorway grain is the tell
 * that one material is doing all the work.
 */
export const ROAD_CLASS_ROUGHNESS: Record<RoadClass, number> =
  { vehicular: 0.22, pedestrian: 0.5, track: 0.78 }

/**
 * Kerb drop at the edge of a way, metres.
 *
 * A carriageway sits in a kerbed channel; a footpath is flush with what it
 * crosses, and dropping it 16 cm like a road carved a trench through every
 * park. Steps and paths get the smallest lip that still separates them from
 * the ground they lie on.
 */
export const ROAD_CLASS_KERB_M: Record<RoadClass, number> =
  { vehicular: 0.16, pedestrian: 0.05, track: 0.03 }

/** Road-marking white, worn — the same paint as the centre line. */
const CROSSING_TONE: [number, number, number] = [0.82, 0.80, 0.72]

/**
 * A marked pedestrian crossing. `crossing=no` and unmarked crossings are
 * excluded: painting stripes where there is no paint would be inventing a
 * traffic control that is not there.
 */
/**
 * Is this CLOSED way a paved area rather than a ribbon?
 *
 * `area=yes` is the explicit answer and is always believed. The rest is the
 * case OSM leaves ambiguous and mappers routinely leave untagged: a
 * `highway=pedestrian` drawn as a closed loop.
 *
 * SEMANTIC EVIDENCE, and the reason the rule stops at `pedestrian`. A closed
 * `highway=footway` is usually a real loop — a path that goes round a pond and
 * comes back — and paving its interior would tarmac the pond. A closed
 * `highway=pedestrian` is a pedestrianised STREET or a square, and a square is
 * the only thing a closed one is ever drawn for. Measured on the benchmark
 * harbour: six closed pedestrian ways, five carrying `area=yes` and one not —
 * the Passeig del Mare Nostrum, 2 277 m2, 114 m from the model, drawn as a 5 m
 * loop with a hole through the middle where the promenade is.
 *
 * `area=no` is a statement and is honoured: somebody looked and said ribbon.
 */
export function isPavedArea(tags: Record<string, string> | undefined): boolean {
  const t = tags ?? {}
  if (t['area'] === 'yes') return true
  if (t['area'] === 'no') return false
  return t['highway'] === 'pedestrian'
}

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
  // The material beats the guess. `highway` only ever stood in for what a way
  // is paved in; when the survey says so outright, it wins.
  const surface = normalizeSurface(tags?.['surface'])
  const fromSurface = surface ? SURFACE_TONES[surface] : undefined
  if (fromSurface) return fromSurface
  const cls = (tags?.['highway'] ?? '').replace(/_link$/, '')
  return ROAD_TONES[cls] ?? [0.41, 0.41, 0.43]
}

const WATER_LANDUSE = new Set(['reservoir', 'basin'])

/**
 * Watercourses mapped as a CENTRELINE rather than as an area.
 *
 * This is how most rivers are mapped, and until now they drew as nothing at
 * all: a site on a riverbank came back with dry ground where the river is.
 * `riverbank` (the area form) was handled; the line form is far more common.
 */
const WATERWAY_LINEAR = new Set(['river', 'stream', 'canal', 'ditch', 'drain'])

/**
 * Surface width of a watercourse, metres. An explicit `width` wins; otherwise a
 * per-class default that is honest about scale — a stream is not a river, and
 * drawing both 20 m wide would put a canal through somebody's garden.
 */
const WATERWAY_DEFAULT_WIDTH: Record<string, number> = {
  river: 22, canal: 12, stream: 3, ditch: 1.6, drain: 1.6,
}

export function waterwayWidth(tags: Record<string, string> | undefined): number {
  const t = tags ?? {}
  const explicit = parseLengthM(t['width'])
  if (explicit && explicit > 0) return Math.min(400, explicit)
  return WATERWAY_DEFAULT_WIDTH[t['waterway'] ?? ''] ?? 6
}

/**
 * Is this thing somewhere other than on the ground we are drawing?
 *
 * OSM maps the whole solid: metro tunnels, culverted streams, service roads
 * inside a car park, the corridors of a shopping centre. All of it classifies
 * perfectly well as road, rail or water, and drawing it lays a network of
 * phantom streets and blue ribbons across parks and squares that in reality
 * have nothing on them at all. Measured on the Ciutadella box: 100 roads and
 * 50 railways in tunnel, 61 more indoors, and three culverted streams — a
 * spaghetti of asphalt through the park, and a river through the zoo.
 *
 * `layer` is deliberately NOT consulted, and that is the whole subtlety. A
 * negative layer means "below the thing it crosses", which is exactly what a
 * perfectly ordinary street does where a bridge passes over it. Using it here
 * would delete real streets in every city with a flyover. Only tags that say
 * "this is not on the surface" count, and they say it explicitly.
 *
 * `covered=yes` is likewise left alone: an arcade, a market hall or a gallery
 * IS the ground floor of the street, and people walk it.
 */
export function isBelowSurface(tags: Record<string, string> | undefined): boolean {
  const t = tags ?? {}
  const tunnel = t['tunnel']
  if (tunnel && tunnel !== 'no') return true
  if (t['location'] === 'underground' || t['location'] === 'underwater') return true
  if (t['indoor'] === 'yes') return true
  return false
}

/**
 * Should this feature be DISCARDED for being off the surface, given what it is?
 *
 * The blunt rule above deleted everything below grade, and for water, greenery
 * and buildings that is still exactly right: a culverted stream must not be
 * drawn as a blue ribbon through a park, and the corridors of a shopping centre
 * are not streets.
 *
 * For ROADS AND RAILWAYS it was wrong, and expensively so. A tunnel is not
 * scenery to be deleted, it is infrastructure to be drawn BELOW the surface —
 * and deleting it at parse time, before the session cache, meant no layer
 * toggle could ever bring it back. Worse, the rule caught `building_passage`:
 * 114 of the 226 tunnel-tagged ways in the benchmark district are arcades and
 * gateways that are the ground floor of the street, and every one of them
 * vanished. They are now kept, with `vertical.structure` recording how they sit.
 *
 * `indoor=yes` stays deleted for everything. An indoor corridor genuinely is
 * not a street, and drawing it lays a spaghetti of service ways through the
 * inside of every mall in the district.
 */
export function shouldDiscardBelowSurface(
  kind: FeatureKind, tags: Record<string, string> | undefined,
): boolean {
  const t = tags ?? {}
  if (t['indoor'] === 'yes') return true
  if (kind === 'road' || kind === 'rail') return false
  return isBelowSurface(t)
}

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
  // A `building:part` is a VOLUME of a building — a podium, a shaft, a crown —
  // under the Simple 3D Buildings schema. It carries its own `height` and
  // `min_height`, which is why it is worth fetching at all: over Lujiazui, 74 %
  // of parts state a height against 14 % of outlines. Classified as a building
  // because from here down it behaves as one; which outlines it replaces is
  // decided by `building-parts`, not here.
  const part = t['building:part']
  if (part && part !== 'no') return 'building'

  // A free-standing arch is masonry with a footprint and a height, so it is
  // built by the building path even when nobody tagged `building=*` on it.
  if (t['man_made'] === 'arch') return 'building'

  // PORT STRUCTURES, before water: a quay is the edge of the harbour and a pier
  // stands IN it, so a `man_made=pier` that also carries `water=*` context must
  // not be swallowed by the water rule below. These are decks over water, not
  // ground cover — which is why they get a kind of their own rather than being
  // folded into `road` (they are not carriageways) or `building` (no walls).
  if (PORT_STRUCTURES.has(t['man_made'] ?? '')) return 'pier'

  // SEMANTIC EVIDENCE: `waterway=dock` is "an enclosed area of WATER", not a
  // structure. It used to return 'pier' here, one line after the port
  // structures, and the consequence was measured on the real harbour: both
  // Port Vell basins — 2 106 m2 and 8 177 m2 — were paved with an opaque
  // 0.9 m concrete slab hanging 2 m over the water they are made of. Worse
  // quietly: a dock that is not `kind === 'water'` is invisible to
  // `buildWaterMask`, so the elevation raster went on reading the moored ships
  // in those basins as ground.
  //
  // A DRY dock is the exception the tag itself marks, with `dock=drydock`. It
  // is a hole in the ground with a gate, so it is not water — and it is not a
  // deck either; leaving it to the classifier below is the honest answer until
  // something knows how to cut one.
  if (t['waterway'] === 'dock' && t['dock'] !== 'drydock') return 'water'

  if (t['natural'] === 'tree') return 'tree'

  // A surveyed junction control. Only the signals themselves — a crossing node
  // that merely REFERS to signals is part of that crossing, not a mast.
  if (t['highway'] === 'traffic_signals') return 'signal'

  // A bridge OUTLINE — `man_made=bridge` — is a real area feature: the deck's
  // own footprint, mapped as a polygon.
  //
  // A `bridge=yes` WAY is not. It is a road, or a railway, that happens to be
  // carried on a structure, and promoting it to its own kind here is what used
  // to remove it from the road graph: it lost its junctions, its width solving
  // and its markings, and came back as an unrelated slab with no ramps. How a
  // way is carried is answered by `readVerticalTags`, not by this function, and
  // the two answers now travel together on the feature. Note this also ends the
  // DOUBLE DECK: the standard tagging pair — an outline plus the way it carries
  // — used to produce two overlapping decks at two independently-guessed
  // heights. Now the outline is the area and the way is the road on it.
  if (t['man_made'] === 'bridge') return 'bridge'

  if (
    t['natural'] === 'water' ||
    t['waterway'] === 'riverbank' ||
    WATERWAY_LINEAR.has(t['waterway'] ?? '') ||
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
/**
 * Which of the three port structures this is, because they are not one thing.
 *
 * QUAY — the built edge of the land. Water on one side, solid ground on the
 * other, all the way down. It is the only one of the three that is not
 * standing IN the water, and drawing it as though it were is what made the
 * Moll de Barcelona — 1 073 m of Barcelona's principal commercial quay — a 4 m
 * plank floating at +2 m with open sea rendered on both sides of it.
 *
 * PIER — a deck that walks out into the water on legs. Narrow, thin, water
 * underneath and all around: the finger pontoons of a marina.
 *
 * MOLE — a breakwater or groyne. Armour, not a deck: higher out of the water,
 * never walked, and rough.
 *
 * They share a builder because they share a datum — the sea, never the terrain.
 * They differ in width, in height, and in what is under them.
 */
function pierKindOf(tags: Record<string, string> | undefined): 'deck' | 'mole' | 'quay' {
  const mm = (tags ?? {})['man_made']
  if (mm === 'breakwater' || mm === 'groyne') return 'mole'
  if (mm === 'quay') return 'quay'
  return 'deck'
}

export function resolveFeatureStyle(
  kind: FeatureKind, tags: Record<string, string> | undefined,
): FeatureStyle {
  const t = tags ?? {}
  if (kind === 'pier') {
    return {
      roofShape: 'flat', roofHeightM: 0, pierKind: pierKindOf(t),
      surface: normalizeSurface(t['surface']),
      // A PORT STRUCTURE CAN ALSO BE A STREET, and the Rambla de Mar is both:
      // `man_made=pier` + `highway=pedestrian` + `area=yes` + `surface=wood`,
      // the most-walked structure in the harbour. The port branch above claims
      // it first — correctly, it IS a pier standing in the water — but claiming
      // it must not erase the rest of what it is. Carrying the class here is
      // what lets anything downstream know a deck is walked on rather than
      // worked from, and it costs one call.
      roadClass: t['highway'] !== undefined ? roadClass(t) : undefined,
    }
  }
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
    const cover = greenCover(t)
    return {
      roofShape: 'flat', roofHeightM: 0,
      tone: greenTone(t), roughness: greenRoughness(t),
      cover,
      coverShape: coverTreeShape(cover, t),
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
      return {
        roofShape: 'flat', roofHeightM: 0, crossing: true, tone: CROSSING_TONE,
        // A crossing is paint, and it is ALSO a footway. Omitting the class
        // here made `functionalType` call every zebra in the city a road,
        // which is the wrong answer to a question nothing currently asks —
        // crossings are excluded from the vertical solve, so no consumer sees
        // it today. Left correct rather than left latent: the day a zebra on a
        // deck is solved, this is the line that would have been wrong.
        roadClass: roadClass(t),
      }
    }
    const lanes = parseFloat(t['lanes'] ?? '')
    const oneway = (t['oneway'] ?? '').toLowerCase()
    return {
      roofShape: 'flat', roofHeightM: 0, tone: roadTone(t),
      surface: normalizeSurface(t['surface']),
      roadClass: roadClass(t),
      lanes: Number.isFinite(lanes) && lanes > 0 ? Math.min(12, Math.round(lanes)) : undefined,
      // A roundabout is one-way by definition even when nobody tagged it, and
      // painting a centre line down a ring road is the giveaway of a renderer
      // that never looked at the topology.
      oneway: (oneway !== '' && oneway !== 'no')
        || t['junction'] === 'roundabout' || t['junction'] === 'circular',
      roundabout: t['junction'] === 'roundabout' || t['junction'] === 'circular',
    }
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
    roofTagged: (t['roof:shape'] ?? '') !== '',
    use: buildingUse(t),
    monument: monumentShape(t),
    roofHeightM: roofShape === 'flat' ? 0 : (tagged && tagged > 0 ? tagged : 3),
  }
}

/**
 * Monuments whose whole point is a shape a solid extrusion cannot express.
 *
 * A triumphal arch IS its opening. OSM traces the outline of the masonry and
 * tags the height, and extruding that gives a 29 m brick cube where the Arc de
 * Triomf should be — the one building on the site everybody recognises, drawn
 * as the one thing it is not. There is no `building:part` data to fall back on
 * for it (nor for most of them), so the shape has to come from the type.
 *
 * Deliberately a SHORT list of documented values. This is the seam where "we
 * model named landmarks" would start, and that is a different product: what
 * belongs here is only the handful of tags that state a form outright.
 */
export function monumentShape(
  tags: Record<string, string> | undefined,
): 'arch' | undefined {
  const t = tags ?? {}
  if (t['building'] === 'triumphal_arch' || t['man_made'] === 'arch') return 'arch'
  return undefined
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

/**
 * `man_made` values that are a deck or a mole at the water's edge.
 *
 * A groyne and a breakwater are not walkable and a quay is, but all four are
 * the same problem for the generator: a hard surface at a known height above
 * the SEA rather than at whatever the terrain raster believes.
 */
const PORT_STRUCTURES = new Set(['pier', 'quay', 'breakwater', 'groyne'])

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
  // A finger pier is long and narrow; a small pontoon is genuinely small.
  pier: 8,
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
/**
 * Where in the pipeline an element stopped being a thing we draw.
 *
 * `classify` — nothing in the tag vocabulary claimed it.
 * `accept`   — it was understood, then rejected by a rule (below surface, too small).
 * `geometry` — it was accepted, then produced no ring worth keeping.
 */
export type LossStage = 'classify' | 'accept' | 'geometry'

/**
 * One element that entered the parser and did not come out.
 *
 * The point of recording this is that the alternative is finding these by eye,
 * one at a time, in a rendered scene — which is how the quay that is also the
 * shoreline stayed missing: it was requested, it arrived, and it silently
 * became part of the sea instead of a quay. `reason` is a short stable code so
 * a report can group by it and a grep can find the line that emitted it.
 */
export interface FeatureLoss {
  /** Prefixed as the feature would have been: `w123`, `r45`, `n7`. */
  id: string
  tags: Record<string, string>
  stage: LossStage
  reason: string
}

export interface ParseOptions {
  bbox?: CoastlineBbox
  /**
   * Called for every element that is discarded, with the reason.
   *
   * OFF by default and never wired up in production: this exists for the
   * offline benchmark, which asks "of everything real in this box, what reaches
   * the scene?". Undefined costs one optional call per drop.
   */
  onDrop?: (loss: FeatureLoss) => void
}

export function parseOsmFeatures(
  json: unknown,
  opts?: ParseOptions,
): OsmFeature[] {
  const elements = (json as { elements?: unknown })?.elements
  if (!Array.isArray(elements)) return []

  const out: OsmFeature[] = []
  /** Shoreline ways, held back to be turned into the sea once all are known. */
  const coastline: LatLonPoint[][] = []

  const drop = (
    el: OverpassEl, stage: LossStage, reason: string,
  ): void => {
    opts?.onDrop?.({
      id: `${el.type === 'relation' ? 'r' : el.type === 'node' ? 'n' : 'w'}${el.id}`,
      tags: el.tags ?? {},
      stage,
      reason,
    })
  }

  for (const raw of elements) {
    const el = raw as OverpassEl
    if (!el || typeof el !== 'object') continue

    // A coastline is not a feature. It is the EDGE of one, and on its own it
    // draws nothing — the water it implies is assembled below, once the whole
    // shoreline is in hand. See `coastline.ts` for why the sea has to be built
    // rather than read.
    //
    // It does NOT `continue`, and that is the fix for a harbour. In a built
    // port the land/water boundary IS a structure: Moll de Barcelona carries
    // `man_made=quay` and `natural=coastline` on one way, as does the mole
    // guarding the Nova Bocana, and so does the seaward edge of a beach. Taking
    // the shoreline and stopping meant the quay contributed its shape to the
    // sea and then drew nothing — the single most visible built edge of the
    // harbour, missing, while `classifyFeature` carried a comment explaining
    // that port structures are ranked before water precisely so this could not
    // happen. It never got the chance to run. A PLAIN coastline way still
    // classifies to null a few lines below and is dropped exactly as before,
    // so this costs nothing where the shoreline is only a shoreline.
    let consumedAsShore = false
    if (el.tags?.['natural'] === 'coastline'
      && el.type === 'way' && Array.isArray(el.geometry)) {
      const pts = el.geometry.filter((q) => q && Number.isFinite(q.lat) && Number.isFinite(q.lon))
      if (pts.length >= 2) {
        coastline.push(pts.map((q) => ({ lat: q.lat, lon: q.lon })))
        consumedAsShore = true
      }
    }

    const kind = classifyFeature(el.tags)
    if (!kind) {
      // A plain shoreline way IS used — it is the edge the sea was built from —
      // and calling that a loss would put nine correct elements in the same
      // column as the ones nothing claims. The distinction is the whole value
      // of the report: "we understood this and consumed it" and "nothing in the
      // vocabulary recognises this" are different problems.
      drop(el, 'classify', consumedAsShore
        ? 'coastline-consumed-into-sea' : 'no-classifier-claims-it')
      continue
    }
    // Off-surface features are dropped here rather than in `classifyFeature`,
    // which answers what a thing IS: a culverted stream is still a stream. What
    // counts as "drop" depends on the kind — a road in a tunnel is kept and
    // drawn underground. See `shouldDiscardBelowSurface`.
    if (shouldDiscardBelowSurface(kind, el.tags)) {
      drop(el, 'accept', 'below-surface')
      continue
    }

    const style = resolveFeatureStyle(kind, el.tags)
    const height = resolveBuildingHeight(el.tags)

    // Trees and signals are nodes.
    if (kind === 'signal') {
      if (el.type !== 'node' || !Number.isFinite(el.lat) || !Number.isFinite(el.lon)) {
        drop(el, 'geometry', 'point-kind-without-a-position')
        continue
      }
      out.push({
        id: `n${el.id}`, kind, point: { lat: el.lat!, lon: el.lon! },
        height: { heightM: 3.4, minHeightM: 0, estimated: true }, style,
      })
      continue
    }

    if (kind === 'tree') {
      if (el.type !== 'node' || !Number.isFinite(el.lat) || !Number.isFinite(el.lon)) {
        drop(el, 'geometry', 'point-kind-without-a-position')
        continue
      }
      out.push({
        id: `n${el.id}`, kind, point: { lat: el.lat!, lon: el.lon! },
        height: treeHeight(el.tags), style,
      })
      continue
    }

    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const pts = el.geometry.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
      if (pts.length < 2) { drop(el, 'geometry', 'fewer-than-two-points'); continue }
      const closed = isClosed(pts)

      // A finger pier, a jetty, a groyne: mapped as a LINE, because it is long
      // and narrow. Closing it into a ring gives a zero-area sliver that the
      // minimum-area filter then throws away, which is why every pier in a
      // marina used to vanish even once they were being requested. Kept as a
      // centreline with a width, exactly like a bridge deck.
      if (kind === 'pier' && !closed) {
        out.push({
          id: `w${el.id}`, kind, ring: pts, height,
          widthM: pierWidth(el.tags), style,
          name: el.tags?.['name'], label: featureLabel(el.tags),
        })
        continue
      }

      // A bridge tagged on an open way is a centreline: keep it as-is with a
      // width, and let the mesh stage buffer it into a deck.
      if (kind === 'bridge' && !closed) {
        out.push({
          id: `w${el.id}`, kind, ring: pts, height,
          widthM: bridgeWidth(el.tags), style,
        })
        continue
      }

      // A watercourse mapped as a line becomes its own bank-to-bank polygon
      // here, so everything downstream — triangulation, terrain draping, the
      // water material — treats it exactly like a lake and needs no new path.
      if (kind === 'water' && !closed && WATERWAY_LINEAR.has(el.tags?.['waterway'] ?? '')) {
        const ring = bufferWaterway(pts, waterwayWidth(el.tags))
        if (ring) out.push({ id: `w${el.id}`, kind, ring, height, style })
        else drop(el, 'geometry', 'waterway-buffer-collapsed')
        continue
      }

      // A square, an esplanade, a pedestrianised street: mapped as an AREA, and
      // the only honest way to draw it is to pave the polygon. Ribboning its
      // outline instead drew a 3 m footpath around the edge of the Passeig de
      // Lluís Companys and left the middle showing the raster basemap, which is
      // the opposite of what is there — 83 such areas in the Ciutadella box.
      if (kind === 'road' && closed && isPavedArea(el.tags)) {
        const ring = closeRing(pts, kind)
        if (ring) {
          out.push({
            id: `w${el.id}`, kind, ring, height, style,
            name: el.tags?.['name'], label: featureLabel(el.tags),
          })
        } else drop(el, 'geometry', ringRejection(pts, kind))
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
          // How it is CARRIED, and what it is FOR — the two halves of the
          // vertical model. Carried alongside `kind` rather than replacing it,
          // so a way on a bridge is still a road everywhere downstream.
          vertical: readVerticalTags(el.tags),
          functional: functionalType(kind, style.roadClass),
        })
        continue
      }

      const ring = closeRing(pts, kind)
      if (ring) {
        out.push({
          id: `w${el.id}`, kind, ring, height, style,
          name: el.tags?.['name'], label: featureLabel(el.tags),
          isBuildingPart: isBuildingPartTag(el.tags),
        })
      } else drop(el, 'geometry', ringRejection(pts, kind))
      continue
    }

    if (el.type === 'relation' && Array.isArray(el.members)) {
      // ASSEMBLE FIRST, then close. A relation does not store rings, it stores
      // member ways; the ring is what they make joined end to end, in whatever
      // order and whatever direction the mappers happened to draw them. Closing
      // each member on its own is not a coarser answer, it is a different
      // shape — see multipolygon.ts for the measurement that says so.
      let part = 0
      const outer = assembleMultipolygon(el.members).outer
      for (const chain of outer) {
        const ring = closeRing(chain, kind)
        if (ring) {
          out.push({
            id: `r${el.id}-${part++}`, kind, ring, height, style,
            name: el.tags?.['name'], label: featureLabel(el.tags),
          })
        }
      }
      // A relation that assembled into nothing usable is exactly the failure
      // the ring assembler exists to end, so it must never be silent again.
      if (part === 0) {
        drop(el, 'geometry', outer.length === 0
          ? 'relation-has-no-outer-members' : 'relation-rings-all-rejected')
      }
    }
  }

  // ── The sea ─────────────────────────────────────────────────────────────────
  // Emitted as an ordinary WATER feature, deliberately. Everything downstream —
  // the water layer, its material and animation, the layer toggle, and the mask
  // that stops the DEM reading moored ships as ground — then works on it with
  // no new path and no new contract. The only thing special about the sea is
  // that nobody mapped it as a polygon, and that is this function's problem.
  if (opts?.bbox && coastline.length > 0) {
    const rings = buildSeaPolygons(coastline, opts.bbox)
    rings.forEach((ring, i) => {
      out.push({
        id: `sea-${i}`,
        kind: 'water',
        ring,
        height: { heightM: 0, minHeightM: 0, estimated: true },
        style: resolveFeatureStyle('water', { natural: 'water' }),
        label: 'Sea',
        // The one thing that IS special about it downstream: its datum.
        isSea: true,
      })
    })
  }

  return supersedeOutlinesWithParts(out)
}

/**
 * Stand down every building outline that its own `building:part`s describe.
 *
 * A part is not an extra building, it REPLACES the volume of the outline it
 * sits in. Drawing both leaves the outline's prism standing around its own
 * parts like shrink-wrap — visible wherever the outline is taller than the
 * podium, which is most of the time.
 *
 * Applied here, at the end of parsing, rather than inside the loop: it is a
 * decision about the whole feature SET, and one part can supersede an outline
 * that has not been read yet.
 */
/** True where the tags describe a VOLUME of a building rather than a building. */
function isBuildingPartTag(tags: Record<string, string> | undefined): boolean {
  const t = tags ?? {}
  const part = t['building:part']
  // `building` wins: a way carrying both is a building that also states its own
  // part, and treating it as a part would delete the outline it IS.
  if (t['building'] && t['building'] !== 'no') return false
  return part !== undefined && part !== 'no'
}

function supersedeOutlinesWithParts(features: OsmFeature[]): OsmFeature[] {
  const parts = features.filter((f) => f.kind === 'building' && f.isBuildingPart && f.ring)
  if (parts.length === 0) return features

  const outlines = features
    .filter((f) => f.kind === 'building' && !f.isBuildingPart && f.ring)
    .map((f) => ({ id: f.id, ring: f.ring!.map((p) => ({ x: p.lon, y: p.lat })) }))

  const { supersededOutlines } = partitionBuildingParts(
    outlines,
    parts.map((f) => ({ id: f.id, ring: f.ring!.map((p) => ({ x: p.lon, y: p.lat })) })),
  )
  if (supersededOutlines.size === 0) return features
  return features.filter((f) => !supersededOutlines.has(f.id))
}

/**
 * Turn a watercourse centreline into a bank-to-bank ring.
 *
 * Offsetting happens in METRES and is converted back to degrees per point,
 * because a degree of longitude is not a degree of latitude anywhere but the
 * equator — buffering in raw degrees would make every river north of the Alps
 * visibly wider than it is, in one axis only.
 *
 * Sharp meanders can fold the ring over itself. That is left alone rather than
 * mitred: a self-intersecting ring fails triangulation and is dropped by the
 * mesh stage, which is the honest outcome — better a missing bend than a
 * confident triangle across a river.
 */
export function bufferWaterway(
  pts: ReadonlyArray<{ lat: number; lon: number }>, widthM: number,
): LatLonPoint[] | null {
  if (pts.length < 2 || !(widthM > 0)) return null
  const half = widthM / 2
  const midLat = pts[Math.floor(pts.length / 2)].lat
  const mPerDegLat = 111_132
  const mPerDegLon = 111_320 * Math.max(0.01, Math.cos((midLat * Math.PI) / 180))

  const left: LatLonPoint[] = []
  const right: LatLonPoint[] = []

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    // Direction in metres, so the normal is perpendicular on the ground rather
    // than perpendicular in a stretched coordinate space.
    const dx = (next.lon - prev.lon) * mPerDegLon
    const dy = (next.lat - prev.lat) * mPerDegLat
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    const offLon = ((-dy / len) * half) / mPerDegLon
    const offLat = ((dx / len) * half) / mPerDegLat
    left.push({ lat: pts[i].lat + offLat, lon: pts[i].lon + offLon })
    right.push({ lat: pts[i].lat - offLat, lon: pts[i].lon - offLon })
  }

  if (left.length < 2) return null
  return [...left, ...right.reverse()]
}

function isClosed(pts: OverpassGeom[]): boolean {
  if (pts.length < 4) return false
  const a = pts[0]
  const b = pts[pts.length - 1]
  return Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lon - b.lon) < 1e-12
}

/** Strip the duplicate closing vertex and reject areas too small to matter. */
/**
 * WHY `closeRing` said no — the two gates, told apart.
 *
 * "too small" and "not a polygon at all" are different problems with different
 * fixes, and a report that merges them tells you nothing. Deliberately mirrors
 * closeRing rather than being folded into it: the hot path returns a ring or
 * null and must not pay for a string.
 */
function ringRejection(pts: OverpassGeom[], kind: FeatureKind): string {
  const ring = pts.length >= 3 && isClosed(pts) ? pts.slice(0, -1) : pts
  if (ring.length < 3) return 'ring-has-fewer-than-three-points'
  const min = kind === 'tree' || kind === 'signal' ? 0 : MIN_AREA_M2[kind]
  const area = approximateAreaM2(ring)
  return area < min ? `ring-under-min-area-${kind}` : 'ring-rejected'
}

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

/**
 * Deck width for a pier mapped as a line.
 *
 * A finger pier in a marina is a walkway two people can pass on; a commercial
 * quay mapped as a line is far wider, and says so with a `width` tag. The
 * default is deliberately narrow: an over-wide pier paves over the water it is
 * supposed to stand in, which reads far worse than a slightly thin one.
 */
export function pierWidth(tags: Record<string, string> | undefined): number {
  const t = tags ?? {}
  const explicit = parseLengthM(t['width']) ?? parseLengthM(t['est_width'])
  if (explicit && explicit > 0) return Math.min(80, explicit)
  const mm = t['man_made']
  if (mm === 'breakwater' || mm === 'groyne') return 6
  // A commercial quay mapped as a line is the edge of a working apron, not a
  // walkway. Measured on the benchmark harbour: Moll de Barcelona and Moll de
  // Sant Bertran are both over a kilometre long and neither carries `width`,
  // so the finger-pier default was the only number they ever got.
  if (mm === 'quay') return 14
  return 4
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

  // Each GROUP gets its own result set and its own `out`, so each one gets its
  // own share of the budget.
  //
  // This used to be a single union with one `out geom N`, and that is a trap:
  // Overpass truncates the combined set, and the order it emits in is nothing to
  // do with the order the query asks in. Measured on a 1.4 km box over Poblenou,
  // the first 6000 elements were 5581 land-cover polygons and only 347 of the
  // 3113 highways — so the app drew 11 % of the streets and looked like the road
  // renderer was broken. Land cover is a handful of enormous polygons; roads are
  // thousands of small ways. Letting them compete for one number means the big
  // cheap ones always win.
  //
  // Shares are weighted by what a SITE VIEW is actually for: the street network
  // is the skeleton everything else hangs off, so it is funded first.
  const groups: Array<[string, number]> = [
    // The street network, and the bridges that carry it.
    [`way["highway"](${b});way["railway"](${b});`, Math.round(maxElements * 0.55)],
    // Bridge OUTLINES only. The linear case needs no funding here: a
    // `bridge=yes` highway is a highway and already arrives in the group above,
    // which is why this share could be cut to pay for the waterfront.
    [area('["man_made"="bridge"]'), Math.round(maxElements * 0.02)],
    [area('["building"]') + area('["man_made"="arch"]'), Math.round(maxElements * 0.45)],
    // Ground cover: few polygons, huge area. A tight cap costs nothing visible.
    [
      area('["natural"="water"]')
      + area('["waterway"="riverbank"]')
      + `way["waterway"~"^(river|stream|canal|ditch|drain)$"](${b});`
      + area('["landuse"~"^(reservoir|basin)$"]')
      + area('["leisure"~"^(park|garden|pitch|golf_course|nature_reserve)$"]')
      + area('["landuse"~"^(grass|forest|meadow|village_green|recreation_ground|allotments|orchard|vineyard|cemetery)$"]')
      + area('["natural"~"^(wood|scrub|grassland|heath|wetland)$"]')
      + area('["natural"~"^(beach|sand|dune|shingle|mud)$"]')
      + area('["natural"~"^(bare_rock|rock|scree|stone|glacier)$"]')
      + area('["landuse"~"^(sand|quarry)$"]')
      + area('["golf"="bunker"]'),
      Math.round(maxElements * 0.30),
    ],
    [area('["railway"="platform"]'), Math.round(maxElements * 0.02)],
    // THE WATERFRONT. None of this was ever requested, and at a harbour that is
    // the difference between a site and a hole: the benchmark district holds 36
    // piers, 4 quays, 2 breakwaters and 10 coastline ways, and the open basin
    // and the sea beyond it are not polygons at all — they are the implicit
    // seaward side of `natural=coastline`, which nothing else can supply.
    [
      `way["natural"="coastline"](${b});`
      + area('["man_made"~"^(pier|quay|breakwater|groyne)$"]')
      + area('["waterway"="dock"]')
      + area('["landuse"~"^(harbour|port)$"]'),
      // Sized from the data, not from a guess: the benchmark district's entire
      // waterfront — every pier, quay, breakwater, dock, harbour and coastline
      // way — is about 55 elements. This is a threefold margin on that.
      Math.round(maxElements * 0.03),
    ],
    // Nodes are cheap — one coordinate each — so they are not taken from the
    // geometry budget that the ways are competing over.
    [`node["natural"="tree"](${b});`, Math.round(maxElements * 0.35)],
    [`node["highway"="traffic_signals"](${b});`, Math.round(maxElements * 0.05)],
  ]

  return [
    `[out:json][timeout:${timeoutS}];`,
    ...groups.map(([body, cap]) => `(${body});out geom ${Math.max(1, cap)};`),
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
    tree: 0, bridge: 0, road: 0, rail: 0, signal: 0, pier: 0 }
  for (const f of features) counts[f.kind]++
  return counts
}
