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
 * Pick a facade tone for a building without a tagged colour. Deterministic, so
 * the same block always looks the same — and varied, so a block does not read
 * as one extruded mass.
 */
export function facadeColor(id: string): [number, number, number] {
  const tone = FACADE_TONES[hashId(`${id}#facade`) % FACADE_TONES.length]
  const brightness = 0.92 + variate(id, 3) * 0.16
  return [clamp01(tone[0] * brightness), clamp01(tone[1] * brightness), clamp01(tone[2] * brightness)]
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
