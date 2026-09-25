import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyRigidMotion, composeYaw, groundPivot, type Member } from './rigid-move'

const model = (id: string, x: number, z: number, rotY = 0): Member => ({
  kind: 'model', id, position: { x, y: 0, z }, rotation: { x: 0, y: rotY, z: 0 },
})

/** World position of a local point under a model pivot (T·R). */
function worldOf(pos: { x: number; y: number; z: number }, rotDeg: { x: number; y: number; z: number }, local: THREE.Vector3): THREE.Vector3 {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(pos.x, pos.y, pos.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  )
  return local.clone().applyMatrix4(m)
}

describe('applyRigidMotion', () => {
  it('translates every member by the same delta', () => {
    const out = applyRigidMotion([model('a', 0, 0), model('b', 10, 5)], { delta: { x: 1, y: 2, z: 3 } })
    expect(out.map((u) => (u.kind === 'model' ? u.position : null))).toEqual([{ x: 1, y: 2, z: 3 }, { x: 11, y: 2, z: 8 }])
  })

  it('turns members about the SHARED pivot, preserving their relative placement', () => {
    const members = [model('a', 0, 0), model('b', 10, 0)]
    const out = applyRigidMotion(members, { yawDeg: 90, pivot: { x: 5, y: 0, z: 0 } })
    // A point that sat on each model's origin must stay 10 m from the other.
    const pa = out[0].kind === 'model' ? out[0].position : null
    const pb = out[1].kind === 'model' ? out[1].position : null
    expect(Math.hypot(pa!.x - pb!.x, pa!.z - pb!.z)).toBeCloseTo(10)
    // 90° about +Y sends +X to −Z: a (left of pivot) goes to +Z side.
    expect(pa).toEqual({ x: 5, y: 0, z: 5 })
    expect(out[0].kind === 'model' && out[0].rotation.y).toBeCloseTo(90)
  })

  it('moves geometry exactly like rotating the whole set as one rigid body', () => {
    const m = model('a', 3, -2, 20) as Extract<Member, { kind: 'model' }>
    m.rotation.x = 10
    const pivot = { x: 1, y: 0, z: 4 }
    const [u] = applyRigidMotion([m], { yawDeg: 35, pivot, delta: { x: 0, y: 1, z: 0 } })
    if (u.kind !== 'model') throw new Error()
    const local = new THREE.Vector3(2, 1, -3)
    const before = worldOf(m.position, m.rotation, local)
    const expected = before.clone().sub(new THREE.Vector3(pivot.x, pivot.y, pivot.z))
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), 35 * Math.PI / 180)
      .add(new THREE.Vector3(pivot.x, pivot.y + 1, pivot.z))
    const after = worldOf(u.position, u.rotation, local)
    expect(after.distanceTo(expected)).toBeLessThan(1e-4)
  })

  it('edits a cloud through its offset and adds the yaw', () => {
    const cloud: Member = { kind: 'cloud', id: 'c', position: { x: 10, y: 0, z: 0 }, offset: { x: 2, y: 0, z: 0 }, yawDeg: 170 }
    const [u] = applyRigidMotion([cloud], { yawDeg: 20, pivot: { x: 0, y: 0, z: 0 } })
    if (u.kind !== 'cloud') throw new Error()
    expect(u.yawDeg).toBeCloseTo(-170)
    // position (10,0,0) → Ry(20°): (cos20·10, 0, −sin20·10); offset gets the difference.
    expect(u.offset.x).toBeCloseTo(2 + 10 * Math.cos(20 * Math.PI / 180) - 10)
    expect(u.offset.z).toBeCloseTo(-10 * Math.sin(20 * Math.PI / 180))
  })
})

describe('composeYaw', () => {
  it('adds yaw to a pure yaw', () => {
    expect(composeYaw({ x: 0, y: 30, z: 0 }, 15).y).toBeCloseTo(45)
  })
})

describe('groundPivot', () => {
  it('is the plan centre at the lowest floor', () => {
    expect(groundPivot([
      { min: { x: 0, y: 2, z: 0 }, max: { x: 10, y: 5, z: 10 } },
      { min: { x: 20, y: -1, z: 0 }, max: { x: 30, y: 3, z: 4 } },
    ])).toEqual({ x: 15, y: -1, z: 5 })
    expect(groundPivot([])).toBeNull()
  })
})
