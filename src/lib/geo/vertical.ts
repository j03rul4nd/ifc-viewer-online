// ─── vertical ─────────────────────────────────────────────────────────────────
// The semantic model of WHERE INFRASTRUCTURE SITS IN THE THIRD DIMENSION, and
// the solver that turns it into a continuous elevation profile.
//
// ── The mistake this module exists to undo ────────────────────────────────────
//
// `classifyFeature` used to answer "what is this?" with ONE enum, and `bridge`
// was one of its values. So a street that happened to cross a river stopped
// being a street: it left the road graph, lost its junctions, lost its width
// solving, lost its markings, and reappeared as an unrelated slab floating at a
// constant height with no ramp at either end. The carriageway feeding it stayed
// on the ground, and the two met nowhere.
//
// That is a modelling error, not a rendering one. A bridge is not a KIND of
// thing, it is a way of CARRYING a thing. The two questions are orthogonal:
//
//     functional type — road, railway, pedestrian: what it is FOR
//     structure       — ground, bridge, tunnel, covered, trench, floating:
//                       how it is CARRIED
//
// Every combination is real. A road on a bridge, a railway in a tunnel, a
// footpath on a pier, a street through a building passage. Keeping them
// separate is what lets a route stay ONE route from end to end while its
// vertical treatment changes underneath it — which matters for the picture now
// and for anything that ever wants to traverse this graph later.
//
// ── The vertical resolution hierarchy ─────────────────────────────────────────
//
// When several sources speak, this is the order and the reason:
//
//   1. SURVEYED — an explicit `ele`. Somebody measured it. Nothing beats it.
//   2. INFERRED — what the way actually crosses. A flyover over a railway needs
//      a railway's clearance; the geometry says so more reliably than any tag.
//   3. TAGGED   — `layer` as an ORDERING. It says this is above that. It does
//      NOT say by how much, and treating it as metres is the naive move this
//      module refuses (see `layerSeparationM`).
//   4. ASSUMED  — a default clearance for the structure type. A fallback, and
//      labelled as one, so a debug session can tell a measurement from a guess.
//
// Whatever the source, the answer is then forced through the SLOPE constraint,
// because a discontinuous road is worse than an imprecise one. See
// `lipschitzEnvelope`.
//
// ── What this module does NOT do ──────────────────────────────────────────────
//
// It never samples a raster (`terrain-truth` owns that), never touches THREE
// materials, and never knows about scene z (`ground-frame` owns that). It works
// in METRES throughout, on a planar frame it is handed. PURE.

// ── The semantic model ─────────────────────────────────────────────────────────

/** What a way is FOR. Orthogonal to how it is carried. */
export type FunctionalType = 'road' | 'railway' | 'pedestrian' | 'water'

/** How a way is CARRIED. Orthogonal to what it is for. */
export type StructureType =
  /** On the ground, following it. The overwhelming majority. */
  | 'ground'
  /** Carried clear of what it crosses on a structure of its own. */
  | 'bridge'
  /** Bored or cut-and-covered, below the surface. */
  | 'tunnel'
  /** At grade, but with something over it — an arcade, a building passage. */
  | 'covered'
  /** Below grade in an OPEN cutting: sunk, but with sky above it. */
  | 'trench'
  /** Carried on water — a pontoon, a floating dock. */
  | 'floating'

/**
 * How much the vertical answer is worth.
 *
 * Never shown to the user. It exists so heuristics can decline to be clever on
 * evidence that will not carry it, and so the debug overlay can explain a
 * floating road by its CAUSE rather than by its symptom.
 */
export type VerticalConfidence = 'surveyed' | 'inferred' | 'tagged' | 'assumed'

const CONFIDENCE_RANK: Record<VerticalConfidence, number> = {
  surveyed: 3, inferred: 2, tagged: 1, assumed: 0,
}

/** Pick the better-evidenced of two confidences. */
export function bestConfidence(a: VerticalConfidence, b: VerticalConfidence): VerticalConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b
}

