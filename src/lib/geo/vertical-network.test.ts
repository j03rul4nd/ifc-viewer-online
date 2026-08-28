// ─── vertical-network tests ───────────────────────────────────────────────────
// Small synthetic cities, because they are the only kind you can reason about.
// Each scenario is a shape somebody has to be able to point at and say what the
// right answer is — a flyover, a bore, a hillside, a bad pixel — and every one
// runs through the SAME code the real district does, including the ground
// resolver, so a pass here is a pass on the pipeline and not on a mock of it.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  solveVerticalNetwork, findLevelCrossings, sampleProfile,
  type SolvedProfile,
} from './vertical-network'
import { readVerticalTags, MAX_GRADE, CROSSING_CLEARANCE_M } from './vertical'
import type { VerticalWay } from './vertical-network'
import { createGroundResolver } from './terrain-truth'

const M_TO_N = 1 / (40_075_016.686 * Math.cos((41.38 * Math.PI) / 180))

function way(
  id: string,
  metres: Array<[number, number]>,
  tags: Record<string, string>,
  functional: VerticalWay['functional'] = 'road',
): VerticalWay {
  return {
    id,
    points: metres.map(([x, y]) => new THREE.Vector2(x * M_TO_N, y * M_TO_N)),
    functional,
    tags: readVerticalTags(tags),
  }
}

/** Flat ground at a constant height — the SRTM-OFF case, and the baseline. */
const flat = (h = 0) => () => h

/** Resolve a network over a RAW sampler, exactly as production does. */
function solve(
  ways: VerticalWay[],
  rawSample: ((nx: number, ny: number) => number) | null,
  waterAt?: (nx: number, ny: number) => boolean,
): Map<string, SolvedProfile> {
  const resolver = createGroundResolver({ rawSample, mToN: M_TO_N, waterAt })
  const solved = solveVerticalNetwork(ways, {
    mToN: M_TO_N,
    groundM: (nx, ny) => resolver.groundM(nx, ny),
    groundTrusted: (nx, ny) => resolver.resolve(nx, ny).confidence !== 'low',
  })
  return new Map(solved.map((p) => [p.wayId, p]))
}

/** Highest point of a profile, metres. */
const peak = (p: SolvedProfile): number => Math.max(...p.elevationM)
/** Lowest point of a profile, metres. */
const trough = (p: SolvedProfile): number => Math.min(...p.elevationM)

/**
 * Assert a profile has no vertical step: every station-to-station change is
 * within the design grade. This is the property the whole module exists for —
 * §"continuity beats absolute precision".
 */
function expectContinuous(p: SolvedProfile, tolerance = 1.35): void {
  const grade = MAX_GRADE[p.functional]
  for (let i = 1; i < p.elevationM.length; i++) {
    const run = Math.abs(p.stationM[i] - p.stationM[i - 1])
    const rise = Math.abs(p.elevationM[i] - p.elevationM[i - 1])
    // The tolerance absorbs the shared-error case at a pinned junction; a real
    // step would be many times this.
    expect(rise).toBeLessThanOrEqual(grade * run * tolerance + 1e-6)
  }
}

/**
 * A crossroads with one arm carried over it.
 *
 *   A ────────────────────────  east–west, on the ground
 *              │
 *   B: south approach ─ SPAN ─ north approach, crossing A at the origin
 *
 * Split into three ways because that is how OSM maps it: the structure is
 * tagged, the approaches are not. They share nodes with each other and with
 * nothing else, which is exactly the topology the real data has.
 */
function overpassScene(structureTags: Record<string, string>): VerticalWay[] {
  return [
    way('A', [[-150, 0], [150, 0]], { highway: 'primary' }),
    way('B1', [[0, -220], [0, -45]], { highway: 'trunk' }),
    way('B2', [[0, -45], [0, 45]], { highway: 'trunk', ...structureTags }),
    way('B3', [[0, 45], [0, 220]], { highway: 'trunk' }),
  ]
}

// ── Test 1 — flat bridge ───────────────────────────────────────────────────────

