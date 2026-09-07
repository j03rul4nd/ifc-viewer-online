// ─── lane-markings tests ──────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   a marking that states more than the data does is worse than no marking.
//
// An absent lane divider costs a little realism. A divider drawn at the thirds
// of a two-way road tells a client the road is 1+2 or 2+1 when OSM never said
// so, and a turn arrow invented for an unmapped junction sends them the wrong
// way at it. The tests below are mostly about what must NOT be produced.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  laneDividers, arrowOffsets, arrowPlacements, arrowQuads, offsetByFraction,
  ARROW_LENGTH_M, ARROW_WIDTH_M, ARROW_STEM_M,
} from './lane-markings'

const v = (x: number, y: number) => new THREE.Vector2(x, y)
const straight = (len: number) => [v(0, 0), v(len, 0)]

describe('laneDividers', () => {
  it('puts a divider between each pair of lanes on a one-way road', () => {
    // Three one-way lanes have two interior boundaries, at the thirds.
    const d = laneDividers(3, true)
    expect(d).toHaveLength(2)
    expect(d[0]).toBeCloseTo(-1 / 3, 10)
    expect(d[1]).toBeCloseTo(1 / 3, 10)
  })

  it('divides a two-lane one-way road, which used to render as a blank ribbon', () => {
    // The old threshold was `lanes >= 3`, so the 53 two-lane ways in the
    // measured district carried no lane information at all.
    expect(laneDividers(2, true)).toEqual([0])
  })

  it('omits the centre line from a two-way road, since it is not a lane divider', () => {
    const d = laneDividers(4, false)
    expect(d).toHaveLength(2)
    expect(d).not.toContain(0)
    expect(d[0]).toBeCloseTo(-0.5, 10)
    expect(d[1]).toBeCloseTo(0.5, 10)
  })

  it('draws NO dividers on an odd two-way road, rather than inventing a split', () => {
    // 3 lanes two-way is 2+1 or 1+2 and the source does not say. Dividers at
    // the thirds would assert a symmetric split that exists on no street.
    expect(laneDividers(3, false)).toEqual([])
    expect(laneDividers(5, false)).toEqual([])
  })

  it('has nothing to divide below two lanes, or on unusable input', () => {
    expect(laneDividers(1, true)).toEqual([])
    expect(laneDividers(0, true)).toEqual([])
    expect(laneDividers(Number.NaN, true)).toEqual([])
  })

  it('keeps every divider strictly inside the kerbs', () => {
    for (const lanes of [2, 3, 4, 6, 8]) {
      for (const oneway of [true, false]) {
        for (const d of laneDividers(lanes, oneway)) {
          expect(Math.abs(d)).toBeLessThan(1)
        }
      }
    }
  })
})

describe('arrowOffsets', () => {
  it('centres one arrow in each lane of a one-way road', () => {
    const o = arrowOffsets(3, true)
    expect(o).toHaveLength(3)
    expect(o[0]).toBeCloseTo(-2 / 3, 10)
    expect(o[1]).toBeCloseTo(0, 10)
    expect(o[2]).toBeCloseTo(2 / 3, 10)
  })

  it('still states direction when the lane count is unmapped', () => {
    // `oneway` is mapped on 79.8% of vehicular ways and `lanes` on 63.7%, so
    // "direction known, lanes unknown" is a large real population. One arrow on
    // the centreline says the one thing we actually know.
    expect(arrowOffsets(undefined, true)).toEqual([0])
  })

  it('draws no arrows on a two-way road', () => {
    // An arrow would have to pick a side to be true of, and which lanes run
    // which way is not mapped.
    expect(arrowOffsets(4, false)).toEqual([])
    expect(arrowOffsets(undefined, false)).toEqual([])
  })

  it('places arrows between the kerbs, never on them', () => {
    for (const lanes of [1, 2, 3, 4, 6]) {
      for (const o of arrowOffsets(lanes, true)) expect(Math.abs(o)).toBeLessThan(1)
    }
  })
})

