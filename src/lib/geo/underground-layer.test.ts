import { describe, expect, it } from 'vitest'
import type { OsmFeature } from './osm-features'
import { createGroundFrame } from './ground-frame'
import {
  buildUndergroundLayer, depthProfile, fullDepthM, LAYER_STEP_M, portalEnds, selectUnderground,
  TYPICAL_DEPTH_M, type UndergroundWay,
} from './underground-layer'

const vertical = (structure: string, layer = 0) => ({
  structure, layer, eleM: null, minHeightM: null, heightM: null, overWater: false,
}) as unknown as OsmFeature['vertical']

function way(id: string, kind: 'road' | 'rail', pts: Array<[number, number]>, extra: Partial<OsmFeature> = {}): OsmFeature {
  return {
    id, kind, ring: pts.map(([lat, lon]) => ({ lat, lon })),
    height: {} as OsmFeature['height'], style: {} as OsmFeature['style'], ...extra,
  } as OsmFeature
}

const BCN: Array<[number, number]> = [[41.3800, 2.1700], [41.3810, 2.1712], [41.3820, 2.1724]]

describe('selectUnderground', () => {
  it('keeps road and rail tunnels and underground platforms, as their own systems', () => {
    const out = selectUnderground([
      way('w1', 'road', BCN, { vertical: vertical('tunnel'), functional: 'road' as OsmFeature['functional'] }),
      way('w2', 'rail', BCN, { vertical: vertical('tunnel', -2), style: { railSystem: 'subway' } as OsmFeature['style'] }),
      way('w3', 'rail', BCN, { vertical: vertical('tunnel'), style: { railSystem: 'rail' } as OsmFeature['style'] }),
      way('w4', 'rail', [...BCN, BCN[0]], { vertical: vertical('ground', -2), style: { railKind: 'platform' } as OsmFeature['style'] }),
    ])
    expect(out.map((w) => w.system)).toEqual(['road', 'metro', 'rail', 'platform'])
  })

  it('leaves arcades, trenches, surface ways and pedestrian tunnels out', () => {
    expect(selectUnderground([
      way('a', 'road', BCN, { vertical: vertical('covered') }),
      way('b', 'road', BCN, { vertical: vertical('trench', -1) }),
      way('c', 'road', BCN, { vertical: vertical('ground') }),
      way('d', 'road', BCN, { vertical: vertical('tunnel'), functional: 'pedestrian' as OsmFeature['functional'] }),
    ])).toEqual([])
  })
})

describe('depth', () => {
  it('uses the system’s typical depth, with layer deepening the order', () => {
    expect(fullDepthM({ system: 'metro', layer: -1 })).toBe(TYPICAL_DEPTH_M.metro)
    expect(fullDepthM({ system: 'metro', layer: -3 })).toBe(TYPICAL_DEPTH_M.metro + 2 * LAYER_STEP_M)
  })

  it('ramps a road tunnel out at a portal, and only there', () => {
    const w: UndergroundWay = { id: 'r', system: 'road', points: BCN.map(([lat, lon]) => ({ lat, lon })), widthM: 7, layer: -1 }
    const portals = portalEnds([w])
    const d = depthProfile(w, [0, 100, 500, 900, 1000], portals)
    expect(d[0]).toBe(0)
    expect(d[4]).toBe(0)
    expect(d[2]).toBe(TYPICAL_DEPTH_M.road)
    // 6 % grade: 100 m in is 6 m down.
    expect(d[1]).toBeCloseTo(6)
  })

  it('does not ramp a metro line at the edge of the box', () => {
    const w: UndergroundWay = { id: 'm', system: 'metro', points: BCN.map(([lat, lon]) => ({ lat, lon })), widthM: 4.5, layer: -1 }
    expect(portalEnds([w]).size).toBe(0)
    expect(depthProfile(w, [0, 500], new Set())).toEqual([TYPICAL_DEPTH_M.metro, TYPICAL_DEPTH_M.metro])
  })

  it('a tunnel end shared with another tunnel way is not a portal', () => {
    const a: UndergroundWay = { id: 'a', system: 'road', points: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }], widthM: 7, layer: -1 }
    const b: UndergroundWay = { id: 'b', system: 'road', points: [{ lat: 0, lon: 1 }, { lat: 0, lon: 2 }], widthM: 7, layer: -1 }
    const p = portalEnds([a, b])
    expect([...p].sort()).toEqual(['0.0000000,0.0000000', '0.0000000,2.0000000'])
  })
})

describe('buildUndergroundLayer', () => {
  const frame = createGroundFrame({ anchorLat: 41.38, anchorElevationM: 0, sampleGroundM: () => 0, exaggeration: 1 })
  const metro = way('m', 'rail', BCN, { vertical: vertical('tunnel'), style: { railSystem: 'subway' } as OsmFeature['style'] })

  it('draws the line below the ground, marked approximate and owned by the view', () => {
    const layer = buildUndergroundLayer([metro], { frame })!
    expect(layer.counts.metro).toBe(1)
    const mesh = layer.object.children[0] as import('three').Mesh
    expect(layer.object.userData.approximate).toBe(true)
    expect((mesh.material as import('three').Material).userData.subsurfaceOwned).toBe(true)
    const pos = mesh.geometry.getAttribute('position')
    let maxZ = -Infinity
    for (let i = 0; i < pos.count; i++) maxZ = Math.max(maxZ, pos.getZ(i))
    // The roof of an 18 m-deep, 5.5 m-tall tube is still 12.5 m under the ground.
    expect(maxZ / frame.mToN).toBeCloseTo(-(TYPICAL_DEPTH_M.metro - 5.5), 3)
  })

  it('leaves out what stands inside a model’s footprint', () => {
    expect(buildUndergroundLayer([metro], { frame, skip: () => true })).toBeNull()
  })
})
