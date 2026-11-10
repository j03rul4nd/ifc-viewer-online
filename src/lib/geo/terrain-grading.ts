// ─── terrain-grading ──────────────────────────────────────────────────────────
// STREETS CUT THEIR OWN BENCH INTO THE HILLSIDE.
//
// ── The defect ────────────────────────────────────────────────────────────────
//
// A carriageway is level from kerb to kerb: the vertical solver gives every way
// one elevation per station, taken along its centreline, and the ribbon is
// built flat across at that height. The ground under it is not. The relief
// comes from a raster of 10–30 m cells sampled onto a mesh of ~7–10 m, which
// has never heard of the street: on a hillside it simply carries on sloping
// straight through the road.
//
// So the uphill half of every street on a slope sat INSIDE the hill, and the
// downhill half hung over it. Measured on El Carmel (Barcelona, a district of
// steep streets), 4 m either side of the centreline of 442 ground-level roads:
// the hillside stood above the carriageway at 77 % of the samples by more than
// 15 cm, at 39 % by more than half a metre, and by up to 1.5 m. A road is
// lifted 25 cm to clear the ground it lies on — so two thirds of those streets
// were being eaten along one edge, and read as torn strips of asphalt.
//
// ── The correction ────────────────────────────────────────────────────────────
//
// This is the same kind of statement beach-carve makes: where the MAP knows
// something the raster cannot resolve, the ground is corrected to agree with
// it. A street is a graded surface. Under it, and for a shoulder either side,
// the ground takes the street's own level; beyond the shoulder it returns to
// the measured hillside over a bank whose width follows the height it has to
// make up — a cut on the uphill side, a fill on the downhill one, at a slope a
// real embankment could stand at. Flat ground is untouched, because there the
// street and the raster already agree.
//
// The level is the ground ALONG the centreline, lightly smoothed, read before
// any grading. The solver then runs on the graded ground and finds, under each
// way, the bench that was cut for it.
//
// ── What it does not do ───────────────────────────────────────────────────────
//
// It never moves a bridge, a tunnel or a covered way: those are not on the
// ground, and bending the ground to them is a different decision (see the
// tunnel note in osm-scene). The caller hands over ground-level ways only.
//
// PURE: metres in a local planar frame in, a height function out. No THREE, no
// map, no terrain patch.

export interface GradedWay {
  /** Centreline, metres, in any local planar frame (x east, y north). */
  points: ReadonlyArray<{ x: number; y: number }>
  /** Half the width of the graded surface itself, metres. */
  halfWidthM: number
}

export interface StreetGradingOptions {
  /** The ground BEFORE grading, metres, at a local position. */
  groundM: (x: number, y: number) => number
  /**
   * Spacing of the mesh the correction will be applied to, metres. The bench
   * is widened by a share of it: a correction narrower than the mesh it is
   * sampled on does not exist once sampled.
   */
  spacingM: number
}

/** Horizontal run of bank per metre of height made up — a 1 : 1.5 embankment. */
export const BANK_RUN = 1.5
/** A bank is never wider than this, metres: a street does not regrade a hill. */
export const MAX_BANK_M = 18
/**
 * Share of the mesh spacing added to each side of the street as shoulder.
 *
 * More than one cell, by geometry. The ground is only ever read at the mesh's
 * vertices, so a point on the carriageway takes its height from the four
 * corners of the cell it is in — and the far corner of a cell that a diagonal
 * street merely clips is most of a cell beyond the kerb. The shoulder has to
 * hold every corner that weighs on the asphalt, or the bank starts inside it.
 */
export const SHOULDER_PER_SPACING = 1.1
/** Shoulder on a mesh so fine it needs none, metres — a kerb and a gutter. */
export const MIN_SHOULDER_M = 1.5

