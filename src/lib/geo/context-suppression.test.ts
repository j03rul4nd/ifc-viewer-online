import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createSuppressor, footprintFromBounds, expandPolygon, pointInPolygon,
  convexHull, overlapArea, polygonArea,
  DEFAULT_POLICY, facilityKindFromTree, type ModelFootprint,
} from './context-suppression'
import type { OsmFeature, LatLonPoint } from './osm-features'

// A trivial planar projection: lat/lon ARE the planar axes here, so the
// geometry under test is readable as coordinates rather than as Mercator.
const project = (p: LatLonPoint): { x: number; y: number } => ({ x: p.lon, y: p.lat })

/** A 100 x 100 unit plot centred on the origin. */
const plot = (kind: ModelFootprint['kind'] = 'building', marginN = 0): ModelFootprint => ({
  polygon: [
    new THREE.Vector2(-50, -50), new THREE.Vector2(50, -50),
    new THREE.Vector2(50, 50), new THREE.Vector2(-50, 50),
  ],
  kind,
  marginN,
})

const feature = (
  kind: OsmFeature['kind'], id: string, coords: Array<[number, number]>,
): OsmFeature => ({
  id, kind,
  ring: coords.map(([x, y]) => ({ lon: x, lat: y })),
  height: { heightM: 10, minHeightM: 0, estimated: true },
  style: { roofShape: 'flat', roofHeightM: 0 },
})

const node = (kind: OsmFeature['kind'], id: string, x: number, y: number): OsmFeature => ({
  id, kind, point: { lon: x, lat: y },
  height: { heightM: 8, minHeightM: 0, estimated: true },
  style: { roofShape: 'flat', roofHeightM: 0 },
})

/** A square feature of `size`, centred on (cx, cy). */
const square = (
  kind: OsmFeature['kind'], id: string, cx: number, cy: number, size: number,
): OsmFeature => {
  const h = size / 2
  return feature(kind, id, [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]])
}

describe('geometry primitives', () => {
  it('tests a point against a polygon', () => {
    const poly = plot().polygon
    expect(pointInPolygon({ x: 0, y: 0 }, poly)).toBe(true)
    expect(pointInPolygon({ x: 80, y: 0 }, poly)).toBe(false)
  })

  it('grows a polygon outward from its centroid', () => {
    const grown = expandPolygon(plot().polygon, 10)
    // The corners move out along the diagonal, so each axis gains 10/sqrt(2).
    expect(Math.max(...grown.map((p) => p.x))).toBeGreaterThan(50)
    expect(Math.min(...grown.map((p) => p.x))).toBeLessThan(-50)
  })
})

describe('a BUILDING replaces the building on its plot — and nothing else', () => {
  const suppress = createSuppressor([plot('building')], project)

  it('drops the mapped building the model stands on', () => {
    expect(suppress(square('building', 'b1', 0, 0, 60))).toBe(false)
  })

  it('keeps the building next door', () => {
    expect(suppress(square('building', 'b2', 200, 0, 60))).toBe(true)
  })

  it('drops trees and signals standing inside the plan', () => {
    expect(suppress(node('tree', 't1', 10, 10))).toBe(false)
    expect(suppress(node('signal', 's1', -20, 30))).toBe(false)
  })

  it('keeps the street outside — a tower does not describe the avenue', () => {
    // The failure that makes people switch a feature like this off: a model
    // near a road deleting the road.
    expect(suppress(feature('road', 'r1', [[-500, 0], [500, 0]]))).toBe(true)
    expect(suppress(feature('rail', 'k1', [[-500, 20], [500, 20]]))).toBe(true)
  })

  it('keeps ground cover, which the building simply covers', () => {
    expect(suppress(square('green', 'g1', 0, 0, 40))).toBe(true)
    expect(suppress(square('water', 'w1', 0, 0, 40))).toBe(true)
  })
})

describe('a BRIDGE replaces the infrastructure it IS', () => {
  const suppress = createSuppressor([plot('bridge')], project)

  it('drops the mapped bridge and the way it carries', () => {
    expect(suppress(feature('bridge', 'x1', [[-30, 0], [30, 0]]))).toBe(false)
    expect(suppress(feature('road', 'r1', [[-30, 0], [30, 0]]))).toBe(false)
    expect(suppress(feature('rail', 'k1', [[-30, 0], [30, 0]]))).toBe(false)
  })

  it('leaves the buildings at either end standing', () => {
    expect(suppress(square('building', 'b1', 0, 0, 60))).toBe(true)
  })

  it('does not take a road that merely crosses underneath and leaves', () => {
    // A way clipping the footprint must not vanish for its whole length; that
    // is why coverage is a fraction and not "any vertex inside".
    const crossing = feature('road', 'r2', [
      [-800, -40], [-400, -40], [0, -40], [400, -40], [800, -40],
    ])
    expect(suppress(crossing)).toBe(true)
  })
})

