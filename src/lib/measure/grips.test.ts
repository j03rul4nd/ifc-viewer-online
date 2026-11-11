import { describe, expect, it } from 'vitest'
import { gripAt, movePoint } from './grips'
import type { AreaItem, DimensionItem, DistanceItem, PathItem } from './measure-types'

const P = (x: number, y = 0, z = 0) => ({ x, y, z })
const base = { id: 'm', seq: 1, name: 'Hall', visible: true, note: 'check', requirement: { op: 'min' as const, min: 1, max: null, target: 'value' as const } }

describe('movePoint', () => {
  it('recomputes a distance and drops what only held for the old points', () => {
    const d: DistanceItem = {
      ...base, kind: 'distance', points: [P(0), P(3)], value: 3,
      components: { dx: 3, dy: 0, dz: 0, horizontal: 3 }, perpendicular: true, source: 'elements', clash: true,
    }
    const next = movePoint(d, 1, P(0, 0, -4)) as DistanceItem
    expect(next.value).toBeCloseTo(4, 9)
    expect(next.components.dy).toBeCloseTo(4, 9)
    expect(next.perpendicular).toBe(false)
    expect(next.source).toBeUndefined()
    expect(next.clash).toBeUndefined()
    // What it is FOR stays.
    expect(next.name).toBe('Hall')
    expect(next.note).toBe('check')
    expect(next.requirement).toEqual(base.requirement)
  })

  it('a moved route point makes a hand-drawn path', () => {
    const p: PathItem = {
      ...base, kind: 'path', points: [P(0), P(3), P(3, 0, 4)], value: 7, segments: [3, 4],
      route: { mode: 'foot', seconds: 10, metres: 7, legs: [], request: { from: P(0), to: P(3, 0, 4), fromAnchor: null, toAnchor: null } },
    }
    const next = movePoint(p, 2, P(3, 0, 1)) as PathItem
    expect(next.value).toBeCloseTo(4, 9)
    expect(next.route).toBeUndefined()
  })

  it('an area traced from a face becomes a polygon with its new area', () => {
    const a: AreaItem = { ...base, kind: 'area', points: [P(0), P(2), P(2, 0, 2), P(0, 0, 2)], value: 4, perimeter: 8, source: 'face', planar: true }
    const next = movePoint(a, 2, P(4, 0, 2)) as AreaItem
    expect(next.source).toBe('polygon')
    expect(next.value).toBeCloseTo(6, 9)
  })

  it('a dimension keeps its mode and side, with the new value', () => {
    const dim: DimensionItem = { ...base, kind: 'dimension', mode: 'aligned', points: [P(0), P(5)], value: 5, parts: [5], facing: P(0, 0, 10) }
    const next = movePoint(dim, 1, P(8)) as DimensionItem
    expect(next.value).toBeCloseTo(8, 9)
    expect(next.mode).toBe('aligned')
    expect(next.facing).toEqual(P(0, 0, 10))
    // Dragged onto the other point: no dimension.
    expect(movePoint(dim, 1, P(0))).toBeNull()
  })
})

describe('gripAt', () => {
  it('grabs the nearest point within the radius, nothing beyond it', () => {
    const screen = [{ x: 100, y: 100 }, { x: 108, y: 100 }, null]
    expect(gripAt(screen, 106, 101)).toBe(1)
    expect(gripAt(screen, 100, 120)).toBeNull()
  })
})