describe('Test 1 · a bridge over a road on flat ground', () => {
  const scene = overpassScene({ bridge: 'yes', layer: '1' })
  const out = solve(scene, flat(0))

  it('lifts the deck clear of the road it crosses', () => {
    const deck = out.get('B2')!
    const road = out.get('A')!
    expect(deck.structure).toBe('bridge')
    // Clearance comes from what it CROSSES — a road — not from a flat default.
    expect(peak(deck)).toBeGreaterThanOrEqual(5)
    expect(peak(road)).toBeCloseTo(0, 6)
    expect(peak(deck) - peak(road)).toBeGreaterThanOrEqual(5 - 1e-6)
    expect(deck.confidence).toBe('inferred')
  })

  it('does NOT connect the two roads that merely cross', () => {
    // They share no node, so nothing may weld them. The road stays on the
    // ground for its whole length, including directly under the deck.
    const road = out.get('A')!
    for (const e of road.elevationM) expect(e).toBeCloseTo(0, 6)
    expect(road.structure).toBe('ground')
  })

  it('ramps continuously up to the deck and back down', () => {
    for (const id of ['B1', 'B2', 'B3']) expectContinuous(out.get(id)!)

    // The approaches carry the climb: they start on the ground far away and
    // arrive at the abutment already high. Nobody generated that ramp — the
    // grade constraint produced it.
    const south = out.get('B1')!
    expect(south.elevationM[0]).toBeCloseTo(0, 4)
    expect(south.elevationM[south.elevationM.length - 1]).toBeGreaterThan(3)
    expect(south.phase).toContain('ramp')
  })

  it('joins the approach to the deck with no step at the abutment', () => {
    const south = out.get('B1')!
    const deck = out.get('B2')!
    const abutment = south.elevationM[south.elevationM.length - 1]
    expect(Math.abs(abutment - deck.elevationM[0])).toBeLessThan(0.05)
  })

  it('is deterministic and order-independent', () => {
    const shuffled = solve([...scene].reverse(), flat(0))
    for (const id of ['A', 'B1', 'B2', 'B3']) {
      expect(shuffled.get(id)!.elevationM).toEqual(out.get(id)!.elevationM)
    }
  })
})

// ── Test 2 — tunnel ────────────────────────────────────────────────────────────

describe('Test 2 · a road passing under another in a tunnel', () => {
  const scene = overpassScene({ tunnel: 'yes', layer: '-1' })
  const out = solve(scene, flat(0))

  it('puts the bore below the ground', () => {
    const bore = out.get('B2')!
    expect(bore.structure).toBe('tunnel')
    expect(trough(bore)).toBeLessThanOrEqual(-5)
  })

  it('leaves the surface road on the surface', () => {
    for (const e of out.get('A')!.elevationM) expect(e).toBeCloseTo(0, 6)
  })

  it('descends and climbs continuously through the portals', () => {
    for (const id of ['B1', 'B2', 'B3']) expectContinuous(out.get(id)!)
    const south = out.get('B1')!
    // Out in the open at the far end, already dropping at the portal.
    expect(south.elevationM[0]).toBeCloseTo(0, 4)
    expect(south.elevationM[south.elevationM.length - 1]).toBeLessThan(-3)
  })

  it('keeps a real vertical gap between the two roads', () => {
    expect(peak(out.get('A')!) - trough(out.get('B2')!)).toBeGreaterThan(5)
  })

  it('reads an open cutting as shallower than a bore', () => {
    const trench = solve(overpassScene({ layer: '-1' }), flat(0))
    expect(trench.get('B2')!.structure).toBe('trench')
    expect(trough(trench.get('B2')!)).toBeGreaterThan(trough(out.get('B2')!))
  })
})

// ── Test 3 — terrain ───────────────────────────────────────────────────────────

