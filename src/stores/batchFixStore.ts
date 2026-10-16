// ─── Batch fix runs ───────────────────────────────────────────────────────────
// State behind the fixed-file card: the batch the user applied, and per model
// the export → check → done run that produced the fixed IFC and its measured
// score. In memory only. The bytes held here are EXACTLY the bytes that were
// validated, and the bytes the Download button saves — never re-exported, since
// the export stamps the header with the time and would come out different.
//
// Nothing here feeds the headline score, the certificate or the benchmark.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ValidationResult } from '../types'
import type { BatchRenameRule } from '../lib/fix/batch-rename'
import type { PatternToken } from '../lib/fix/name-pattern'
import { useEditorStore } from './editorStore'
import { commandSignatureForModel } from '../lib/diffStore'

export type FixRunStatus = 'exporting' | 'checking' | 'done' | 'error' | 'stale'

/**
 * Why a run failed. `no_buffer` and `no_result` cannot be retried from the
 * card (the IFC bytes, or the original result to compare with, are missing);
 * the other three can.
 */
export type FixRunErrorCode = 'no_buffer' | 'no_result' | 'export_failed' | 'check_failed' | 'stalled'

export interface FixRun {
  modelId: string
  batchId: string
  ruleId: BatchRenameRule
  status: FixRunStatus
  /** 0–100 while checking. */
  progress: number
  /** commandSignatureForModel when the export started. */
  historySig: string
  /** EXACTLY the validated bytes = the downloaded bytes. Dropped once stale. */
  bytes?: Uint8Array
  /** `${stem}-fixed.ifc` */
  fileName: string
  /** cachedResultsByModel[modelId] at apply time. */
  before: ValidationResult
  /** The fixed file's result, `metadata.edits` stamped. */
  after?: ValidationResult
  skippedDiffs?: number
  totalDiffs?: number
  /**
   * Fixed-file GlobalId → original GlobalId, for elements whose GUID the
   * export changed (pending GUID fixes). Set only when there are any; the
   * card compares the two files through it (score-delta.withOriginalGuids).
   */
  guidRemap?: Record<string, string>
  error?: { code: FixRunErrorCode; message: string }
  startedAt: number
}

export interface FixBatch {
  batchId: string
  ruleId: BatchRenameRule
  modelIds: string[]
  renamed: number
  cleared: number
  predictedBefore: number
  predictedAfter: number
  patternEdited: boolean
  keepFirst: boolean
  tokens: PatternToken[]
  startedAt: number
}

export interface StartRunInput {
  modelId: string
  batchId: string
  ruleId: BatchRenameRule
  fileName: string
  before: ValidationResult
  historySig: string
  startedAt: number
}

export interface FinishRunInput {
  bytes: Uint8Array
  after: ValidationResult
  skippedDiffs: number
  totalDiffs: number
  guidRemap?: Record<string, string>
}

interface BatchFixStore {
  batch: FixBatch | null
  /** modelId → that model's run for the current batch. */
  runs: Record<string, FixRun>

  /** A new batch supersedes the previous one: its runs (and bytes) go. */
  beginBatch:  (batch: FixBatch) => void
  /** Create (or restart, for Retry / Check again) a model's run, status `exporting`. */
  startRun:    (input: StartRunInput) => void
  /** Progress of the check; the first call moves the run to `checking`. */
  setProgress: (modelId: string, batchId: string, progress: number) => void
  finishRun:   (modelId: string, batchId: string, out: FinishRunInput) => void
  failRun:     (modelId: string, batchId: string, error: { code: FixRunErrorCode; message: string }) => void
  /** The edits changed since the export: the bytes no longer match the history. */
  markStale:   (modelId: string, batchId: string, out?: Partial<FinishRunInput>) => void
  /** Drop a batch and its runs (undo, dismiss). No-op for another batch's id. */
  removeBatch: (batchId: string) => void
  clear:       () => void
}

export const useBatchFixStore = create<BatchFixStore>()(
  devtools(
    (set) => {
      /** Update one run, only if it still belongs to `batchId` — a superseded check must not write. */
      const patchRun = (modelId: string, batchId: string, patch: (r: FixRun) => Partial<FixRun>, action: string): void =>
        set((s) => {
          const run = s.runs[modelId]
          if (!run || run.batchId !== batchId) return s
          return { runs: { ...s.runs, [modelId]: { ...run, ...patch(run) } } }
        }, false, action)

      return {
        batch: null,
        runs:  {},

        beginBatch: (batch) => set({ batch, runs: {} }, false, 'beginBatch'),

        startRun: (input) => set((s) => {
          if (!s.batch || s.batch.batchId !== input.batchId) return s
          const run: FixRun = { ...input, status: 'exporting', progress: 0 }
          return { runs: { ...s.runs, [input.modelId]: run } }
        }, false, 'startRun'),

        setProgress: (modelId, batchId, progress) =>
          patchRun(modelId, batchId, () => ({ status: 'checking', progress: Math.max(0, Math.min(100, progress)) }), 'setProgress'),

        finishRun: (modelId, batchId, out) =>
          patchRun(modelId, batchId, () => ({ ...out, status: 'done', progress: 100, error: undefined }), 'finishRun'),

        failRun: (modelId, batchId, error) =>
          patchRun(modelId, batchId, () => ({ status: 'error', error, bytes: undefined }), 'failRun'),

        markStale: (modelId, batchId, out) =>
          patchRun(modelId, batchId, () => ({ ...out, status: 'stale', bytes: undefined }), 'markStale'),

        removeBatch: (batchId) => set((s) => {
          if (!s.batch || s.batch.batchId !== batchId) return s
          return { batch: null, runs: {} }
        }, false, 'removeBatch'),

        clear: () => set({ batch: null, runs: {} }, false, 'clear'),
      }
    },
    { name: 'BatchFixStore', enabled: import.meta.env.DEV },
  ),
)

// ── Follow the editor history ─────────────────────────────────────────────────
// Ctrl+Z reaches the editor store directly, never the card's handlers, so the
// card has to notice by itself:
//   • the batch's commands are no longer applied (undone, discarded, history
//     cleared) → the batch and its bytes go;
//   • a finished run's model got another edit since its export → stale, so a
//     download can never hand out bytes that no longer match the edits.

export function syncBatchWithHistory(): void {
  const { batch, runs, removeBatch, markStale } = useBatchFixStore.getState()
  if (!batch) return
  const { history, historyIndex } = useEditorStore.getState()
  const applied = history.slice(0, historyIndex + 1)
  if (!applied.some((c) => c.batchId === batch.batchId)) {
    removeBatch(batch.batchId)
    return
  }
  for (const run of Object.values(runs)) {
    if (run.status !== 'done') continue
    if (commandSignatureForModel(run.modelId) !== run.historySig) markStale(run.modelId, run.batchId)
  }
}

useEditorStore.subscribe((s, prev) => {
  if (s.history !== prev.history || s.historyIndex !== prev.historyIndex) syncBatchWithHistory()
})
