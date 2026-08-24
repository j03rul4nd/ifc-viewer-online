// ─── feature-variation ────────────────────────────────────────────────────────
// Per-feature variation for the OSM scene. PURE, and deliberately DETERMINISTIC:
// the same tree at the same coordinates always renders the same size and shade,
// so a screenshot is reproducible and a re-toggle does not reshuffle the world.
//
// Why this exists at all. The single biggest tell that a generated scene is
// generated is uniformity — every tree an identical cone, every building the
// same grey. Real streets vary. Nothing here invents facts about a specific
// building or tree; it varies *appearance* within a plausible range, seeded by
// the feature's own OSM id so it is stable rather than random.
//
// Everything is derived from one integer hash, no RNG state, so it behaves
// identically across browsers and runs.

/** Stable 32-bit hash of a feature id string. */
export function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministic value in [0,1) for a feature, per named channel. The channel
 * keeps independent properties from correlating — without it every tall tree
 * would also be the darkest one, which reads as a pattern rather than variety.
 */
export function variate(id: string, channel: number): number {
  const h = hashId(`${id}#${channel}`)
  return h / 4294967296
}

/** Symmetric jitter: `base` scaled by 1 ± amount, deterministic per feature. */
export function jitter(id: string, channel: number, base: number, amount: number): number {
  return base * (1 + (variate(id, channel) * 2 - 1) * amount)
}

// ── Tree species ───────────────────────────────────────────────────────────────

/**
 * Canopy silhouette. `leaf_type` is the reliable signal and covers the broad
 * split; `genus`/`species`/`taxon` are rarer but worth reading for the two
 * shapes nothing else can stand in for — a spindle-shaped poplar or cypress,
 * and a palm. Everything outside those lists falls back to the leaf type, so a
 * wrong guess is never worse than the old single-shape default.
 */
export type TreeShape = 'broadleaf' | 'needleleaf' | 'columnar' | 'palm'

// TYPE-ONLY, and it has to stay that way: osm-features imports this module for
// its tone helpers, so a value import back would be a genuine cycle. Type
// imports are erased at compile time and cost nothing at runtime.
import type { BuildingUse, GreenCover, RoofShape } from './osm-features'

/** Genera whose habit is a narrow spindle rather than a round crown. */
const COLUMNAR_GENERA = [
  'populus', 'cupressus', 'thuja', 'juniperus', 'taxodium', 'calocedrus',
]

/** Palms, by the genera actually planted in streets and parks. */
const PALM_GENERA = [
  'phoenix', 'washingtonia', 'trachycarpus', 'chamaerops', 'syagrus',
  'butia', 'livistona', 'roystonea', 'arecaceae', 'cocos',
]

export function treeShape(tags: Record<string, string> | undefined): TreeShape {
  const t = tags ?? {}
  // genus/species/taxon are all used in the wild for the same information.
  const name = [t['genus'], t['species'], t['taxon'], t['genus:en'], t['species:en']]
    .filter(Boolean).join(' ').toLowerCase()

  if (name) {
    if (PALM_GENERA.some((g) => name.includes(g)) || name.includes('palm')) return 'palm'
    if (COLUMNAR_GENERA.some((g) => name.includes(g)) || name.includes('cypress') || name.includes('poplar')) {
      return 'columnar'
    }
  }

  const leaf = (t['leaf_type'] ?? '').toLowerCase()
  if (leaf === 'needleleaved') return 'needleleaf'
  if (leaf === 'broadleaved') return 'broadleaf'
  // Untagged: broadleaf is the safer default — most mapped trees are street
  // trees, and a street of conifers looks wrong far more often than the reverse.
  return 'broadleaf'
}

// ── Foliage colour ─────────────────────────────────────────────────────────────

