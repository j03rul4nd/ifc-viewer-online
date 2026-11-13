// ─── compare/view-split.ts ────────────────────────────────────────────────────
// Curtain (A | B slider) over one camera (spec 10 V2.4), in the MAIN renderer.
// A second WebGL renderer cannot draw the fragments models: fragments frees
// the CPU copy of each buffer once it is on the GPU, so another context has
// nothing to upload (it throws in createBuffer and takes the viewer down).
// Instead every frame a vertical plane through the camera eye and the screen
// column of the handle clips the meshes: A keeps the left side, B the right.
// Uses only the public ViewerAPI; viewer.ts is untouched.

import * as THREE from 'three'
import type { ViewerAPI } from '../viewer'

export interface CurtainHandle {
  setCurtain(x: number): void
  /** Frames per second of the main view over the last second. */
  fps(): number
  dispose(): void
}

type Clippable = THREE.Material & { clippingPlanes: THREE.Plane[] | null }

function materialsOf(root: THREE.Object3D, out: Set<Clippable>): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    for (const x of Array.isArray(m) ? m : m ? [m] : []) out.add(x as Clippable)
  })
}

export function startCurtain(v: ViewerAPI, modelIdsA: string[], modelIdsB: string[], curtain = 0.5): CurtainHandle {
  const planeA = new THREE.Plane()
  const planeB = new THREE.Plane()
  const touched = new Map<Clippable, THREE.Plane[] | null>()
  let x = curtain
  let raf = 0
  let frames = 0, lastFps = 0, fpsT = performance.now()
  let disposed = false
  const fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3(), dir = new THREE.Vector3(), n = new THREE.Vector3()

  const assign = (ids: string[], plane: THREE.Plane, other: Set<Clippable>): Set<Clippable> => {
    const mats = new Set<Clippable>()
    for (const id of ids) { const o = v.getModelObject(id); if (o) materialsOf(o, mats) }
    for (const m of mats) {
      if (other.has(m)) continue // shared by both sides: leave it unclipped
      if (!touched.has(m)) touched.set(m, m.clippingPlanes ?? null)
      if (m.clippingPlanes?.[0] !== plane) { m.clippingPlanes = [plane]; m.needsUpdate = true }
    }
    return mats
  }

  const frame = (): void => {
    if (disposed) return
    raf = requestAnimationFrame(frame)
    const vp = v.getCameraViewpoint()
    if (!vp) return
    fwd.set(vp.direction.x, vp.direction.y, vp.direction.z).normalize()
    up.set(vp.up?.x ?? 0, vp.up?.y ?? 1, vp.up?.z ?? 0).normalize()
    right.crossVectors(fwd, up).normalize()
    const half = Math.tan(THREE.MathUtils.degToRad(vp.fovDeg) / 2) * vp.aspect
    dir.copy(fwd).addScaledVector(right, (2 * x - 1) * half)
    n.crossVectors(dir, up).normalize() // points to the right of the handle
    const eye = new THREE.Vector3(vp.position.x, vp.position.y, vp.position.z)
    planeB.setFromNormalAndCoplanarPoint(n, eye)            // keeps the right side
    planeA.setFromNormalAndCoplanarPoint(n.clone().negate(), eye) // keeps the left side
    // New fragment tiles stream in: (re)assign every frame, cheap for a few hundred materials.
    const matsB = new Set<Clippable>()
    for (const id of modelIdsB) { const o = v.getModelObject(id); if (o) materialsOf(o, matsB) }
    const matsA = assign(modelIdsA, planeA, matsB)
    assign(modelIdsB, planeB, matsA)
    v.drawingHost().requestRender()
    frames++
    const now = performance.now()
    if (now - fpsT >= 1000) { lastFps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now }
  }
  frame()

  return {
    setCurtain(nx) { x = nx },
    fps: () => lastFps,
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      for (const [m, prev] of touched) { m.clippingPlanes = prev; m.needsUpdate = true }
      touched.clear()
      try { v.drawingHost().requestRender() } catch { /* viewer gone */ }
    },
  }
}