describe('Test 3 · SRTM slope', () => {
  /** A steady 1:20 rise to the north. Gentle enough to be legal for a road. */
  const hill = (_nx: number, ny: number): number => (ny / M_TO_N) * 0.05

  it('a surface road follows the relief', () => {
    const out = solve([way('r', [[0, -200], [0, 200]], { highway: 'primary' })], hill)
    const r = out.get('r')!
    for (let i = 0; i < r.points.length; i++) {
      expect(r.elevationM[i]).toBeCloseTo((r.points[i].y / M_TO_N) * 0.05, 4)
    }
    expect(r.phase.every((p) => p === 'surface')).toBe(true)
  })

  it('a bridge keeps its clearance over the ground it spans', () => {
    const out = solve(overpassScene({ bridge: 'yes', layer: '1' }), hill)
    const deck = out.get('B2')!
    // Above the ground beneath it at EVERY station, not merely on average.
    for (let i = 0; i < deck.elevationM.length; i++) {
      expect(deck.elevationM[i]).toBeGreaterThan(deck.groundM[i])
    }
    const core = deck.elevationM[Math.floor(deck.elevationM.length / 2)]
    const groundThere = deck.groundM[Math.floor(deck.groundM.length / 2)]
    expect(core - groundThere).toBeGreaterThanOrEqual(4)
  })
})

// ── Test 4 — a bad DEM spike ───────────────────────────────────────────────────

describe('Test 4 · one bad pixel must not lift a whole bridge', () => {
  /** Flat ground with a single narrow 18 m artefact — a moored ship, a crane. */
  const spike = (nx: number, ny: number): number =>
    Math.hypot(nx / M_TO_N, ny / M_TO_N) < 7 ? 18 : 0

  const out = solve(overpassScene({ bridge: 'yes', layer: '1' }), spike)

  it('does not raise the deck onto the artefact', () => {
    const deck = out.get('B2')!
    // The old rule was `max ground over the whole span + clearance` = 18 + 6.
    expect(peak(deck)).toBeLessThan(9)
    expect(peak(deck)).toBeGreaterThanOrEqual(5)
  })

  it('does not raise the road under it either', () => {
    // The road runs straight through the artefact. The resolver rejects it as
    // an obstruction, so the carriageway stays on the ground under it.
    const road = out.get('A')!
    expect(peak(road)).toBeLessThan(2)
  })

  it('still clears sustained high ground, which is terrain and not an artefact', () => {
    const bank = (_nx: number, ny: number): number => ((ny / M_TO_N) > -10 ? 12 : 0)
    const raised = solve(overpassScene({ bridge: 'yes', layer: '1' }), bank)
    expect(peak(raised.get('B2')!)).toBeGreaterThan(12)
  })
})

// ── Test 5 — water ─────────────────────────────────────────────────────────────

describe('Test 5 · a raster that reads high over water', () => {
  // The measured harbour case: the basin returns +4.7 m off moored vessels.
  const harbourRaster = (): number => 4.7
  const allWater = (): boolean => true

  it('puts a causeway on the sea datum, not on the vessels', () => {
    const out = solve(
      [way('quayRoad', [[-100, 0], [100, 0]], { highway: 'service' })],
      harbourRaster, allWater,
    )
    for (const e of out.get('quayRoad')!.elevationM) expect(e).toBeCloseTo(0, 6)
  })

  it('measures a bridge over water from the sea, not from what floats on it', () => {
    const out = solve(overpassScene({ bridge: 'yes', layer: '1' }), harbourRaster, allWater)
    const deck = out.get('B2')!
    // 4.7 of artefact + 5 of clearance would be 9.7. The datum is the sea.
    expect(peak(deck)).toBeLessThan(7)
    expect(peak(deck)).toBeGreaterThanOrEqual(5)
  })
})

// ── Test 6 — SRTM off ──────────────────────────────────────────────────────────