/** Base foliage tones. Needleleaf reads darker and bluer than broadleaf. */
const FOLIAGE_BASE: Record<TreeShape, [number, number, number]> = {
  broadleaf: [0.29, 0.47, 0.24],
  needleleaf: [0.20, 0.36, 0.26],
  // Cypress and poplar read darker and greyer than a street lime.
  columnar: [0.22, 0.38, 0.22],
  // Palm fronds are yellower and lighter than temperate foliage.
  palm: [0.36, 0.50, 0.22],
}

/**
 * Foliage colour with deterministic variation. Real canopies differ in tone by
 * species, age and light; a single flat green across a whole park is the
 * giveaway. Variation is kept modest so it reads as foliage, not confetti.
 */
export function foliageColor(id: string, shape: TreeShape): [number, number, number] {
  const base = FOLIAGE_BASE[shape]
  // One brightness channel plus a small independent hue drift toward yellow or
  // blue — the two directions real foliage actually varies in.
  const brightness = 0.82 + variate(id, 1) * 0.36
  const warm = (variate(id, 2) - 0.5) * 0.06
  return [
    clamp01((base[0] + warm) * brightness),
    clamp01(base[1] * brightness),
    clamp01((base[2] - warm) * brightness),
  ]
}

// ── Building facade colour ─────────────────────────────────────────────────────

/**
 * Neutral facade tones a real street mixes: render, stone, brick, concrete.
 * Muted on purpose — the IFC model is the subject and context must not shout.
 */
const FACADE_TONES: Array<[number, number, number]> = [
  [0.72, 0.70, 0.66], // warm render
  [0.66, 0.65, 0.63], // grey stone
  [0.70, 0.64, 0.58], // sandstone
  [0.62, 0.60, 0.60], // concrete
  [0.68, 0.62, 0.57], // pale brick
]

/**
 * Roughly where in the world the site is, in the few divisions that change what
 * a street of buildings looks like.
 *
 * DELIBERATELY COARSE, and boxes rather than borders. The honest alternative was
 * shipping a country polygon set to pick a paint colour, which is absurd for
 * what this buys; the dishonest one was pretending the six European tones fit
 * everywhere, which is what a neighbourhood in Kyoto looked like. A box that is
 * right about Japan, the Mediterranean and northern Europe and says `generic`
 * everywhere else is a real improvement over one palette for the planet, and it
 * degrades to exactly the old behaviour where it does not know.
 */
export type BuildingRegion =
  | 'east-asia' | 'mediterranean' | 'northern-europe' | 'north-america' | 'generic'

/** south, west, north, east — in that order, degrees. */
const REGION_BOXES: Array<[BuildingRegion, number, number, number, number]> = [
  // Japan, Korea, eastern China. The one that motivated this.
  ['east-asia', 20, 100, 46, 146],
  // The Mediterranean basin, both shores.
  ['mediterranean', 30, -10, 45, 36],
  ['northern-europe', 45, -11, 71, 32],
  ['north-america', 25, -125, 60, -60],
]

export function buildingRegion(lat: number, lon: number): BuildingRegion {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'generic'
  for (const [region, s, w, n, e] of REGION_BOXES) {
    if (lat >= s && lat <= n && lon >= w && lon <= e) return region
  }
  return 'generic'
}

// ── Which species grows where ──────────────────────────────────────────────────

