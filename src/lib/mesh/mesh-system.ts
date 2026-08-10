// ─── mesh-system ──────────────────────────────────────────────────────────────
// Lifecycle owner for imported meshes — the fourth sibling of geo-system,
// solar-system and point-cloud-system. This module owns every Three.js resource
// an import touches; meshStore owns the product state; the viewer carries only a
// lazy getMeshes() hook.
//
// Loaded via dynamic import — never import it statically from entry-path code.
//
// Invariants, deliberately the same ones point clouds carry:
//   INV-M1 — the IFC model is never moved, scaled or re-parented. The import is
//            transformed into the model's frame, never the other way round.
//   INV-M2 — every geometry, material and TEXTURE this module uploads is
//            disposed in remove()/dispose(). Textures are the ones that hurt:
//            they are invisible to the geometry graph and three frees none of
//            them on removal from the scene.
//   INV-M3 — an import can never take the scene down. The triangle budget is
//            checked before anything reaches the GPU, because a lost WebGL
//            context blacks out the IFC model too.

import * as THREE from 'three'
import { disposeObject } from './mesh-loader'
import { effectivePlacement } from './mesh-transform'
import { createLogger } from '../logger'
import type { AlignmentOffset, MeshFrame, MeshStats } from './mesh-types'

const log = createLogger('Mesh')

export interface MeshContext {
  scene: THREE.Scene
  getActiveCamera(): THREE.Camera
  renderer: THREE.WebGLRenderer
  frameBox(min: THREE.Vector3, max: THREE.Vector3): void
  /** Offer the import to the app's shared raycaster, so it can be measured. */
  registerRaycastTarget?(object: THREE.Object3D): void
  unregisterRaycastTarget?(object: THREE.Object3D): void
}

export interface MeshSystemAPI {
  add(
    id: string, object: THREE.Object3D, frame: MeshFrame,
    placement: AlignmentOffset, stats: MeshStats,
  ): void
  setPlacement(id: string, frame: MeshFrame, placement: AlignmentOffset): void
  setVisible(id: string, visible: boolean): void
  getBounds(id?: string): { min: THREE.Vector3; max: THREE.Vector3 } | null
  frame(id?: string): void
  remove(id: string): void
  count(): number
  /** Triangles resident across every import — what the budget is checked against. */
  triangleCount(): number
  dispose(): void
}

interface Record_ {
  id: string
  /** Wrapper carrying the placement. The decoded object is its only child. */
  root: THREE.Group
  object: THREE.Object3D
  stats: MeshStats
}

export function createMeshSystem(ctx: MeshContext): MeshSystemAPI {
  const items = new Map<string, Record_>()
  let disposed = false

  function applyPlacement(rec: Record_, frame: MeshFrame, placement: AlignmentOffset): void {
    const t = effectivePlacement(frame, placement)
    rec.root.position.set(t.position.x, t.position.y, t.position.z)
    // The identical composition point clouds use: yaw(Y) ∘ pitch(X) ∘ roll(Z),
    // then the structural tilt that lays a Z-up source into the Y-up scene.
    // Sharing it is what makes a scan and a mesh of the same room agree.
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(t.pitchRad, t.yawRad, t.rollRad, 'YXZ'),
    )
    if (t.tiltRad !== 0) {
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.tiltRad))
    }
    rec.root.quaternion.copy(q)
    rec.root.scale.setScalar(t.scale)
    rec.root.updateMatrixWorld(true)
  }

  function disposeRecord(rec: Record_): void {
    // Withdraw from the shared raycaster BEFORE leaving the scene: the registry
    // is a Set held elsewhere, and a root left in it keeps every texture the
    // import owns reachable after the user deleted it.
    ctx.unregisterRaycastTarget?.(rec.root)
    try { disposeObject(rec.object) } catch (e) { log.warn('dispose failed:', e) }
    rec.root.removeFromParent()
  }

  return {
    add(id, object, frame, placement, stats) {
      if (disposed) return
      const existing = items.get(id)
      if (existing) disposeRecord(existing)

      const root = new THREE.Group()
      root.name = `mesh:${id}`
      root.add(object)
      ctx.scene.add(root)

      const rec: Record_ = { id, root, object, stats }
      items.set(id, rec)
      applyPlacement(rec, frame, placement)
      ctx.registerRaycastTarget?.(root)
    },

    setPlacement(id, frame, placement) {
      const rec = items.get(id)
      if (rec) applyPlacement(rec, frame, placement)
    },

    setVisible(id, visible) {
      const rec = items.get(id)
      if (rec) rec.root.visible = visible
    },

    getBounds(id) {
      const targets = id ? [items.get(id)].filter(Boolean) as Record_[] : [...items.values()]
      if (targets.length === 0) return null
      const box = new THREE.Box3()
      for (const rec of targets) {
        if (!rec.root.visible) continue
        box.union(new THREE.Box3().setFromObject(rec.root))
      }
      return box.isEmpty() ? null : { min: box.min.clone(), max: box.max.clone() }
    },

    frame(id) {
      const b = this.getBounds(id)
      if (b) ctx.frameBox(b.min, b.max)
    },

    remove(id) {
      const rec = items.get(id)
      if (!rec) return
      disposeRecord(rec)
      items.delete(id)
    },

    count() { return items.size },

    triangleCount() {
      let n = 0
      for (const rec of items.values()) n += rec.stats.triangles
      return n
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const rec of items.values()) disposeRecord(rec)
      items.clear()
    },
  }
}
