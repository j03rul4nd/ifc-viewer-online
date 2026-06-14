// ─── useIdsRun ────────────────────────────────────────────────────────────────
// Shared IDS run/cancel/highlight handlers for IdsModal (loader) and IdsPanel
// (results). Cross-store side effects live here, at the caller — never inside
// a store's set() (registry doctrine, idsStore header).

import { useCallback } from 'react'
import i18n from '../i18n/config'
import { useIdsStore } from '../stores/idsStore'
import { useSceneStore } from '../stores/sceneStore'
import { useValidationStore } from '../stores/validationStore'
import { modelRegistry } from '../lib/model-registry'
import { runIds, cancelActiveIdsRuns, IdsCheckError } from '../lib/ids/ids-runner'
import { trackIdsCheckStarted, trackIdsCheckCompleted, trackIdsCheckCancelled } from '../lib/analytics'
import { toast } from '../stores/toastStore'

/** The model an IDS action targets: the active one, else the first loaded. */
export function idsTargetModelId(): string | null {
  const s = useSceneStore.getState()
  return s.activeModelId ?? s.models[0]?.id ?? null
}

export function useIdsRun(): {
  run: () => Promise<void>
  runAll: () => Promise<void>
  cancel: () => void
  toggleHighlight: () => void
} {
  const run = useCallback(async (): Promise<void> => {
    const s = useIdsStore.getState()
    const modelId = idsTargetModelId()
    if (!s.doc || !modelId || s.status === 'running' || s.status === 'cancelling') return
    const buffer = modelRegistry.getBuffer(modelId)
    if (!buffer) {
      s.setError('no-buffer', i18n.t('ids:errors.bufferUnavailable'))
      return
    }
    // Memory guard (§8): a very large IFC re-parsed in the worker (web-ifc heap
    // ~2–3× file size transiently) can OOM. Confirm before committing.
    const LARGE_BYTES = 400 * 1_048_576
    if (buffer.byteLength > LARGE_BYTES && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const mb = Math.round(buffer.byteLength / 1_048_576)
      if (!window.confirm(i18n.t('ids:errors.largeModel', { mb }))) return
    }
    const idsFileName = s.fileName ?? i18n.t('ids:errors.untitled')
    const specCount = s.doc.specifications.length
    s.startRun(modelId)
    trackIdsCheckStarted({ spec_count: specCount })
    const t0 = performance.now()
    try {
      const { result } = await runIds(s.doc, buffer, {
        onProgress: (pct, phase) => useIdsStore.getState().setProgress(pct, phase),
      })
      useIdsStore.getState().setResultForModel(modelId, result, {
        at: Date.now(), idsFileName, durationMs: Math.round(performance.now() - t0), modelSchema: result.modelSchema,
      })
      trackIdsCheckCompleted({
        score: result.score,
        spec_count: result.totalSpecs,
        failed_specs: result.failedSpecs,
        duration_ms: Math.round(performance.now() - t0),
        model_mb: Math.round((buffer.byteLength / 1_048_576) * 10) / 10,
        model_schema: result.modelSchema ?? null,
      })
    } catch (err) {
      if (err instanceof IdsCheckError && err.code === 'cancelled') {
        useIdsStore.getState().finishCancel() // neutral — button feedback was enough
        trackIdsCheckCancelled()
        return
      }
      useIdsStore.getState().setError(
        err instanceof IdsCheckError ? err.code : 'unknown',
        err instanceof Error ? err.message : String(err),
      )
      toast(i18n.t('ids:errors.checkFailed'), 'error')
    }
  }, [])

  // Check the loaded IDS against EVERY loaded model, sequentially (P7-2). Runs
  // are serial on purpose — parallel web-ifc workers would spike peak memory.
  // Each result lands in resultsByModel[modelId]; a single model failing toasts
  // but never aborts the batch. User cancel stops the whole batch.
  const runAll = useCallback(async (): Promise<void> => {
    const s0 = useIdsStore.getState()
    if (!s0.doc || s0.status === 'running' || s0.status === 'cancelling' || s0.multiRun) return
    const doc = s0.doc
    const idsFileName = s0.fileName ?? i18n.t('ids:errors.untitled')
    const targets = useSceneStore.getState().models.filter((m) => modelRegistry.getBuffer(m.id))
    if (targets.length === 0) return

    useIdsStore.getState().setMultiRun({ done: 0, total: targets.length })
    trackIdsCheckStarted({ spec_count: doc.specifications.length })
    let failures = 0
    for (let i = 0; i < targets.length; i++) {
      const m = targets[i]
      const buffer = modelRegistry.getBuffer(m.id)
      if (!buffer) { useIdsStore.getState().setMultiRun({ done: i + 1, total: targets.length }); continue }
      useIdsStore.getState().startRun(m.id)
      const t0 = performance.now()
      try {
        const { result } = await runIds(doc, buffer, {
          onProgress: (pct, phase) => useIdsStore.getState().setProgress(pct, phase),
        })
        useIdsStore.getState().setResultForModel(m.id, result, {
          at: Date.now(), idsFileName, durationMs: Math.round(performance.now() - t0), modelSchema: result.modelSchema,
        })
        trackIdsCheckCompleted({
          score: result.score, spec_count: result.totalSpecs, failed_specs: result.failedSpecs,
          duration_ms: Math.round(performance.now() - t0),
          model_mb: Math.round((buffer.byteLength / 1_048_576) * 10) / 10,
          model_schema: result.modelSchema ?? null,
        })
      } catch (err) {
        if (err instanceof IdsCheckError && err.code === 'cancelled') {
          useIdsStore.getState().finishCancel()
          trackIdsCheckCancelled()
          useIdsStore.getState().setMultiRun(null)
          return // user cancelled → stop the whole batch
        }
        failures++ // a corrupt model just gets no result; keep going
      }
      useIdsStore.getState().setMultiRun({ done: i + 1, total: targets.length })
    }
    useIdsStore.getState().setMultiRun(null)
    if (failures > 0) toast(i18n.t('ids:errors.checkFailed'), 'error')
  }, [])

  const cancel = useCallback((): void => {
    useIdsStore.getState().requestCancel()
    cancelActiveIdsRuns()
  }, [])

  const toggleHighlight = useCallback((): void => {
    const next = !useIdsStore.getState().highlightMode
    // Mutual exclusion with the validation overlay (shared viewer channel).
    if (next && useValidationStore.getState().validationMode) {
      useValidationStore.getState().toggleValidationMode()
    }
    useIdsStore.getState().setHighlightMode(next) // the App-level effect drives the viewer
  }, [])

  return { run, runAll, cancel, toggleHighlight }
}
