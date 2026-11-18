import { describe, expect, it } from 'vitest'
import { buildTriangleIndex, nearestTriangle, triSignedDistance, type NearestTriangle } from './triangle-index'
import { boxGeometry } from './synthetic-scene'

describe('triangle index', () => {
  const a = boxGeometry(1, 'A', [0, 0, 0], [1, 1, 1])
  const b = boxGeometry(2, 'B', [1, 0, 0], [2, 1, 1]) // flush with A at x = 1
  const big = boxGeometry(3, 'C', [0, 0, -0.2], [20, 20, -0.1]) // huge slab, few triangles
  const idx = buildTriangleIndex([a, b, big], 0.15)
  const hit: NearestTriangle = { tri: -1, distance: Infinity, otherDistance: Infinity }

  it('attributes a point to the element whose surface is nearest, with signed distance', () => {
    nearestTriangle(idx, 0.5, 0.5, 1.04, 0.15, hit)
    expect(idx.triElement[hit.tri]).toBe(0)
    expect(hit.distance).toBeCloseTo(0.04, 5)
    expect(triSignedDistance(idx, hit.tri, 0.5, 0.5, 1.04)).toBeCloseTo(0.04, 5)
    expect(triSignedDistance(idx, hit.tri, 0.5, 0.5, 0.96)).toBeCloseTo(-0.04, 5)
  })

  it('reports the other element distance on a flush face', () => {
    nearestTriangle(idx, 1.001, 0.5, 0.5, 0.15, hit)
    expect(hit.otherDistance - hit.distance).toBeLessThan(0.01)
  })

  it('finds large triangles far from their vertices, and nothing beyond the radius', () => {
    nearestTriangle(idx, 15, 15, -0.05, 0.15, hit)
    expect(idx.triElement[hit.tri]).toBe(2)
    expect(hit.distance).toBeCloseTo(0.05, 5)
    nearestTriangle(idx, 15, 15, 0.5, 0.15, hit)
    expect(hit.tri).toBe(-1)
  })

  it('builds a 100 m x 100 m tilted triangle in under a second', () => {
    const g = { id: 9, ifcClass: 'T', positions: new Float32Array([0, 0, 0, 100, 0, 37, 0, 100, 61]), indices: new Uint32Array([0, 1, 2]) }
    const t0 = performance.now()
    const big = buildTriangleIndex([g], 0.15)
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(1000)
    nearestTriangle(big, 30, 30, 0.37 * 30 + 0.61 * 30 + 0.05, 0.15, hit)
    expect(hit.tri).toBe(0)
  })
})
