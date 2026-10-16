import { describe, expect, it } from 'vitest'
import { parseOsmFeatures } from './osm-features'
import { buildPigeonLayer, pigeonGeometry, planPigeons } from './pigeons'
import { pointInLatLonRing } from './osm-features'

const LAT = 41.387, LON = 2.17
const dLat = 1 / 111_320, dLon = 1 / (111_320 * Math.cos((LAT * Math.PI) / 180))
const at = (x: number, y: number) => ({ lat: LAT + y * dLat, lon: LON + x * dLon })
const closed = (...p: Array<[number, number]>) => [...p, p[0]].map(([x, y]) => at(x, y))
const way = (id: number, tags: Record<string, string>, geometry: Array<{ lat: number; lon: number }>) => ({ type: 'way', id, tags, geometry })

const square = way(1, { highway: 'pedestrian', area: 'yes' }, closed([0, 0], [120, 0], [120, 120], [0, 120]))
const fountain = way(2, { natural: 'water', water: 'basin' }, closed([40, 40], [80, 40], [80, 80], [40, 80]))

describe('pigeons', () => {
  it('puts flocks on open paving of a real square, never in its fountain', () => {
    const features = parseOsmFeatures({ elements: [square, fountain] })
    const plan = planPigeons(features)
    expect(plan.ground.length).toBeGreaterThan(20)
    const pool = features.find((f) => f.id === 'w2')!.ring!
    expect(plan.ground.some((b) => pointInLatLonRing(b, pool))).toBe(false)
    expect(plan.air?.birds).toBeGreaterThan(0)
  })
  it('is deterministic, and leaves forecourts and streets alone', () => {
    const features = parseOsmFeatures({ elements: [square] })
    expect(planPigeons(features)).toEqual(planPigeons(features))
    const tiny = parseOsmFeatures({ elements: [way(3, { highway: 'pedestrian', area: 'yes' }, closed([0, 0], [20, 0], [20, 20], [0, 20]))] })
    expect(planPigeons(tiny).ground).toHaveLength(0)
    expect(buildPigeonLayer(tiny, { anchorLat: LAT, anchorLon: LON })).toBeNull()
  })
  it('builds two animated instanced flocks', () => {
    const layer = buildPigeonLayer(parseOsmFeatures({ elements: [square] }), { anchorLat: LAT, anchorLon: LON })!
    expect(layer.object.children.map((c) => c.name)).toEqual(['osm-pigeons-ground', 'osm-pigeons-air'])
    for (const c of layer.object.children) {
      const mat = (c as import('three').Mesh).material as import('three').Material
      expect(mat.userData.animated).toBe(true)
    }
    const g = pigeonGeometry(true)
    g.computeBoundingBox()
    expect(g.boundingBox!.max.y - g.boundingBox!.min.y).toBeCloseTo(0.64, 1)
  })
})
