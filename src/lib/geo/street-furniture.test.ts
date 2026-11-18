// ─── street-furniture tests ───────────────────────────────────────────────────
// Position is data; FACING is inferred. These pin the inference rules down,
// because every one of them fails silently: a bench facing a hedge, a signal
// mast in the middle of the carriageway and a lamp arm pointing at a facade
// all render, and all pass any check that only counts instances.

import { describe, it, expect } from 'vitest'
import { planFurniture, planSignals } from './street-furniture'
import { resolveFeatureStyle, type OsmFeature, type LatLonPoint } from './osm-features'

const LAT = 41.39
const LON = 2.17
const kLon = 111_320 * Math.cos((LAT * Math.PI) / 180)
/** Metres east/north of the anchor, as lat/lon. */
const at = (x: number, y: number): LatLonPoint => ({ lat: LAT + y / 111_320, lon: LON + x / kLon })
/** Local metres, the frame the planners work in (flat approximation is exact enough here). */
const toLocal = (p: LatLonPoint) => ({ x: (p.lon - LON) * kLon, y: (p.lat - LAT) * 111_320 })

const H = { heightM: 1, minHeightM: 0, estimated: true }
function way(id: string, tags: Record<string, string>, pts: LatLonPoint[], widthM: number): OsmFeature {
  return { id, kind: 'road', ring: pts, widthM, height: H, style: resolveFeatureStyle('road', tags) }
}
function node(id: string, kind: 'furniture' | 'signal', tags: Record<string, string>, p: LatLonPoint): OsmFeature {
  return { id, kind, point: p, height: H, style: resolveFeatureStyle(kind, tags) }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < eps

describe('planFurniture — a bench faces the path it sits beside', () => {
  const footway = way('w1', { highway: 'footway' }, [at(-50, 0), at(50, 0)], 3)

  it('faces south when it stands north of an east-west path', () => {
    const [p] = planFurniture([footway, node('n1', 'furniture', { amenity: 'bench' }, at(0, 3))], toLocal)
    expect(p.slot).toBe('bench')
    expect(near(p.at.yaw, -Math.PI / 2)).toBe(true)
    // It stays where it was surveyed: it is already beside the path.
    expect(p.at.y).toBeCloseTo(3, 1)
  })

  it('obeys a tagged direction over any inference', () => {
    const [p] = planFurniture([footway, node('n2', 'furniture', { amenity: 'bench', direction: 'E' }, at(0, 3))], toLocal)
    expect(near(p.at.yaw, 0)).toBe(true)
  })

  it('moves a bench surveyed ON the path out to its edge, still facing it', () => {
    const [p] = planFurniture([footway, node('n3', 'furniture', { amenity: 'bench' }, at(10, 0.2))], toLocal)
    expect(Math.abs(p.at.y)).toBeGreaterThanOrEqual(1.5)
    // Facing back across the path: toward y = 0.
    expect(Math.sign(Math.sin(p.at.yaw))).toBe(-Math.sign(p.at.y))
  })

  it('prefers the park path to the avenue behind it', () => {
    const avenue = way('w2', { highway: 'secondary' }, [at(-50, 8), at(50, 8)], 12)
    const [p] = planFurniture([footway, avenue, node('n4', 'furniture', { amenity: 'bench' }, at(0, 2.5))], toLocal)
    expect(near(p.at.yaw, -Math.PI / 2)).toBe(true)
  })
})

describe('planFurniture — lamps', () => {
  const street = way('w3', { highway: 'residential' }, [at(-60, 0), at(60, 0)], 10)

  it('stands a street lamp at the kerb with its arm over the carriageway', () => {
    const [p] = planFurniture([street, node('n5', 'furniture', { highway: 'street_lamp' }, at(0, 1))], toLocal)
    expect(p.slot).toBe('lamp-street')
    expect(Math.abs(p.at.y)).toBeGreaterThan(5)            // out of the 10 m carriageway
    expect(Math.sign(Math.sin(p.at.yaw))).toBe(-Math.sign(p.at.y)) // arm back toward the road
  })

  it('draws a park lantern on a path far from traffic, and nothing for a wall lamp', () => {
    const path = way('w4', { highway: 'footway' }, [at(-60, 40), at(60, 40)], 3)
    const plans = planFurniture([street, path,
      node('n6', 'furniture', { highway: 'street_lamp' }, at(0, 42)),
      node('n7', 'furniture', { highway: 'street_lamp', lamp_mount: 'wall' }, at(0, 7))], toLocal)
    expect(plans.map((p) => p.slot)).toEqual(['lamp-park'])
  })
})

describe('planSignals — the mast stands at the kerb, facing the traffic it controls', () => {
  it('puts a one-way street’s signal at the RIGHT kerb, lenses toward oncoming traffic', () => {
    // Traffic runs east. Right of travel is south.
    const road = way('w5', { highway: 'secondary', oneway: 'yes' }, [at(-50, 0), at(0, 0), at(50, 0)], 7)
    const plans = planSignals([road, node('n8', 'signal', { highway: 'traffic_signals', 'traffic_signals:direction': 'forward' }, at(0, 0))], toLocal)
    expect(plans).toHaveLength(1)
    expect(plans[0].at.y).toBeLessThan(-3.5)               // south kerb, outside the carriageway
    expect(near(plans[0].at.yaw, Math.PI)).toBe(true)      // facing west, into the traffic
  })

  it('adds the left-kerb mast on a wide one-way street, as the Eixample does', () => {
    const road = way('w6', { highway: 'primary', oneway: 'yes', lanes: '4' }, [at(-50, 0), at(0, 0), at(50, 0)], 14)
    const plans = planSignals([road, node('n9', 'signal', { highway: 'traffic_signals' }, at(0, 0))], toLocal)
    expect(plans).toHaveLength(2)
    expect(plans.map((p) => Math.sign(p.at.y)).sort()).toEqual([-1, 1])
    for (const p of plans) expect(near(p.at.yaw, Math.PI)).toBe(true)
  })

  it('controls both directions of a two-way street when the survey does not say', () => {
    const road = way('w7', { highway: 'residential' }, [at(-50, 0), at(0, 0), at(50, 0)], 8)
    const plans = planSignals([road, node('n10', 'signal', { highway: 'traffic_signals' }, at(0, 0))], toLocal)
    expect(plans).toHaveLength(2)
    const east = plans.find((p) => near(p.at.yaw, Math.PI))!   // controls eastbound, stands south
    const west = plans.find((p) => near(p.at.yaw, 0))!         // controls westbound, stands north
    expect(east.at.y).toBeLessThan(0)
    expect(west.at.y).toBeGreaterThan(0)
  })

  it('reads backward as the travel direction against the way', () => {
    const road = way('w8', { highway: 'residential' }, [at(-50, 0), at(0, 0), at(50, 0)], 8)
    const plans = planSignals([road, node('n11', 'signal', { highway: 'traffic_signals', 'traffic_signals:direction': 'backward' }, at(0, 0))], toLocal)
    expect(plans).toHaveLength(1)
    expect(plans[0].at.y).toBeGreaterThan(0)
    expect(near(plans[0].at.yaw, 0)).toBe(true)
  })

  it('gives a signalised crossing a head at each kerb, facing each other', () => {
    const road = way('w9', { highway: 'secondary', oneway: 'yes' }, [at(-50, 0), at(0, 0), at(50, 0)], 10)
    const plans = planSignals([road, node('n12', 'signal', { highway: 'crossing', crossing: 'traffic_signals' }, at(0, 0))], toLocal)
    expect(plans.every((p) => p.kind === 'pedestrian')).toBe(true)
    expect(plans).toHaveLength(2)
    const [a, b] = plans
    expect(Math.sign(a.at.y)).toBe(-Math.sign(b.at.y))
    for (const p of plans) {
      expect(Math.abs(p.at.y)).toBeGreaterThan(5)
      expect(Math.sign(Math.sin(p.at.yaw))).toBe(-Math.sign(p.at.y))  // looking across the road
    }
  })

  it('never stands a mast inside any carriageway', () => {
    const road = way('w10', { highway: 'residential' }, [at(-50, 0), at(0, 0), at(50, 0)], 8)
    const plans = planSignals([road,
      node('n13', 'signal', { highway: 'traffic_signals', crossing: 'traffic_signals' }, at(0, 0))], toLocal)
    for (const p of plans) expect(Math.abs(p.at.y)).toBeGreaterThan(4)
  })
})
