// ─── Scene store ──────────────────────────────────────────────────────────────
// Tracks all models currently loaded in the 3D scene. Designed to hold multiple
// models simultaneously (Sprint 5 multi-model). For now a single model is added
// on load and cleared on navigate-to-landing.
//
// The store intentionally knows nothing about Three.js objects — it holds only
// serialisable data (IDs, names, transforms). The ViewerAPI owns the actual
// geometry; the store owns the UI metadata and user overrides.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SceneModel, ModelTransform, ModelInfo } from '../types'

// ── Store types ────────────────────────────────────────────────────────────────

interface SceneStore {
  models:        SceneModel[]
  activeModelId: string | null

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Called by loader when a model finishes loading into the scene. */
  addModel:         (id: string, info: ModelInfo) => void
  /** Remove a model entry (call AFTER the viewer has disposed the geometry). */
  removeModel:      (id: string) => void
  /** Toggle or set a model's visibility flag (reflects viewer applyFilters state). */
  setModelVisible:  (id: string, visible: boolean) => void
  /** Store the updated transform so the UI stays in sync with viewer state. */
  setModelTransform:(id: string, transform: ModelTransform) => void
  /** Select which model the scene controls operate on. */
  setActiveModel:   (id: string | null) => void
  /** Clear all models — called on navigate-to-landing. */
  clearScene:       () => void
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useSceneStore = create<SceneStore>()(
  devtools(
    (set) => ({
      models:        [],
      activeModelId: null,

      addModel: (id, info) =>
        set(
          (s) => {
            // Replace existing entry with the same id if re-loaded
            const filtered = s.models.filter((m) => m.id !== id)
            const entry: SceneModel = {
              id,
              fileName:     info.fileName,
              fileSize:     info.fileSize,
              elementCount: info.elementCount,
              categories:   info.categories,
              visible:      true,
              transform:    { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 },
              loadedAt:     Date.now(),
            }
            return { models: [...filtered, entry], activeModelId: id }
          },
          false,
          'addModel',
        ),

      removeModel: (id) =>
        set(
          (s) => {
            const models = s.models.filter((m) => m.id !== id)
            let activeModelId = s.activeModelId
            if (activeModelId === id) {
              // Promote the most-recently-loaded remaining model so the UI is never left with no active model
              const next = [...models].sort((a, b) => b.loadedAt - a.loadedAt)[0]
              activeModelId = next?.id ?? null
            }
            return { models, activeModelId }
          },
          false,
          'removeModel',
        ),

      setModelVisible: (id, visible) =>
        set(
          (s) => ({
            models: s.models.map((m) => m.id === id ? { ...m, visible } : m),
          }),
          false,
          'setModelVisible',
        ),

      setModelTransform: (id, transform) =>
        set(
          (s) => ({
            models: s.models.map((m) =>
              m.id === id
                ? { ...m, transform: { ...m.transform, ...transform } }
                : m,
            ),
          }),
          false,
          'setModelTransform',
        ),

      setActiveModel: (id) =>
        set({ activeModelId: id }, false, 'setActiveModel'),

      clearScene: () =>
        set({ models: [], activeModelId: null }, false, 'clearScene'),
    }),
    { name: 'SceneStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectSceneModels    = (s: SceneStore) => s.models
export const selectActiveModelId  = (s: SceneStore) => s.activeModelId
export const selectActiveModel    = (s: SceneStore) =>
  s.models.find((m) => m.id === s.activeModelId) ?? null
