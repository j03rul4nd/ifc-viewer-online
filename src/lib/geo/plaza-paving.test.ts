import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { parseOsmFeatures } from './osm-features'
import { capSquareKiosks, islandsInFloor, outsetRing, pavedAreaOrder, routingOverPaving, SQUARE_KIOSK_HEIGHT_M } from './plaza-paving'
import { applyGroundDepthNudge, nudgeVertexShader, GROUND_EYE_NUDGE } from './ground-depth-nudge'

type OverpassElement = Record<string, unknown>
const parseOverpassFeatures = (elements: OverpassElement[]) => parseOsmFeatures({ elements })

// A 100 m square plaza at Plaça de Catalunya's latitude, as OSM maps it.
const LAT = 41.387
const LON = 2.17
const dLat = 100 / 111_320
const dLon = 100 / (111_320 * Math.cos((LAT * Math.PI) / 180))
const at = (fx: number, fy: number) => ({ lat: LAT + fy * dLat, lon: LON + fx * dLon })
const closed = (...pts: Array<[number, number]>) => [...pts, pts[0]].map(([x, y]) => at(x, y))

function way(id: number, tags: Record<string, string>, geometry: Array<{ lat: number; lon: number }>): OverpassElement {
  return { type: 'way', id, tags, geometry } as OverpassElement
}

const plaza = way(1, { highway: 'pedestrian', area: 'yes', surface: 'paving_stones' },
  closed([0, 0], [1, 0], [1, 1], [0, 1]))

describe('routingOverPaving', () => {
  it('drops a footway that only routes across the square, keeps one that leaves it', () => {
    const features = parseOverpassFeatures([
      plaza,
      way(2, { highway: 'footway' }, [at(0.1, 0.1), at(0.9, 0.9)]),
      way(3, { highway: 'footway' }, [at(0.5, 0.5), at(1.5, 0.5)]),
    ])
    const ids = routingOverPaving(features)
    expect(ids.has('w2')).toBe(true)
    expect(ids.has('w3')).toBe(false)
  })

  it('keeps crossings, steps and anything off the ground', () => {
    const features = parseOverpassFeatures([
      plaza,
      way(4, { highway: 'footway', footway: 'crossing', crossing: 'marked' }, [at(0.2, 0.2), at(0.3, 0.3)]),
      way(5, { highway: 'steps' }, [at(0.4, 0.4), at(0.5, 0.5)]),
      way(6, { highway: 'footway', bridge: 'yes', layer: '1' }, [at(0.2, 0.6), at(0.8, 0.6)]),
    ])
    const ids = routingOverPaving(features)
    expect([...ids]).toEqual([])
  })

  it('treats a lawn hole in the square as off the paving', () => {
    const holed: OverpassElement = {
      type: 'relation', id: 9, tags: { type: 'multipolygon', highway: 'pedestrian', area: 'yes' },
      members: [
        { type: 'way', ref: 91, role: 'outer', geometry: closed([0, 0], [1, 0], [1, 1], [0, 1]) },
        { type: 'way', ref: 92, role: 'inner', geometry: closed([0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]) },
      ],
    } as unknown as OverpassElement
    const features = parseOverpassFeatures([
      holed,
      way(7, { highway: 'footway' }, [at(0.1, 0.5), at(0.9, 0.5)]),
      way(8, { highway: 'footway' }, [at(0.1, 0.1), at(0.3, 0.1)]),
    ])
    const ids = routingOverPaving(features)
    expect(ids.has('w7')).toBe(false)
    expect(ids.has('w8')).toBe(true)
  })
})

describe('mapped artwork on a square', () => {
  it('stands a statue mapped by its plinth outline at the plinth centre', () => {
    const [statue] = parseOverpassFeatures([
      way(10, { tourism: 'artwork', artwork_type: 'statue', area: 'yes', name: 'Treball' },
        closed([0.4, 0.4], [0.5, 0.4], [0.5, 0.5], [0.4, 0.5])),
    ])
    expect(statue.kind).toBe('furniture')
    expect(statue.style.furniture).toBe('artwork')
    expect(statue.point!.lat).toBeCloseTo(at(0.45, 0.45).lat, 9)
    expect(statue.point!.lon).toBeCloseTo(at(0.45, 0.45).lon, 9)
  })

  it('paves a tiled compass rose as floor, drawn after the square it is set into', () => {
    const features = parseOverpassFeatures([
      way(11, { tourism: 'artwork', artwork_type: 'tilework', area: 'yes', name: 'Rosa dels Vents' },
        closed([0.45, 0.45], [0.55, 0.45], [0.55, 0.55], [0.45, 0.55])),
      plaza,
    ])
    const rose = features.find((f) => f.id === 'w11')!
    expect(rose.kind).toBe('road')
    expect(rose.widthM).toBeUndefined()
    expect(pavedAreaOrder(features).map((f) => f.id)).toEqual(['w1', 'w11'])
  })
})

