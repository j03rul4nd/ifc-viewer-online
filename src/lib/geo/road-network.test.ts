import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildRoadNetwork, solveFillet, trimPolyline, mitredBorders, endDirection,
  type NetworkWay, type RoadNetwork,
} from './road-network'

// Everything here runs in METRES with an explicit snap, so the numbers read as
// what they are. The scene builder passes `mToN` instead and the metric snap
// scales with it; the geometry is identical either way.
const SNAP = { snap: 0.3 }

const v = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y)

const GREY: [number, number, number] = [0.4, 0.4, 0.42]

function way(
  id: string, points: Array<[number, number]>, halfWidth = 4, extra: Partial<NetworkWay> = {},
): NetworkWay {
  return { id, points: points.map(([x, y]) => v(x, y)), halfWidth, tone: GREY, ...extra }
}

/** Signed area — positive means CCW, and any non-zero means it is a real face. */
function area(poly: ReadonlyArray<THREE.Vector2>): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** A polygon is star-shaped about `c` when every edge is seen from the same side. */
function starShapedAbout(poly: ReadonlyArray<THREE.Vector2>, c: THREE.Vector2): boolean {
  const sign = (i: number): number => {
    const p = poly[i].clone().sub(c)
    const q = poly[(i + 1) % poly.length].clone().sub(c)
    return Math.sign(p.x * q.y - p.y * q.x)
  }
  const first = sign(0)
  for (let i = 1; i < poly.length; i++) {
    const s = sign(i)
    if (s !== 0 && first !== 0 && s !== first) return false
  }
  return true
}

/** Shortest distance from a point to a polyline — used to prove there is no gap. */
function distanceToPolyline(p: THREE.Vector2, line: ReadonlyArray<THREE.Vector2>): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const ab = b.clone().sub(a)
    const len2 = ab.lengthSq()
    const t = len2 > 0 ? Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / len2)) : 0
    best = Math.min(best, p.distanceTo(a.clone().addScaledVector(ab, t)))
  }
  return best
}

/** Total centreline length of every ribbon — how much road survived. */
function drawnLength(net: RoadNetwork): number {
  let total = 0
  for (const r of net.ribbons) {
    for (let i = 0; i < r.centre.length - 1; i++) total += r.centre[i].distanceTo(r.centre[i + 1])
  }
  return total
}

describe('primitives', () => {
  it('endDirection skips repeated nodes, which real OSM ways carry', () => {
    const line = [v(0, 0), v(0, 0), v(5, 0)]
    expect(endDirection(line, true)!.x).toBeCloseTo(1)
    expect(endDirection([v(0, 0)], true)).toBeNull()
  })

  it('solveFillet puts a right-angle meeting one half-width out on both arms', () => {
    const f = solveFillet(v(0, 0), v(1, 0), 4, v(0, 1), 4)
    expect(f.trimA).toBeCloseTo(4)
    expect(f.trimB).toBeCloseTo(4)
    expect(f.point!.x).toBeCloseTo(4)
    expect(f.point!.y).toBeCloseTo(4)
  })

  it('solveFillet reports parallel arms instead of returning a point at infinity', () => {
    const f = solveFillet(v(0, 0), v(1, 0), 4, v(1, 0), 4)
    expect(f.point).toBeNull()
  })

  it('solveFillet trims further the tighter the wedge — that IS the flare', () => {
    // The wedge is measured from arm A counter-clockwise to arm B, so a small
    // angle is the tight one: two branches of a fork peeling apart.
    const right = solveFillet(v(0, 0), v(1, 0), 4, v(0, 1), 4).trimA
    const tight = solveFillet(
      v(0, 0), v(1, 0), 4, v(Math.cos(0.25), Math.sin(0.25)), 4,
    ).trimA
    const open = solveFillet(
      v(0, 0), v(1, 0), 4, v(Math.cos(2.9), Math.sin(2.9)), 4,
    ).trimA
    expect(tight).toBeGreaterThan(right)
    expect(right).toBeGreaterThan(open)
  })

  it('trimPolyline cuts arc length off both ends and inserts the cut vertices', () => {
    const out = trimPolyline([v(0, 0), v(10, 0), v(20, 0)], 3, 5)!
    expect(out[0].x).toBeCloseTo(3)
    expect(out[out.length - 1].x).toBeCloseTo(15)
    expect(out.some((p) => Math.abs(p.x - 10) < 1e-9)).toBe(true)
  })

  it('trimPolyline refuses to return a degenerate line when the trims overlap', () => {
    expect(trimPolyline([v(0, 0), v(10, 0)], 8, 8)).toBeNull()
  })

  it('mitred borders stay parallel to both segments at a corner', () => {
    const centre = [v(0, 0), v(10, 0), v(10, 10)]
    const { left, right } = mitredBorders(centre, [4, 4, 4])
    // The outside corner of a left turn is the right border, and it must sit at
    // the true corner of the offset lines — (14, -4) — not on the segment normal.
    expect(right[1].x).toBeCloseTo(14)
    expect(right[1].y).toBeCloseTo(-4)
    expect(left[1].x).toBeCloseTo(6)
    expect(left[1].y).toBeCloseTo(4)
  })

  it('mitred borders clamp the spike on a hairpin and fan the gap instead', () => {
    const centre = [v(0, 0), v(20, 0), v(0, 0.4)]
    const { right, joins } = mitredBorders(centre, [4, 4, 4])
    // Un-clamped, the miter at a 180-degree turn runs to infinity.
    expect(right[1].distanceTo(centre[1])).toBeLessThan(4 * 2.6)
    expect(joins.length).toBeGreaterThan(0)
  })
})

