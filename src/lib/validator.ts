// ─── Validator launcher ────────────────────────────────────────────────────────
// Creates/reuses a validator worker and orchestrates streaming validation results
// into the Zustand validation store.

import { useValidationStore } from '../stores/validationStore'
import { useModelStore } from '../stores/modelStore'
import type { RulesConfig } from '../types'
import type { ValidatorOutMessage } from '../workers/validator.worker'

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

export function disposeValidatorWorker(): void {
  workerInstance?.terminate()
  workerInstance = null
}

/**
 * Run validation against the current model.
 * Streams partial results into the validation store as each rule completes.
 * Uses the IFC buffer stored in the model store.
 */
export async function runValidation(rules?: RulesConfig): Promise<void> {
  const { ifcBuffer, opfsCacheKey } = useModelStore.getState()
  const {
    setRunning, setProgress, addPartialIssues,
    setSpatialTree, setResult, cacheResult, rules: storedRules,
  } = useValidationStore.getState()

  if (!ifcBuffer) {
    console.warn('[Validator] No IFC buffer available — load a model first')
    return
  }

  const activeRules = rules ?? storedRules

  // Check cache for instant result on re-validation
  if (opfsCacheKey) {
    const cached = useValidationStore.getState().cachedResults[opfsCacheKey]
    if (cached && !rules) {
      useValidationStore.getState().setResult(cached)
      return
    }
  }

  setRunning(true)
  setProgress(0)

  // Copy the buffer so the original is preserved for export
  const bufferCopy = ifcBuffer.slice(0)

  const worker = getWorker()
  const id = `validate-${Date.now()}`

  return new Promise<void>((resolve, reject) => {
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
          worker.removeEventListener('message', handler)
          resolve()
          break
        case 'error':
          setRunning(false)
          worker.removeEventListener('message', handler)
          reject(new Error(msg.message))
          break
      }
    }

    worker.addEventListener('message', handler)
    ;(worker.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
      { type: 'validate', id, buffer: bufferCopy, rules: activeRules },
      [bufferCopy],
    )
  })
}
