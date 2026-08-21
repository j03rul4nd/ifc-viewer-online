import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createSuppressor, footprintFromBounds, expandPolygon, pointInPolygon,
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
    // OSM outlines and surveyed ones never agree to the metre. Without a skirt,
    // a mapped building offset by a couple of metres survives as a sliver.
    const offset = square('building', 'b1', 47, 0, 20)
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
