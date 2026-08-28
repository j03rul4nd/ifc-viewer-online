// ─── coastline tests ──────────────────────────────────────────────────────────
// The convention under test: an OSM coastline is DIRECTED, with land on the
// LEFT and water on the RIGHT. Every case here is a shape where you can say by
// eye which half should be sea, so a wrong winding is immediately visible as
// "the map filled the land instead".

import { describe, it, expect } from 'vitest'
import {
  buildSeaPolygons, buildSea, approximateSea, joinChains, perimeterT, perimeterPoint,
  type LatLon, type CoastlineBbox,
} from './coastline'
import { selfIntersections, duplicateVertices } from './ring-checks'

/** A unit box around the origin — the numbers stay readable. */
const BOX: CoastlineBbox = { south: -1, west: -1, north: 1, east: 1 }

const p = (lon: number, lat: number): LatLon => ({ lat, lon })

/** Even-odd point-in-polygon, for asking "is this bit sea?". */
function contains(ring: ReadonlyArray<LatLon>, q: LatLon): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.lat > q.lat) !== (b.lat > q.lat) &&
        q.lon < ((b.lon - a.lon) * (q.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      hit = !hit
    }
  }
  return hit
}

const area = (ring: ReadonlyArray<LatLon>): number => {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j].lon + ring[i].lon) * (ring[j].lat - ring[i].lat)
  }
  return Math.abs(s / 2)
}

describe('joinChains', () => {
  it('joins ways at their shared endpoints', () => {
    const chains = joinChains([
      [p(0, -2), p(0, 0)],
      [p(0, 0), p(0, 2)],
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0]).toHaveLength(3)
  })

  it('joins in either order', () => {
    const chains = joinChains([
      [p(0, 0), p(0, 2)],
      [p(0, -2), p(0, 0)],
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0][0]).toEqual(p(0, -2))
  })

  it('leaves unrelated ways as separate chains', () => {
    expect(joinChains([[p(0, 0), p(0, 1)], [p(5, 5), p(5, 6)]])).toHaveLength(2)
  })

  it('does not reverse a way to force a join', () => {
    // Direction IS the land/water convention. Flipping a way to make it fit
    // would invert which side is sea, which is worse than not joining it.
    const chains = joinChains([[p(0, -2), p(0, 0)], [p(0, 2), p(0, 0)]])
    expect(chains).toHaveLength(2)
  })
})

describe('perimeter parameterisation', () => {
  it('runs counter-clockwise from the south-west corner', () => {
    expect(perimeterT(p(-1, -1), BOX)).toBeCloseTo(0, 9)   // SW
    expect(perimeterT(p(1, -1), BOX)).toBeCloseTo(1, 9)    // SE
    expect(perimeterT(p(1, 1), BOX)).toBeCloseTo(2, 9)     // NE
    expect(perimeterT(p(-1, 1), BOX)).toBeCloseTo(3, 9)    // NW
  })

  it('round-trips', () => {
    for (const t of [0.25, 1.5, 2.75, 3.1]) {
      expect(perimeterT(perimeterPoint(t, BOX), BOX)).toBeCloseTo(t, 9)
    }
  })
})

describe('buildSeaPolygons', () => {
  it('fills the side the convention says is water', () => {
    // Northward shoreline down the middle: land on the LEFT is the west half,
    // so the sea is the EAST half.
    const sea = buildSeaPolygons([[p(0, -2), p(0, 2)]], BOX)
    expect(sea).toHaveLength(1)
    expect(contains(sea[0], p(0.5, 0))).toBe(true)    // east: sea
    expect(contains(sea[0], p(-0.5, 0))).toBe(false)  // west: land
    // Half the box.
    expect(area(sea[0])).toBeCloseTo(2, 6)
  })

  it('fills the other side when the shoreline runs the other way', () => {
    // Southward: land on the left is now the EAST half, so the sea is the WEST.
    const sea = buildSeaPolygons([[p(0, 2), p(0, -2)]], BOX)
    expect(sea).toHaveLength(1)
    expect(contains(sea[0], p(-0.5, 0))).toBe(true)
    expect(contains(sea[0], p(0.5, 0))).toBe(false)
  })

  it('handles an east–west shore', () => {
    // Eastward, so land is to the north and the sea is the SOUTH half.
    const sea = buildSeaPolygons([[p(-2, 0), p(2, 0)]], BOX)
    expect(sea).toHaveLength(1)
    expect(contains(sea[0], p(0, -0.5))).toBe(true)
    expect(contains(sea[0], p(0, 0.5))).toBe(false)
  })

  it('follows a shoreline with a bay in it', () => {
    // A notch cut into the land — the sea reaches further west inside the bay.
    const sea = buildSeaPolygons([[
      p(0, -2), p(0, -0.5), p(-0.6, -0.3), p(-0.6, 0.3), p(0, 0.5), p(0, 2),
    ]], BOX)
    expect(sea).toHaveLength(1)
    expect(contains(sea[0], p(-0.4, 0))).toBe(true)     // inside the bay: sea
    expect(contains(sea[0], p(-0.8, 0))).toBe(false)    // behind it: land
    expect(area(sea[0])).toBeGreaterThan(2)
  })

  it('joins a shoreline mapped as several ways', () => {
    // The real case: ten ways in the benchmark district, meaningless separately.
    const whole = buildSeaPolygons([[p(0, -2), p(0, 2)]], BOX)
    const split = buildSeaPolygons([
      [p(0, -2), p(0, -0.4)],
      [p(0, -0.4), p(0, 0.4)],
      [p(0, 0.4), p(0, 2)],
    ], BOX)
    expect(split).toHaveLength(1)
    expect(area(split[0])).toBeCloseTo(area(whole[0]), 6)
  })

  it('is deterministic whatever order the ways arrive in', () => {
    const ways = [
      [p(0, -2), p(0, -0.4)],
      [p(0, -0.4), p(0, 0.4)],
      [p(0, 0.4), p(0, 2)],
    ]
    const a = buildSeaPolygons(ways, BOX)
    const b = buildSeaPolygons([...ways].reverse(), BOX)
    expect(b).toEqual(a)
  })

  it('says nothing rather than guessing when there is no shoreline', () => {
    expect(buildSeaPolygons([], BOX)).toEqual([])
  })

  it('drops a shoreline that never reaches the box', () => {
    expect(buildSeaPolygons([[p(8, 8), p(9, 9)]], BOX)).toEqual([])
  })

  it('drops a dangling shoreline that stops inside the box', () => {
    // The way continues in a tile we did not fetch. It cannot close a region,
    // and inventing the rest of it would invent a coastline.
    expect(buildSeaPolygons([[p(0, -2), p(0, 0)]], BOX)).toEqual([])
  })

  it('produces a ring that is inside the box', () => {
    const sea = buildSeaPolygons([[p(0, -2), p(0, 2)]], BOX)
    for (const q of sea[0]) {
      expect(q.lat).toBeGreaterThanOrEqual(BOX.south - 1e-9)
      expect(q.lat).toBeLessThanOrEqual(BOX.north + 1e-9)
      expect(q.lon).toBeGreaterThanOrEqual(BOX.west - 1e-9)
      expect(q.lon).toBeLessThanOrEqual(BOX.east + 1e-9)
    }
  })
})

