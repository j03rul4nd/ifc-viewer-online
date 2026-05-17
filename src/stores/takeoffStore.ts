import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { TakeoffResult, TakeoffGroup } from '../types'

type TakeoffStatus = 'idle' | 'running' | 'done' | 'error'

interface ModelTakeoffEntry {
  status: TakeoffStatus
  result: TakeoffResult | null
  error:  string | null
}

interface TakeoffStore {
  byModel: Record<string, ModelTakeoffEntry>

  setModelStatus: (modelId: string, status: TakeoffStatus, error?: string | null) => void
  setModelResult: (modelId: string, result: TakeoffResult) => void
  clearModelResult: (modelId: string) => void
  reset: () => void
}

const DEFAULT_ENTRY: ModelTakeoffEntry = { status: 'idle', result: null, error: null }

export const useTakeoffStore = create<TakeoffStore>()(
  devtools(
    (set) => ({
      byModel: {},

      setModelStatus: (modelId, status, error = null) =>
        set(
          (s) => ({
            byModel: {
              ...s.byModel,
              [modelId]: { ...(s.byModel[modelId] ?? DEFAULT_ENTRY), status, error: error ?? null },
            },
          }),
          false,
          'setModelStatus',
        ),

      setModelResult: (modelId, result) =>
        set(
          (s) => ({
            byModel: {
              ...s.byModel,
              [modelId]: { status: 'done', result, error: null },
            },
          }),
          false,
          'setModelResult',
        ),

      clearModelResult: (modelId) =>
        set(
          (s) => {
            const next = { ...s.byModel }
            delete next[modelId]
            return { byModel: next }
          },
          false,
          'clearModelResult',
        ),

      reset: () => set({ byModel: {} }, false, 'reset'),
    }),
    { name: 'TakeoffStore' },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

const EMPTY_GROUPS: TakeoffGroup[] = []

export function selectTakeoffEntry(modelId: string) {
  return (s: TakeoffStore): ModelTakeoffEntry =>
    s.byModel[modelId] ?? DEFAULT_ENTRY
}

export function selectTakeoffGroups(modelId: string) {
  return (s: TakeoffStore): TakeoffGroup[] =>
    s.byModel[modelId]?.result?.groups ?? EMPTY_GROUPS
}

export function selectTakeoffStatus(modelId: string) {
  return (s: TakeoffStore): TakeoffStatus =>
    s.byModel[modelId]?.status ?? 'idle'
}

export function selectTakeoffRunning(modelId: string) {
  return (s: TakeoffStore): boolean =>
    (s.byModel[modelId]?.status ?? 'idle') === 'running'
}