/**
 * The species mix a cover class grows in a region, as weights that need not sum
 * to anything in particular.
 *
 * TWO DELIBERATE CHOICES, both of which cost something:
 *
 * 1. This is a REGIONAL PLAUSIBILITY, not a fact about the polygon it is
 *    applied to. OSM knows `leaf_type` for a small minority of woods; where it
 *    knows, it wins and this is never consulted (see `coverTreeShape`). Where
 *    it does not, the honest options are a coin flip, one global default, or a
 *    guess informed by where on Earth the site is. The last is the least wrong,
 *    and calling it a guess in the code is the price of using it.
 * 2. A wood is a MIXTURE. A single species is a plantation, and rendering every
 *    wood as one is the uniformity tell all over again — so every entry keeps a
 *    minority, even where the dominance is overwhelming.
 *
 * COST. One InstancedMesh per authored asset actually planted, never one per
 * tree — so the draw calls follow how many distinct trees a site contains, and
 * a wood of six thousand costs what a wood of six does. All four silhouettes
 * are authored now, and the broadleaf bucket splits again by variant, so the
 * ceiling is the size of that asset table and not something this file can
 * quietly raise. What this table controls is how much of it a given place
 * REACHES: a northern site stays on two meshes, a Mediterranean park can ask
 * for five. That is the trade being made here, and `treeAssetCeiling` in the
 * tests is what stops it drifting upward unnoticed.
 */
const SPECIES_MIX: Record<string, ReadonlyArray<readonly [TreeShape, number]>> = {
  // Japan, Korea, eastern China: post-war sugi and hinoki plantation covers the
  // working hillsides, with broadleaf on the margins and in the old groves.
  'east-asia:forest': [['needleleaf', 0.75], ['broadleaf', 0.25]],
  // Pine and holm oak, with the cypress that punctuates them. The columnar
  // minority is small on purpose: cypress is planted in lines and beside
  // buildings far more than it grows through a wood.
  'mediterranean:forest': [['needleleaf', 0.55], ['broadleaf', 0.35], ['columnar', 0.1]],
  // The box spans temperate deciduous and boreal alike, so an even hand is the
  // only defensible answer at this resolution.
  'northern-europe:forest': [['needleleaf', 0.5], ['broadleaf', 0.5]],
  'north-america:forest': [['needleleaf', 0.5], ['broadleaf', 0.5]],

  // Planted greenery follows what people plant, which is broadleaf almost
  // everywhere — a park is shade, and conifers give little of it.
  'east-asia:park': [['broadleaf', 0.85], ['needleleaf', 0.15]],
  // PLANTED greenery only, and that is the whole justification for the palm.
  // The Mediterranean box spans the coast and a good deal of inland Iberia and
  // the Balkans, where a palm growing in a wood would be plainly wrong — but a
  // park or a promenade is somewhere a person CHOSE what to put there, and
  // ornamental palm and cypress are two of the commonest choices in that band.
  // So both appear here and neither appears in `:forest`.
  'mediterranean:park': [
    ['broadleaf', 0.6], ['columnar', 0.18], ['palm', 0.12], ['needleleaf', 0.1],
  ],
}

/** Broadleaf-dominant, for every region and cover the table does not name. */
const DEFAULT_MIX: ReadonlyArray<readonly [TreeShape, number]> =
  [['broadleaf', 0.85], ['needleleaf', 0.15]]

/**
 * Scrub is a low rounded mass with no trunk worth drawing, and the broadleaf
 * crown already reads as exactly that. A conifer among it would read as a tree
 * standing in heather, which is a different landscape.
 */
const SHRUB_MIX: ReadonlyArray<readonly [TreeShape, number]> = [['broadleaf', 1]]

export function coverSpeciesMix(
  cover: GreenCover, region: BuildingRegion,
): ReadonlyArray<readonly [TreeShape, number]> {
  if (cover === 'shrub') return SHRUB_MIX
  // An orchard is one crop per field by definition — mixing it would undo the
  // regularity that makes it read as agriculture at all.
  if (cover === 'orchard') return [['broadleaf', 1]]
  return SPECIES_MIX[`${region}:${cover}`] ?? DEFAULT_MIX
}

/**
 * Pick one tree's species from its mix, deterministically per feature id, so a
 * wood keeps the same trees between reloads and screenshots stay reproducible —
 * the same rule the rest of this module follows.
 */
