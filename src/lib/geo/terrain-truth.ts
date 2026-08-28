// ─── terrain-truth ────────────────────────────────────────────────────────────
// The DEM is a witness, not an oracle.
//
// Everything downstream used to do this:
//
//     const groundM = sampleElevation(nx, ny)
//
// and treat the answer as the physical ground. It is not. The terrarium mosaic
// this app fetches is assembled from SRTM and friends, and SRTM is a RADAR
// SURFACE model: the return comes off whatever the beam hit first, which in a
// city is roofs and in a harbour is moored vessels, cranes and terminal sheds.
// Measured on the app's own z15 tiles over Barcelona's Port Vell:
//
//   Via Laietana, a street in the Gothic Quarter …… 29.8 m   (street is ~10 m)
//   Moll de Barcelona, flat reclaimed quay ………………  8.5 m   (quay is ~2–3 m)
//   Port Vell, OPEN WATER ………………………………………………………  4.7 m   (should be 0)
//   W Hotel, a 99 m building ……………………………………………  0.0 m   (absent entirely)
//
// So the raster is simultaneously too high (objects), too low (things built
// after the survey) and internally inconsistent — a 9 m cliff across flat
// reclaimed land 200 m from the hotel. A generator that trusts it puts quays
// inside their own harbour, drapes streets over rooftops, and lifts a bridge
// deck onto whatever ship happened to be moored under it on survey day.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: nothing outside this file may call
// the raw sampler. Callers ask for RESOLVED GROUND and are told, alongside the
// number, how much to believe it. Where the estimate comes from — a water mask,
// a neighbourhood statistic, or the raw value because nothing was wrong with it
// — is this module's business and nobody else's.
//
// Why a LOW percentile and not a minimum or a mean. Bare ground is the lower
// envelope of a surface model: obstructions only ever add height, so the floor
// of a neighbourhood is a better estimate of it than the middle. A strict
// minimum, though, is one bad pixel away from a hole, and voids and water
// artefacts really do go negative. A low percentile keeps the envelope while
// spending one sample on robustness, which is the same trade a grey
// morphological opening makes, done statistically and per query.
//
// PURE: numbers in, numbers out. No THREE, no scene, no I/O.

import type { GroundSampler } from './ground-frame'

/** How a resolved ground height was arrived at. */
export type GroundVerdict =
  /** The raster was plausible and is used as-is. */
  | 'raw'
  /** The point is on mapped water; the water's own level wins. */
  | 'water'
  /** The raster stood well above its own neighbourhood — a roof, hull or crane. */
  | 'obstruction'
  /** No sampler at all: the flat map. */
  | 'flat'

/**
 * How much to believe a resolved height.
 *
 * Not shown to the user. It exists so that heuristics further up can decline to
 * do something clever on evidence that does not support it — a bridge does not
 * infer a clearance from ground it does not trust — and so that the debug
 * overlay can colour a floating road by the reason rather than the symptom.
 */
export type GroundConfidence = 'high' | 'medium' | 'low'

export interface ResolvedGround {
  /** Straight off the raster, unfiltered. Kept for debug and for diffing. */
  rawM: number
  /** Best estimate of BARE GROUND — the number everything should build on. */
  groundM: number
  verdict: GroundVerdict
  confidence: GroundConfidence
}

export interface GroundResolverOptions {
  /** The raw raster sampler, or null on the flat basemap. */
  rawSample: GroundSampler | null
  /** Metres → normalized planar units, for turning radii into offsets. */
  mToN: number
  /** Elevation of mean sea level in the DEM's datum. */
  seaLevelM?: number
  /**
   * Is this normalized point on mapped water? Injected rather than computed
   * here so this module stays free of OSM vocabulary and of spatial indexes.
   */
  waterAt?: ((nx: number, ny: number) => boolean) | null
  /**
   * Radius of the neighbourhood used for the robust statistic, metres.
   *
   * Wants to be comfortably wider than the objects being rejected and narrower
   * than the landforms being kept. A city block is 50–120 m across and a ship
   * 20–300 m long; real terrain features that matter to a street scene are
   * wider still. 30 m is a compromise that erases a house and keeps a hill.
   */
  windowM?: number
  /**
   * How far above its own neighbourhood floor a sample may sit before it is
   * read as an object standing ON the ground rather than as the ground.
   *
   * Deliberately generous: a genuine 5 m bank must survive, and it is far worse
   * to flatten real relief than to leave one roof in.
   */
  obstructionM?: number
  /**
   * Ground to report when there is NO raster at all — the flat basemap.
   *
   * Defaults to sea level, which is right for a standalone resolver. Inside the
   * scene it must be handed the frame's own anchor elevation instead: the frame
   * answers `anchorElevationM` with no sampler, and a resolver that answered 0
   * would put every solved profile 400 m under a site at 400 m.
   */
  flatGroundM?: number
  /**
   * Quantisation of the sample cache, metres. Samples within one cell share an
   * answer. Roads run in corridors and hundreds of ways share the same ground,
   * so this is the difference between one raster read and thousands.
   */
  cacheCellM?: number
}