/**
 * How much a way's level counts against its neighbours', from its half-width.
 *
 * Ways run in bundles: a carriageway, the pavement mapped as its own way a few
 * metres uphill, a cycle track beyond that. Each reads the hillside under its
 * OWN centreline, so the pavement's level is a metre above the road's — and an
 * even blend of the two lifts the ground along the kerb straight back into the
 * asphalt, which is the defect all over again. In reality the bundle is one
 * graded surface and the carriageway sets its level; the pavement follows.
 * Width to the fourth power makes an 8 m street outweigh a 2 m path 256 to 1
 * where both are at full strength, and leaves two streets of a kind to meet as
 * equals.
 */
function precedence(halfWidthM: number): number {
  const w = Math.max(0.5, halfWidthM)
  return w * w * w * w
}

/**
 * Softening of the nearness term, metres: within about this of a centreline a
 * way's claim stops growing, so a pavement's own centreline is not a ridge
 * the carriageway beside it cannot level.
 */
const NEARNESS_M = 1

/** Side of a cell of the segment index, metres. */
const CELL_M = 24

interface Segment {
  ax: number; ay: number; bx: number; by: number
  /** Street level at each end, metres. */
  la: number; lb: number
  /** Half-width plus shoulder: inside this the ground IS the street's level. */
  core: number
  /** Which way this is a piece of. */
  way: number
  /** How much this way's level counts where several meet — see `precedence`. */
  rank: number
}

