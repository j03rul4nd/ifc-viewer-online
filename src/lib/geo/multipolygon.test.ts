// ─── multipolygon tests ───────────────────────────────────────────────────────
// The property under test: a relation's rings are what its member ways make
// JOINED, and the joining must not care what order the members are in or which
// way round each one was drawn. Every case below is a shape you can check by
// eye — a unit square, split and shuffled and reversed in the ways OSM actually
// splits, shuffles and reverses them.

import { describe, it, expect } from 'vitest'
import { assembleRings, assembleMultipolygon, type RingPoint } from './multipolygon'

const p = (lon: number, lat: number): RingPoint => ({ lat, lon })

/** Shoelace area, so "is this the right ring?" is one number. */
const area = (ring: ReadonlyArray<RingPoint>): number => {
  const r = ring.length > 1
    && ring[0].lat === ring[ring.length - 1].lat
    && ring[0].lon === ring[ring.length - 1].lon
    ? ring.slice(0, -1) : ring
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += r[j].lon * r[i].lat - r[i].lon * r[j].lat
  }
  return Math.abs(a) / 2
}

const closed = (r: ReadonlyArray<RingPoint>): boolean =>
  r.length >= 4
  && Math.abs(r[0].lat - r[r.length - 1].lat) < 1e-9
  && Math.abs(r[0].lon - r[r.length - 1].lon) < 1e-9

// The unit square, cut into the four edges a mapper would draw.
const S = p(0, 0)
const E = p(1, 0)
const NE = p(1, 1)
const N = p(0, 1)
const BOTTOM = [S, E]
const RIGHT = [E, NE]
const TOP = [NE, N]
const LEFT = [N, S]

describe('assembleRings', () => {
  it('joins members into the ring they describe', () => {
    const [ring] = assembleRings([BOTTOM, RIGHT, TOP, LEFT])
    expect(closed(ring)).toBe(true)
    expect(area(ring)).toBeCloseTo(1)
  })

  it('does not care what order the members arrive in', () => {
    const [ring] = assembleRings([TOP, LEFT, BOTTOM, RIGHT])
    expect(closed(ring)).toBe(true)
    expect(area(ring)).toBeCloseTo(1)
  })

  // THE case coastline.joinChains deliberately refuses, and the reason this
  // module exists rather than reusing it: a coastline's direction is the
  // land/water convention, a multipolygon member's direction is nothing at all.
  it('turns a member around when that is what closes the ring', () => {
    const reversedTop = [...TOP].reverse()
    const reversedLeft = [...LEFT].reverse()
    const [ring] = assembleRings([BOTTOM, RIGHT, reversedTop, reversedLeft])
    expect(closed(ring)).toBe(true)
    expect(area(ring)).toBeCloseTo(1)
  })

  it('joins a member that only meets the chain at its head', () => {
    // LEFT ends where BOTTOM starts, so it can only attach to the front.
    const [ring] = assembleRings([BOTTOM, LEFT, TOP, RIGHT])
    expect(closed(ring)).toBe(true)
    expect(area(ring)).toBeCloseTo(1)
  })

  it('keeps a member that is already a whole ring as it is', () => {
    const square = [S, E, NE, N, S]
    const rings = assembleRings([square])
    expect(rings).toHaveLength(1)
    expect(area(rings[0])).toBeCloseTo(1)
  })

  it('separates rings that do not touch — a multipolygon of two islands', () => {
    const far = [p(10, 10), p(11, 10), p(11, 11), p(10, 11), p(10, 10)]
    const rings = assembleRings([BOTTOM, RIGHT, TOP, LEFT, far])
    expect(rings).toHaveLength(2)
    expect(rings.map((r) => Math.round(area(r))).sort()).toEqual([1, 1])
  })

  // A relation clipped by the query box, or one a mapper left broken. It must
  // come back as ONE open chain for the caller to judge, not as a handful of
  // fragments each of which closes into a sliver — which is the shape of the
  // bug this module was written to end.
  it('returns an unclosable run as a single open chain', () => {
    const rings = assembleRings([BOTTOM, RIGHT, TOP])
    expect(rings).toHaveLength(1)
    expect(closed(rings[0])).toBe(false)
    expect(rings[0]).toHaveLength(4)
  })

  it('drops a member too short to be an edge', () => {
    expect(assembleRings([[p(0, 0)]])).toEqual([])
  })

  it('is deterministic — the same input assembles the same way', () => {
    const once = assembleRings([TOP, LEFT, BOTTOM, RIGHT])
    const twice = assembleRings([TOP, LEFT, BOTTOM, RIGHT])
    expect(twice).toEqual(once)
  })

  it('matches endpoints at ~10 cm, not bit-exactly', () => {
    // A shared node survives a JSON round trip and a rounding step; requiring
    // equality to the last bit would split a ring on floating-point noise.
    const nudged = [{ lat: 1 + 4e-7, lon: 1 }, N]
    const [ring] = assembleRings([BOTTOM, RIGHT, nudged, LEFT])
    expect(closed(ring)).toBe(true)
  })
})

describe('assembleMultipolygon', () => {
  const geom = (pts: RingPoint[]) => pts

  it('separates outer from inner', () => {
    const hole = [p(0.4, 0.4), p(0.6, 0.4), p(0.6, 0.6), p(0.4, 0.6), p(0.4, 0.4)]
    const res = assembleMultipolygon([
      { role: 'outer', geometry: geom(BOTTOM) },
      { role: 'outer', geometry: geom(RIGHT) },
      { role: 'outer', geometry: geom(TOP) },
      { role: 'outer', geometry: geom(LEFT) },
      { role: 'inner', geometry: geom(hole) },
    ])
    expect(res.outer).toHaveLength(1)
    expect(area(res.outer[0])).toBeCloseTo(1)
    expect(res.inner).toHaveLength(1)
    expect(area(res.inner[0])).toBeCloseTo(0.04)
  })

  // Older relations predate the role being mandatory, and OSM has always read a
  // blank role as `outer`. Dropping those loses the whole polygon.
  it('reads a blank role as outer', () => {
    const res = assembleMultipolygon([
      { geometry: geom(BOTTOM) }, { geometry: geom(RIGHT) },
      { geometry: geom(TOP) }, { geometry: geom(LEFT) },
    ])
    expect(res.outer).toHaveLength(1)
    expect(area(res.outer[0])).toBeCloseTo(1)
  })

  it('survives a member with no geometry at all', () => {
    const res = assembleMultipolygon([
      { role: 'outer', geometry: geom(BOTTOM) },
      { role: 'outer', geometry: null },
      { role: 'outer', geometry: geom(RIGHT) },
    ])
    expect(res.outer).toHaveLength(1)
    expect(res.outer[0]).toHaveLength(3)
  })

  it('answers empty for nothing', () => {
    expect(assembleMultipolygon(undefined)).toEqual({ outer: [], inner: [] })
  })
})