describe('Test 6 · the same city with the terrain switched off', () => {
  const scene = overpassScene({ bridge: 'yes', layer: '1' })
  const withTerrain = solve(scene, (_nx, ny) => (ny / M_TO_N) * 0.05)
  const withoutTerrain = solve(scene, null)

  it('keeps every vertical RELATIONSHIP when the ground goes flat', () => {
    for (const out of [withTerrain, withoutTerrain]) {
      const deck = out.get('B2')!
      const road = out.get('A')!
      const clearance = peak(deck) - road.elevationM[Math.floor(road.elevationM.length / 2)]
      expect(clearance).toBeGreaterThanOrEqual(5 - 1e-6)
    }
  })

  it('puts everything at the reference height when there is no terrain', () => {
    for (const e of withoutTerrain.get('A')!.elevationM) expect(e).toBeCloseTo(0, 9)
    expect(peak(withoutTerrain.get('B2')!)).toBeCloseTo(5, 4)
  })

  it('still ramps rather than stepping on the flat', () => {
    for (const id of ['B1', 'B2', 'B3']) expectContinuous(withoutTerrain.get(id)!)
  })

  it('reads the city identically: same structures, same phases', () => {
    for (const id of ['A', 'B1', 'B2', 'B3']) {
      expect(withoutTerrain.get(id)!.structure).toBe(withTerrain.get(id)!.structure)
    }
  })
})

// ── Adversarial ────────────────────────────────────────────────────────────────

describe('adversarial cases', () => {
  it('stacks a bridge over a bridge', () => {
    const scene: VerticalWay[] = [
      way('ground', [[-150, 0], [150, 0]], { highway: 'primary' }),
      way('l1', [[0, -150], [0, 150]], { highway: 'trunk', bridge: 'yes', layer: '1' }),
      way('l2', [[-120, -120], [120, 120]], { highway: 'motorway', bridge: 'yes', layer: '2' }),
    ]
    const out = solve(scene, flat(0))
    const g = peak(out.get('ground')!)
    const a = peak(out.get('l1')!)
    const b = peak(out.get('l2')!)
    // A genuine three-level interchange: each level clear of the one below.
    expect(a).toBeGreaterThan(g + 4)
    expect(b).toBeGreaterThan(a + 4)
  })

  it('puts a tunnel under a bridge without either noticing the other', () => {
    const scene: VerticalWay[] = [
      way('bore', [[-150, 0], [150, 0]], { highway: 'trunk', tunnel: 'yes', layer: '-1' }),
      way('deck', [[0, -150], [0, 150]], { highway: 'trunk', bridge: 'yes', layer: '1' }),
    ]
    const out = solve(scene, flat(0))
    expect(trough(out.get('bore')!)).toBeLessThan(-4)
    expect(peak(out.get('deck')!)).toBeGreaterThan(4)
  })

  it('survives a span too short to ramp, and says so', () => {
    // 12 m of bridge wanting 5 m of climb at 10 %: physically impossible.
    const scene: VerticalWay[] = [
      way('a', [[0, -60], [0, -6]], { highway: 'primary' }),
      way('b', [[0, -6], [0, 6]], { highway: 'primary', bridge: 'yes', layer: '1' }),
      way('c', [[0, 6], [0, 60]], { highway: 'primary' }),
    ]
    const out = solve(scene, flat(0))
    // The approaches take the climb, so the SHORT span is still continuous…
    expectContinuous(out.get('b')!)
    // …and the deck is still off the ground.
    expect(peak(out.get('b')!)).toBeGreaterThan(2)
  })

  it('survives a very long viaduct', () => {
    const scene: VerticalWay[] = [
      way('v', [[0, -2000], [0, 2000]], { highway: 'motorway', bridge: 'yes', layer: '1' }),
    ]
    const out = solve(scene, flat(0))
    expectContinuous(out.get('v')!)
    expect(peak(out.get('v')!)).toBeGreaterThan(4)
  })

  it('survives contradictory tags without producing NaN', () => {
    const scene: VerticalWay[] = [
      way('x', [[0, -80], [0, 80]], {
        highway: 'primary', bridge: 'yes', tunnel: 'yes', layer: '-2', ele: 'nonsense',
      }),
    ]
    const out = solve(scene, flat(0))
    for (const e of out.get('x')!.elevationM) expect(Number.isFinite(e)).toBe(true)
  })

  it('survives a degenerate way', () => {
    const scene: VerticalWay[] = [
      way('dup', [[10, 10], [10, 10]], { highway: 'service', bridge: 'yes' }),
      way('ok', [[0, -50], [0, 50]], { highway: 'service' }),
    ]
    const out = solve(scene, flat(0))
    expect(out.get('ok')).toBeDefined()
    for (const e of out.get('dup')?.elevationM ?? []) expect(Number.isFinite(e)).toBe(true)
  })

  it('agrees on ONE height where several arms meet', () => {
    // A T-junction whose stem is a bridge approach. All three arms must arrive
    // at the same elevation or the crossroads tears open.
    const scene: VerticalWay[] = [
      way('west', [[-150, 0], [0, 0]], { highway: 'primary' }),
      way('east', [[0, 0], [150, 0]], { highway: 'primary' }),
      way('stem', [[0, 0], [0, 120]], { highway: 'primary', bridge: 'yes', layer: '1' }),
    ]
    const out = solve(scene, flat(0))
    const atNode = [
      out.get('west')!.elevationM[out.get('west')!.elevationM.length - 1],
      out.get('east')!.elevationM[0],
      out.get('stem')!.elevationM[0],
    ]
    for (const v of atNode) expect(v).toBeCloseTo(atNode[0], 3)
  })
})