describe('a TUNNEL takes the alignment but never the surface', () => {
  const suppress = createSuppressor([plot('tunnel')], project)

  it('drops the carriageway and track on its line', () => {
    expect(suppress(feature('road', 'r1', [[-30, 0], [30, 0]]))).toBe(false)
    expect(suppress(feature('rail', 'k1', [[-30, 0], [30, 0]]))).toBe(false)
  })

  it('keeps the trees and buildings ABOVE it — they are still there', () => {
    // The distinction that makes tunnels their own case: a tunnel occupies the
    // same plan as the city on top of it, and that city has not gone anywhere.
    expect(suppress(node('tree', 't1', 0, 0))).toBe(true)
    expect(suppress(square('building', 'b1', 0, 0, 60))).toBe(true)
  })
})

describe('policy', () => {
  it('an unknown facility behaves as a building — the conservative answer', () => {
    expect(DEFAULT_POLICY.unknown).toEqual(DEFAULT_POLICY.building)
  })

  it('honours an explicit override over the default', () => {
    const keep = createSuppressor([plot('building')], project, { building: false })
    expect(keep(square('building', 'b1', 0, 0, 60))).toBe(true)
    const alsoRoads = createSuppressor([plot('building')], project, { road: true })
    expect(alsoRoads(feature('road', 'r1', [[-10, 0], [10, 0]]))).toBe(false)
  })

  it('is a constant pass with no footprints, so the flat map pays nothing', () => {
    const none = createSuppressor([], project)
    expect(none(square('building', 'b1', 0, 0, 60))).toBe(true)
  })

  it('ignores a degenerate footprint rather than suppressing everything', () => {
    const bad = createSuppressor(
      [{ polygon: [new THREE.Vector2(0, 0), new THREE.Vector2(1, 1)], kind: 'building', marginN: 0 }],
      project,
    )
    expect(bad(square('building', 'b1', 0, 0, 60))).toBe(true)
  })

  it('the margin reaches a mapped outline that misses the surveyed one', () => {
    // OSM outlines and surveyed ones never agree to the metre. This one sits
    // almost entirely outside the plan and shares a tenth of itself with it —
    // too little to read as the same building, so without a skirt it survives
    // as a sliver along the wall. The skirt is what closes that gap.
    const offset = square('building', 'b1', 58, 0, 20)
    expect(createSuppressor([plot('building', 0)], project)(offset)).toBe(true)
    expect(createSuppressor([plot('building', 12)], project)(offset)).toBe(false)
  })
})

describe('footprintFromBounds', () => {
  it('maps the plan corners of a world AABB through the caller conversion', () => {
    const fp = footprintFromBounds(
      { center: { x: 10, y: 5, z: -20 }, size: { x: 40, y: 100, z: 60 } },
      (wx, wz) => ({ x: wx, y: wz }),
      'building', 0,
    )
    expect(fp.polygon).toHaveLength(4)
    expect(Math.min(...fp.polygon.map((p) => p.x))).toBeCloseTo(-10)
    expect(Math.max(...fp.polygon.map((p) => p.x))).toBeCloseTo(30)
    expect(Math.min(...fp.polygon.map((p) => p.y))).toBeCloseTo(-50)
    expect(Math.max(...fp.polygon.map((p) => p.y))).toBeCloseTo(10)
    // Height is irrelevant to a footprint and must not leak into it.
    expect(fp.kind).toBe('building')
  })
})