function smoothstep(t: number): number {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

/**
 * A centreline cut into stations no further apart than `stepM`, with the level
 * of the street at each.
 *
 * The level is the ground under the station, smoothed along the way by two
 * passes of a 1-2-1 kernel with the ends held: a street does not follow every
 * cell of the raster it crosses, and the ends are where it meets its
 * neighbours, which read the same ground at the same point.
 */
export function streetLevels(
  points: ReadonlyArray<{ x: number; y: number }>,
  groundM: (x: number, y: number) => number,
  stepM: number,
): { stations: Array<{ x: number; y: number }>; levelM: number[] } {
  const stations: Array<{ x: number; y: number }> = []
  if (points.length === 0) return { stations, levelM: [] }
  const step = Math.max(1, stepM)
  stations.push({ x: points[0].x, y: points[0].y })
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (!(len > 0)) continue
    const n = Math.max(1, Math.ceil(len / step))
    for (let s = 1; s <= n; s++) {
      const t = s / n
      stations.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  let level = stations.map((p) => groundM(p.x, p.y))
  for (let pass = 0; pass < 2 && level.length > 2; pass++) {
    const next = level.slice()
    for (let i = 1; i < level.length - 1; i++) next[i] = (level[i - 1] + 2 * level[i] + level[i + 1]) / 4
    level = next
  }
  return { stations, levelM: level }
}

/**
 * The corrected ground for a set of ground-level ways.
 *
 * Returns `(x, y, measuredM) → metres`, to be applied to the terrain, or null
 * when there is nothing to grade. `measuredM` is the ground at that point
 * before grading — the same surface `opts.groundM` reads.
 *
 * Where several ways reach the same point (a junction, two streets a few
 * metres apart) their levels are averaged by a steep power of their weights
 * and by their precedence, and the strongest weight decides how much of that
 * the ground takes: the answer is continuous across the junction, and on a
 * street's own bench it is that street's level, whoever's bank reaches it.
 */
export function createStreetGrading(
  ways: ReadonlyArray<GradedWay>,
  opts: StreetGradingOptions,
): ((x: number, y: number, measuredM: number) => number) | null {
  const spacing = Math.max(0.5, opts.spacingM)
  const shoulder = Math.max(MIN_SHOULDER_M, spacing * SHOULDER_PER_SPACING)
  const minBank = spacing

  const segments: Segment[] = []
  const cells = new Map<number, number[]>()
  const key = (cx: number, cy: number): number => (cx + 32768) * 65536 + (cy + 32768)

  for (let wayIndex = 0; wayIndex < ways.length; wayIndex++) {
    const way = ways[wayIndex]
    if (way.points.length < 2 || !(way.halfWidthM > 0)) continue
    const { stations, levelM } = streetLevels(way.points, opts.groundM, spacing)
    const core = way.halfWidthM + shoulder
    const rank = precedence(way.halfWidthM)
    const reach = core + MAX_BANK_M
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i - 1]
      const b = stations[i]
      const la = levelM[i - 1]
      const lb = levelM[i]
      if (!Number.isFinite(la) || !Number.isFinite(lb)) continue
      const index = segments.length
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, la, lb, core, way: wayIndex, rank })
      const cx0 = Math.floor((Math.min(a.x, b.x) - reach) / CELL_M)
      const cx1 = Math.floor((Math.max(a.x, b.x) + reach) / CELL_M)
      const cy0 = Math.floor((Math.min(a.y, b.y) - reach) / CELL_M)
      const cy1 = Math.floor((Math.max(a.y, b.y) + reach) / CELL_M)
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = key(cx, cy)
          const list = cells.get(k)
          if (list) list.push(index); else cells.set(k, [index])
        }
      }
    }
  }
  if (segments.length === 0) return null

  return (x, y, measuredM) => {
    const list = cells.get(key(Math.floor(x / CELL_M), Math.floor(y / CELL_M)))
    if (!list) return measuredM
    let sumW = 0
    let sumLevel = 0
    let strongest = 0

    // ONE answer per way — its nearest point — and only then a blend between
    // ways. Averaging every segment in reach smeared a climbing street along
    // its own length, so its bench was no longer level across.
    let way = -1
    let bestD = Infinity
    let bestLevel = 0
    let bestCore = 0
    let bestRank = 1
    const flush = (): void => {
      if (way < 0 || bestD >= bestCore + MAX_BANK_M) return
      let w = 1
      if (bestD > bestCore) {
        // The bank is as wide as the height it makes up needs, and no wider:
        // a shallow correction is over in a mesh cell, a deep cut takes its run.
        const bank = Math.min(MAX_BANK_M, Math.max(minBank, Math.abs(measuredM - bestLevel) * BANK_RUN))
        w = 1 - smoothstep((bestD - bestCore) / bank)
        if (w <= 0) return
      }
      // WHOSE GROUND IS THIS? Three things decide a way's share of a point.
      //
      //   • Its weight, steeply: a bank is where a street is handing the
      //     ground back, and it must not argue with a neighbour's bench.
      //   • Its precedence (see `precedence`).
      //   • How NEAR its centreline is. The shoulder a coarse mesh needs is
      //     wider than the gap between two hillside streets, so their benches
      //     overlap at full weight — and an even share put the step between
      //     them in the middle of the narrower one's carriageway (measured on
      //     El Carmel: a 5.5 m street 85 cm low along one kerb, 3 m above the
      //     street 16 m below it). Each point belongs to the street it is on.
      const w3 = w * w * w
      const share = (w3 * w3 * bestRank) / (bestD * bestD + NEARNESS_M * NEARNESS_M)
      sumW += share
      sumLevel += share * bestLevel
      if (w > strongest) strongest = w
    }

    // A cell's list is in segment order and a way's segments are contiguous,
    // so the ways arrive one after another.
    for (let n = 0; n < list.length; n++) {
      const s = segments[list[n]]
      if (s.way !== way) {
        flush()
        way = s.way
        bestD = Infinity
      }
      const dx = s.bx - s.ax
      const dy = s.by - s.ay
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (y - s.ay) * dy) / len2)) : 0
      const d = Math.hypot(x - (s.ax + dx * t), y - (s.ay + dy * t))
      if (d < bestD) {
        bestD = d
        bestLevel = s.la + (s.lb - s.la) * t
        bestCore = s.core
        bestRank = s.rank
      }
    }
    flush()
    if (sumW <= 0) return measuredM
    return measuredM + (sumLevel / sumW - measuredM) * strongest
  }
}