export function speciesFor(
  id: string, cover: GreenCover, region: BuildingRegion,
): TreeShape {
  const mix = coverSpeciesMix(cover, region)
  if (mix.length === 1) return mix[0][0]
  const total = mix.reduce((sum, [, w]) => sum + w, 0)
  let roll = variate(id, 11) * total
  for (const [shape, weight] of mix) {
    roll -= weight
    if (roll <= 0) return shape
  }
  return mix[mix.length - 1][0]
}

/**
 * Which broadleaf a planted tree actually is.
 *
 * `TreeShape` answers the SILHOUETTE question — round crown, spire, palm — and
 * that is the right granularity for a forest seen from above. It is the wrong
 * granularity at street level, where every round crown being the same green is
 * the thing that reads as one asset repeated. This splits the broadleaf bucket
 * by what people actually plant, and it does it BY REGION rather than by roll:
 * an olive in Helsinki and a cherry avenue in Seville are each worse than no
 * variety at all.
 *
 * Silhouette stays with `TreeShape`, so the procedural path is unaffected — a
 * variant only chooses between authored assets, and an absent one falls back to
 * the plain broadleaf.
 */
export type BroadleafVariant = 'plain' | 'blossom' | 'olive'

const BROADLEAF_MIX: Record<BuildingRegion, ReadonlyArray<readonly [BroadleafVariant, number]>> = {
  // Cherry and plum are planted in quantity, and they are what the place looks
  // like for the weeks anybody photographs it.
  'east-asia': [['plain', 0.55], ['blossom', 0.45]],
  // Olive, and enough of it to change the colour of a square. Blossom stays as
  // a minority: almond and jacaranda are planted, just not in avenues.
  mediterranean: [['plain', 0.5], ['olive', 0.38], ['blossom', 0.12]],
  // Ornamental cherry exists in northern streets but never dominates one.
  'northern-europe': [['plain', 0.9], ['blossom', 0.1]],
  'north-america': [['plain', 0.85], ['blossom', 0.15]],
  generic: [['plain', 0.85], ['blossom', 0.1], ['olive', 0.05]],
}

/**
 * Pick one broadleaf's variant, deterministically per tree id — same contract
 * as `speciesFor`, so a street keeps its trees between reloads.
 */
export function broadleafVariant(id: string, region: BuildingRegion): BroadleafVariant {
  const mix = BROADLEAF_MIX[region] ?? BROADLEAF_MIX.generic
  const total = mix.reduce((sum, [, w]) => sum + w, 0)
  let roll = variate(id, 41) * total
  for (const [variant, weight] of mix) {
    roll -= weight
    if (roll <= 0) return variant
  }
  return mix[mix.length - 1][0]
}

/** Wall palettes that belong to a place. */
const REGION_TONES: Record<BuildingRegion, Array<[number, number, number]>> = {
  generic: FACADE_TONES,
  'northern-europe': FACADE_TONES,
  mediterranean: [
    [0.88, 0.85, 0.78], // whitewash
    [0.84, 0.78, 0.68], // cream render
    [0.80, 0.70, 0.58], // ochre
    [0.76, 0.66, 0.60], // faded terracotta render
    [0.82, 0.80, 0.74], // pale limewash
  ],
  'east-asia': [
    [0.80, 0.78, 0.74], // pale plaster
    [0.66, 0.64, 0.62], // grey render
    [0.72, 0.69, 0.63], // sand plaster
    [0.55, 0.52, 0.49], // dark timber and plaster
    [0.61, 0.60, 0.61], // concrete
    [0.74, 0.72, 0.70], // tile-hung wall
  ],
  'north-america': [
    [0.74, 0.72, 0.68], // painted board
    [0.66, 0.63, 0.58],
    [0.70, 0.66, 0.60], // brick
    [0.62, 0.62, 0.63], // concrete
    [0.78, 0.76, 0.72],
  ],
}

