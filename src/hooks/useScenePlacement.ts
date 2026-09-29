// ─── useScenePlacement ────────────────────────────────────────────────────────
// One door for moving things in the scene: IFC models (viewer pivots +
// sceneStore) and point clouds (alignment offsets + the cloud system), with
// undo/redo and temporary mode recorded around every change.
//
// Components used to call `viewer.setModelTransform` and the store side by side
// and each got the pair slightly different. Everything that moves goes through
// here now, so history sees all of it and a cloud moves with its building.
//
// The math is `lib/rigid-move`; this is wiring.

import React, { useCallback } from 'react'
import type { ViewerAPI } from '../lib/viewer'
import type { ModelTransform } from '../types'
import { useSceneStore } from '../stores/sceneStore'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { useTransformHistoryStore, type PlacementSnapshot } from '../stores/transformHistoryStore'
import { applyRigidMotion, groundPivot, type Member, type RigidMotion, type Vec3 } from '../lib/rigid-move'
import { effectiveTransform } from '../lib/pointcloud/pc-align'
import { NO_OFFSET, type AlignmentOffset } from '../lib/pointcloud/pc-types'

const V0: Vec3 = { x: 0, y: 0, z: 0 }

function snapshot(): PlacementSnapshot {
  const models: Record<string, ModelTransform> = {}
  for (const m of useSceneStore.getState().models) {
    models[m.id] = {
      position: { ...((m.transform.position as Vec3 | undefined) ?? V0) },
      rotation: { ...((m.transform.rotation as Vec3 | undefined) ?? V0) },
      scale: typeof m.transform.scale === 'object' ? { ...m.transform.scale } : (m.transform.scale ?? 1),
    }
  }
  const clouds: Record<string, AlignmentOffset> = {}
  for (const c of usePointCloudStore.getState().clouds) {
    if (c.alignment) clouds[c.id] = { ...c.alignment.offset }
  }
  return { models, clouds }
}

export interface ScenePlacement {
  /** Members (model + cloud) of these ids, in their current placement. */
  membersOf: (ids: ReadonlyArray<string>) => Member[]
  /** Plan centre at floor level of these ids' world boxes. */
  pivotOf: (ids: ReadonlyArray<string>) => Vec3 | null
  /** Move these ids as one rigid body. Recorded for undo. */
  moveRigid: (ids: ReadonlyArray<string>, motion: RigidMotion) => void
  /** Set one model's transform (per-file editing). Recorded for undo. */
  setModelTransform: (id: string, t: ModelTransform) => void
  /** Restore identity for these models and zero these clouds' offsets. Recorded. */
  reset: (ids: ReadonlyArray<string>) => void
  undo: () => void
  redo: () => void
  beginTemporary: () => void
  endTemporary: (restore: boolean) => void
}