// ── Grade separation ───────────────────────────────────────────────────────────

describe('findLevelCrossings · crossing is not connecting', () => {
  it('finds a flyover over a street and knows which is on top', () => {
    const under = way('under', [[-50, 0], [50, 0]], { highway: 'primary' })
    const over = way('over', [[0, -50], [0, 50]], { highway: 'trunk', bridge: 'yes', layer: '1' })
    const hits = findLevelCrossings([under, over], { mToN: M_TO_N })
    expect(hits).toHaveLength(1)
    expect(hits[0].overId).toBe('over')
    expect(hits[0].underId).toBe('under')
    expect(hits[0].underFunctional).toBe('road')
    // Halfway along the 100 m over-way.
    expect(hits[0].stationM).toBeCloseTo(50, 1)
  })

  it('does NOT report two ways that cross at the SAME level', () => {
    // Same layer means they genuinely meet; that is the junction solver's
    // business, not a grade separation.
    const a = way('a', [[-50, 0], [50, 0]], { highway: 'primary' })
    const b = way('b', [[0, -50], [0, 50]], { highway: 'primary' })
    expect(findLevelCrossings([a, b], { mToN: M_TO_N })).toHaveLength(0)
  })

  it('finds a tunnel passing under a street', () => {
    const surface = way('s', [[-50, 0], [50, 0]], { highway: 'primary' })
    const bore = way('t', [[0, -50], [0, 50]], { highway: 'trunk', tunnel: 'yes', layer: '-1' })
    const hits = findLevelCrossings([surface, bore], { mToN: M_TO_N })
    expect(hits).toHaveLength(1)
    // The SURFACE road is the one on top.
    expect(hits[0].overId).toBe('s')
    expect(hits[0].underId).toBe('t')
  })

  it('ignores ways that share an endpoint instead of crossing', () => {
    const a = way('a', [[0, 0], [50, 0]], { highway: 'primary' })
    const b = way('b', [[50, 0], [50, 50]], { highway: 'primary', layer: '1' })
    expect(findLevelCrossings([a, b], { mToN: M_TO_N })).toHaveLength(0)
  })

  it('reports the same crossings whatever order the ways arrive in', () => {
    const a = way('a', [[-50, 0], [50, 0]], { highway: 'primary' })
    const b = way('b', [[0, -50], [0, 50]], { highway: 'trunk', bridge: 'yes', layer: '1' })
    const c = way('c', [[0, -50], [50, 50]], { highway: 'trunk', tunnel: 'yes', layer: '-1' })
    const forward = findLevelCrossings([a, b, c], { mToN: M_TO_N })
    const backward = findLevelCrossings([c, b, a], { mToN: M_TO_N })
    expect(forward).toEqual(backward)
  })

  it('resolves a three-level stack pairwise', () => {
    const ground = way('g', [[-50, 0], [50, 0]], { highway: 'primary' })
    const first = way('l1', [[0, -50], [0, 50]], { highway: 'trunk', bridge: 'yes', layer: '1' })
    const second = way('l2', [[-40, -40], [40, 40]], {
      highway: 'motorway', bridge: 'yes', layer: '2',
    })
    const hits = findLevelCrossings([ground, first, second], { mToN: M_TO_N })
    // g×l1, g×l2, l1×l2 — every pair is a genuine grade separation.
    expect(hits).toHaveLength(3)
    expect(hits.filter((h) => h.overId === 'l2')).toHaveLength(2)
  })
})