/** Palettes that belong to a USE, wherever it is. A steel shed is a steel shed. */
const USE_TONES: Partial<Record<BuildingUse, Array<[number, number, number]>>> = {
  industrial: [[0.62, 0.64, 0.66], [0.56, 0.59, 0.62], [0.68, 0.68, 0.66]],
  shed: [[0.58, 0.58, 0.56], [0.64, 0.62, 0.57], [0.52, 0.53, 0.52]],
  tower: [[0.58, 0.63, 0.68], [0.52, 0.57, 0.62], [0.64, 0.68, 0.71]],
}

/** Where a place and a purpose together mean something neither means alone. */
const REGION_USE_TONES: Record<string, Array<[number, number, number]>> = {
  // Timber, white plaster and the deep red of a torii. A shrine is not a house
  // with a different roof, and painting it as one is what made the block around
  // the temple read as a European suburb.
  'east-asia:shrine': [[0.55, 0.28, 0.22], [0.78, 0.75, 0.70], [0.45, 0.34, 0.27]],
  'east-asia:temple': [[0.50, 0.40, 0.32], [0.72, 0.69, 0.64], [0.42, 0.35, 0.30]],
  'east-asia:house': [[0.78, 0.76, 0.72], [0.62, 0.59, 0.55], [0.70, 0.67, 0.62]],
  'mediterranean:house': [[0.90, 0.88, 0.82], [0.86, 0.80, 0.70], [0.82, 0.74, 0.62]],
}

/** Roof colours worth stating outright, rather than shading the wall tone. */
const ROOF_TONES: Record<string, [number, number, number]> = {
  'east-asia:temple': [0.20, 0.21, 0.23],   // dark glazed tile
  'east-asia:shrine': [0.24, 0.25, 0.26],
  'east-asia:house': [0.28, 0.30, 0.33],    // blue-grey kawara
  'mediterranean:house': [0.62, 0.38, 0.27], // terracotta
  'mediterranean:generic': [0.60, 0.40, 0.30],
  'northern-europe:house': [0.42, 0.30, 0.26],
}

/** The tone a discreet context block is painted, before its own slight variance. */
const NEUTRAL_TONE: [number, number, number] = [0.72, 0.72, 0.71]

/**
 * What a building is, and where. Everything a facade needs beyond its own id.
 *
 * Optional throughout: a caller with none of it gets exactly the old behaviour,
 * which is what keeps the plain footprint path (no tags, no site) working.
 */
export interface FacadeContext {
  use?: BuildingUse
  region?: BuildingRegion
  /**
   * 'neutral' is the discreet treatment: near-monochrome masses whose only job
   * is to give the IFC model scale. Not a level of detail — it is orthogonal to
   * simple/detailed/showcase, because "how much is modelled" and "how much is it
   * allowed to compete with the subject" are two different questions.
   */
  tone?: 'natural' | 'neutral'
}

/**
 * Pick a facade tone for a building without a tagged colour. Deterministic, so
 * the same block always looks the same — and varied, so a block does not read
 * as one extruded mass.
 *
 * The palette is chosen by place and purpose, most specific first. Before that
 * existed there was one list of six European renders picked by hash, which is
 * why every neighbourhood on earth came out looking like the same suburb.
 */
export function facadeColor(id: string, ctx?: FacadeContext): [number, number, number] {
  if (ctx?.tone === 'neutral') {
    // Enough variance to keep the block from reading as one solid, far too
    // little to draw the eye off whatever is standing in front of it.
    const g = 0.96 + variate(id, 5) * 0.08
    return [clamp01(NEUTRAL_TONE[0] * g), clamp01(NEUTRAL_TONE[1] * g), clamp01(NEUTRAL_TONE[2] * g)]
  }
  const palette = facadePalette(ctx)
  const tone = palette[hashId(`${id}#facade`) % palette.length]
  const brightness = 0.92 + variate(id, 3) * 0.16
  return [clamp01(tone[0] * brightness), clamp01(tone[1] * brightness), clamp01(tone[2] * brightness)]
}