describe('arrowPlacements', () => {
  it('spaces arrows along a straight and points them down it', () => {
    const p = arrowPlacements(straight(200), 26, ARROW_LENGTH_M)
    expect(p.length).toBeGreaterThan(3)
    for (const a of p) {
      expect(a.heading.x).toBeCloseTo(1, 10)
      expect(a.heading.y).toBeCloseTo(0, 10)
    }
    // Monotonic along the way, and roughly at the requested spacing.
    for (let i = 1; i < p.length; i++) {
      expect(p[i].at.x).toBeGreaterThan(p[i - 1].at.x)
      expect(p[i].at.distanceTo(p[i - 1].at)).toBeCloseTo(26, 6)
    }
  })

  it('keeps every arrow clear of both ends of the ribbon', () => {
    // A ribbon is already trimmed to the stop line, so paint at its very end
    // reads as paint inside the junction.
    const len = 200
    const p = arrowPlacements(straight(len), 26, ARROW_LENGTH_M)
    for (const a of p) {
      expect(a.at.x).toBeGreaterThan(ARROW_LENGTH_M / 2)
      expect(a.at.x).toBeLessThan(len - ARROW_LENGTH_M / 2)
    }
  })

  it('draws nothing on a stretch too short to hold a whole arrow', () => {
    expect(arrowPlacements(straight(2), 26, ARROW_LENGTH_M)).toEqual([])
  })

  it('reverses the heading for oneway=-1 instead of pointing traffic backwards', () => {
    const p = arrowPlacements(straight(200), 26, ARROW_LENGTH_M, true)
    expect(p.length).toBeGreaterThan(0)
    for (const a of p) expect(a.heading.x).toBeCloseTo(-1, 10)
  })

  it('follows a corner rather than pointing arrows off the carriageway', () => {
    const bend = [v(0, 0), v(100, 0), v(100, 100)]
    const p = arrowPlacements(bend, 26, ARROW_LENGTH_M)
    expect(p.length).toBeGreaterThan(2)
    // Arrows past the corner run north, not east.
    const late = p[p.length - 1]
    expect(late.heading.y).toBeCloseTo(1, 6)
    expect(late.heading.x).toBeCloseTo(0, 6)
  })

  it('terminates on degenerate input instead of spinning', () => {
    expect(arrowPlacements([v(0, 0), v(0, 0), v(0, 0)], 26, ARROW_LENGTH_M)).toEqual([])
    expect(arrowPlacements([v(0, 0)], 26, ARROW_LENGTH_M)).toEqual([])
    expect(arrowPlacements(straight(200), 0, ARROW_LENGTH_M)).toEqual([])
  })

  it('refuses to allocate a city when the spacing is mis-scaled', () => {
    // The failure this guards is passing metres where normalised units were
    // wanted, which asks for millions of arrows on one street.
    expect(arrowPlacements(straight(200), 1e-6, ARROW_LENGTH_M)).toEqual([])
  })
})

