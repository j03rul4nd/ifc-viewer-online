// ─── Mesh store ───────────────────────────────────────────────────────────────
// Intent and status for imported meshes. Three.js resources live in
// src/lib/mesh/mesh-system.ts; this store never holds a Three object (repo
// convention: serialisable state only).

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { clampOffset, NO_OFFSET } from '../lib/pointcloud/pc-types'
import {
  EMPTY_STATS, MAX_TRIANGLES_DEFAULT,
  type AlignmentOffset, type MeshEntry, type MeshFrame, type UpAxis,
} from '../lib/mesh/mesh-types'

/**
 * Persistence is installed by the lazy mesh chunk rather than imported here, for
 * the same reason the point cloud store does it: the toolbar imports this store
 * eagerly, and the writers live beside the loader.
 */
let onPlacementPersist: ((fileKey: string, placement: AlignmentOffset) => void) | null = null
let onUpAxisPersist: ((fileKey: string, axis: UpAxis) => void) | null = null
let onUnitPersist: ((fileKey: string, unitScale: number) => void) | null = null

export function registerMeshPersistence(fns: {
  placement: (fileKey: string, placement: AlignmentOffset) => void
  upAxis: (fileKey: string, axis: UpAxis) => void
  unit: (fileKey: string, unitScale: number) => void
}): void {
  onPlacementPersist = fns.placement
  onUpAxisPersist = fns.upAxis
  onUnitPersist = fns.unit
}

interface MeshStore {
  meshes: MeshEntry[]
  activeMeshId: string | null
  panelOpen: boolean
  maxTriangles: number
  /** Cancellation token — bumped whenever an import is dropped. */
  epoch: number

  setPanelOpen: (open: boolean) => void
  addMesh: (entry: MeshEntry) => void
  updateMesh: (id: string, patch: Partial<MeshEntry>) => void
  removeMesh: (id: string) => void
  setActiveMesh: (id: string | null) => void
  setVisible: (id: string, visible: boolean) => void
  /** Merge a manual nudge. Clamped, and persisted per file. */
  setPlacement: (id: string, placement: Partial<AlignmentOffset>) => void
  resetPlacement: (id: string) => void
  /** Correct the source's vertical axis. Writes to the frame, like scans do. */
  setUpAxis: (id: string, axis: UpAxis) => void
  /** Correct the source unit when the size guess was wrong. */
  setUnitScale: (id: string, unitScale: number) => void
  clearMeshes: () => void
}

export const useMeshStore = create<MeshStore>()(
  devtools(
    (set) => ({
      meshes: [],
      activeMeshId: null,
      panelOpen: false,
      maxTriangles: MAX_TRIANGLES_DEFAULT,
      epoch: 0,

      setPanelOpen: (open) => set({ panelOpen: open }, false, 'setPanelOpen'),

      addMesh: (entry) =>
        set(
          (s) => ({
            meshes: [...s.meshes.filter((m) => m.id !== entry.id), entry],
            activeMeshId: entry.id,
          }),
          false,
          'addMesh',
        ),

      updateMesh: (id, patch) =>
        set(
          (s) => ({ meshes: s.meshes.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
          false,
          'updateMesh',
        ),

      removeMesh: (id) =>
        set(
          (s) => {
            const meshes = s.meshes.filter((m) => m.id !== id)
            return {
              meshes,
              epoch: s.epoch + 1,
              activeMeshId: s.activeMeshId === id
                ? (meshes[meshes.length - 1]?.id ?? null)
                : s.activeMeshId,
            }
          },
          false,
          'removeMesh',
        ),

      setActiveMesh: (id) => set({ activeMeshId: id }, false, 'setActiveMesh'),

      setVisible: (id, visible) =>
        set(
          (s) => ({ meshes: s.meshes.map((m) => (m.id === id ? { ...m, visible } : m)) }),
          false,
          'setVisible',
        ),

      setPlacement: (id, placement) =>
        set(
          (s) => ({
            meshes: s.meshes.map((m) => {
              if (m.id !== id) return m
              const next = clampOffset({ ...m.placement, ...placement })
              onPlacementPersist?.(m.fileKey, next)
              return { ...m, placement: next }
            }),
          }),
          false,
          'setPlacement',
        ),

      resetPlacement: (id) =>
        set(
          (s) => ({
            meshes: s.meshes.map((m) => {
              if (m.id !== id) return m
              onPlacementPersist?.(m.fileKey, { ...NO_OFFSET })
              return { ...m, placement: { ...NO_OFFSET } }
            }),
          }),
          false,
          'resetPlacement',
        ),

      setUpAxis: (id, axis) =>
        set(
          (s) => ({
            meshes: s.meshes.map((m) => {
              if (m.id !== id || !m.frame) return m
              onUpAxisPersist?.(m.fileKey, axis)
              return { ...m, frame: { ...m.frame, upAxis: axis, upAxisSource: 'user' } }
            }),
          }),
          false,
          'setUpAxis',
        ),

      setUnitScale: (id, unitScale) =>
        set(
          (s) => ({
            meshes: s.meshes.map((m) => {
              if (m.id !== id || !m.frame) return m
              // Guard the same range the loader does. A unit of zero collapses
              // the object to a point that no control can recover.
              const u = Number.isFinite(unitScale) && unitScale > 0
                ? Math.min(1e6, Math.max(1e-6, unitScale))
                : 1
              onUnitPersist?.(m.fileKey, u)
              return { ...m, frame: { ...m.frame, unitScale: u, unitSource: 'user' } }
            }),
          }),
          false,
          'setUnitScale',
        ),

      clearMeshes: () =>
        set((s) => ({ meshes: [], activeMeshId: null, epoch: s.epoch + 1 }), false, 'clearMeshes'),
    }),
    { name: 'MeshStore' },
  ),
)

/** A blank entry, for the moment an import starts and the UI needs a row. */
export function pendingEntry(
  id: string, file: File, format: MeshEntry['format'], fileKey: string,
): MeshEntry {
  return {
    id,
    fileName: file.name,
    fileSize: file.size,
    format,
    status: 'loading',
    errorKey: null,
    visible: true,
    stats: { ...EMPTY_STATS },
    frame: null,
    placement: { ...NO_OFFSET },
    fileKey,
    loadedAt: Date.now(),
  }
}

export type { MeshEntry, MeshFrame }
