// ─── Validator launcher ────────────────────────────────────────────────────────
// Creates/reuses a validator worker and orchestrates streaming validation results
// into the Zustand validation store.
//
// Pre-flight guards added vs. previous version:
//   • Buffer size check — avoids sending an empty or stub buffer to the worker
//     (can happen when a cache-hit load has no stored IFC buffer).
//   • Worker script error recovery — if the singleton worker encounters a fatal
//     script error (e.g. WASM SIGABRT on GitHub Pages), the instance is cleared
//     and recreated on the next call rather than permanently breaking validation.
//   • Toast notifications — non-fatal warnings (e.g. "no buffer") surface as
//     warning toasts instead of silently failing.

import { useValidationStore } from '../stores/validationStore'
import { useModelStore }      from '../stores/modelStore'
import { toast }              from '../stores/toastStore'
import type { RulesConfig }   from '../types'
import type { ValidatorOutMessage } from '../workers/validator.worker'

// ── Singleton worker ──────────────────────────────────────────────────────────

let workerInstance: Worker | null = null

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../workers/validator.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return workerInstance
}

/** Terminate and clear the validator worker singleton.
 *  The next call to getWorker() will spawn a fresh instance. */
export function disposeValidatorWorker(): void {
  workerInstance?.terminate()
  workerInstance = null
}

// ── Pre-flight helper ─────────────────────────────────────────────────────────

/** Returns null if the buffer is suitable to send to the worker,
 *  or a descriptive string when it should be rejected. */
function validateBufferForWorker(buffer: ArrayBuffer | null): string | null {
  if (!buffer) {
    return 'No IFC buffer is available. Load an IFC model first.'
  }
  if (buffer.byteLength === 0) {
    return (
      'The IFC buffer is empty. This can happen when the model was loaded ' +
      'from an older OPFS cache entry that did not store the raw IFC data. ' +
      'Try reloading the file from disk to regenerate the cache.'
    )
  }
  if (buffer.byteLength < 64) {
    return `The IFC buffer is too small (${buffer.byteLength} bytes) to be valid.`
  }
  return null
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run validation against the current model.
 * Streams partial results into the validation store as each rule completes.
 * Uses the IFC buffer stored in the model store.
 */
export async function runValidation(rules?: RulesConfig): Promise<void> {
  const { ifcBuffer, opfsCacheKey } = useModelStore.getState()
  const {
    setValidationStatus, setProgress, addPartialIssues,
    setSpatialTree, setResult, cacheResult, rules: storedRules,
  } = useValidationStore.getState()

  // ── Pre-flight: buffer check ──────────────────────────────────────────────
  const bufferProblem = validateBufferForWorker(ifcBuffer)
  if (bufferProblem) {
    console.warn('[Validator]', bufferProblem)
    toast(bufferProblem, 'warning')
    return
  }

  const activeRules = rules ?? storedRules

  // ── Cache check: skip worker if result already cached ─────────────────────
  if (opfsCacheKey) {
    const cached   = useValidationStore.getState().cachedResults[opfsCacheKey]
    const treeBuilt = useValidationStore.getState().spatialTree.length > 0
    if (cached && !rules && treeBuilt) {
      useValidationStore.getState().setResult(cached)
      return
    }
  }

  setRunning(true)
  setProgress(0)

  // Copy the buffer so the original is preserved for export
  // (postMessage transfer would detach the original)
  const bufferCopy = ifcBuffer!.slice(0)

  let worker: Worker
  try {
    worker = getWorker()
  } catch (err: unknown) {
    const msg = `Failed to create validator worker: ${err instanceof Error ? err.message : String(err)}`
    console.error('[Validator]', msg)
    toast(msg, 'error')
    setValidationStatus('error', msg)
    throw new Error(msg)
  }

  const id = `validate-${Date.now()}`

  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      worker.removeEventListener('message', handler)
      worker.removeEventListener('error',   errorHandler)
    }

    const handler = (e: MessageEvent<ValidatorOutMessage>): void => {
      const msg = e.data
      if (msg.id !== id) return

      switch (msg.type) {
        case 'tree':
          setSpatialTree(msg.tree)
          break

        case 'partial':
          addPartialIssues(msg.issues)
          setProgress(msg.progress)
          break

        case 'done':
          setResult(msg.result)
          if (opfsCacheKey) cacheResult(opfsCacheKey, msg.result)
          cleanup()
          resolve()
          break

        case 'error':
          console.error('[Validator] Worker reported error:', msg.message)
          toast(`Validation error: ${msg.message}`, 'warning')
          setValidationStatus('error', msg.message)
          cleanup()
          reject(new Error(msg.message))
          break
      }
    }

    const errorHandler = (e: ErrorEvent): void => {
      console.error('[Validator] Worker script error:', e.message, e)
      disposeValidatorWorker()
      const msg = `Validator worker crashed: ${e.message}. Validation is temporarily unavailable.`
      toast(msg, 'error')
      setValidationStatus('error', msg)
      cleanup()
      reject(new Error(msg))
    }

    worker.addEventListener('message', handler)
    worker.addEventListener('error',   errorHandler)

    ;(worker.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
      { type: 'validate', id, buffer: bufferCopy, rules: activeRules },
      [bufferCopy],
    )
  })
}