describe('topology', () => {
  it('splits a way at the node another way joins it on', () => {
    const net = buildRoadNetwork([
      way('main', [[0, 0], [50, 0], [100, 0]]),
      way('side', [[50, 0], [50, 50]]),
    ], SNAP)
    // main became two edges, side one.
    expect(net.ribbons).toHaveLength(3)
    expect(net.junctions).toHaveLength(1)
    expect(net.count).toBe(2)
  })

  it('snaps vertices that only ALMOST coincide, across grid cell boundaries', () => {
    const net = buildRoadNetwork([
      way('a', [[0, 0], [50, 0], [100, 0]]),
      way('b', [[50.05, 0.05], [50, 50]]),
    ], SNAP)
    expect(net.junctions).toHaveLength(1)
  })

  it('does not fuse the two carriageways of a dual road', () => {
    const net = buildRoadNetwork([
      way('north', [[0, 6], [100, 6]]),
      way('south', [[0, -6], [100, -6]]),
    ], SNAP)
    expect(net.junctions).toHaveLength(0)
    expect(net.ribbons).toHaveLength(2)
  })

  it('leaves a lone way untouched — no junction, no trim', () => {
    const net = buildRoadNetwork([way('solo', [[0, 0], [100, 0]])], SNAP)
    expect(net.junctions).toHaveLength(0)
    expect(net.ribbons[0].trimmedStart).toBe(false)
    expect(net.ribbons[0].centre[0].x).toBeCloseTo(0)
  })

  it('survives empty and degenerate input', () => {
    expect(buildRoadNetwork([], SNAP).count).toBe(0)
    expect(buildRoadNetwork([way('p', [[5, 5], [5, 5]])], SNAP).ribbons).toHaveLength(0)
    expect(buildRoadNetwork([way('x', [[0, 0], [1, 0]])], { snap: 0 }).count).toBe(0)
  })
})