function facadePalette(ctx?: FacadeContext): Array<[number, number, number]> {
  const region = ctx?.region ?? 'generic'
  const use = ctx?.use ?? 'generic'
  return REGION_USE_TONES[`${region}:${use}`]
    ?? USE_TONES[use]
    ?? REGION_TONES[region]
}

/**
 * A roof colour the place and purpose actually imply, or null to keep shading
 * the wall tone as before. A tagged `roof:colour` outranks this everywhere.
 */
export function roofColorFor(ctx?: FacadeContext): [number, number, number] | null {
  if (!ctx || ctx.tone === 'neutral') return null
  const region = ctx.region ?? 'generic'
  const use = ctx.use ?? 'generic'
  return ROOF_TONES[`${region}:${use}`] ?? ROOF_TONES[`${region}:generic`] ?? null
}

/**
 * The roof shape to build when nobody tagged one.
 *
 * Barely a few per cent of OSM buildings carry `roof:shape`, so this decides
 * what almost every roof in the scene looks like. Flat stays the default for
 * everything urban and everything unknown — inventing pitches across a city
 * centre would be a much louder lie than a flat cap. It is the cases where the
 * pitch is near-universal that are worth stating: houses, and the deep hipped
 * roofs that are the single most recognisable thing about an East Asian temple.
 */
export function defaultRoofShape(ctx?: FacadeContext): RoofShape {
  const use = ctx?.use ?? 'generic'
  const region = ctx?.region ?? 'generic'
  if (use === 'temple' || use === 'shrine') {
    return region === 'east-asia' ? 'pyramidal' : 'gabled'
  }
  if (use === 'house') return 'gabled'
  if (use === 'shed') return region === 'east-asia' ? 'gabled' : 'flat'
  return 'flat'
}

/**
 * How deep that inferred roof is, as a fraction of the building's own height.
 *
 * A temple roof is not a lid: it is most of what you see, which is why a temple
 * drawn with a house's pitch reads as a shed. Only ever applied to an INFERRED
 * shape — a tagged `roof:height` is a measurement and is left alone.
 */
export function defaultRoofFraction(ctx?: FacadeContext): number {
  const use = ctx?.use ?? 'generic'
  if (use === 'temple' || use === 'shrine') return 0.45
  if (use === 'house') return 0.3
  return 0.22
}

/**
 * Storey banding factor for a point at height fraction `t` up a wall.
 *
 * A flat wall of one colour reads as a solid block at any distance. Real
 * facades have floor lines, and a faint periodic darkening is enough to give
 * the eye a sense of scale — it is what tells you a building is eight storeys
 * rather than one tall thing. Returns a multiplier near 1.
 */
export function storeyBanding(t: number, storeys: number, strength = 0.06): number {
  if (!(storeys > 0) || strength <= 0) return 1
  // A soft cosine rather than a hard line: at map distances a crisp stripe
  // aliases into moiré, whereas a smooth wave stays readable.
  const phase = Math.cos(t * storeys * Math.PI * 2)
  return 1 - strength * 0.5 * (1 - phase)
}

/** Approximate storey count from a height, for banding only. */
export function storeysFor(heightM: number, storeyHeightM = 3.2): number {
  return Math.max(1, Math.round(heightM / storeyHeightM))
}

// ── Greenery tone ──────────────────────────────────────────────────────────────

/**
 * Greenery differs by what it is: a forest is much darker than a lawn, and a
 * cemetery or pitch is somewhere between. Painting them all one green throws
 * away information OSM actually carries.
 */
