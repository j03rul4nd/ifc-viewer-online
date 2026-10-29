import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { edgesNear, featureEdges, hitMatrix } from './mesh-snap'

describe('featureEdges', () => {
  it('a box has its 12 real edges and none of the diagonals that split its faces', () => {
    const box = new THREE.BoxGeometry(2, 2, 2)
    const e = featureEdges(box)!
    expect(e.length / 6).toBe(12)
    // No edge runs across a face: every edge is axis-aligned.
    for (let i = 0; i < e.length; i += 6) {
      const changed = [e[i] !== e[i + 3], e[i + 1] !== e[i + 4], e[i + 2] !== e[i + 5]].filter(Boolean).length
      expect(changed).toBe(1)
    }
  })

  it('is cached per geometry', () => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    expect(featureEdges(g)).toBe(featureEdges(g))
  })
})

describe('edgesNear', () => {
  it('finds the edge under a point near it, in world space', () => {
    const box = new THREE.BoxGeometry(2, 2, 2)
    const m = new THREE.Matrix4().makeTranslation(10, 0, 0)
    // On the top face, 0.05 from the edge at x = 11 (world).
    const near = edgesNear(box, m, new THREE.Vector3(10.95, 1, 0), 0.2)
    expect(near.length).toBeGreaterThan(0)
    expect(near[0].nearest.x).toBeCloseTo(11, 9)
    expect(near[0].nearest.y).toBeCloseTo(1, 9)
    expect(near[0].distance).toBeCloseTo(0.05, 9)
  })

  it('finds nothing in the middle of a flat face', () => {
    expect(edgesNear(new THREE.BoxGeometry(2, 2, 2), new THREE.Matrix4(), new THREE.Vector3(0, 1, 0), 0.2)).toEqual([])
  })
})

describe('hitMatrix', () => {
  it('adds an instance’s own matrix', () => {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2)
    inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 0, 0))
    inst.updateMatrixWorld()
    const m = hitMatrix({ object: inst, instanceId: 1 } as unknown as THREE.Intersection)
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBe(5)
  })
})
