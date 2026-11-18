import { describe, it, expect } from 'vitest'
import { chunkLayers, cutPlane, explodeGap, groupLayers, planCutY, planFitDistance, sampleEvenly, storeysFromTree } from './cuts'
import type { SpatialNode } from '../../types'

const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 30, z: 10 } }

// three.js keeps points whose signed distance to the plane is ≥ 0.
const kept = (p: { x: number; y: number; z: number }, c: ReturnType<typeof cutPlane>) =>
  c.normal.x * (p.x - c.point.x) + c.normal.y * (p.y - c.point.y) + c.normal.z * (p.z - c.point.z) >= 0

describe('cutPlane', () => {
  it('plan keeps what is below the cut and looks down', () => {
    const c = cutPlane(box, 'plan', 0.5)
    expect(c.point.y).toBe(15)
    expect(c.preset).toBe('top')
    expect(kept({ x: 5, y: 2, z: 5 }, c)).toBe(true)
    expect(kept({ x: 5, y: 28, z: 5 }, c)).toBe(false)
  })
  it('sections cut through the box and face the kept half', () => {
    const l = cutPlane(box, 'long', 0.5)
    expect(l.preset).toBe('front')
    expect(kept({ x: 5, y: 5, z: 1 }, l)).toBe(true)
    expect(kept({ x: 5, y: 5, z: 9 }, l)).toBe(false)
    const x = cutPlane(box, 'cross', 0.25)
    expect(x.point.x).toBe(5)
    expect(x.preset).toBe('right')
    expect(kept({ x: 1, y: 5, z: 5 }, x)).toBe(true)
  })
  it('never cuts exactly on a face', () => {
    expect(cutPlane(box, 'plan', 0).point.y).toBeGreaterThan(0)
    expect(cutPlane(box, 'plan', 1).point.y).toBeLessThan(30)
  })
})

function node(ifcClass: string, name: string, ids: number[], children: SpatialNode[] = []): SpatialNode {
  return { expressId: 0, globalId: '', ifcClass, name, children, containedElements: ids.map((id) => ({ expressId: id, globalId: '', ifcClass: 'IFCWALL', name: '' })) }
}

describe('storeys', () => {
  it('collects every element under each storey, spaces included', () => {
    const tree = [node('IFCPROJECT', 'P', [], [node('IFCSITE', 'S', [99], [node('IFCBUILDING', 'B', [], [
      node('IFCBUILDINGSTOREY', 'L0', [1, 2], [node('IFCSPACE', 'room', [3])]),
      node('IFCBUILDINGSTOREY', 'L1', [4]),
      node('IFCBUILDINGSTOREY', 'Empty', []),
    ])])])]
    expect(storeysFromTree('m', tree)).toEqual([
      { modelId: 'm', name: 'L0', ids: [1, 2, 3] },
      { modelId: 'm', name: 'L1', ids: [4] },
    ])
  })
  it('merges storeys of different models at the same level, bottom to top', () => {
    const layers = groupLayers([
      { modelId: 'arq', name: 'L1', ids: [10], elevation: 3.2 },
      { modelId: 'str', name: 'L0', ids: [20], elevation: -0.1 },
      { modelId: 'str', name: 'L1', ids: [21], elevation: 3.0 },
      { modelId: 'arq', name: 'L0', ids: [11], elevation: 0 },
    ])
    expect(layers).toHaveLength(2)
    expect(layers[0].parts).toEqual([{ modelId: 'str', ids: [20] }, { modelId: 'arq', ids: [11] }])
    expect(layers[1].names).toEqual(['L1'])
  })
  it('spreads the lift over the storeys', () => {
    expect(explodeGap(30, 10)).toBe(3)
    expect(explodeGap(30, 1)).toBe(0)
  })
})

describe('chunkLayers', () => {
  const layer = (i: number) => ({ elevation: i * 3, names: [`L${i}`], parts: [{ modelId: 'm', ids: [i] }] })
  it('bands 20 storeys into 7 with every element kept, in order', () => {
    const bands = chunkLayers(Array.from({ length: 20 }, (_, i) => layer(i)), 7)
    expect(bands).toHaveLength(7)
    expect(bands.flatMap((b) => b.parts[0].ids)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(bands[0].names[0]).toBe('L0 – L1')
  })
  it('leaves short buildings alone', () => {
    expect(chunkLayers([layer(0), layer(1)], 7)).toHaveLength(2)
  })
})

describe('storey plans', () => {
  it('cuts 1.2 m above the floor, never through the next slab', () => {
    expect(planCutY(10, 20)).toBeCloseTo(11.2)
    expect(planCutY(10, 11)).toBeCloseTo(10.95)
    expect(planCutY(10, null)).toBeCloseTo(11.2)
  })
  it('samples evenly, keeping first and last', () => {
    const s = sampleEvenly(Array.from({ length: 30 }, (_, i) => i), 5)
    expect(s).toEqual([0, 7, 15, 22, 29])
    expect(sampleEvenly([1, 2], 5)).toEqual([1, 2])
  })
})

describe('planFitDistance', () => {
  it('fits the binding dimension of the footprint', () => {
    const b = { min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 3, z: 10 } }
    // 90° fov on a square view: half-width 20 → 20 m away, × margin.
    expect(planFitDistance(b, 90, 1, 1)).toBeCloseTo(20)
    // A wide view makes depth bind instead.
    expect(planFitDistance(b, 90, 8, 1)).toBeCloseTo(5)
  })
})
