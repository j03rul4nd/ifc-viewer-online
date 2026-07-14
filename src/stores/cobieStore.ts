// ─── cobieStore ───────────────────────────────────────────────────────────────
// Caches the last COBie extraction per model so the FM-readiness badge can show
// real numbers WITHOUT a fresh worker pass on every model load (extraction
// re-opens the model in the validator worker — too costly to do eagerly). It is
// populated when the user exports COBie; the badge appears once a result exists.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { computeFmReadiness, type FmReadiness } from '../lib/cobie/fm-readiness'
import type { CobieExtractResult } from '../lib/worker-schemas'

interface CobieStore {
  byModel: Record<string, { result: CobieExtractResult; readiness: FmReadiness }>
  setResult: (modelId: string, result: CobieExtractResult) => void
  clear: (modelId: string) => void
  reset: () => void
}

export const useCobieStore = create<CobieStore>()(
  devtools(
    (set) => ({
      byModel: {},
      setResult: (modelId, result) =>
        set(
          (s) => ({ byModel: { ...s.byModel, [modelId]: { result, readiness: computeFmReadiness(result) } } }),
          false,
          'setResult',
        ),
      clear: (modelId) =>
        set(
          (s) => {
            const next = { ...s.byModel }
            delete next[modelId]
            return { byModel: next }
          },
          false,
          'clear',
        ),
      reset: () => set({ byModel: {} }, false, 'reset'),
    }),
    { name: 'CobieStore' },
  ),
)