// ── When the exact walk fails ─────────────────────────────────────────────────
// Three ways a real shoreline defeats the boundary walk, all reproduced from
// the audit. None of them fires on the benchmark harbour, whose coastline is
// clean — which is exactly why they need a net rather than a fix each. Losing
// the sea is the worst outcome available: the water vanishes and so does the
// mask that stops the elevation raster reading moored ships as ground.

describe('buildSea · the safe fallback', () => {
  /** Land north, water south, mapped in three ways — the MIDDLE one backwards. */
  const reversedMiddle: LatLon[][] = [
    [p(-2, 0), p(-0.4, 0)],
    [p(0.4, 0), p(-0.4, 0)],
    [p(0.4, 0), p(2, 0)],
  ]

  it('the exact walk really does give up on a reversed way', () => {
    // Not an assumption: the refusal to flip is deliberate in joinChains,
    // because a coastline's direction IS the land/water convention.
    expect(joinChains(reversedMiddle)).toHaveLength(3)
  })

  it('falls back rather than losing the sea entirely', () => {
    const built = buildSea(reversedMiddle, BOX)
    expect(built.quality).toBe('approximate')
    expect(built.rings).toHaveLength(1)
    // The water is on the right of travel — south of a west-to-east shore.
    expect(contains(built.rings[0], p(0, -0.5))).toBe(true)
    expect(contains(built.rings[0], p(0, 0.5))).toBe(false)
  })

  it('keeps the exact answer when there is one', () => {
    const clean: LatLon[][] = [[p(-2, 0), p(2, 0)]]
    const built = buildSea(clean, BOX)
    expect(built.quality).toBe('exact')
    expect(built.rejected).toEqual([])
  })

  // The fallback must be SAFER than the failure, not merely different. A shore
  // that wanders cannot be a line, and a half-plane through it would put water
  // over half the city — worse than drawing none.
  it('refuses to approximate a shoreline that is not straight', () => {
    // Asked of the fallback DIRECTLY: this shore chains cleanly, so the exact
    // walk answers it and the fallback is never consulted in practice. The
    // guard still has to hold, because the shore that DOES defeat the walk may
    // be just as convoluted.
    const zigzag: LatLon[][] = [
      [p(-2, 0), p(-1, 0.9)], [p(-1, 0.9), p(0, -0.9)],
      [p(0, -0.9), p(1, 0.9)], [p(1, 0.9), p(2, 0)],
    ]
    expect(approximateSea(zigzag, BOX)).toBeNull()
  })

  it('refuses a shore that does not cross the box', () => {
    expect(buildSea([[p(0, -2), p(0, 0)]], BOX).quality).toBe('none')
    expect(buildSea([[p(8, 8), p(9, 9)]], BOX).quality).toBe('none')
  })

  // Two shorelines CROSSING is not a coastline — a real one never crosses
  // itself, and OSM's own validators say so. The walk cannot make a region out
  // of it, and neither can a straight line. What matters is that the failure is
  // clean: a tangled ring must never reach the triangulator, where it becomes
  // three faces and a hole where the harbour was.
  it('never hands out a tangled ring, and says so when it can build none', () => {
    const crossing: LatLon[][] = [
      [p(-2, -0.8), p(2, -0.8)],
      [p(-0.5, -2), p(-0.5, 2)],
    ]
    const built = buildSea(crossing, BOX)
    for (const ring of built.rings) {
      expect(selfIntersections(ring), 'a ring that reaches the caller is simple').toBe(0)
      expect(duplicateVertices(ring)).toBe(0)
    }
    // Whatever it decided, it wrote down why: a silent empty answer is the one
    // outcome this whole mechanism exists to prevent.
    if (built.rings.length === 0) {
      expect(built.quality).toBe('none')
      expect(built.rejected.join(' ')).toContain('self-intersecting')
    }
  })

  it('repairs a doubled vertex rather than rejecting the ring for it', () => {
    const built = buildSea([[p(-2, 0), p(0, 0), p(0, 0), p(2, 0)]], BOX)
    expect(built.quality).toBe('exact')
    expect(duplicateVertices(built.rings[0])).toBe(0)
  })
})