export function greenTone(tags: Record<string, string> | undefined): [number, number, number] {
  const t = tags ?? {}
  const landuse = (t['landuse'] ?? '').toLowerCase()
  const natural = (t['natural'] ?? '').toLowerCase()
  const leisure = (t['leisure'] ?? '').toLowerCase()

  if (natural === 'wood' || landuse === 'forest') return [0.16, 0.33, 0.17]
  if (natural === 'scrub' || natural === 'heath') return [0.35, 0.40, 0.24]
  if (landuse === 'vineyard' || landuse === 'orchard') return [0.34, 0.45, 0.24]
  if (landuse === 'cemetery') return [0.33, 0.42, 0.30]
  if (leisure === 'pitch') return [0.28, 0.52, 0.28]
  if (landuse === 'allotments') return [0.38, 0.46, 0.26]
  // park / garden / grass / meadow / village_green
  return [0.29, 0.48, 0.27]
}

/**
 * How shaggy the vegetation is, 0-1. A mown pitch is smooth, heath and scrub
 * are coarse, and woodland floor is somewhere in between. Feeds the tuft scale
 * and bump strength of the grass material — the same tone at two roughnesses
 * reads as two different kinds of ground, which is the point.
 */
export function greenRoughness(tags: Record<string, string> | undefined): number {
  const t = tags ?? {}
  const landuse = (t['landuse'] ?? '').toLowerCase()
  const natural = (t['natural'] ?? '').toLowerCase()
  const leisure = (t['leisure'] ?? '').toLowerCase()

  if (leisure === 'pitch' || leisure === 'golf_course') return 0.12
  if (landuse === 'grass' || landuse === 'village_green') return 0.22
  if (leisure === 'park' || leisure === 'garden') return 0.3
  if (landuse === 'cemetery') return 0.3
  if (landuse === 'meadow' || landuse === 'allotments') return 0.55
  if (landuse === 'vineyard' || landuse === 'orchard') return 0.6
  if (natural === 'wetland') return 0.65
  if (natural === 'wood' || landuse === 'forest') return 0.8
  if (natural === 'scrub' || natural === 'heath') return 0.9
  return 0.4
}

// ── Bare ground: sand and rock ─────────────────────────────────────────────────

/**
 * Colour of unvegetated ground.
 *
 * Sand is not one colour — a quartz beach is pale and slightly pink, a dune
 * field is warmer, a river bar is grey shingle and tidal mud is brown. Painting
 * them all "beige" is the same mistake as painting every park one green, and it
 * is more obvious, because a beach is usually the biggest thing in the frame.
 */
export function bareTone(
  kind: 'sand' | 'rock', tags: Record<string, string> | undefined,
): [number, number, number] {
  const t = tags ?? {}
  const natural = (t['natural'] ?? '').toLowerCase()

  if (kind === 'sand') {
    if (natural === 'mud') return [0.42, 0.37, 0.30]
    if (natural === 'shingle') return [0.60, 0.58, 0.54]
    if (natural === 'dune') return [0.79, 0.68, 0.47]
    if (t['golf'] === 'bunker') return [0.87, 0.82, 0.68]
    // beach / sand / landuse=sand
    return [0.81, 0.73, 0.56]
  }

  if (natural === 'glacier') return [0.82, 0.87, 0.92]
  if (natural === 'scree') return [0.53, 0.50, 0.47]
  if (t['landuse'] === 'quarry') return [0.60, 0.56, 0.50]
  // bare_rock / rock / stone
  return [0.47, 0.46, 0.44]
}

/** Surface coarseness for bare ground — see `FeatureStyle.roughness`. */
export function bareRoughness(
  kind: 'sand' | 'rock', tags: Record<string, string> | undefined,
): number {
  const t = tags ?? {}
  const natural = (t['natural'] ?? '').toLowerCase()

  if (kind === 'sand') {
    if (natural === 'mud') return 0.08
    if (natural === 'shingle') return 0.95
    if (natural === 'dune') return 0.72
    if (t['golf'] === 'bunker') return 0.2
    return 0.3
  }

  // Ice has no fractures to speak of at this scale; scree is nothing but.
  if (natural === 'glacier') return 0.06
  if (natural === 'scree') return 0.92
  return 0.5
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
