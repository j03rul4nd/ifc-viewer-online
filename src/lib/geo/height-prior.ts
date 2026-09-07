// ─── height-prior ─────────────────────────────────────────────────────────────
// WHAT AN UNTAGGED BUILDING IS PROBABLY LIKE *HERE*.
//
// ── The measurement that motivates this file ──────────────────────────────────
//
// In the Lujiazui benchmark patch, 937 building outlines are mapped and 4.2% of
// them carry `height`. The other ~750 fall through to a global constant — an
// untagged `building=yes` is drawn 8 m tall. Measured against the 276 buildings
// in the SAME patch whose height is actually known:
//
//     median 60.8 m, p25 19.2 m, p75 185 m, max 632 m
//     `building=yes` alone (n=207): median 55.0 m
//
// So the constant we substitute is the FIFTEENTH PERCENTILE of what the district
// measurably is. Three quarters of Lujiazui gets drawn as a car park with a few
// towers standing in it, and that single number explains more of "the Shanghai
// map looks wrong" than roads, textures and terrain combined.
//
// ── Why a prior rather than a better source ───────────────────────────────────
//
// Because there is no free per-building height source for this city. Overture
// was queried over the same bbox and returned 59% MORE footprints with not one
// additional height. GHSL's 100 m height raster puts 15.0 m on the Shanghai
// Tower, 8.9 m on the Oriental Pearl and 15.9 m in the middle of the Huangpu
// river. Google Open Buildings does not cover China. See
// `docs/GIS_DATA_SOURCES_RESEARCH.md` for the numbers.
//
// What IS available is the patch's own surveyed buildings. Using their measured
// distribution as the fallback keeps the guess derived from data, and makes it
// adapt: tall in Lujiazui, low in a village, with no per-city configuration.
//
// ── It is still a guess, and says so ──────────────────────────────────────────
//
// Nothing here promotes a building to `estimated: false`. The prior moves the
// fallback from "wrong everywhere" to "typical of here", which is the honest
// ceiling without a height source — and the audit and confidence overlay go on
// reporting every one of these as assumed.
//
// PURE: samples in, a lookup out. No tags parsing, no THREE, no I/O.

/** One building whose height is actually known, used to inform the rest. */
export interface HeightSample {
  /** The `building` / `building:part` value, lowercased. Empty means untyped. */
  type: string
  areaM2: number
  heightM: number
}

/**
 * How many surveyed buildings a rung needs before it may answer.
 *
 * A median of three is not a distribution, and the failure it guards is
 * specific: one supertall among two low blocks would hand its height to every
 * untagged building in the patch.
 */
export const MIN_PRIOR_SAMPLES = 8

/**
 * Footprint that separates "a building on a plot" from "a building on a block",
 * m².
 *
 * Not a guess: in the benchmark patch the median surveyed height below this is
 * 19.2 m and above it 134.4 m, and log-area against log-height correlates at
 * r = 0.42. Size carries real signal about height, so the prior conditions on
 * it — but only as a two-way split, because with 72 samples the finer bands are
 * not monotonic and any smoother curve would be fitting the noise.
 */
export const PRIOR_SIZE_SPLIT_M2 = 1000

/**
 * Types whose height is a property of what they ARE, not of where they are.
 *
 * A shed is 3 m in Lujiazui and 3 m in a village. Handing these the district
 * median is how a prior turns a plausible fallback into an absurd one, and a
 * 55 m bicycle shed is a worse error than the 8 m tower it was meant to fix.
 */
export const LOCALLY_INVARIANT_TYPES: ReadonlySet<string> = new Set([
  'shed', 'garage', 'garages', 'hut', 'carport', 'roof', 'bicycle_parking',
  'kiosk', 'toilets', 'container', 'tent',
])

export interface HeightPrior {
  /**
   * Typical height for a building of this type and size in the patch, or null
   * when the evidence does not support one and the caller should keep its own
   * constant.
   */
  heightFor(type: string | undefined, areaM2: number): number | null
  /** How many surveyed buildings the prior was built from. Null when unusable. */
  readonly sampleCount: number
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const bandOf = (areaM2: number): 'small' | 'large' =>
  areaM2 >= PRIOR_SIZE_SPLIT_M2 ? 'large' : 'small'

/**
 * Build the patch's own height distribution.
 *
 * The lookup is a LADDER, and each rung has to earn the right to answer with
 * `MIN_PRIOR_SAMPLES`:
 *
 *   1. same type, same size band — the most specific thing the patch supports
 *   2. same size band, any type  — a type nobody here has surveyed
 *   3. nothing                   — the caller keeps its global constant
 *
 * THE LADDER NEVER CROSSES A SIZE BAND, and that is not tidiness — it is the
 * result of a rung that was in here and had to come out. An earlier version
 * fell from (type, band) to (type, any size), which reads as the reasonable
 * thing to do. In the benchmark patch it is a disaster: there is not ONE
 * surveyed `building=yes` under 1000 m², so the type rung answered from the
 * surveyed towers and handed **67.2 m to 120 small footprints, 33 of them under
 * 200 m²**. The prior would have replaced "every building 8 m" with "every shed
 * a tower", which is a louder wrong answer than the one it was fixing.
 *
 * Size is the axis on which being wrong is absurd; type is the axis on which
 * being wrong is merely imprecise. So size is never given up, and a type with
 * no local evidence at its own size falls to its neighbours of that size —
 * which in the same patch yields 19.2 m for those 120 footprints.
 *
 * Type still earns its place at rung 1: `residential` in the patch measures
 * 19.2 m against `commercial` at 182.5 m, and one number for both would be no
 * better than the constant this replaces.
 */
export function buildHeightPrior(samples: ReadonlyArray<HeightSample>): HeightPrior {
  const byTypeBand = new Map<string, number[]>()
  const byBand = new Map<string, number[]>()

  let used = 0
  for (const s of samples) {
    if (!Number.isFinite(s.heightM) || s.heightM <= 0) continue
    if (!Number.isFinite(s.areaM2) || s.areaM2 <= 0) continue
    const type = (s.type ?? '').toLowerCase()
    // A shed teaches nothing about the district and would drag its median down.
    if (LOCALLY_INVARIANT_TYPES.has(type)) continue
    used++
    const band = bandOf(s.areaM2)
    const push = (m: Map<string, number[]>, k: string): void => {
      const list = m.get(k)
      if (list) list.push(s.heightM)
      else m.set(k, [s.heightM])
    }
    push(byTypeBand, `${type}|${band}`)
    push(byBand, band)
  }

  const pick = (m: Map<string, number[]>, k: string): number | null => {
    const list = m.get(k)
    return list && list.length >= MIN_PRIOR_SAMPLES ? median(list) : null
  }

  return {
    sampleCount: used,
    heightFor(rawType, areaM2) {
      const type = (rawType ?? '').toLowerCase()
      if (LOCALLY_INVARIANT_TYPES.has(type)) return null
      if (!Number.isFinite(areaM2) || areaM2 <= 0) return null
      const band = bandOf(areaM2)
      return pick(byTypeBand, `${type}|${band}`)
        ?? pick(byBand, band)
    },
  }
}
