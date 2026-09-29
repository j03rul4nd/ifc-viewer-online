// ─── useSceneGizmo ────────────────────────────────────────────────────────────
// Puts the viewer's move/turn handle on the current scope's pivot and routes
// its drags into placement (one undo step per drag, clouds included).
//
// The handle follows the set: after an undo, a typed edit or a group change it
// re-seats itself on the new pivot. It is removed when the mode is off, the
// scope is empty or the owning panel unmounts — a handle nobody can see the
// controls for is a trap on the canvas.

import React, { useEffect, useRef } from 'react'
import type { ViewerAPI } from '../lib/viewer'
import type { GizmoMode } from '../lib/scene-gizmo'
import type { ScenePlacement } from './useScenePlacement'
import type { Vec3 } from '../lib/rigid-move'
import { useSceneStore } from '../stores/sceneStore'
import { usePointCloudStore } from '../stores/pointCloudStore'

export function useSceneGizmo(
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>,
  placement: ScenePlacement,
  ids: ReadonlyArray<string>,
  mode: GizmoMode | null,
): void {
  // Key the effect on the id LIST, not the array identity, or every render of
  // the panel would tear the handle down and rebuild it mid-drag.
  const idsKey = ids.join('|')
  const placementRef = useRef(placement)
  placementRef.current = placement

  useEffect(() => {
    const api = viewerApiRef.current
    const list = idsKey ? idsKey.split('|') : []
    if (!api || !mode || list.length === 0) {
      api?.setGizmo(null)
      return
    }
    const pivot = placementRef.current.pivotOf(list)
    if (!pivot) { api.setGizmo(null); return }

    let drag: ReturnType<ScenePlacement['beginDrag']> | null = null
    let startPivot: Vec3 = pivot
    let dragging = false

    api.setGizmo({
      position: pivot,
      mode,
      onStart: () => {
        dragging = true
        startPivot = placementRef.current.pivotOf(list) ?? startPivot
        drag = placementRef.current.beginDrag(list)
      },
      onChange: (m) => drag?.update({ delta: m.delta, yawDeg: m.yawDeg, pivot: startPivot }),
      onEnd: () => {
        drag?.end()
        drag = null
        dragging = false
        const p = placementRef.current.pivotOf(list)
        if (p) api.setGizmoPosition(p)
      },
    })

    // Follow placement changes made elsewhere (undo, numeric fields, reset).
    const reseat = (): void => {
      if (dragging) return
      const p = placementRef.current.pivotOf(list)
      if (p) api.setGizmoPosition(p)
    }
    const unsubModels = useSceneStore.subscribe((s, prev) => { if (s.models !== prev.models) reseat() })
    const unsubClouds = usePointCloudStore.subscribe((s, prev) => { if (s.clouds !== prev.clouds) reseat() })

    return () => {
      unsubModels()
      unsubClouds()
      api.setGizmo(null)
    }
  }, [viewerApiRef, idsKey, mode])
}