export function useScenePlacement(viewerApiRef: React.MutableRefObject<ViewerAPI | null>): ScenePlacement {
  const applyModel = useCallback((id: string, t: ModelTransform) => {
    useSceneStore.getState().setModelTransform(id, t)
    viewerApiRef.current?.setModelTransform(t, id)
  }, [viewerApiRef])

  const applyCloud = useCallback((id: string, offset: Partial<AlignmentOffset>) => {
    const store = usePointCloudStore.getState()
    store.setOffset(id, offset)
    const next = usePointCloudStore.getState().clouds.find((c) => c.id === id)
    if (next?.alignment) {
      const alignment = next.alignment
      // Synchronously when the system is loaded (it is, if a cloud exists): the
      // pivot is read back from the cloud's bounds right after this, and a
      // deferred apply made it read the OLD box — each turn then used a stale
      // pivot and the set drifted.
      const system = viewerApiRef.current?.peekPointClouds()
      if (system) system.setAlignment(id, alignment)
      else void viewerApiRef.current?.getPointClouds().then((s) => s.setAlignment(id, alignment))
    }
  }, [viewerApiRef])

  const applySnapshot = useCallback((snap: PlacementSnapshot) => {
    const loadedModels = new Set(useSceneStore.getState().models.map((m) => m.id))
    for (const [id, t] of Object.entries(snap.models)) if (loadedModels.has(id)) applyModel(id, t)
    const loadedClouds = new Set(usePointCloudStore.getState().clouds.map((c) => c.id))
    for (const [id, o] of Object.entries(snap.clouds)) if (loadedClouds.has(id)) applyCloud(id, o)
  }, [applyModel, applyCloud])

  const record = useCallback(() => useTransformHistoryStore.getState().record(snapshot()), [])

  const membersOf = useCallback((ids: ReadonlyArray<string>): Member[] => {
    const want = new Set(ids)
    const out: Member[] = []
    for (const m of useSceneStore.getState().models) {
      if (!want.has(m.id)) continue
      out.push({
        kind: 'model',
        id: m.id,
        position: (m.transform.position as Vec3 | undefined) ?? V0,
        rotation: (m.transform.rotation as Vec3 | undefined) ?? V0,
      })
    }
    for (const c of usePointCloudStore.getState().clouds) {
      // A cloud still parsing has no alignment yet and nothing to move.
      if (!want.has(c.id) || !c.alignment) continue
      const t = effectiveTransform(c.alignment)
      const o = c.alignment.offset ?? NO_OFFSET
      out.push({ kind: 'cloud', id: c.id, position: t.position, offset: { x: o.x, y: o.y, z: o.z }, yawDeg: o.yawDeg })
    }
    return out
  }, [])

  const pivotOf = useCallback((ids: ReadonlyArray<string>): Vec3 | null => {
    const api = viewerApiRef.current
    if (!api) return null
    const want = new Set(ids)
    return groundPivot(api.getFramingItems({ visibleCloudIds: [...want] }).filter((i) => want.has(i.id)).map((i) => i.box))
  }, [viewerApiRef])

  const moveRigid = useCallback((ids: ReadonlyArray<string>, motion: RigidMotion) => {
    const members = membersOf(ids)
    if (members.length === 0) return
    record()
    for (const u of applyRigidMotion(members, motion)) {
      if (u.kind === 'model') applyModel(u.id, { position: u.position, rotation: u.rotation })
      else applyCloud(u.id, { x: u.offset.x, y: u.offset.y, z: u.offset.z, yawDeg: u.yawDeg })
    }
  }, [membersOf, record, applyModel, applyCloud])

  const setModelTransform = useCallback((id: string, t: ModelTransform) => {
    record()
    applyModel(id, t)
  }, [record, applyModel])

  const reset = useCallback((ids: ReadonlyArray<string>) => {
    record()
    const want = new Set(ids)
    for (const m of useSceneStore.getState().models) {
      if (!want.has(m.id)) continue
      useSceneStore.getState().setModelTransform(m.id, { position: V0, rotation: V0, scale: 1 })
      viewerApiRef.current?.resetModelTransform(m.id)
    }
    for (const c of usePointCloudStore.getState().clouds) {
      if (want.has(c.id) && c.alignment) applyCloud(c.id, { x: 0, y: 0, z: 0, yawDeg: 0 })
    }
  }, [record, viewerApiRef, applyCloud])

  const undo = useCallback(() => {
    const prev = useTransformHistoryStore.getState().undo(snapshot())
    if (prev) applySnapshot(prev)
  }, [applySnapshot])

  const redo = useCallback(() => {
    const next = useTransformHistoryStore.getState().redo(snapshot())
    if (next) applySnapshot(next)
  }, [applySnapshot])

  const beginTemporary = useCallback(() => useTransformHistoryStore.getState().beginTemporary(snapshot()), [])

  const endTemporary = useCallback((restore: boolean) => {
    const current = snapshot()
    const base = useTransformHistoryStore.getState().endTemporary(restore)
    if (base) {
      // Restoring is itself undoable: someone who pressed Restore by mistake
      // gets their temporary arrangement back with one undo.
      useTransformHistoryStore.getState().record(current)
      applySnapshot(base)
    }
  }, [applySnapshot])

  return { membersOf, pivotOf, moveRigid, setModelTransform, reset, undo, redo, beginTemporary, endTemporary }
}