describe('junction surfaces', () => {
  const expectSaneJunction = (net: RoadNetwork): void => {
    for (const j of net.junctions) {
      expect(j.polygon.length).toBeGreaterThanOrEqual(3)
      expect(Math.abs(area(j.polygon))).toBeGreaterThan(0)
      // Fan-triangulated from `at`, so it MUST be star-shaped about it or the
      // fan folds over itself and shows as a dark self-overlapping wedge.
      expect(starShapedAbout(j.polygon, j.at)).toBe(true)
      for (const p of j.polygon) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    }
  }

  it('T junction: one surface, both arms pulled back off the node', () => {
    const net = buildRoadNetwork([
      way('main', [[-100, 0], [0, 0], [100, 0]]),
      way('side', [[0, 0], [0, -100]]),
    ], SNAP)
    expect(net.junctions).toHaveLength(1)
    expectSaneJunction(net)
    for (const r of net.ribbons) expect(r.trimmedStart || r.trimmedEnd).toBe(true)
  })

  it('X crossing of unequal widths: the surface spans the WIDER road', () => {
    const net = buildRoadNetwork([
      way('wide', [[-100, 0], [0, 0], [100, 0]], 8),
      way('narrow', [[0, -100], [0, 0], [0, 100]], 3),
    ], SNAP)
    expect(net.junctions).toHaveLength(1)
    expectSaneJunction(net)
    const j = net.junctions[0]
    expect(j.halfWidth).toBeCloseTo(8)
    // Every corner of the crossing has to be inside the box the two roads span.
    for (const p of j.polygon) {
      expect(Math.abs(p.x)).toBeLessThan(20)
      expect(Math.abs(p.y)).toBeLessThan(20)
    }
  })

  it('irregular angles are handled by the same solver, with no special case', () => {
    for (const deg of [20, 47, 90, 133, 168]) {
      const a = (deg * Math.PI) / 180
      const net = buildRoadNetwork([
        way('main', [[-100, 0], [0, 0], [100, 0]]),
        way('skew', [[0, 0], [100 * Math.cos(a), 100 * Math.sin(a)]]),
      ], SNAP)
      expect(net.junctions).toHaveLength(1)
      expectSaneJunction(net)
    }
  })

  it('a fork flares: the tighter the split, the further the BRANCHES pull back', () => {
    // The gore of a fork belongs to the branches, not to the trunk: the wedge
    // between the two branches is the tight one, and it is their borders that
    // meet far downstream. The trunk arrives into a pair of wide wedges and
    // barely gives up anything — which is exactly how a real fork looks.
    const branchTrim = (deg: number): number => {
      const a = (deg * Math.PI) / 180
      const net = buildRoadNetwork([
        way('trunk', [[-100, 0], [0, 0]]),
        way('left', [[0, 0], [100 * Math.cos(a), 100 * Math.sin(a)]]),
        way('right', [[0, 0], [100 * Math.cos(a), -100 * Math.sin(a)]]),
      ], SNAP)
      expect(net.junctions).toHaveLength(1)
      const left = net.ribbons.find((r) => r.id.startsWith('left'))!
      return left.centre[0].length()
    }
    expect(branchTrim(10)).toBeGreaterThan(branchTrim(45))
    expect(branchTrim(45)).toBeGreaterThan(0)
  })

  it('a near-parallel slip road clamps instead of trimming to infinity', () => {
    const a = (2 * Math.PI) / 180
    const net = buildRoadNetwork([
      way('main', [[-400, 0], [0, 0], [400, 0]]),
      way('slip', [[0, 0], [400 * Math.cos(a), 400 * Math.sin(a)]]),
    ], SNAP)
    expect(net.junctions).toHaveLength(1)
    // Exact geometry would put the border meeting ~230 m away. Capped at five
    // half-widths, the junction stays a junction rather than eating the street.
    for (const p of net.junctions[0].polygon) expect(Math.abs(p.x)).toBeLessThan(4 * 5 + 1)
    expect(drawnLength(net)).toBeGreaterThan(1000)
  })

  it('never swallows a short link between two junctions', () => {
    const net = buildRoadNetwork([
      way('westCross', [[-10, -60], [-10, 0], [-10, 60]], 10),
      way('eastCross', [[10, -60], [10, 0], [10, 60]], 10),
      way('link', [[-10, 0], [10, 0]], 10),
    ], SNAP)
    const link = net.ribbons.find((r) => r.id.startsWith('link'))
    expect(link).toBeDefined()
    expect(link!.centre.length).toBeGreaterThanOrEqual(2)
    expect(net.junctions).toHaveLength(2)
  })

  it('degree-2 continuation gets a taper, not a junction and not a step', () => {
    const net = buildRoadNetwork([
      way('narrow', [[-100, 0], [0, 0]], 3),
      way('wide', [[0, 0], [100, 0]], 9),
    ], SNAP)
    expect(net.junctions).toHaveLength(0)
    const narrow = net.ribbons.find((r) => r.id.startsWith('narrow'))!
    const last = narrow.halfWidths[narrow.halfWidths.length - 1]
    // It ends at the wide road's width and starts at its own.
    expect(last).toBeCloseTo(9, 1)
    expect(narrow.halfWidths[0]).toBeCloseTo(3, 1)
    // Monotone, so the blend never doubles back on itself.
    for (let i = 1; i < narrow.halfWidths.length; i++) {
      expect(narrow.halfWidths[i]).toBeGreaterThanOrEqual(narrow.halfWidths[i - 1] - 1e-9)
    }
  })
})

