import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { IdsDocument, IdsPhase, IdsResult } from '../lib/ids/ids-types'

export type IdsStatus = 'idle' | 'running' | 'cancelling' | 'done' | 'error'

export interface IdsError { code: string; message: string }

export interface IdsFilters {
  search: string
  statusTab: 'all' | 'fail' | 'pass' | 'na'
  /** Facet kinds a spec's requirements must include ([] = no filter). */
  facetKinds: string[]
  groupBy: 'spec' | 'element' | 'class'
}

const DEFAULT_FILTERS: IdsFilters = { search: '', statusTab: 'all', facetKinds: [], groupBy: 'spec' }

export interface IdsRunMeta {
  at: number
  idsFileName: string
  durationMs: number
  /** Model schema (IFC2X3/IFC4/…) — populated from P2-4 onward. */
  modelSchema?: string
}

interface IdsStore {
  // document (model-independent)
  fileName: string | null
  doc: IdsDocument | null
  // runs (model-keyed) — results survive model switches and new IDS loads;
  // runMetaByModel[m].idsFileName !== fileName marks a result as stale (§5.4).
  resultsByModel: Record<string, IdsResult>
  previousResultByModel: Record<string, IdsResult>
  runMetaByModel: Record<string, IdsRunMeta>
  // active run
  status: IdsStatus
  runningModelId: string | null
  progress: number
  progressPhase: IdsPhase | null
  error: IdsError | null
  /**
   * 3D overlay of IDS failures (P4-1). Mutually exclusive with the validation
   * overlay — the TOGGLE HANDLERS enforce it (cross-store side effects happen
   * at callers, never inside set).
   */
  highlightMode: boolean
  // UI (P5-1)
  panelOpen: boolean
  filters: IdsFilters
  /** Set while "check all loaded models" runs sequentially (P7-2); null otherwise. */
  multiRun: { done: number; total: number } | null

  setPanelOpen: (open: boolean) => void
  setFilters: (patch: Partial<IdsFilters>) => void
  setMultiRun: (v: { done: number; total: number } | null) => void
  setLoaded: (fileName: string, doc: IdsDocument) => void
  /** No-op while a run is already in flight (double-click guard, §5.3-3). */
  startRun: (modelId: string) => void
  setProgress: (pct: number, phase: IdsPhase) => void
  /** Snapshots the prior result into previousResultByModel. Ignored unless this
   *  model's run is the one in flight (stale-result guard, §5.3-1/2). */
  setResultForModel: (modelId: string, result: IdsResult, meta: IdsRunMeta) => void
  setError: (code: string, message: string) => void
  /** UI requested a cancel; the caller must also abort the runner (cancelActiveIdsRuns). */
  requestCancel: () => void
  /** Runner confirmed the cancel → back to idle, document (and prior results) kept. */
  finishCancel: () => void
  setHighlightMode: (on: boolean) => void
  /** Drop all IDS state for a removed model (wired next to clearValidationForModel). */
  clearForModel: (modelId: string) => void
  reset: () => void
}