describe('facilityKindFromTree', () => {
  interface Node { ifcClass: string; children: Node[] }
  const n = (ifcClass: string, children: Node[] = []): Node => ({ ifcClass, children })

  it('reads a plain building through project and site', () => {
    expect(facilityKindFromTree([n('IFCPROJECT', [n('IFCSITE', [n('IFCBUILDING')])])]))
      .toBe('building')
  })

  it('reads the IFC4x3 infrastructure facilities', () => {
    const at = (cls: string) => facilityKindFromTree([n('IFCPROJECT', [n('IFCSITE', [n(cls)])])])
    expect(at('IFCBRIDGE')).toBe('bridge')
    expect(at('IFCROAD')).toBe('road')
    expect(at('IFCRAILWAY')).toBe('railway')
    expect(at('IFCTUNNEL')).toBe('tunnel')
  })

  it('is case-insensitive, because schema casing in the wild is not consistent', () => {
    expect(facilityKindFromTree([n('IfcBridge')])).toBe('bridge')
  })

  it('refuses to guess from a bare IfcFacility', () => {
    // "Some facility" is not enough to start deleting streets over.
    expect(facilityKindFromTree([n('IFCPROJECT', [n('IFCSITE', [n('IFCFACILITY')])])]))
      .toBe('unknown')
  })

  it('never infers from a name — only from the class', () => {
    expect(facilityKindFromTree([{ ifcClass: 'IFCBUILDING' } as never])).toBe('building')
    expect(facilityKindFromTree([])).toBe('unknown')
    expect(facilityKindFromTree(null)).toBe('unknown')
  })
})

describe('an ORIENTED footprint beats an axis-aligned box', () => {
  // The Cerdà grid puts every building at 45 degrees to the world axes, so this
  // is not an edge case here — it is the normal case.
  const DIAG = Math.SQRT1_2

  /** A 40 x 20 plan rotated 45 degrees, as four oriented corners. */
  const oriented = (): THREE.Vector2[] => {
    const half: Array<[number, number]> = [[-20, -10], [20, -10], [20, 10], [-20, 10]]
    return half.map(([x, y]) => new THREE.Vector2(
      (x - y) * DIAG, (x + y) * DIAG,
    ))
  }

  it('the axis-aligned box of the same plan is much larger', () => {
    const poly = oriented()
    const w = Math.max(...poly.map((p) => p.x)) - Math.min(...poly.map((p) => p.x))
    const h = Math.max(...poly.map((p) => p.y)) - Math.min(...poly.map((p) => p.y))
    // 40 x 20 = 800 of real plan; the box around it is over 1700.
    expect(w * h).toBeGreaterThan(800 * 2)
  })

  it('spares the neighbour that the box would have deleted', () => {
    // A building sitting off the rotated plan's corner: inside the axis-aligned
    // box, outside the actual outline. With the box it vanishes — somebody
    // else's building deleted because ours is on a diagonal.
    const neighbour = square('building', 'n1', 18, 18, 6)

    const withOriented = createSuppressor(
      [{ polygon: oriented(), kind: 'building', marginN: 0 }], project,
    )
    const withBox = createSuppressor([{
      polygon: [
        new THREE.Vector2(-21.2, -21.2), new THREE.Vector2(21.2, -21.2),
        new THREE.Vector2(21.2, 21.2), new THREE.Vector2(-21.2, 21.2),
      ],
      kind: 'building', marginN: 0,
    }], project)

    expect(withBox(neighbour), 'the box eats the neighbour').toBe(false)
    expect(withOriented(neighbour), 'the real outline spares it').toBe(true)
  })

  it('still takes the building actually under the plan', () => {
    const under = square('building', 'u1', 0, 0, 10)
    expect(createSuppressor(
      [{ polygon: oriented(), kind: 'building', marginN: 0 }], project,
    )(under)).toBe(false)
  })
})

describe('the model inside the mapped polygon', () => {
  // The other direction of overlap, and the one that made a mapped block stand
  // through a temple: OSM draws one outline around a whole precinct, the model
  // is one building inside it, and not a single vertex of the OSM ring is
  // anywhere near the model. Vertex coverage is zero, so the old test never
  // fired however large the margin was.

  it('takes the precinct that the model stands in', () => {
    // 200 x 200 around the 100 x 100 plot: four times the area, plainly "the
    // same object, drawn coarsely".
    const precinct = square('building', 'p1', 0, 0, 200)
    expect(createSuppressor([plot()], project)(precinct)).toBe(false)
  })

  it('leaves a polygon far larger than the model alone', () => {
    // 400 x 400 is sixteen times the plan. That is a block or a campus, and
    // deleting it because a model sits somewhere inside is the failure this
    // guard exists to prevent.
    const district = square('building', 'd1', 0, 0, 400)
    expect(createSuppressor([plot()], project)(district)).toBe(true)
  })

  it('leaves a same-sized neighbour that does not contain the model', () => {
    const neighbour = square('building', 'n1', 300, 300, 200)
    expect(createSuppressor([plot()], project)(neighbour)).toBe(true)
  })

  it('still obeys the policy: a building model does not delete the park it is in', () => {
    // Containment is not a licence to ignore what a facility is entitled to
    // replace. `green` is not in the building policy, so the park stays.
    const park = square('green', 'g1', 0, 0, 200)
    expect(createSuppressor([plot()], project)(park)).toBe(true)
  })

  it('works with an unknown facility kind, which is what most IFC files are', () => {
    const precinct = square('building', 'p2', 0, 0, 180)
    expect(createSuppressor([plot('unknown')], project)(precinct)).toBe(false)
  })
})

