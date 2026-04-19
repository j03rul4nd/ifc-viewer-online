import { create } from 'zustand'
import type { ModelInfo } from '../types'

interface ModelStore {
  modelInfo: ModelInfo | null
  /** Original IFC file bytes — retained for validation and IFC export. */
  ifcBuffer: ArrayBuffer | null
  opfsCacheKey: string | null
  /** Opaque reference to the loaded FragmentsModel — used for GLB/Fragments export. */
  modelObject: unknown | null

  setModel: (params: {
    modelInfo: ModelInfo
    ifcBuffer: ArrayBuffer
    cacheKey: string
    modelObject: unknown
  }) => void
  clearModel: () => void
}

export const useModelStore = create<ModelStore>((set) => ({
  modelInfo: null,
  ifcBuffer: null,
  opfsCacheKey: null,
  modelObject: null,

  setModel: ({ modelInfo, ifcBuffer, cacheKey, modelObject }) =>
    set({ modelInfo, ifcBuffer, opfsCacheKey: cacheKey, modelObject }),

  clearModel: () =>
    set({ modelInfo: null, ifcBuffer: null, opfsCacheKey: null, modelObject: null }),
}))
