// ─── building-parts tests ─────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   a part REPLACES the volume of its outline. Draw both and the outline's
//   prism stands around its own parts like shrink-wrap, visible wherever it is
//   taller than the podium — which is most of the time.
//
// The second rule, which is easy to get backwards: a part that matches no
// outline is still drawn. It is a surveyed volume with a surveyed height, and
// losing it to a bookkeeping mismatch would throw away exactly the data this
// module was added to collect.

import { describe, it, expect } from 'vitest'
import { partitionBuildingParts, ringCentroid } from './building-parts'

const square = (cx: number, cy: number, r: number) => [
  { x: cx - r, y: cy - r }, { x: cx + r, y: cy - r },
  { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r },
]

describe('ringCentroid', () => {
  it('averages the ring', () => {
    expect(ringCentroid(square(10, 20, 5))).toEqual({ x: 10, y: 20 })
  })

  it('has no opinion about an empty ring', () => {
    expect(ringCentroid([])).toBeNull()
  })
})

describe('partitionBuildingParts', () => {
  it('stands an outline down once a part describes it', () => {
    const r = partitionBuildingParts(
      [{ id: 'tower', ring: square(0, 0, 50) }],
      [{ id: 'podium', ring: square(0, 0, 40) }],
    )
    expect(r.supersededOutlines.has('tower')).toBe(true)
    expect(r.matched).toBe(1)
    expect(r.orphans).toEqual([])
  })

  it('leaves an outline with no parts alone', () => {
    // Most of a city is still plain outlines, and they must keep being drawn.
    const r = partitionBuildingParts(
      [{ id: 'block', ring: square(0, 0, 50) }],
      [{ id: 'far', ring: square(500, 500, 10) }],
    )
    expect(r.supersededOutlines.size).toBe(0)
  })

  it('keeps a part that overhangs its own footprint', () => {
    // THE REASON THIS MATCHES ON A CENTROID. Parts routinely overhang: a
    // cantilevered floor, a canopy, a crown wider than its shaft. Strict
    // containment would fail to match those and leave the building drawn twice.
    const r = partitionBuildingParts(
      [{ id: 'tower', ring: square(0, 0, 20) }],
      [{ id: 'crown', ring: square(0, 0, 35) }],
    )
    expect(r.supersededOutlines.has('tower')).toBe(true)
    expect(r.orphans).toEqual([])
  })

  it('draws a part that belongs to no outline, and says so', () => {
    // A surveyed volume with a surveyed height. Dropping it for a bookkeeping
    // mismatch would lose the data this module exists to collect.
    const r = partitionBuildingParts(
      [{ id: 'block', ring: square(0, 0, 10) }],
      [{ id: 'stray', ring: square(400, 400, 10) }],
    )
    expect(r.orphans).toEqual(['stray'])
    expect(r.matched).toBe(0)
    expect(r.supersededOutlines.size).toBe(0)
  })

  it('stands down every outline a part sits in, not just the first', () => {
    // A mall inside a block: both outlines describe volume the part replaces,
    // and leaving the outer one standing wraps the whole thing.
    const r = partitionBuildingParts(
      [
        { id: 'block', ring: square(0, 0, 100) },
        { id: 'mall', ring: square(0, 0, 60) },
      ],
      [{ id: 'part', ring: square(0, 0, 30) }],
    )
    expect(r.supersededOutlines.has('block')).toBe(true)
    expect(r.supersededOutlines.has('mall')).toBe(true)
  })

  it('counts a tower with many parts once per part, not once per outline', () => {
    // A real tower is a podium, a shaft and a crown. All three supersede the
    // same outline, and the count reports parts matched.
    const r = partitionBuildingParts(
      [{ id: 'tower', ring: square(0, 0, 50) }],
      [
        { id: 'podium', ring: square(0, 0, 45) },
        { id: 'shaft', ring: square(0, 0, 25) },
        { id: 'crown', ring: square(0, 0, 12) },
      ],
    )
    expect(r.supersededOutlines.size).toBe(1)
    expect(r.matched).toBe(3)
  })

  it('ignores a degenerate outline rather than matching against it', () => {
    const r = partitionBuildingParts(
      [{ id: 'bad', ring: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
      [{ id: 'p', ring: square(0, 0, 5) }],
    )
    expect(r.supersededOutlines.size).toBe(0)
    expect(r.orphans).toEqual(['p'])
  })

  it('survives empty inputs', () => {
    expect(partitionBuildingParts([], []).matched).toBe(0)
    expect(partitionBuildingParts([{ id: 'a', ring: square(0, 0, 5) }], []).matched).toBe(0)
  })
})
