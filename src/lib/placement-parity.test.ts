// ─── placement parity ─────────────────────────────────────────────────────────
// A claim made in two commit messages and several code comments: a scan and an
// imported mesh of the same room land the same way, because the same arithmetic
// places both.
//
// It was never tested. It is also the claim most likely to quietly stop being
// true: the rotation composition is written out in BOTH point-cloud-system.ts
// and mesh-system.ts, identically and separately. Duplicated code that must
// agree is duplicated code that eventually does not, and the symptom would be a
// scan and a mesh of the same place sitting at a small angle to each other —
// which reads as bad survey data rather than as a bug in here.
//
// So this drives the REAL systems rather than the pure transform functions. The
// pure functions agreeing would prove nothing about the two places that consume
// them.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { createPointCloudSystem, type PointCloudContext } from './pointcloud/point-cloud-system'
import { createMeshSystem, type MeshContext } from './mesh/mesh-system'
import { NO_OFFSET, type AlignmentOffset, type PointCloudAlignment, type UpAxis } from './pointcloud/pc-types'
import type { MeshFrame } from './mesh/mesh-types'

function pcContext(scene: THREE.Scene): PointCloudContext {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  return {
    scene,
    getActiveCamera: () => camera,
    renderer: {
      getPixelRatio: () => 1,
      getSize: (v: THREE.Vector2) => v.set(800, 600),
      domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    } as unknown as THREE.WebGLRenderer,
    getActiveModelBounds: () => null,
    frameBox: vi.fn(),
  }
}

function meshContext(scene: THREE.Scene): MeshContext {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  return {
    scene,
    getActiveCamera: () => camera,
    renderer: { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer,
    frameBox: vi.fn(),
  }
}

/**
 * The equivalence being tested.
 *
 * A point cloud's transform is a DERIVED alignment plus a user offset; a mesh
 * has no derived half, only a unit and the same offset. Zeroing the derived part
 * — origin at the world origin, no yaw, scale equal to the mesh's unit — makes
 * the two describe the same placement, and they must therefore produce the same
 * matrix.
 */
function equivalentPair(upAxis: UpAxis, unitScale: number, offset: AlignmentOffset): {
  alignment: PointCloudAlignment
  frame: MeshFrame
  placement: AlignmentOffset
} {
  return {
    alignment: {
      rung: 'manual', confidence: 'manual',
      origin: { x: 0, y: 0, z: 0 }, yawRad: 0, scale: unitScale, upAxis,
      reasons: [], offset,
    },
    frame: {
      unitScale, unitSource: 'assumed', upAxis, upAxisSource: 'declared',
      min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 },
    },
    placement: offset,
  }
}

/** Sample points through a root's world matrix — the observable that matters. */
function sample(root: THREE.Object3D): number[] {
  const probes = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-3.5, 7.25, 2.5),
  ]
  root.updateMatrixWorld(true)
  return probes.flatMap((p) => p.clone().applyMatrix4(root.matrixWorld).toArray())
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => { /* no-op */ })
})

describe('a scan and a mesh with the same placement land identically', () => {
  const CASES: Array<{ name: string; upAxis: UpAxis; unit: number; offset: AlignmentOffset }> = [
    { name: 'level Y-up, untouched', upAxis: 'y', unit: 1, offset: { ...NO_OFFSET } },
    { name: 'level Z-up, untouched', upAxis: 'z', unit: 1, offset: { ...NO_OFFSET } },
    { name: 'translated', upAxis: 'y', unit: 1, offset: { ...NO_OFFSET, x: 12, y: -3, z: 40 } },
    { name: 'yawed', upAxis: 'z', unit: 1, offset: { ...NO_OFFSET, yawDeg: 37 } },
    { name: 'levelled', upAxis: 'y', unit: 1, offset: { ...NO_OFFSET, pitchDeg: 4, rollDeg: -2.5 } },
    // Yaw AND pitch together, deliberately. Euler order only shows up when two
    // angles about different axes are non-zero at once, so every case above is
    // blind to an order change — verified by mutating one system to XYZ and
    // watching only the composite case fail. This one, and the composite, are
    // what actually hold the composition down.
    { name: 'yawed and levelled at once', upAxis: 'y', unit: 1, offset: { ...NO_OFFSET, yawDeg: 30, pitchDeg: 5 } },
    { name: 'millimetre source', upAxis: 'z', unit: 0.001, offset: { ...NO_OFFSET, scaleMul: 1.1 } },
    {
      name: 'everything at once', upAxis: 'z', unit: 0.3048,
      offset: { x: -7.5, y: 2.25, z: 18, yawDeg: -120, pitchDeg: 3, rollDeg: 6, scaleMul: 0.9 },
    },
  ]

  it.each(CASES)('$name', ({ upAxis, unit, offset }) => {
    const { alignment, frame, placement } = equivalentPair(upAxis, unit, offset)

    const pcScene = new THREE.Scene()
    const pc = createPointCloudSystem(pcContext(pcScene))
    pc.create('c', alignment)

    const meshScene = new THREE.Scene()
    const mesh = createMeshSystem(meshContext(meshScene))
    mesh.add('m', new THREE.Group(), frame, placement, {
      meshes: 0, triangles: 0, materials: 0, textures: 0, textureBytes: 0,
    })

    const cloudRoot = pcScene.children.find((o) => o.name === 'point-cloud:c')!
    const meshRoot = meshScene.children.find((o) => o.name === 'mesh:m')!
    expect(cloudRoot).toBeTruthy()
    expect(meshRoot).toBeTruthy()

    const a = sample(cloudRoot)
    const b = sample(meshRoot)
    for (let i = 0; i < a.length; i++) {
      // Same arithmetic, so this is exact to floating point, not approximate.
      expect(b[i], `component ${i}`).toBeCloseTo(a[i], 9)
    }

    pc.dispose()
    mesh.dispose()
  })

  it('would notice if only one of them applied the levelling angles', () => {
    // Guards the guard. If pitch/roll were dropped on one side, the case above
    // would still pass whenever the offset happened to be level — so prove the
    // comparison has teeth by showing the two DIFFER when they should.
    const level = equivalentPair('y', 1, { ...NO_OFFSET })
    const tipped = equivalentPair('y', 1, { ...NO_OFFSET, pitchDeg: 8 })

    const scene = new THREE.Scene()
    const mesh = createMeshSystem(meshContext(scene))
    const stats = { meshes: 0, triangles: 0, materials: 0, textures: 0, textureBytes: 0 }
    mesh.add('flat', new THREE.Group(), level.frame, level.placement, stats)
    mesh.add('tipped', new THREE.Group(), tipped.frame, tipped.placement, stats)

    const flat = sample(scene.children.find((o) => o.name === 'mesh:flat')!)
    const tip = sample(scene.children.find((o) => o.name === 'mesh:tipped')!)
    expect(flat).not.toEqual(tip)
    mesh.dispose()
  })
})