describe('plans that simply overlap, with neither inside the other', () => {
  // The case both other directions are blind to, and the one that put a mapped
  // hall through the east flank of a surveyed temple: a neighbour that pushes
  // part of its plan into the model's. Vertex coverage tops out at 0.5 for a
  // rectangle with two corners inside, and the model's centre is still on its
  // own side of the wall, so nothing fired.

  it('takes the mapped building standing through the model', () => {
    // 40 x 40 at x = 50: half of it is inside the 100 x 100 plot.
    const through = square('building', 't1', 50, 0, 40)
    expect(createSuppressor([plot()], project)(through)).toBe(false)
  })

  it('leaves the neighbour that only clips a corner', () => {
    // 20 x 20 sharing a 4 x 4 corner — 4% of its plan. Two buildings meeting at
    // a corner is how cities are built, and deleting one of them is not a fix.
    const corner = square('building', 'c1', 56, 56, 20)
    expect(createSuppressor([plot()], project)(corner)).toBe(true)
  })

  it('leaves a block far larger than the model that it happens to reach into', () => {
    // 400 x 400 covering half the plot. It shares plenty of ground, but it is
    // sixteen times the model: an urban block, not a description of this
    // building — so the area guard keeps it, same as for containment.
    const block = square('building', 'b1', 200, 0, 400)
    expect(createSuppressor([plot()], project)(block)).toBe(true)
  })

  it('keeps obeying the policy — an overlapping park is still a park', () => {
    const park = square('green', 'g2', 50, 0, 40)
    expect(createSuppressor([plot()], project)(park)).toBe(true)
  })

  it('survives the normalized frame, where a building spans 1e-7 at x ≈ 0.38', () => {
    // The frame every real call arrives in. Run on absolute coordinates the
    // clipper cuts on cancellation noise instead of on geometry — the trap that
    // put an inferred roof a kilometre from its own building.
    const O = 0.377_281
    const M = 1e-7
    const model: ModelFootprint = {
      polygon: [
        new THREE.Vector2(O - M, O - M), new THREE.Vector2(O + M, O - M),
        new THREE.Vector2(O + M, O + M), new THREE.Vector2(O - M, O + M),
      ],
      kind: 'building',
      marginN: 0,
    }
    // Reaches into the model's east half without covering its centre, and with
    // only two of its four corners inside: invisible to the other two tests.
    const half = feature('building', 'n1', [
      [O + 0.1 * M, O - 0.5 * M], [O + 2 * M, O - 0.5 * M],
      [O + 2 * M, O + 0.5 * M], [O + 0.1 * M, O + 0.5 * M],
    ])
    const away = feature('building', 'n2', [
      [O + 4 * M, O - M], [O + 6 * M, O - M], [O + 6 * M, O + M], [O + 4 * M, O + M],
    ])
    const keep = createSuppressor([model], project)
    expect(keep(half), 'the hall standing in the model goes').toBe(false)
    expect(keep(away), 'the one down the street stays').toBe(true)
  })
})

describe('overlap geometry', () => {
  const unit = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ]

  it('hulls a square to itself, counter-clockwise', () => {
    const hull = convexHull([...unit].reverse())
    expect(hull).toHaveLength(4)
    expect(polygonArea(hull)).toBeCloseTo(100)
    // Signed area positive = counter-clockwise, which is what the clipper needs.
    let twice = 0
    for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
      twice += (hull[j].x + hull[i].x) * (hull[i].y - hull[j].y)
    }
    expect(twice).toBeGreaterThan(0)
  })

  it('drops the interior points that no hull needs', () => {
    expect(convexHull([...unit, { x: 5, y: 5 }, { x: 2, y: 8 }])).toHaveLength(4)
  })

  it('measures what two plans share', () => {
    const shifted = unit.map((p) => ({ x: p.x + 5, y: p.y }))
    expect(overlapArea(shifted, convexHull(unit))).toBeCloseTo(50)
    expect(overlapArea(unit, convexHull(unit))).toBeCloseTo(100)
  })

  it('is zero when the plans miss each other', () => {
    const away = unit.map((p) => ({ x: p.x + 40, y: p.y }))
    expect(overlapArea(away, convexHull(unit))).toBe(0)
  })

  it('clips a polygon that pokes out of both ends', () => {
    // A long hall crossing the plot completely: the shared part is the plot's
    // own width, not the hall's length.
    const hall = [{ x: -20, y: 3 }, { x: 30, y: 3 }, { x: 30, y: 7 }, { x: -20, y: 7 }]
    expect(overlapArea(hall, convexHull(unit))).toBeCloseTo(40)
  })
})