export const DEFAULT_WINDOW_M = 30
export const DEFAULT_OBSTRUCTION_M = 6
export const DEFAULT_CACHE_CELL_M = 4

/**
 * Sample offsets for the neighbourhood, in units of the window radius.
 *
 * Centre plus eight compass points. FIXED and ordered, because the resolver
 * must be deterministic: the same scene and the same data have to produce the
 * same geometry every run, or a regression test is a coin toss and a debug
 * session is archaeology.
 */
const RING: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071],
]

/** Index into a 9-sample sorted ring for the ~25th percentile. */
const P25 = 2
/** …and for the median. */
const P50 = 4

export interface GroundResolver {
  /** Full answer, with provenance. */
  resolve(nx: number, ny: number): ResolvedGround
  /** Just the number — the hot path, for samplers that feed a GroundFrame. */
  groundM(nx: number, ny: number): number
  /** The unfiltered raster value, for debug overlays and diffing. */
  rawM(nx: number, ny: number): number
  /** True when a real raster is under the scene. */
  readonly hasTerrain: boolean
  /** How many distinct cells have been evaluated — a cache-effectiveness probe. */
  stats(): { cells: number }
}

/**
 * Build a resolver over a raw sampler.
 *
 * Cheap to construct and safe to rebuild: it owns a cache whose lifetime should
 * match the terrain it describes, so it is created alongside the frame and
 * thrown away with it.
 */
export function createGroundResolver(opts: GroundResolverOptions): GroundResolver {
  const raw = opts.rawSample ?? null
  const mToN = opts.mToN
  const seaLevelM = Number.isFinite(opts.seaLevelM ?? 0) ? (opts.seaLevelM ?? 0) : 0
  const waterAt = opts.waterAt ?? null
  const windowN = Math.max(0, (opts.windowM ?? DEFAULT_WINDOW_M)) * mToN
  const obstructionM = Math.max(0, opts.obstructionM ?? DEFAULT_OBSTRUCTION_M)
  const cellN = Math.max(1e-12, (opts.cacheCellM ?? DEFAULT_CACHE_CELL_M) * mToN)
  const rawFlat = opts.flatGroundM ?? seaLevelM
  const flatGroundM = Number.isFinite(rawFlat) ? rawFlat : seaLevelM

  /**
   * WHAT IS CACHED, AND WHAT DELIBERATELY IS NOT.
   *
   * The expensive half of a resolve is the nine-point neighbourhood, and it is
   * a smoothly-varying summary of a wide area, so quantising it to a few metres
   * costs nothing. The CENTRE sample is different: it is what a draped road
   * actually stands on, and rounding it to a cell turns a smooth hillside into
   * a flight of four-metre steps. That stair-casing is invisible in a unit test
   * and glaring on a slope, so the centre is always read at its true position
   * and only the neighbourhood is shared.
   */
  const ringCache = new Map<string, { floorM: number; medianM: number } | null>()

  /** A finite raster read at an exact position, or null. */
  const rawAt = (nx: number, ny: number): number | null => {
    if (!raw) return null
    const v = raw(nx, ny)
    return Number.isFinite(v) ? v : null
  }

  /** The robust summary of the area around a point, cached by cell. */
  const neighbourhood = (
    nx: number, ny: number,
  ): { floorM: number; medianM: number } | null => {
    const key = `${Math.round(nx / cellN)}:${Math.round(ny / cellN)}`
    const hit = ringCache.get(key)
    if (hit !== undefined) return hit
    const ring: number[] = []
    for (const [dx, dy] of RING) {
      const v = rawAt(nx + dx * windowN, ny + dy * windowN)
      if (v !== null) ring.push(v)
    }
    const out = ring.length < 3 ? null : (() => {
      ring.sort((a, b) => a - b)
      return {
        floorM: ring[Math.min(P25, ring.length - 1)],
        medianM: ring[Math.min(P50, ring.length - 1)],
      }
    })()
    ringCache.set(key, out)
    return out
  }

  const resolveAt = (nx: number, ny: number): ResolvedGround => {
    if (!raw) {
      return { rawM: flatGroundM, groundM: flatGroundM, verdict: 'flat', confidence: 'high' }
    }

    const centre = rawAt(nx, ny)

    // ── 1. Water wins outright ────────────────────────────────────────────────
    // A mapped water body has a known surface, and no raster reading over it is
    // evidence about the ground: it is evidence about what was floating there.
    // This is the one case where the DEM is not merely noisy but categorically
    // answering a different question.
    if (waterAt?.(nx, ny)) {
      return {
        rawM: centre ?? seaLevelM,
        groundM: seaLevelM,
        verdict: 'water',
        confidence: 'high',
      }
    }

    if (centre === null) {
      return { rawM: flatGroundM, groundM: flatGroundM, verdict: 'flat', confidence: 'low' }
    }

    // ── 2. The neighbourhood, as a robust envelope ────────────────────────────
    if (windowN <= 0) {
      return { rawM: centre, groundM: centre, verdict: 'raw', confidence: 'medium' }
    }

    const near = neighbourhood(nx, ny)
    if (!near) {
      return { rawM: centre, groundM: centre, verdict: 'raw', confidence: 'low' }
    }
    const { floorM, medianM } = near

    // ── 3. Is the centre standing ON the ground rather than being it? ─────────
    // Compared against the neighbourhood FLOOR, not its median: on the edge of
    // a dense block more than half the ring can be roof, which would drag a
    // median up and quietly bless the very reading being tested.
    if (centre - floorM > obstructionM) {
      return {
        rawM: centre,
        groundM: floorM,
        verdict: 'obstruction',
        // The floor is an estimate of ground, not a measurement of it.
        confidence: 'low',
      }
    }

    // The centre agrees with its surroundings. Use it — smoothing ground that
    // is not suspect would erase the relief this whole feature exists to show.
    return {
      rawM: centre,
      groundM: centre,
      // A neighbourhood that disagrees with itself is rough ground, a survey
      // seam, or the edge of an object we did not quite catch.
      confidence: medianM - floorM > obstructionM ? 'medium' : 'high',
      verdict: 'raw',
    }
  }

  return {
    resolve: resolveAt,
    groundM: (nx, ny) => resolveAt(nx, ny).groundM,
    rawM: (nx, ny) => rawAt(nx, ny) ?? flatGroundM,
    hasTerrain: raw !== null,
    stats: () => ({ cells: ringCache.size }),
  }
}