describe('roundabouts, with no roundabout-specific code', () => {
  /** A ring of `n` vertices with `arms` radial approaches on it. */
  function roundabout(radius: number, n: number, arms: number): RoadNetwork {
    const ring: Array<[number, number]> = []
    for (let i = 0; i <= n; i++) {
      const a = (i % n) * ((2 * Math.PI) / n)
      ring.push([radius * Math.cos(a), radius * Math.sin(a)])
    }
    const ways = [way('ring', ring, 4)]
    for (let k = 0; k < arms; k++) {
      const i = Math.round((k * n) / arms)
      const a = i * ((2 * Math.PI) / n)
      ways.push(way(`arm${k}`, [
        [radius * Math.cos(a), radius * Math.sin(a)],
        [(radius + 120) * Math.cos(a), (radius + 120) * Math.sin(a)],
      ], 5))
    }
    return buildRoadNetwork(ways, SNAP)
  }

  it('splits the ring into one arc per entry and solves each entry as a node', () => {
    const net = roundabout(20, 32, 4)
    expect(net.junctions).toHaveLength(4)
    // 4 arcs + 4 approaches.
    expect(net.ribbons).toHaveLength(8)
  })

  it('closes the seam wherever the mapper started drawing the circle', () => {
    // The ring's first vertex is NOT an entry here, so the old code left the
    // loop open exactly there. Every entry must still be a full junction.
    const net = roundabout(20, 36, 3)
    expect(net.junctions).toHaveLength(3)
    for (const j of net.junctions) expect(j.polygon.length).toBeGreaterThanOrEqual(3)
  })

  it('leaves no gap between an arc, its entry surface and the approach', () => {
    const net = roundabout(25, 48, 4)
    for (const j of net.junctions) {
      for (const r of net.ribbons) {
        for (const end of [r.centre[0], r.centre[r.centre.length - 1]]) {
          // Any ribbon end near this node must land ON the junction surface —
          // within its own half-width of the polygon boundary. A gap here is
          // the visible tear the old renderer had at every roundabout entry.
          if (end.distanceTo(j.at) > j.halfWidth * 6) continue
          expect(distanceToPolyline(end, [...j.polygon, j.polygon[0]]))
            .toBeLessThan(Math.max(...r.halfWidths) * 1.5)
        }
      }
    }
  })

  it('keeps a ring that nothing connects to as a single closed edge', () => {
    const net = roundabout(20, 24, 0)
    expect(net.junctions).toHaveLength(0)
    expect(net.ribbons).toHaveLength(1)
    // Head and tail meet, so the loop reads as a ring rather than as an arc.
    const r = net.ribbons[0]
    expect(r.centre[0].distanceTo(r.centre[r.centre.length - 1])).toBeLessThan(0.31)
  })

  it('produces a ring whose asphalt is continuous around the circle', () => {
    const net = roundabout(20, 32, 4)
    const arcs = net.ribbons.filter((r) => r.id.startsWith('ring'))
    const perimeter = 2 * Math.PI * 20
    const drawnArc = arcs.reduce((sum, r) => {
      let l = 0
      for (let i = 0; i < r.centre.length - 1; i++) l += r.centre[i].distanceTo(r.centre[i + 1])
      return sum + l
    }, 0)
    // The junctions eat the rest; between them the arcs must still cover most
    // of the ring, and never more than it.
    expect(drawnArc).toBeGreaterThan(perimeter * 0.4)
    expect(drawnArc).toBeLessThanOrEqual(perimeter + 1)
  })
})

describe('curves and borders', () => {
  it('a wide curve keeps both borders at the full half-width', () => {
    const centre: Array<[number, number]> = []
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * (Math.PI / 2)
      centre.push([80 * Math.cos(a), 80 * Math.sin(a)])
    }
    const net = buildRoadNetwork([way('curve', centre, 5)], SNAP)
    const r = net.ribbons[0]
    for (let i = 0; i < r.centre.length; i++) {
      expect(r.centre[i].distanceTo(r.left[i])).toBeGreaterThan(4.9)
      expect(r.centre[i].distanceTo(r.right[i])).toBeGreaterThan(4.9)
      // Mitred, so the offset grows only marginally on a gentle turn — the old
      // per-segment buffer was exactly 5 and left the wedge between segments.
      expect(r.centre[i].distanceTo(r.left[i])).toBeLessThan(5.2)
    }
  })

  it('a sharp turn emits the join fan that covers what the miter cannot', () => {
    const net = buildRoadNetwork([way('elbow', [[0, 0], [60, 0], [60, 60]], 6)], SNAP)
    expect(net.ribbons[0].joins.length).toBeGreaterThan(0)
  })

  it('borders and half-widths stay in step with the centreline', () => {
    const net = buildRoadNetwork([
      way('a', [[0, 0], [40, 10], [80, -5], [120, 0]], 4),
      way('b', [[40, 10], [40, 90]], 6),
    ], SNAP)
    for (const r of net.ribbons) {
      expect(r.left).toHaveLength(r.centre.length)
      expect(r.right).toHaveLength(r.centre.length)
      expect(r.halfWidths).toHaveLength(r.centre.length)
    }
  })
})

describe('markings travel with the edge', () => {
  it('carries lane count and one-way through to the ribbon', () => {
    const net = buildRoadNetwork([
      way('ave', [[0, 0], [200, 0]], 12, { centreLine: true, lanes: 4, oneway: false }),
    ], SNAP)
    expect(net.ribbons[0].lanes).toBe(4)
    expect(net.ribbons[0].centreLine).toBe(true)
    expect(net.ribbons[0].oneway).toBe(false)
  })
})