// ── The case that sent this module back for a second look ─────────────────────
//
// Real geometry, from scripts/blender/hotel_vela_site.py, itself generated from
// the OSM survey of the W Barcelona: metres east/north of the plot centroid.
// The user loaded the federated model, turned the map on, and the mapped block
// stood through it. Both halves of that are reproduced here — the footprint
// that cannot claim the plot, and the one that can.

describe('context-suppression · the Hotel Vela plot', () => {
  const PLOT: Array<[number, number]> = [
    [44.12, 34.97], [19.36, 38.30], [19.44, 40.73], [-7.72, 44.41],
    [-7.95, 41.98], [-83.22, 52.06], [-81.09, 47.99], [-83.08, 46.95],
    [-58.21, 0.51], [-63.46, -39.19], [8.23, -48.49], [12.53, -38.76],
    [16.13, -38.11], [15.39, -32.82], [18.46, -32.62], [28.30, -12.01],
    [25.49, -11.62], [43.54, 27.23], [41.05, 28.36],
  ]
  /** way 908035013, `building:part` — the sail itself. */
  const TOWER: Array<[number, number]> = [
    [-22.06, -4.29], [-58.21, 0.51], [-63.46, -39.19], [-27.37, -43.85],
    [-26.32, -36.32], [-29.03, -35.27], [-28.81, -33.70], [-21.31, -36.26],
    [-9.11, -38.90], [4.71, -39.45], [16.13, -38.11], [15.05, -31.81],
    [16.99, -32.07], [17.33, -29.52], [15.36, -29.25], [18.00, -23.47],
    [9.61, -19.65], [-3.73, -15.77], [-17.36, -14.30], [-26.06, -14.58],
    [-25.86, -13.00], [-23.19, -12.84],
  ]

  const mapped = feature('building', 'w908035012', PLOT)

  /** Plan corners of an axis-aligned box, which is what the viewer reports. */
  const boxOf = (pts: Array<[number, number]>): THREE.Vector2[] => {
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
    return [new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0),
            new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)]
  }
  const footprint = (polygon: THREE.Vector2[]): ModelFootprint =>
    ({ polygon, kind: 'building', marginN: 2 })

  /** A plant room and two risers, which is an MEP model of a hotel in plan. */
  const SERVICES = boxOf([[-30, -30], [-10, -30], [-10, -10], [-30, -10]])

  it('the architectural file claims the plot it stands on', () => {
    const keep = createSuppressor([footprint(boxOf(TOWER))], project)
    expect(keep(mapped)).toBe(false)
  })

  it('the services file on its own does NOT — and must not', () => {
    // 400 m2 against 8 466 m2. Letting a footprint that small delete the
    // polygon around it is how a bus shelter deletes a city block; the module
    // is right to refuse, and the fix belongs upstream in what it is handed.
    expect(polygonArea(PLOT.map(([x, y]) => ({ x, y })))).toBeGreaterThan(8000)
    const keep = createSuppressor([footprint(SERVICES)], project)
    expect(keep(mapped)).toBe(true)
  })

  it('the delivery as a whole claims it, whichever file loaded last', () => {
    const keep = createSuppressor(
      [footprint(SERVICES), footprint(boxOf(TOWER))], project)
    expect(keep(mapped)).toBe(false)
  })

  it('leaves the neighbour across the street alone', () => {
    // 40 m east of the plot's eastern edge: a block of its own, the same size,
    // sharing no ground with the model. Nothing about the fix above may reach
    // it — deleting the street is the failure mode this module fears most.
    const neighbour = feature('building', 'w-neighbour',
      PLOT.map(([x, y]) => [x + 130, y] as [number, number]))
    const keep = createSuppressor(
      [footprint(SERVICES), footprint(boxOf(TOWER))], project)
    expect(keep(neighbour)).toBe(true)
  })
})