// ── Corridor statistics ────────────────────────────────────────────────────────

/**
 * Fewest stations worth trimming. Below this there is no distribution to be
 * robust about, and dropping the top of three samples would throw away a third
 * of the evidence to guard against an artefact that may not be there.
 */
const MIN_TRIMMABLE = 5

/** Share of the top of the distribution treated as artefact, not terrain. */
const DEFAULT_TRIM = 0.1

/**
 * How many samples to discard from one end.
 *
 * ALWAYS at least one once there is a distribution — that single dropped sample
 * IS the guarantee, and it is the whole point. A percentile does not give it:
 * the 90th percentile of six samples is the sixth, so `[0,0,0,18,0,0]` comes
 * back as 18 and the spike wins anyway. Stating the trim as a count rather than
 * a quantile makes the promise checkable — "one bad pixel cannot set this
 * height" — instead of merely likely.
 */
function trimCount(n: number, fraction: number): number {
  if (n < MIN_TRIMMABLE) return 0
  return Math.max(1, Math.floor(n * fraction))
}

/**
 * A robust "how high is the ground under this run" for LINEAR infrastructure.
 *
 * The rule this replaces was `max over the whole span`, and it is the single
 * worst vertical heuristic in the codebase: one crane, one moored ship, one
 * roof clipped by the corridor lifts an entire viaduct. On the Port Vell tiles
 * that is not hypothetical — a 300 m span there sees an 18 m spread, and the
 * three parallel decks of one bridge landed at three different heights because
 * each sampled a slightly different set of artefacts.
 *
 * A TRIMMED maximum keeps the honest intent of `max` — clear the high ground,
 * not the average ground — while refusing to let the topmost samples set it.
 * Sustained high ground survives, because a bank is many stations and an
 * artefact is few. With too few stations to trim it degrades to the plain
 * maximum, which is the right answer when there is nothing to be robust with.
 */
export function corridorHighM(
  samples: ReadonlyArray<number>,
  trimFraction = DEFAULT_TRIM,
): number {
  const clean = samples.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return 0
  const sorted = [...clean].sort((a, b) => a - b)
  return sorted[sorted.length - 1 - trimCount(sorted.length, trimFraction)]
}

/**
 * The same, mirrored: what a tunnel or a trench has to get under, robust
 * against the voids and water artefacts that make a DEM read too LOW.
 */
export function corridorLowM(
  samples: ReadonlyArray<number>,
  trimFraction = DEFAULT_TRIM,
): number {
  const clean = samples.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return 0
  const sorted = [...clean].sort((a, b) => a - b)
  return sorted[trimCount(sorted.length, trimFraction)]
}