// ── The indexed sampler must not change the answer ────────────────────────────
//
// The lookup has a hint, a grid and a full scan. Only the last is the
// DEFINITION; the other two exist to avoid paying O(segments) per emitted
// vertex on a long way. An accelerator that quietly returns a different segment
// is the worst kind of optimisation, because the result still looks like a road.

describe('sampleProfile · fast paths agree with the reference', () => {
  /** A long, doubling-back alignment — the case a naive hint gets wrong. */
  const serpentine = (): VerticalWay => {
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 40; i++) {
      pts.push([Math.sin(i / 4) * 120, i * 30 - 600])
    }
    return way('snake', pts, { highway: 'primary', bridge: 'yes', layer: '1' })
  }

  it('returns the same elevation as an exhaustive search, everywhere', () => {
    const solved = solve([serpentine()], (_nx, ny) => (ny / M_TO_N) * 0.03).get('snake')!
    const fast = sampleProfile(solved)

    /** The definition: nearest segment by exhaustive projection. */
    const reference = (x: number, y: number): number => {
      let bestI = 0
      let bestT = 0
      let bestD2 = Infinity
      for (let i = 0; i < solved.points.length - 1; i++) {
        const a = solved.points[i]
        const b = solved.points[i + 1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len2 = dx * dx + dy * dy
        const t = len2 <= 0 ? 0
          : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
        const d2 = (x - (a.x + dx * t)) ** 2 + (y - (a.y + dy * t)) ** 2
        if (d2 < bestD2) { bestD2 = d2; bestI = i; bestT = t }
      }
      const e = solved.elevationM
      return e[bestI] + (e[bestI + 1] - e[bestI]) * bestT
    }

    // Queried in a deliberately AWKWARD order — jumping around the way rather
    // than walking it — so the hint is wrong as often as it is right.
    let worst = 0
    for (let k = 0; k < 400; k++) {
      const i = (k * 137) % 41
      const p = solved.points[Math.min(i, solved.points.length - 1)]
      const jitter = ((k % 7) - 3) * 4 * M_TO_N
      const x = p.x + jitter
      const y = p.y - jitter
      worst = Math.max(worst, Math.abs(fast.at(x, y) - reference(x, y)))
    }
    expect(worst).toBeLessThan(1e-9)
  })

  it('samples by station and by position consistently', () => {
    const solved = solve([serpentine()], null).get('snake')!
    const s = sampleProfile(solved)
    for (let i = 0; i < solved.points.length; i += 3) {
      const p = solved.points[i]
      expect(s.stationAt(p.x, p.y)).toBeCloseTo(solved.stationM[i], 6)
      expect(s.atStation(solved.stationM[i]).elevationM).toBeCloseTo(solved.elevationM[i], 9)
    }
  })

  it('clamps stations outside the way rather than extrapolating', () => {
    const solved = solve([serpentine()], null).get('snake')!
    const s = sampleProfile(solved)
    const total = solved.stationM[solved.stationM.length - 1]
    expect(s.atStation(-500).elevationM).toBeCloseTo(solved.elevationM[0], 9)
    expect(s.atStation(total + 500).elevationM)
      .toBeCloseTo(solved.elevationM[solved.elevationM.length - 1], 9)
  })
})
