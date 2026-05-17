import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ModelInfo } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SetModelParams {
  modelInfo:   ModelInfo
  ifcBuffer:   ArrayBuffer
  cacheKey:    string
  modelObject: unknown
  /** Viewer-assigned scene ID. Defaults to cacheKey when omitted (legacy). */
  modelId?:    string
}

/** Per-model metadata held in the store (serialisable portion only). */
export interface ModelEntry {
  modelId:   string
  modelInfo: ModelInfo
  /** May be empty (byteLength === 0) for cache-only loads without a persisted IFC buffer. */
  ifcBuffer: ArrayBuffer
  cacheKey:  string
  loadedAt:  number
}

interface ModelStore {
  // ── Active-model scalar fields (backward compat) ─────────────────────────
  /** ModelInfo of the most recently loaded model. */
  modelInfo:    ModelInfo | null
  /** IFC buffer of the most recently loaded model. */
  ifcBuffer:    ArrayBuffer | null
  opfsCacheKey: string | null
  /** Opaque reference to the loaded FragmentsModel — used for GLB/Fragments export. */
  modelObject:  unknown | null

  // ── Multi-model registry ─────────────────────────────────────────────────
  /**
   * All loaded models keyed by modelId.
   * Survives model switches — entries are only removed by removeModelEntry or clearModel.
   */
  models:       Record<string, ModelEntry>
  /** ID of the currently active model (drives which entry the scalar fields reflect). */
  activeModelId: string | null

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Add or replace a model entry and make it active. Also updates scalar fields. */
  setModel:         (params: SetModelParams) => void
  /** Register an entry without making it the "active" model (future multi-model path). */
  addModelEntry:    (params: SetModelParams & { modelId: string }) => void
  /** Remove a model entry by modelId. */
  removeModelEntry: (modelId: string) => void
  /** Full reset — clears all entries. Called on navigate-to-landing. */
  clearModel:       () => void
  /** Read back a specific model's buffer. Returns null if not found or buffer is empty. */
  getBuffer:        (modelId: string) => ArrayBuffer | null
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useModelStore = create<ModelStore>()(
  devtools(
    (set, get) => ({
      modelInfo:     null,
      ifcBuffer:     null,
      opfsCacheKey:  null,
      modelObject:   null,
      models:        {},
      activeModelId: null,

      setModel: ({ modelInfo, ifcBuffer, cacheKey, modelObject, modelId: explicitId }) => {
        // Prefer the caller-supplied viewer ID; fall back to cacheKey for legacy callers
        const modelId = explicitId ?? cacheKey
        const entry: ModelEntry = {
          modelId,
          modelInfo,
          ifcBuffer,
          cacheKey,
          loadedAt: Date.now(),
        }
        set(
          (s) => ({
            modelInfo,
            ifcBuffer,
            opfsCacheKey:  cacheKey,
            modelObject,
            activeModelId: modelId,
            models:        { ...s.models, [modelId]: entry },
          }),
          false,
          'setModel',
        )
      },

      addModelEntry: ({ modelId, modelInfo, ifcBuffer, cacheKey }) => {
        const entry: ModelEntry = {
          modelId,
          modelInfo,
          ifcBuffer,
          cacheKey,
          loadedAt: Date.now(),
        }
        set(
          (s) => ({ models: { ...s.models, [modelId]: entry } }),
          false,
          `addModelEntry:${modelId}`,
        )
      },

      removeModelEntry: (modelId) =>
        set(
          (s) => {
            const { [modelId]: _removed, ...rest } = s.models
            const isActive = s.activeModelId === modelId
            // If we removed the active model, promote the most recently loaded one
            const nextEntry = isActive
              ? Object.values(rest).sort((a, b) => b.loadedAt - a.loadedAt)[0]
              : undefined
            return {
              models:        rest,
              activeModelId: isActive ? (nextEntry?.modelId ?? null) : s.activeModelId,
              modelInfo:     isActive ? (nextEntry?.modelInfo ?? null) : s.modelInfo,
              ifcBuffer:     isActive ? (nextEntry?.ifcBuffer ?? null) : s.ifcBuffer,
              opfsCacheKey:  isActive ? (nextEntry?.cacheKey  ?? null) : s.opfsCacheKey,
              modelObject:   isActive ? null : s.modelObject,
            }
          },
          false,
          `removeModelEntry:${modelId}`,
        ),

      clearModel: () =>
        set(
          { modelInfo: null, ifcBuffer: null, opfsCacheKey: null, modelObject: null, models: {}, activeModelId: null },
          false,
          'clearModel',
        ),

      getBuffer: (modelId) => {
        const entry = get().models[modelId]
        if (!entry) return null
        if (entry.ifcBuffer.byteLength === 0) return null
        return entry.ifcBuffer
      },
    }),
    { name: 'ModelStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectIfcBuffer    = (s: ModelStore) => s.ifcBuffer
export const selectModelInfo    = (s: ModelStore) => s.modelInfo
export const selectOpfsCacheKey = (s: ModelStore) => s.opfsCacheKey
export const selectAllModels    = (s: ModelStore) =>
  Object.values(s.models).sort((a, b) => a.loadedAt - b.loadedAt)
export const selectActiveModelId = (s: ModelStore) => s.activeModelId