describe('islandsInFloor', () => {
  it('cuts a lawn and a basin set into the square, not the park around it', () => {
    const features = parseOverpassFeatures([
      plaza,
      way(20, { landuse: 'grass' }, closed([0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3])),
      way(21, { natural: 'water', water: 'basin' }, closed([0.6, 0.6], [0.8, 0.6], [0.8, 0.8], [0.6, 0.8])),
      way(22, { leisure: 'park' }, closed([-1, -1], [2, -1], [2, 2], [-1, 2])),
      way(23, { landuse: 'grass' }, closed([0.9, 0.4], [1.2, 0.4], [1.2, 0.6], [0.9, 0.6])),
    ])
    const floor = features.find((f) => f.id === 'w1')!
    const islands = islandsInFloor(floor, features)
    expect(islands).toHaveLength(2)
  })
})

describe('outsetRing', () => {
  const v = (x: number, y: number) => ({ x, y })
  it('moves every edge of a square out by the distance, either winding', () => {
    const ccw = outsetRing([v(0, 0), v(10, 0), v(10, 10), v(0, 10)], 1, v)
    expect(ccw).toEqual([v(-1, -1), v(11, -1), v(11, 11), v(-1, 11)])
    const cw = outsetRing([v(0, 0), v(0, 10), v(10, 10), v(10, 0)], 1, v)
    expect(cw).toEqual([v(-1, -1), v(-1, 11), v(11, 11), v(11, -1)])
  })

  it('caps the miter of a needle corner at twice the distance', () => {
    const out = outsetRing([v(0, 0), v(100, 1), v(0, 2)], 1, v)
    const tip = out[1]
    expect(Math.hypot(tip.x - 100, tip.y - 1)).toBeLessThanOrEqual(2 + 1e-9)
  })
})

describe('ground depth nudge', () => {
  it('re-projects after project_vertex for perspective cameras only', () => {
    const out = nudgeVertexShader('a\n#include <project_vertex>\nb')
    expect(out).toContain('#include <project_vertex>')
    expect(out).toContain('projectionMatrix[ 2 ][ 3 ] != 0.0')
    expect(out).toContain((1 - GROUND_EYE_NUDGE).toFixed(6))
  })

  it('chains an existing onBeforeCompile and keys the program apart', () => {
    const m = new THREE.MeshBasicMaterial()
    const seen: string[] = []
    m.onBeforeCompile = (shader) => { seen.push('prev'); shader.vertexShader += '' }
    m.customProgramCacheKey = () => 'mine'
    applyGroundDepthNudge(m)
    const shader = { vertexShader: '#include <project_vertex>', fragmentShader: '', uniforms: {} }
    m.onBeforeCompile(shader as never, undefined as never)
    expect(seen).toEqual(['prev'])
    expect(shader.vertexShader).toContain('mvPosition.xyz *')
    expect(m.customProgramCacheKey()).toBe('mine|ground-nudge')
  })
})

describe('capSquareKiosks', () => {
  const features = parseOsmFeatures({ elements: [plaza] })
  const box = (x: number, y: number, s: number) => closed([x, y], [x + s, y], [x + s, y + s], [x, y + s]).slice(0, -1)
  it('brings an unmeasured lift house on the square down to kiosk height', () => {
    const [b] = capSquareKiosks([{ ring: box(0.5, 0.5, 0.07), height: { heightM: 19.2, basis: 'guess' } }], features)
    expect(b.height.heightM).toBe(SQUARE_KIOSK_HEIGHT_M)
  })
  it('leaves surveyed heights, large buildings and buildings off the square alone', () => {
    const out = capSquareKiosks([
      { ring: box(0.5, 0.5, 0.07), height: { heightM: 12, basis: 'height' } },
      { ring: box(0.3, 0.3, 0.3), height: { heightM: 19.2, basis: 'guess' } },
      { ring: box(1.5, 1.5, 0.07), height: { heightM: 19.2, basis: 'guess' } },
    ], features)
    expect(out.map((b) => b.height.heightM)).toEqual([12, 19.2, 19.2])
  })
})

describe('compass rose inlay', () => {
  it('recognises a wind rose floor by name, not any mosaic', async () => {
    const { compassInlay } = await import('./osm-features')
    expect(compassInlay({ tourism: 'artwork', artwork_type: 'tilework', name: 'Rosa dels Vents' })).toBe('compass')
    expect(compassInlay({ tourism: 'artwork', artwork_type: 'mosaic', name: 'El Drac' })).toBeUndefined()
    expect(compassInlay({ tourism: 'artwork', artwork_type: 'statue', name: 'Rosa dels Vents' })).toBeUndefined()
  })
  it('lays the rose inside the floor, pointing north', async () => {
    const { compassRose, inlayCircle } = await import('./plaza-paving')
    const ring = Array.from({ length: 36 }, (_, i) => ({ x: 10 + 30 * Math.cos(i / 36 * Math.PI * 2), y: 20 + 30 * Math.sin(i / 36 * Math.PI * 2) }))
    const c = inlayCircle(ring)!
    expect(c.cx).toBeCloseTo(10, 6); expect(c.cy).toBeCloseTo(20, 6)
    const tris = compassRose(c.cx, c.cy, c.r)
    const pts = tris.flatMap((t) => [t.a, t.b, t.c])
    expect(Math.max(...pts.map((p) => Math.hypot(p.x - 10, p.y - 20)))).toBeLessThanOrEqual(30)
    // The northernmost point is the long cardinal tip, straight up.
    const north = pts.reduce((a, b) => (b.y > a.y ? b : a))
    expect(north.x).toBeCloseTo(10, 6)
  })
})
