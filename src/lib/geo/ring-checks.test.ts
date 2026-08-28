// ─── ring-checks / feature-audit tests ────────────────────────────────────────
// The unit level. These predicates are the ones the generator and the benchmark
// both lean on, so they have to be right on shapes small enough to check by eye
// — a unit square, a bowtie, a sliver — before they are trusted on a harbour.

import { describe, it, expect } from 'vitest'
import {
  ringMetrics, selfIntersections, duplicateVertices, ringProblems,
} from './ring-checks'
import { censusFeatures, sourceIdOf, type SceneProbe } from './feature-audit'
import type { FeatureLoss, OsmFeature } from './osm-features'

/** A square this many metres on a side, at a latitude where the maths is real. */
const LAT = 41.3687
const M_LAT = 111_132
const M_LON = 111_320 * Math.cos((LAT * Math.PI) / 180)
const square = (sideM: number): Array<{ lat: number; lon: number }> => {
  const dLat = sideM / M_LAT
  const dLon = sideM / M_LON
  return [
    { lat: LAT, lon: 0 }, { lat: LAT, lon: dLon },
    { lat: LAT + dLat, lon: dLon }, { lat: LAT + dLat, lon: 0 },
  ]
}

describe('ringMetrics', () => {
  it('measures a square in metres, not degrees', () => {
    const m = ringMetrics(square(100))
    expect(m.areaM2).toBeCloseTo(10_000, -1)
    expect(m.perimeterM).toBeCloseTo(400, 0)
    expect(m.widthM).toBeCloseTo(100, 0)
    expect(m.heightM).toBeCloseTo(100, 0)
    expect(m.verts).toBe(4)
  })

  // The failure this guards: measuring in raw degrees makes everything north of
  // the equator wider than it is, in one axis only, by 1/cos(latitude). At
  // Barcelona that is a third.
  it('does not confuse a degree of longitude with a degree of latitude', () => {
    const m = ringMetrics([
      { lat: LAT, lon: 0 }, { lat: LAT, lon: 0.001 },
      { lat: LAT + 0.001, lon: 0.001 }, { lat: LAT + 0.001, lon: 0 },
    ])
    // One thousandth of a degree is ~111 m of latitude but only ~83 m of
    // longitude here, so the box is plainly not square.
    expect(m.heightM / m.widthM).toBeGreaterThan(1.2)
  })

  it('answers zero for nothing rather than NaN', () => {
    expect(ringMetrics([])).toEqual({ verts: 0, areaM2: 0, perimeterM: 0, widthM: 0, heightM: 0 })
  })
})

describe('selfIntersections', () => {
  it('is zero for a simple polygon', () => {
    expect(selfIntersections(square(100))).toBe(0)
  })

  it('finds the crossing in a bowtie', () => {
    const bowtie = [
      { lat: 0, lon: 0 }, { lat: 1, lon: 1 },
      { lat: 0, lon: 1 }, { lat: 1, lon: 0 },
    ]
    expect(selfIntersections(bowtie)).toBeGreaterThan(0)
  })

  it('does not count neighbouring edges as crossing each other', () => {
    // Adjacent edges share a vertex by construction; a naive test reports every
    // corner of every polygon as an intersection.
    expect(selfIntersections([
      { lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 },
    ])).toBe(0)
  })
})

describe('duplicateVertices', () => {
  it('ignores the repeat that closes a ring', () => {
    const s = square(50)
    expect(duplicateVertices([...s, s[0]])).toBe(0)
  })

  it('counts a genuine repeat', () => {
    const s = square(50)
    expect(duplicateVertices([...s, s[1]])).toBe(1)
  })
})

describe('ringProblems', () => {
  it('passes a real polygon', () => {
    expect(ringProblems(square(50))).toEqual([])
  })

  it('names a sliver, a tangle and a stub', () => {
    expect(ringProblems([{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }]))
      .toEqual(['fewer-than-three-vertices'])
    expect(ringProblems(square(0.05))).toContain('near-zero-area')
    expect(ringProblems([
      { lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 0, lon: 1 }, { lat: 1, lon: 0 },
    ])).toContain('self-intersecting')
  })
})

describe('censusFeatures', () => {
  const feature = (id: string): OsmFeature => ({
    id, kind: 'road', ring: square(20),
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0 },
  })
  const probes: readonly SceneProbe[] = [
    { key: 'roads', match: (t) => t['highway'] !== undefined },
  ]

  it('counts what reached the scene and what did not', () => {
    const elements = [
      { type: 'way', id: 1, tags: { highway: 'residential' } },
      { type: 'way', id: 2, tags: { highway: 'footway' } },
    ]
    const losses: FeatureLoss[] = [
      { id: 'w2', tags: { highway: 'footway' }, stage: 'classify', reason: 'test-reason' },
    ]
    const c = censusFeatures(elements, [feature('w1')], losses, probes)
    expect(c.probes[0]).toMatchObject({ key: 'roads', input: 2, reached: 1, unaccounted: [] })
    expect(c.probes[0].lost[0].reason).toBe('test-reason')
    expect(c.lossByReason).toEqual({ 'test-reason': 1 })
  })

  // The column that matters: something vanished and nobody said why.
  it('reports an unexplained disappearance rather than hiding it', () => {
    const elements = [{ type: 'way', id: 9, tags: { highway: 'service' } }]
    const c = censusFeatures(elements, [], [], probes)
    expect(c.probes[0].unaccounted).toEqual(['w9'])
    expect(c.probes[0].lost).toEqual([])
  })

  it('credits a relation whose ring became several features', () => {
    // `r45-0` and `r45-1` are both the relation reaching the scene, not two
    // relations, and a census that missed that would report a loss that is not
    // one every time a multipolygon has two outer rings.
    expect(sourceIdOf('r45-1')).toBe('r45')
    const elements = [{ type: 'relation', id: 45, tags: { highway: 'pedestrian' } }]
    const c = censusFeatures(elements, [feature('r45-0'), feature('r45-1')], [], probes)
    expect(c.probes[0]).toMatchObject({ input: 1, reached: 1, unaccounted: [] })
  })
})
