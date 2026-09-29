// ─── scene-gizmo ──────────────────────────────────────────────────────────────
// The 3D handle for moving a model, a group or the whole scene by dragging.
//
// The gizmo does NOT move anything itself. It moves an empty proxy sitting on
// the scope's pivot and reports the TOTAL motion since the drag started —
// translation and yaw — to whoever owns placement (`useScenePlacement`), which
// applies it to every member as one rigid body from the pre-drag state. Keeping
// the gizmo ignorant of models is what lets one handle drive a single IFC, a
// federated set and its scans alike, and lets undo record one step per drag.
//
// Rotation is YAW ONLY (the ring about scene +Y), for the reason rigid-move
// gives: it is the rotation that calibrating a set needs, and the one that
// composes exactly with point-cloud alignments.

import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

export type GizmoMode = 'translate' | 'rotate'

export interface GizmoMotion {
  /** Translation since the drag started, scene metres. */
  delta: { x: number; y: number; z: number }
  /** Yaw about +Y since the drag started, degrees (unwrapped, may exceed ±180). */
  yawDeg: number
}

export interface GizmoOptions {
  /** Where the handle sits — the scope's pivot. */
  position: { x: number; y: number; z: number }
  mode: GizmoMode
  onStart?: () => void
  onChange: (motion: GizmoMotion) => void
  onEnd?: (motion: GizmoMotion) => void
}

export interface SceneGizmoContext {
  scene: THREE.Scene
  getCamera: () => THREE.Camera
  domElement: HTMLElement
  /** Orbit controls must stand down while a handle is dragged. */
  setOrbitEnabled: (enabled: boolean) => void
}

export interface SceneGizmo {
  /** Show the handle with these options, or hide it with null. */
  set(opts: GizmoOptions | null): void
  /** Move the handle without starting a drag (after undo, or a typed edit). */
  setPosition(p: { x: number; y: number; z: number }): void
  /** True while the pointer is over (or dragging) a handle axis — a click there is not a selection. */
  isHot(): boolean
  isDragging(): boolean
  dispose(): void
}

const DEG = 180 / Math.PI

/** Smallest signed difference a − b in degrees, in (−180, 180]. */
export function wrapDeltaDeg(a: number, b: number): number {
  let d = (a - b) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

export function createSceneGizmo(ctx: SceneGizmoContext): SceneGizmo {
  const proxy = new THREE.Object3D()
  proxy.name = 'scene-gizmo-proxy'
  // YXZ: with pitch and roll locked at zero, `.y` is the yaw straight, with no
  // Euler flip at ±90° the XYZ order would introduce.
  proxy.rotation.order = 'YXZ'
  ctx.scene.add(proxy)

  const controls = new TransformControls(ctx.getCamera(), ctx.domElement)
  controls.setSize(0.9)
  controls.setRotationSnap(THREE.MathUtils.degToRad(1))
  const helper = controls.getHelper()
  helper.name = 'scene-gizmo'
  helper.visible = false
  controls.enabled = false
  ctx.scene.add(helper)

  let opts: GizmoOptions | null = null
  let dragging = false
  const start = new THREE.Vector3()
  let lastYaw = 0
  let yawAccum = 0

  const motion = (): GizmoMotion => ({
    delta: { x: proxy.position.x - start.x, y: proxy.position.y - start.y, z: proxy.position.z - start.z },
    yawDeg: yawAccum,
  })

  controls.addEventListener('dragging-changed', (e) => {
    const on = Boolean((e as unknown as { value: boolean }).value)
    dragging = on
    ctx.setOrbitEnabled(!on)
    if (!opts) return
    if (on) {
      start.copy(proxy.position)
      lastYaw = proxy.rotation.y * DEG
      yawAccum = 0
      opts.onStart?.()
    } else {
      const m = motion()
      // The ring stays upright for the next drag; the model keeps the yaw.
      proxy.rotation.set(0, 0, 0)
      opts.onEnd?.(m)
    }
  })

  controls.addEventListener('objectChange', () => {
    if (!opts || !dragging) return
    const yaw = proxy.rotation.y * DEG
    yawAccum += wrapDeltaDeg(yaw, lastYaw)
    lastYaw = yaw
    opts.onChange(motion())
  })

  function applyMode(mode: GizmoMode): void {
    controls.setMode(mode)
    // Yaw only: the ring about Y. Translation keeps all three axes — lifting a
    // model to its datum is as common as sliding it.
    controls.showX = mode === 'translate'
    controls.showZ = mode === 'translate'
    controls.showY = true
  }

  return {
    set(next) {
      opts = next
      if (!next) {
        controls.detach()
        controls.enabled = false
        helper.visible = false
        if (dragging) { dragging = false; ctx.setOrbitEnabled(true) }
        return
      }
      // The camera can be swapped (perspective ↔ orthographic, walk mode):
      // take whichever is current each time the handle is shown.
      controls.camera = ctx.getCamera()
      if (!dragging) {
        proxy.position.set(next.position.x, next.position.y, next.position.z)
        proxy.rotation.set(0, 0, 0)
      }
      applyMode(next.mode)
      controls.attach(proxy)
      controls.enabled = true
      helper.visible = true
    },
    setPosition(p) {
      if (dragging) return
      proxy.position.set(p.x, p.y, p.z)
    },
    isHot: () => controls.enabled && (dragging || controls.axis !== null),
    isDragging: () => dragging,
    dispose() {
      controls.detach()
      controls.dispose()
      ctx.scene.remove(helper)
      ctx.scene.remove(proxy)
    },
  }
}