export const useIdsStore = create<IdsStore>()(
  devtools(
    (set) => ({
      fileName: null,
      doc: null,
      resultsByModel: {},
      previousResultByModel: {},
      runMetaByModel: {},
      status: 'idle',
      runningModelId: null,
      progress: 0,
      progressPhase: null,
      error: null,
      highlightMode: false,
      panelOpen: false,
      filters: DEFAULT_FILTERS,
      multiRun: null,

      setPanelOpen: (open) => set({ panelOpen: open }, false, 'ids/panelOpen'),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } }), false, 'ids/filters'),
      setMultiRun: (v) => set({ multiRun: v }, false, 'ids/multiRun'),
      setHighlightMode: (on) => set({ highlightMode: on }, false, 'ids/highlightMode'),
      setLoaded: (fileName, doc) =>
        set(
          // Per-model results are KEPT on purpose (§5.2): users compare runs; the
          // runMeta.idsFileName mismatch labels them as produced by the old file.
          // An in-flight run keeps its status/progress (§5.2 "keeps status");
          // otherwise loading a good file lands on a clean idle state.
          (s) => (s.status === 'running' || s.status === 'cancelling'
            ? { fileName, doc, error: null }
            : { fileName, doc, status: 'idle' as IdsStatus, progress: 0, progressPhase: null, error: null }),
          false,
          'ids/loaded',
        ),
      startRun: (modelId) =>
        set(
          (s) => (s.status === 'running' || s.status === 'cancelling'
            ? s
            : { status: 'running' as IdsStatus, runningModelId: modelId, progress: 0, progressPhase: null, error: null }),
          false,
          'ids/startRun',
        ),
      setProgress: (pct, phase) =>
        set(
          // Ignore stray progress after cancel/error — never resurrect a run.
          (s) => (s.status === 'running' || s.status === 'cancelling' ? { progress: pct, progressPhase: phase } : s),
          false,
          'ids/progress',
        ),
      setResultForModel: (modelId, result, meta) =>
        set(
          (s) => {
            if (s.runningModelId !== modelId || (s.status !== 'running' && s.status !== 'cancelling')) return s
            const prior = s.resultsByModel[modelId]
            return {
              resultsByModel: { ...s.resultsByModel, [modelId]: result },
              previousResultByModel: prior
                ? { ...s.previousResultByModel, [modelId]: prior }
                : s.previousResultByModel,
              runMetaByModel: { ...s.runMetaByModel, [modelId]: meta },
              status: 'done' as IdsStatus,
              runningModelId: null,
              progress: 100,
              progressPhase: null,
              error: null,
            }
          },
          false,
          'ids/result',
        ),
      setError: (code, message) =>
        set(
          { status: 'error', runningModelId: null, progress: 0, progressPhase: null, error: { code, message } },
          false,
          'ids/error',
        ),
      requestCancel: () =>
        set((s) => (s.status === 'running' ? { status: 'cancelling' as IdsStatus } : s), false, 'ids/requestCancel'),
      finishCancel: () =>
        set(
          { status: 'idle', runningModelId: null, progress: 0, progressPhase: null, error: null },
          false,
          'ids/finishCancel',
        ),
      clearForModel: (modelId) =>
        set(
          (s) => {
            const { [modelId]: _r, ...resultsByModel } = s.resultsByModel
            const { [modelId]: _p, ...previousResultByModel } = s.previousResultByModel
            const { [modelId]: _m, ...runMetaByModel } = s.runMetaByModel
            const wasRunning = s.runningModelId === modelId
            return {
              resultsByModel,
              previousResultByModel,
              runMetaByModel,
              ...(wasRunning
                ? { status: 'idle' as IdsStatus, runningModelId: null, progress: 0, progressPhase: null }
                : {}),
            }
          },
          false,
          `ids/clearForModel:${modelId}`,
        ),
      reset: () =>
        set(
          {
            fileName: null,
            doc: null,
            resultsByModel: {},
            previousResultByModel: {},
            runMetaByModel: {},
            status: 'idle',
            runningModelId: null,
            progress: 0,
            progressPhase: null,
            error: null,
            highlightMode: false,
            panelOpen: false,
            filters: DEFAULT_FILTERS,
            multiRun: null,
          },
          false,
          'ids/reset',
        ),
    }),
    { name: 'IdsStore' },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────
// Safe pattern only (see the footgun note at validationStore.ts:428): these
// return stable refs from the records — never freshly-built arrays/objects.

/** Result for a specific model, or null. */
export const selectIdsResultForModel = (modelId: string | null) =>
  (s: Pick<IdsStore, 'resultsByModel'>): IdsResult | null =>
    modelId ? (s.resultsByModel[modelId] ?? null) : null

/** Run metadata for a specific model, or null. */
export const selectIdsRunMetaForModel = (modelId: string | null) =>
  (s: Pick<IdsStore, 'runMetaByModel'>): IdsRunMeta | null =>
    modelId ? (s.runMetaByModel[modelId] ?? null) : null
