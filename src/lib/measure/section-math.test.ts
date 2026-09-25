// ─── section-math tests ───────────────────────────────────────────────────────
// The convention every section bug comes back to: which side does a plane keep?

import { describe, it, expect } from 'vitest'
import {
  boundsFromIfcRanges, boxPlanes, calibrateLevels, closestParamOnAxis, elevationScale, ifcRanges, mergeLevels,
  moveRangeSide, niceStep, planeThrough, projectBounds, signedDistance,
} from './section-math'

const box = { min: { x: -2, y: 0, z: -10 }, max: { x: 8, y: 12, z: 4 } }

describe('ranges in IFC axes', () => {
  it('reads the scene box as X / Y (north = −z) / Z (up = y)', () => {
    const r = ifcRanges(box)
    expect(r.x).toEqual({ min: -2, max: 8 })
    expect(r.y).toEqual({ min: -4, max: 10 })
    expect(r.z).toEqual({ min: 0, max: 12 })
  })
  it('round-trips', () => {
    expect(boundsFromIfcRanges(ifcRanges(box))).toEqual(box)
  })
  it('projects a box onto an arbitrary direction', () => {
    const r = projectBounds(box, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    expect(r).toEqual({ min: 0, max: 12 })
  })
})

describe('planes', () => {
  it('keeps the side the normal points to', () => {
    // Plan cut at 3 m keeping everything below: normal points down.
    const p = planeThrough({ x: 0, y: 3, z: 0 }, { x: 0, y: -1, z: 0 })
    expect(signedDistance(p, { x: 0, y: 1, z: 0 })).toBeGreaterThan(0) // kept
    expect(signedDistance(p, { x: 0, y: 5, z: 0 })).toBeLessThan(0)    // cut away
  })
  it('makes a section box whose planes keep exactly its inside', () => {
    const planes = boxPlanes(box)
    expect(planes).toHaveLength(6)
    const inside = { x: 3, y: 6, z: -3 }
    for (const { plane } of planes) expect(signedDistance(plane, inside)).toBeGreaterThan(0)
    for (const outside of [{ x: 9, y: 6, z: -3 }, { x: 3, y: 13, z: -3 }, { x: 3, y: 6, z: 5 }, { x: 3, y: 6, z: -11 }]) {
      expect(planes.some(({ plane }) => signedDistance(plane, outside) < 0)).toBe(true)
    }
  })
})

describe('box handles', () => {
  const limits = { min: 0, max: 10 }
  it('stops a side before it crosses the other', () => {
    expect(moveRangeSide({ min: 2, max: 6 }, 'min', 9, limits, 0.1)).toEqual({ min: 5.9, max: 6 })
    expect(moveRangeSide({ min: 2, max: 6 }, 'max', 1, limits, 0.1)).toEqual({ min: 2, max: 2.1 })
  })
  it('stays inside the model limits', () => {
    expect(moveRangeSide({ min: 2, max: 6 }, 'max', 40, limits, 0.1).max).toBe(10)
  })
})

describe('dragging along an axis', () => {
  it('finds where the cursor ray passes closest to the axis', () => {
    // Vertical axis at the origin; a horizontal ray at height 4 passing it.
    const t = closestParamOnAxis({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -10, y: 4, z: 1 }, { x: 1, y: 0, z: 0 })
    expect(t).toBeCloseTo(4)
  })
  it('gives up when the axis points at the camera', () => {
    expect(closestParamOnAxis({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -1 })).toBeNull()
  })
})

describe('storey levels', () => {
  it('reads millimetre elevations as metres when that is what fits the model', () => {
    // A 12 m tall building whose storeys say 0, 3200, 6400, 9600.
    expect(elevationScale([0, 3200, 6400, 9600], -0.3, 12)).toBe(0.001)
  })
  it('keeps metres when they already fit', () => {
    expect(elevationScale([0, 3.2, 6.4], -0.3, 9)).toBe(1)
  })
  it('recognises feet', () => {
    // 0, 10.5, 21 ft = 0, 3.2, 6.4 m in a 9 m tall model.
    expect(elevationScale([0, 10.5, 21], -0.3, 9)).toBeCloseTo(0.3048)
  })
  it('calibrates a millimetre model standing on a 100 m site', () => {
    // Elevations 0 / 3200 / 6400 mm; slabs drawn from 99.8, 103.0, 106.2 m.
    const levels = calibrateLevels([
      { name: 'L0', elevation: 0, contentMinY: 99.8 },
      { name: 'L1', elevation: 3200, contentMinY: 103.0 },
      { name: 'L2', elevation: 6400, contentMinY: 106.2 },
    ], 99.8, 110)
    expect(levels.map((l) => +l.y.toFixed(2))).toEqual([99.8, 103, 106.2])
  })
  it('is not thrown by one storey whose contents hang lower (a pit, a footing)', () => {
    const levels = calibrateLevels([
      { name: 'L0', elevation: 0, contentMinY: -2.5 }, // foundations
      { name: 'L1', elevation: 3.2, contentMinY: 3.0 },
      { name: 'L2', elevation: 6.4, contentMinY: 6.2 },
    ], -2.5, 10)
    expect(levels.map((l) => +l.y.toFixed(2))).toEqual([-0.2, 3, 6.2])
  })
  it('falls back to the contents when a storey has no elevation', () => {
    expect(calibrateLevels([{ name: 'X', elevation: null, contentMinY: 4.1 }], 0, 8)).toEqual([{ name: 'X', y: 4.1 }])
  })
  it('merges the same floor seen by two models, keeping the finished floor', () => {
    // Hotel Vela: structure 0.34 m below architecture on every storey.
    const merged = mergeLevels([
      { name: 'Level 01', y: 6.0 }, { name: 'B02', y: -0.34 },
      { name: 'Level 01', y: 5.66 }, { name: 'B02', y: 0 },
    ])
    expect(merged).toEqual([{ name: 'B02', y: 0 }, { name: 'Level 01', y: 6 }])
  })
  it('keeps two real floors apart', () => {
    expect(mergeLevels([{ name: 'A', y: 0 }, { name: 'B', y: 2.4 }])).toHaveLength(2)
  })
})

describe('slider steps', () => {
  it('rounds to 1-2-5 steps', () => {
    expect(niceStep(50)).toBeCloseTo(0.1)
    expect(niceStep(12)).toBeCloseTo(0.02)
    expect(niceStep(2.2)).toBeCloseTo(0.005)
  })
})
