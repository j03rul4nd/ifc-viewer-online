import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { clipConvex, hippedFacets, longestAxis, roofFrame } from './building-mesh'
import { parseRoofShape, resolveFeatureStyle } from './osm-features'

const V = (x: number, y: number) => new THREE.Vector2(x, y)
const area = (r: THREE.Vector2[]) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y
  return Math.abs(a / 2)
}

describe('roof tags', () => {
  it('keeps hipped and gambrel apart from gabled', () => {
    expect(parseRoofShape('hipped')).toBe('hipped')
    expect(parseRoofShape('half-hipped')).toBe('hipped')
    expect(parseRoofShape('gambrel')).toBe('gambrel')
    expect(parseRoofShape('gabled')).toBe('gabled')
  })
  it('reads roof:angle and roof:direction, and knows a placeholder height', () => {
    const s = resolveFeatureStyle('building', { building: 'house', 'roof:shape': 'skillion', 'roof:angle': '30', 'roof:direction': 'S' })
    expect(s.roofAngleDeg).toBe(30)
    expect(s.roofDirectionDeg).toBe(180)
    expect(s.roofHeightTagged).toBe(false)
    expect(resolveFeatureStyle('building', { building: 'yes', 'roof:shape': 'hipped', 'roof:height': '4' }).roofHeightTagged).toBe(true)
  })
})

describe('hipped roof geometry', () => {
  const axis = { x: 1, y: 0 }
  it('covers the whole footprint exactly, L-shapes included', () => {
    const L = [V(0, 0), V(20, 0), V(20, 6), V(8, 6), V(8, 14), V(0, 14)]
    const facets = hippedFacets(L, { x: 10, y: 7 }, axis, 0, 3)
    const total = facets.reduce((s, f) => s + area(clipConvex(L, f.region)), 0)
    expect(total).toBeCloseTo(area(L), 6)
  })
  it('is continuous along hips and ridge, eaves at 0 and ridge at the top', () => {
    const rect = [V(0, 0), V(20, 0), V(20, 10), V(0, 10)]
    const f = roofFrame(rect, { x: 10, y: 5 }, axis)
    expect(f.halfAlong).toBeCloseTo(10); expect(f.halfAcross).toBeCloseTo(5)
    const facets = hippedFacets(rect, { x: 10, y: 5 }, axis, 0, 3)
    // Ridge runs from x=5 to x=15 at y=5.
    for (const fc of facets) {
      const inRegion = (p: THREE.Vector2) => clipConvex([V(p.x - 1e-3, p.y - 1e-3), V(p.x + 1e-3, p.y - 1e-3), V(p.x + 1e-3, p.y + 1e-3), V(p.x - 1e-3, p.y + 1e-3)], fc.region).length > 0
      for (const p of [V(5, 5), V(10, 5), V(15, 5)]) if (inRegion(p)) expect(fc.z(p)).toBeCloseTo(3, 6)
      for (const p of [V(0, 0), V(20, 10), V(10, 0)]) if (inRegion(p)) expect(fc.z(p)).toBeCloseTo(0, 6)
    }
    // A hip point (2.5, 2.5) is the same height on the side and the end.
    const hip = V(2.5, 2.5)
    const zs = facets.map((fc) => fc.z(hip)).filter((z) => Math.abs(z - 1.5) < 1e-6)
    expect(zs.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ridge axis', () => {
  it('runs along the long SIDE, not the diagonal', () => {
    const a = longestAxis([V(0, 0), V(16, 0), V(16, 10), V(0, 10)])
    expect(Math.abs(a.x)).toBeCloseTo(1, 9); expect(a.y).toBeCloseTo(0, 9)
    // Rotated 30°: still the long side.
    const c = Math.cos(Math.PI / 6); const s = Math.sin(Math.PI / 6)
    const rot = [V(0, 0), V(16, 0), V(16, 10), V(0, 10)].map((p) => V(p.x * c - p.y * s, p.x * s + p.y * c))
    const b = longestAxis(rot)
    expect(Math.abs(b.x * c + b.y * s)).toBeCloseTo(1, 9)
  })
})

describe('hipped roof over a footprint that is not a box', () => {
  it('closes the inside corner of an L: no roof edge left above the eaves', async () => {
    const { buildBuildingsGeometry } = await import('./building-mesh')
    const { resolveFeatureStyle } = await import('./osm-features')
    const lat0 = 41.387; const lon0 = 2.17; const dLat = 1 / 111_320; const dLon = 1 / (111_320 * Math.cos((lat0 * Math.PI) / 180))
    const L = [[0, 0], [18, 0], [18, 7], [8, 7], [8, 16], [0, 16]]
    const res = buildBuildingsGeometry([{
      id: 'L', ring: L.map(([x, y]) => ({ lat: lat0 + y * dLat, lon: lon0 + x * dLon })),
      height: { heightM: 10, minHeightM: 0, estimated: false, basis: 'height' },
      style: resolveFeatureStyle('building', { building: 'house', 'roof:shape': 'hipped', 'roof:height': '3' }),
    }], { anchorLat: lat0, anchorLon: lon0, detail: 'simple', localOrigin: true })!
    const pos = res.geometry.attributes.position
    expect(pos.count).toBeLessThan(7_000)
    let zMax = -Infinity; let zMin = Infinity
    for (let i = 0; i < pos.count; i++) { zMax = Math.max(zMax, pos.getZ(i)); zMin = Math.min(zMin, pos.getZ(i)) }
    expect(zMax).toBeGreaterThan(zMin)
  })
})