/** Everything the tags say about where a way sits vertically. */
export interface VerticalTags {
  structure: StructureType
  /**
   * OSM `layer`: a RELATIVE ORDERING among things that overlap in plan.
   * Zero means "no statement", not "at ground".
   */
  layer: number
  /** Surveyed elevation in metres, when tagged. */
  eleM: number | null
  /** `min_height` — the underside of a structure above its own ground. */
  minHeightM: number | null
  /** `height` as tagged. On a bridge this is the STRUCTURE, not the clearance. */
  heightM: number | null
  /** True where the way is explicitly on or over water. */
  overWater: boolean
}

/**
 * `layer` values seen in the wild cluster tightly: measured over a
 * 17 000-way harbour district, 1.1 % of ways carry one at all, spanning
 * −4…+3. Clamping keeps one mistyped `layer=99` from launching a street
 * into orbit, which is a real and recurrent kind of OSM typo.
 */
export const MAX_LAYER = 5

/** Parse an integer tag, tolerating the whitespace and signs OSM actually has. */
function intTag(v: string | undefined): number | null {
  if (v === undefined) return null
  const n = Number.parseInt(v.trim(), 10)
  return Number.isFinite(n) ? n : null
}

/** Parse a metric length tag: "12", "12 m", "12m". Feet are not our problem here. */
export function lengthTagM(v: string | undefined): number | null {
  if (v === undefined) return null
  const n = Number.parseFloat(v.trim().replace(/\s*m$/i, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * `tunnel` values that are NOT a tunnel in the sense that matters here.
 *
 * `building_passage` is an arcade, a gateway, a street running under a building
 * — it is AT GRADE and people walk on it. Deleting it (which is what a blanket
 * `tunnel != no` rule does) removes real streets from the middle of a city: 114
 * of the 226 tunnel-tagged ways in the benchmark district are these, and 95 of
 * them carry no layer at all, so nothing else would have caught them either.
 */
const AT_GRADE_TUNNELS = new Set(['building_passage', 'covered'])

/**
 * Read the structural situation out of a way's tags.
 *
 * Deliberately NOT a classification of what the way is — that stays with
 * `classifyFeature`. This answers only "how is it carried", and it answers it
 * for a road, a railway or a footpath identically.
 */
export function readVerticalTags(tags: Record<string, string> | undefined): VerticalTags {
  const t = tags ?? {}
  const layerRaw = intTag(t['layer']) ?? 0
  const layer = Math.max(-MAX_LAYER, Math.min(MAX_LAYER, layerRaw))

  const bridge = t['bridge']
  const tunnel = t['tunnel']
  const covered = t['covered']
  const location = t['location']

  const overWater =
    t['floating'] === 'yes' ||
    location === 'underwater' ||
    t['seamark:type'] !== undefined

  let structure: StructureType = 'ground'

  if (t['floating'] === 'yes') {
    structure = 'floating'
  } else if (bridge && bridge !== 'no') {
    structure = 'bridge'
  } else if (tunnel && tunnel !== 'no') {
    // An arcade is not a tunnel. It is the ground floor of the street.
    structure = AT_GRADE_TUNNELS.has(tunnel) ? 'covered' : 'tunnel'
  } else if (location === 'underground' || location === 'underwater') {
    structure = 'tunnel'
  } else if (covered && covered !== 'no') {
    structure = 'covered'
  } else if (t['indoor'] === 'yes') {
    structure = 'covered'
  } else if (layer < 0) {
    // THE OPEN-TRENCH CASE, and the reason `layer` had to stop being ignored.
    // A ring road in a cutting is tagged with nothing but a negative layer:
    // 11 ways of one such road in the benchmark district have no `tunnel` and
    // no `covered`, only `layer=-1`. Draped on the surface they run straight
    // through the neighbourhood they are supposed to pass beneath.
    structure = 'trench'
  } else if (layer > 0) {
    // Elevated without a bridge tag. Rare and usually an incomplete mapping,
    // but the ORDER it asserts is still information, and honouring it is what
    // keeps a flyover off the street below.
    structure = 'bridge'
  }

  return {
    structure,
    layer,
    eleM: lengthTagM(t['ele']),
    minHeightM: lengthTagM(t['min_height']),
    heightM: lengthTagM(t['height']),
    overWater,
  }
}

// ── Clearances ─────────────────────────────────────────────────────────────────

/**
 * Minimum headroom a structure must leave over what it crosses, metres.
 *
 * These are engineering minima, not decoration: the numbers a real crossing is
 * built to. Using them rather than one flat default is what makes a footbridge
 * read as a footbridge and a rail viaduct as a rail viaduct.
 */
export const CROSSING_CLEARANCE_M: Record<FunctionalType, number> = {
  // Road under road: enough for a lorry, which is what sets the standard.
  road: 5.0,
  // Electrified rail needs room for catenary above the vehicle.
  railway: 6.0,
  // A path under a bridge needs headroom, not vehicle clearance.
  pedestrian: 3.0,
  // Navigable water varies enormously; this is a small-craft canal, and any
  // real value comes from the data rather than from here.
  water: 5.5,
}

/**
 * Fallback clearance when NOTHING is known about what is being crossed.
 *
 * A last resort, and labelled `assumed` wherever it is used. It exists because
 * a bridge with no evidence still has to be drawn somewhere, and "on the
 * ground" is the one answer guaranteed to be wrong.
 */
export const DEFAULT_BRIDGE_CLEARANCE_M = 5.0

/** How deep a tunnel bore sits below the surface when nothing says otherwise. */
export const DEFAULT_TUNNEL_DEPTH_M = 7.0

/** How deep an OPEN cutting sits. Shallower than a bore: it still has sky. */
export const DEFAULT_TRENCH_DEPTH_M = 4.5

/**
 * Vertical room between consecutive `layer` values, metres.
 *
 * THE NAIVE MOVE THIS REPLACES is `elevation = layer × 5 m`. It is wrong in
 * both directions. `layer` is an ordering, not a measurement: it says a way is
 * above another way it OVERLAPS, and says nothing at all when nothing is
 * beneath. Multiplying it out lifts every `layer=1` way in a city five metres
 * into the air whether or not anything passes under it, and it flattens a
 * genuine three-level interchange into even 5 m steps that match no structure
 * on earth.
 *
 * So this constant is used ONLY to separate levels from EACH OTHER, once
 * something is already known to be stacked — never to decide the height of a
 * lone way. See `resolveStructureElevationM`.
 */
export const LAYER_SEPARATION_M = 5.5

// ── Slope ──────────────────────────────────────────────────────────────────────

/**
 * Steepest grade each functional type may be built to, as a rise/run fraction.
 *
 * The point is continuity. Given a choice between a deck at exactly the right
 * height reached by a vertical step, and a deck a little low reached by a ramp
 * you can drive, the ramp is the honest picture — a road that gains six metres
 * in two is not a road. These are generous relative to design standards,
 * because OSM geometry is coarse and an over-strict limit would flatten real
 * mountain hairpins.
 */
export const MAX_GRADE: Record<FunctionalType, number> = {
  road: 0.10,
  // Steel on steel. Even a steep mountain line is far under this.
  railway: 0.04,
  // Steps and ramps; pedestrians climb what vehicles cannot.
  pedestrian: 0.25,
  water: 0.02,
}

/**
 * Least clearance worth keeping when a span is too short to ramp properly.
 *
 * When geometry and target disagree, §"reduce the clearance within reason" is
 * the third option after "lengthen the transition" and "share the climb with
 * the neighbours". Below this a bridge stops reading as a bridge, so the solver
 * accepts a steeper grade instead and records the compromise.
 */
export const MIN_USABLE_CLEARANCE_M = 2.5

// ── The slope-constrained profile solver ───────────────────────────────────────

/**
 * One vertex of a chain, as the solver sees it.
 *
 * `hard` vertices are structural intent that should survive — the middle of a
 * bridge deck, a surveyed elevation, a node shared with a solved neighbour.
 * `soft` vertices want their target but will yield to keep the profile
 * continuous — ordinary ground following the terrain.
 */
export interface ProfileVertex {
  /** Distance along the chain from its start, metres. */
  stationM: number
  /** Where this vertex WANTS to be, metres. */
  targetM: number
  hard: boolean
}

/**
 * Force a chain of targets to obey a maximum grade, moving soft vertices and
 * preserving hard ones wherever that is possible.
 *
 * HOW IT WORKS. A profile obeys the grade limit exactly when it is Lipschitz
 * continuous with constant `grade` in the station coordinate. For a set of hard
 * seeds there is a largest such profile that stays under all of them — the
 * upper envelope `U(x) = min over seeds s of (target(s) + grade·|x − s|)` — and
 * a smallest that stays over them, the lower envelope `L`. Any feasible profile
 * lies between the two, so the answer is simply each vertex's own target
 * clamped into `[L, U]`. Both envelopes come out of one forward and one
 * backward sweep, so the whole thing is O(n) and exact — no iteration, no
 * convergence criterion, and no dependence on the order vertices arrive in.
 *
 * WHEN THE SEEDS CONTRADICT EACH OTHER. Two hard seeds closer together than
 * their height difference allows make `L > U`: there is no profile through both
 * at this grade. Rather than pick one and produce a step, the solver splits the
 * difference — the midpoint of the infeasible interval — which distributes the
 * error over the transition instead of concentrating it in a cliff, and reports
 * `relaxed` so the caller knows the grade limit was exceeded.
 */
export function lipschitzEnvelope(
  vertices: ReadonlyArray<ProfileVertex>,
  grade: number,
): { elevationM: number[]; relaxed: boolean } {
  const n = vertices.length
  if (n === 0) return { elevationM: [], relaxed: false }
  if (n === 1) return { elevationM: [vertices[0].targetM], relaxed: false }

  const g = Math.max(1e-6, grade)
  const upper = new Array<number>(n).fill(Infinity)
  const lower = new Array<number>(n).fill(-Infinity)

  // Forward sweep: propagate every seed's influence downstream.
  for (let i = 0; i < n; i++) {
    const v = vertices[i]
    if (v.hard) {
      upper[i] = Math.min(upper[i], v.targetM)
      lower[i] = Math.max(lower[i], v.targetM)
    }
    if (i > 0) {
      const d = Math.abs(v.stationM - vertices[i - 1].stationM) * g
      upper[i] = Math.min(upper[i], upper[i - 1] + d)
      lower[i] = Math.max(lower[i], lower[i - 1] - d)
    }
  }
  // Backward sweep: and upstream.
  for (let i = n - 2; i >= 0; i--) {
    const d = Math.abs(vertices[i + 1].stationM - vertices[i].stationM) * g
    upper[i] = Math.min(upper[i], upper[i + 1] + d)
    lower[i] = Math.max(lower[i], lower[i + 1] - d)
  }

  let relaxed = false
  const elevationM = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const lo = lower[i]
    const hi = upper[i]
    if (lo > hi) {
      // Infeasible: the seeds cannot both be honoured at this grade. Share the
      // error rather than stepping.
      relaxed = true
      elevationM[i] = (lo + hi) / 2
      continue
    }
    elevationM[i] = Math.min(hi, Math.max(lo, vertices[i].targetM))
  }
  return { elevationM, relaxed }
}

// ── Structural elevation ───────────────────────────────────────────────────────

/** What a structure wants to be at, and on what evidence. */
export interface StructureTarget {
  /** Metres relative to the RESOLVED GROUND under the way. Signed. */
  offsetM: number
  confidence: VerticalConfidence
}

export interface StructureContext {
  /** Highest clearance any detected crossing demands under this way, metres. */
  crossingClearanceM?: number
  /**
   * How many `layer` steps this way stands above (or below) the ways it
   * actually overlaps. 0 when it overlaps nothing.
   */
  stackedLevels?: number
  /** Resolved ground under the way, metres — for turning `ele` into an offset. */
  groundM?: number
  /** Whether that ground is worth trusting. */
  groundTrusted?: boolean
}

/**
 * How far above (or below) the ground a structure should sit, and why.
 *
 * This is the vertical resolution hierarchy in code. Read the cases top to
 * bottom: each one only runs because everything above it had nothing to say.
 */
export function resolveStructureElevationM(
  tags: VerticalTags,
  functional: FunctionalType,
  ctx: StructureContext = {},
): StructureTarget {
  const { structure } = tags

  // At grade, whatever else the tags say. `covered` is a street with a roof.
  if (structure === 'ground' || structure === 'covered') {
    return { offsetM: 0, confidence: 'tagged' }
  }

  // ── 1. SURVEYED ─────────────────────────────────────────────────────────────
  // Somebody measured it. The only caveat is that `ele` is an ABSOLUTE height
  // and we need an offset, so it is only usable where the ground under it is
  // itself trustworthy — otherwise a good measurement is differenced against a
  // bad one and the result is worse than either.
  if (tags.eleM !== null && ctx.groundM !== undefined && ctx.groundTrusted) {
    const offsetM = tags.eleM - ctx.groundM
    // A surveyed elevation that puts a bridge underground is a datum mismatch,
    // not a measurement — fall through rather than honour it.
    if (structure === 'bridge' ? offsetM > 0 : offsetM < 0) {
      return { offsetM, confidence: 'surveyed' }
    }
  }

  // `min_height` on a bridge IS its soffit: exactly the clearance, measured.
  if (structure === 'bridge' && tags.minHeightM !== null && tags.minHeightM > 0) {
    return { offsetM: tags.minHeightM, confidence: 'surveyed' }
  }

  if (structure === 'floating') {
    // A pontoon sits ON the water. Its ground has already been clamped to the
    // sea datum by the resolver, so it wants no offset at all.
    return { offsetM: 0, confidence: 'tagged' }
  }

  const down = structure === 'tunnel' || structure === 'trench'

  // ── 2. INFERRED ─────────────────────────────────────────────────────────────
  // What it actually crosses. Geometry is better evidence than a tag, because
  // it cannot be stale or mistyped.
  if (!down && ctx.crossingClearanceM !== undefined && ctx.crossingClearanceM > 0) {
    // Stacked levels above the thing crossed: a second deck over a first needs
    // room for BOTH, and this is the only place `LAYER_SEPARATION_M` is
    // legitimate — separating levels already known to be stacked.
    const extra = Math.max(0, (ctx.stackedLevels ?? 1) - 1) * LAYER_SEPARATION_M
    return { offsetM: ctx.crossingClearanceM + extra, confidence: 'inferred' }
  }

  // ── 3. TAGGED ───────────────────────────────────────────────────────────────
  // A layer with nothing under it. It still asserts an ordering, so honour the
  // ordering — but with the DEFAULT clearance as the unit, not by pretending
  // the tag was a measurement.
  const depth = structure === 'trench' ? DEFAULT_TRENCH_DEPTH_M : DEFAULT_TUNNEL_DEPTH_M
  const base = down ? depth : DEFAULT_BRIDGE_CLEARANCE_M
  const steps = Math.abs(tags.layer)
  if (steps > 0) {
    const magnitude = base + (steps - 1) * LAYER_SEPARATION_M
    return { offsetM: down ? -magnitude : magnitude, confidence: 'tagged' }
  }

  // ── 4. ASSUMED ──────────────────────────────────────────────────────────────
  // A bridge tagged as a bridge and nothing more. It has to go somewhere, and
  // the ground is the one place it certainly does not belong.
  return { offsetM: down ? -base : base, confidence: 'assumed' }
}