describe('arrowQuads', () => {
  const place = { at: v(0, 0), heading: v(1, 0) }

  it('builds a stem and a head that together span the arrow length', () => {
    const q = arrowQuads(place, ARROW_LENGTH_M, ARROW_WIDTH_M, ARROW_STEM_M)
    expect(q).toHaveLength(2)
    const xs = q.flat().map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(-ARROW_LENGTH_M / 2, 10)
    expect(Math.max(...xs)).toBeCloseTo(ARROW_LENGTH_M / 2, 10)
  })

  it('points the head the way the placement heads', () => {
    const q = arrowQuads(place, ARROW_LENGTH_M, ARROW_WIDTH_M, ARROW_STEM_M)
    const head = q[1]
    // The tip is the forward-most vertex, and it is doubled.
    const tip = head.reduce((a, b) => (b.x > a.x ? b : a))
    expect(tip.x).toBeCloseTo(ARROW_LENGTH_M / 2, 10)
    expect(head.filter((p) => Math.abs(p.x - tip.x) < 1e-9)).toHaveLength(2)
  })

  it('makes the head wider than the stem, or it is not an arrow', () => {
    const q = arrowQuads(place, ARROW_LENGTH_M, ARROW_WIDTH_M, ARROW_STEM_M)
    const spread = (quad: THREE.Vector2[]) => {
      const ys = quad.map((p) => p.y)
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(spread(q[1])).toBeGreaterThan(spread(q[0]))
    expect(spread(q[0])).toBeCloseTo(ARROW_STEM_M, 10)
    expect(spread(q[1])).toBeCloseTo(ARROW_WIDTH_M, 10)
  })

  it('rotates with the heading instead of always lying east', () => {
    const north = arrowQuads({ at: v(0, 0), heading: v(0, 1) },
      ARROW_LENGTH_M, ARROW_WIDTH_M, ARROW_STEM_M)
    const tip = north[1].reduce((a, b) => (b.y > a.y ? b : a))
    expect(tip.y).toBeCloseTo(ARROW_LENGTH_M / 2, 10)
    expect(tip.x).toBeCloseTo(0, 10)
  })

  it('stays inside a lane at the width it is drawn', () => {
    // An arrow wider than its lane would paint over the divider beside it.
    const laneWidth = 3.2
    const q = arrowQuads(place, ARROW_LENGTH_M, ARROW_WIDTH_M, ARROW_STEM_M)
    for (const p of q.flat()) expect(Math.abs(p.y)).toBeLessThan(laneWidth / 2)
  })
})

describe('offsetByFraction', () => {
  it('runs parallel at a constant width', () => {
    const line = [v(0, 0), v(10, 0), v(20, 0)]
    const out = offsetByFraction(line, [4, 4, 4], 0.5)
    for (const p of out) expect(p.y).toBeCloseTo(2, 10)
    expect(out.map((p) => p.x)).toEqual([0, 10, 20])
  })

  it('opens with the carriageway through a flare, instead of staying parallel', () => {
    // THE POINT OF THE FUNCTION. Offsetting by one nominal distance keeps the
    // lane line where the road STARTED while the kerb walks outwards, so the
    // outer lane quietly grows and the paint stops dividing anything.
    const line = [v(0, 0), v(10, 0), v(20, 0)]
    const out = offsetByFraction(line, [3, 4.5, 6], 0.5)
    expect(out[0].y).toBeCloseTo(1.5, 10)
    expect(out[1].y).toBeCloseTo(2.25, 10)
    expect(out[2].y).toBeCloseTo(3, 10)
  })

  it('keeps lanes equal all the way through a flare', () => {
    // Two dividers on a 3-lane one-way road stay at the thirds of whatever the
    // carriageway is doing at that station.
    const line = [v(0, 0), v(50, 0)]
    const hw = [3, 9]
    const [a, b] = laneDividers(3, true).map((f) => offsetByFraction(line, hw, f))
    for (const i of [0, 1]) {
      const span = b[i].y - a[i].y
      const kerb = 2 * hw[i]
      expect(span / kerb).toBeCloseTo(1 / 3, 10)
    }
  })

  it('mirrors a negative fraction to the other side', () => {
    const line = [v(0, 0), v(10, 0)]
    const left = offsetByFraction(line, [4, 4], 0.5)
    const right = offsetByFraction(line, [4, 4], -0.5)
    for (let i = 0; i < left.length; i++) expect(left[i].y).toBeCloseTo(-right[i].y, 10)
  })

  it('returns the centreline itself at zero', () => {
    const line = [v(0, 0), v(10, 5), v(20, 0)]
    const out = offsetByFraction(line, [4, 4, 4], 0)
    for (let i = 0; i < line.length; i++) {
      expect(out[i].x).toBeCloseTo(line[i].x, 10)
      expect(out[i].y).toBeCloseTo(line[i].y, 10)
    }
  })

  it('turns a corner with the kerb rather than cutting it', () => {
    // Offset on the angle bisector, so the inside of a right angle pulls in.
    const line = [v(0, 0), v(10, 0), v(10, 10)]
    const out = offsetByFraction(line, [2, 2, 2], 1)
    expect(out).toHaveLength(3)
    // The corner vertex moves diagonally, not purely on one axis.
    expect(out[1].x).not.toBeCloseTo(10, 3)
    expect(out[1].y).not.toBeCloseTo(0, 3)
  })

  it('survives a repeated vertex without spinning it to an arbitrary angle', () => {
    const out = offsetByFraction([v(0, 0), v(5, 0), v(5, 0), v(10, 0)], [2, 2, 2, 2], 1)
    expect(out).toHaveLength(4)
    for (const p of out) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })

  it('falls back to the last stated width rather than collapsing the line', () => {
    const out = offsetByFraction([v(0, 0), v(10, 0), v(20, 0)], [3], 1)
    for (const p of out) expect(p.y).toBeCloseTo(3, 10)
  })

  it('passes a degenerate line straight through', () => {
    expect(offsetByFraction([v(1, 2)], [3], 1).map((p) => [p.x, p.y])).toEqual([[1, 2]])
  })
})
