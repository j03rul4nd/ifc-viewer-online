// ─── focus ────────────────────────────────────────────────────────────────────
// The camera-moves, applied to the live viewer.

import type { ViewerAPI } from '../viewer'
import { focusPose, type Box3, type FocusOptions, type Pose } from './camera-moves'

/** The camera as a pose, or null before there is one. */
export function currentPose(viewer: ViewerAPI): Pose | null {
  const cam = viewer.getCameraViewpoint()
  return cam ? { position: cam.position, target: cam.target } : null
}

/** Apply a step (zoom, turn, top view…) to the current camera, animated. */
export function stepCamera(viewer: ViewerAPI, step: (p: Pose) => Pose): void {
  const p = currentPose(viewer)
  if (!p) return
  const next = step(p)
  viewer.setCameraLookAt(next.position, next.target, true)
}

/** Go and look at a box with its surroundings (see camera-moves `focusPose`). */
export function focusBox(viewer: ViewerAPI, box: Box3, opts?: FocusOptions): void {
  stepCamera(viewer, (p) => focusPose(p, box, opts))
}

/**
 * Go and look at elements with their surroundings — the replacement for
 * `frameElements` wherever the point is to SEE something in context rather
 * than to fill the screen with it. False when the elements have no geometry.
 */
export async function focusElements(viewer: ViewerAPI, ids: number[], modelId?: string, opts?: FocusOptions): Promise<boolean> {
  if (ids.length === 0) return false
  const box = await viewer.getElementsBox(ids, modelId).catch(() => null)
  if (!box) return false
  focusBox(viewer, box, opts)
  return true
}
