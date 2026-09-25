// ─── rigid-move ───────────────────────────────────────────────────────────────
// MOVE SEVERAL THINGS AS ONE.
//
// A federated building is three IFC files and a scan whose relative placement
// IS the information. Moving it as a group must keep that placement exactly:
// every member gets the same rigid motion — a turn about ONE shared pivot and
// then one shared translation.
//
// The trap this exists to avoid: rotating each member by the same angle about
// its OWN origin. Three files turned 30° each about their own pivots end up
// scattered, because their pivots are not in the same place. The correct
// rotation moves each member's position around the common pivot as well:
//
//     p' = c + Ry(θ)·(p − c) + d        R' = Ry(θ)·R
//
// Only YAW (about scene +Y) is offered for groups. It is what calibrating a
// set against a map or a survey needs (heading), and it is the one rotation
// that composes exactly with both the IFC pivots and the point-cloud
// alignments (whose yaw is outermost). Tilting a whole site is not a real
// workflow and would silently fight the clouds' levelling.
//
// PURE: numbers in, numbers out. Uses THREE's math only, never a scene.

import * as THREE from 'three'

export interface Vec3 { x: number; y: number; z: number }

export interface ModelMember {
  kind: 'model'
  id: string
  position: Vec3
  /** Euler degrees, XYZ order (THREE default — what the viewer pivot uses). */
  rotation: Vec3
}

export interface CloudMember {
  kind: 'cloud'
  id: string
  /** Scene position of the cloud root (alignment origin + offset). */
  position: Vec3
  /** The manual part of that position, which is what we are allowed to edit. */
  offset: Vec3
  yawDeg: number
}

export type Member = ModelMember | CloudMember

export interface RigidMotion {
  /** Yaw about scene +Y, degrees, applied about `pivot`. */
  yawDeg?: number
  pivot?: Vec3
  /** Translation applied after the turn. */
  delta?: Vec3
}

export type MemberUpdate =
  | { kind: 'model'; id: string; position: Vec3; rotation: Vec3 }
  | { kind: 'cloud'; id: string; offset: Vec3; yawDeg: number }

const DEG = Math.PI / 180
const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

/** Round away float dust so inputs show 30, not 29.999999999999996. */
const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6
  return Object.is(r, -0) ? 0 : r
}
const tidyV = (v: Vec3): Vec3 => ({ x: tidy(v.x), y: tidy(v.y), z: tidy(v.z) })

function turnAbout(p: Vec3, c: Vec3, yawRad: number): Vec3 {
  const cos = Math.cos(yawRad)
  const sin = Math.sin(yawRad)
  const dx = p.x - c.x
  const dz = p.z - c.z
  // THREE's Ry: x' = x cos + z sin, z' = −x sin + z cos
  return { x: c.x + dx * cos + dz * sin, y: p.y, z: c.z - dx * sin + dz * cos }
}

/** Ry(θ)·R for an XYZ Euler in degrees, back to XYZ degrees. */
export function composeYaw(rotationDeg: Vec3, yawDeg: number): Vec3 {
  if (!yawDeg) return { ...rotationDeg }
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotationDeg.x * DEG, rotationDeg.y * DEG, rotationDeg.z * DEG, 'XYZ'),
  )
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDeg * DEG))
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  return tidyV({ x: e.x / DEG, y: e.y / DEG, z: e.z / DEG })
}

export function applyRigidMotion(members: ReadonlyArray<Member>, motion: RigidMotion): MemberUpdate[] {
  const yawDeg = motion.yawDeg ?? 0
  const yawRad = yawDeg * DEG
  const c = motion.pivot ?? ZERO
  const d = motion.delta ?? ZERO

  return members.map((m): MemberUpdate => {
    const turned = yawDeg ? turnAbout(m.position, c, yawRad) : m.position
    const moved = { x: turned.x + d.x, y: turned.y + d.y, z: turned.z + d.z }
    if (m.kind === 'model') {
      return { kind: 'model', id: m.id, position: tidyV(moved), rotation: composeYaw(m.rotation, yawDeg) }
    }
    // A cloud's position is origin + offset and only the offset is ours, so
    // the move is applied to the offset as a difference.
    return {
      kind: 'cloud',
      id: m.id,
      offset: tidyV({
        x: m.offset.x + (moved.x - m.position.x),
        y: m.offset.y + (moved.y - m.position.y),
        z: m.offset.z + (moved.z - m.position.z),
      }),
      yawDeg: tidy(((m.yawDeg + yawDeg) % 360 + 540) % 360 - 180),
    }
  })
}

/** Plan centre at floor level of a union of world boxes — the natural pivot for a set. */
export function groundPivot(boxes: ReadonlyArray<{ min: Vec3; max: Vec3 }>): Vec3 | null {
  let min: Vec3 | null = null
  let max: Vec3 | null = null
  for (const b of boxes) {
    if (![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite)) continue
    min = min ? { x: Math.min(min.x, b.min.x), y: Math.min(min.y, b.min.y), z: Math.min(min.z, b.min.z) } : { ...b.min }
    max = max ? { x: Math.max(max.x, b.max.x), y: Math.max(max.y, b.max.y), z: Math.max(max.z, b.max.z) } : { ...b.max }
  }
  if (!min || !max) return null
  return tidyV({ x: (min.x + max.x) / 2, y: min.y, z: (min.z + max.z) / 2 })
}
