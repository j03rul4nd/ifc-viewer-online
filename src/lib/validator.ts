// ─── Validator launcher ────────────────────────────────────────────────────────
// Creates/reuses a validator worker and orchestrates streaming validation results
// into the Zustand validation store.
//
// Resilience features:
//   • Buffer pre-flight — rejects empty/stub buffers before touching the worker.
//   • Worker recovery — fatal script errors clear the singleton so the next call
//     spawns a fresh instance (handles WASM SIGABRT on GitHub Pages).
//   • Toast notifications — all user-facing errors surface via toastFromError.
//   • Exhaustive message routing — ts-pattern match() ensures every message type
//     is handled; unhandled types produce a TypeScript error at compile time.
//   • Model-aware — all operations accept an optional modelId so results are
//     stored under the correct model key when multiple models are loaded.

import { match } from 'ts-pattern'
import { useValidationStore } from '../stores/validationStore'
import { useModelStore }      from '../stores/modelStore'
import { useSceneStore }      from '../stores/sceneStore'
import { modelRegistry }      from './model-registry'
import { toast, toastFromError } from '../stores/toastStore'
import { createLogger }       from './logger'
import { appBus }             from './event-bus'
import { parseSpatialNodeArray } from './type-guards'
import { parseValidationResultMsg, parseValidatorMsg } from './worker-schemas'
import { WorkerError, ValidationError, toAppError, formatDevError } from './errors'
import type { RulesConfig }        from '../types'
import type { ValidatorOutMessage } from '../workers/validator.worker'

const log = createLogger('Validator')

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

/** Terminate and clear the validator worker singleton. */
export function disposeValidatorWorker(): void {
  workerInstance?.terminate()
  workerInstance = null
  log.debug('Worker disposed')
}

// Reject fn for the currently active runValidation() promise (null when idle)
let activeReject: ((err: Error) => void) | null = null

/**
 * Cancel a running validation.
 * Sets status to 'cancelled', terminates the worker, and rejects the active promise.
 * No-ops if validation is not currently running.
 */
export function cancelValidation(): void {
  const { validationStatus, setValidationStatus } = useValidationStore.getState()
  if (validationStatus !== 'running') return
  log.info('Cancelling validation')
  setValidationStatus('cancelled')
  disposeValidatorWorker()
  activeReject?.(new ValidationError('VALIDATION_CANCELLED', 'cancelled'))
  activeReject = null
}

// ── Buffer resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the IFC buffer to validate.
 * When no modelId is given, targets the currently active model in the scene.
 * Precedence:
 *   1. modelRegistry.getBuffer(targetId)   — primary source (always has the correct buffer)
 *   2. modelStore.getBuffer(targetId)      — serialisable fallback
 *   3. modelStore.ifcBuffer                — last-resort legacy buffer
 */
function resolveBuffer(modelId?: string): ArrayBuffer | null {
  const targetId = modelId ?? useSceneStore.getState().activeModelId ?? undefined
  if (targetId) {
    const regBuf = modelRegistry.getBuffer(targetId)
    if (regBuf) return regBuf

    const storeBuf = useModelStore.getState().getBuffer(targetId)
    if (storeBuf) return storeBuf

    log.warn(`resolveBuffer: "${targetId}" not in registry or store — falling back to legacy buffer`)
  }
  return useModelStore.getState().ifcBuffer
}

/** Resolve the OPFS cache key for a model. Falls back to activeModelId then legacy store. */
function resolveCacheKey(modelId?: string): string | null {
  const targetId = modelId ?? useSceneStore.getState().activeModelId ?? undefined
  if (targetId) {
    const entry = modelRegistry.get(targetId)
    if (entry) return entry.opfsCacheKey

    const storeEntry = useModelStore.getState().models[targetId]
    if (storeEntry) return storeEntry.cacheKey
  }
  return useModelStore.getState().opfsCacheKey
}

// ── Pre-flight ────────────────────────────────────────────────────────────────

function validateBufferForWorker(buffer: ArrayBuffer | null): ValidationError | null {
  if (!buffer) {
    return new ValidationError(
      'VALIDATION_FAILED',
      'No IFC buffer is available. Load an IFC model first.',
    )
  }
  if (buffer.byteLength === 0) {
    return new ValidationError(
      'VALIDATION_FAILED',
      'The IFC buffer is empty. This can happen when the model was loaded from ' +
      'an older OPFS cache entry that did not store the raw IFC data. ' +
      'Try reloading the file from disk to regenerate the cache.',
    )
  }
  if (buffer.byteLength < 64) {
    return new ValidationError(
      'VALIDATION_FAILED',
      `The IFC buffer is too small (${buffer.byteLength} bytes) to be valid.`,
      { byteLength: buffer.byteLength },
    )
  }
  return null
}

// ── Message handler factory ───────────────────────────────────────────────────

function makeTreeHandler(
  id: string,
  worker: Worker,
  onTree:    (msg: Extract<ValidatorOutMessage, { type: 'tree' }>) => void,
  onDone:    () => void,
  onError:   (message: string) => void,
  onUnknown: (msg: ValidatorOutMessage) => void,
): (e: MessageEvent<ValidatorOutMessage>) => void {
  return (e: MessageEvent<ValidatorOutMessage>): void => {
    const raw = e.data
    if (!raw || raw.id !== id) return

    const parsed = parseValidatorMsg(raw)
    if (!parsed.ok) {
      log.warn('Dropping unrecognised worker message:', formatDevError(parsed.error))
      return
    }

    match(parsed.data)
      .with({ type: 'tree' },      onTree)
      .with({ type: 'tree-done' }, () => onDone())
      .with({ type: 'error' },     (m) => onError(m.message))
      .otherwise(onUnknown)
  }
}

// ── Spatial tree ──────────────────────────────────────────────────────────────

/**
 * Build the spatial tree for a model without running any validation rules.
 * Called automatically after a model loads so the tree is visible immediately.
 *
 * @param modelId - The sceneStore/registry ID of the model to build the tree for.
 *                  Falls back to the active model when omitted.
 */
export async function buildSpatialTree(modelId?: string): Promise<void> {
  const {
    setSpatialTreeForModel,
    spatialTrees,
    validationStatus,
  } = useValidationStore.getState()

  if (validationStatus === 'running') {
    // Don't drop the tree — queue it to run once the current validation finishes
    log.debug(`buildSpatialTree: validation running — queuing tree for "${modelId ?? 'active'}"`)
    let handled = false
    const retry = (): void => {
      if (handled) return
      handled = true
      void buildSpatialTree(modelId)
    }
    appBus.once('validation:complete', retry)
    appBus.once('validation:failed',   retry)
    return
  }

  // Skip if a tree already exists for this specific model
  const resolvedId = modelId ?? null
  if (resolvedId && spatialTrees[resolvedId]?.length > 0) {
    log.debug(`buildSpatialTree: tree already exists for "${resolvedId}", skipping`)
    return
  }

  const ifcBuffer = resolveBuffer(modelId)
  const bufferError = validateBufferForWorker(ifcBuffer)
  if (bufferError) {
    log.warn('buildSpatialTree: buffer pre-flight failed:', bufferError.message)
    return
  }

  let worker: Worker
  try {
    worker = getWorker()
  } catch (err: unknown) {
    const appErr = toAppError(err, 'WORKER_INIT_FAILED')
    log.warn('buildSpatialTree: worker init failed:', formatDevError(appErr))
    return
  }

  const bufferCopy = ifcBuffer!.slice(0)
  const id = `tree-${Date.now()}`
  log.debug(`Building spatial tree for "${resolvedId ?? 'active'}", id:`, id)

  return new Promise<void>((resolve) => {
    const cleanup = (): void => {
      worker.removeEventListener('message', handler)
      worker.removeEventListener('error',   errorHandler)
    }

    const handler = makeTreeHandler(
      id, worker,
      (msg) => {
        const tree = parseSpatialNodeArray(msg.tree, 'buildSpatialTree')
        log.debug(`Spatial tree ready for "${resolvedId ?? 'active'}", nodes:`, tree.length)
        if (resolvedId) {
          setSpatialTreeForModel(resolvedId, tree)
        } else {
          // Backward-compat: no modelId provided — update the backward-compat alias
          useValidationStore.getState().setSpatialTree(tree)
        }
      },
      () => { cleanup(); resolve() },
      (message) => {
        log.warn('buildSpatialTree worker error:', message)
        cleanup()
        resolve()
      },
      (msg) => log.debug('buildSpatialTree: ignoring message type:', msg.type),
    )

    const errorHandler = (): void => {
      log.warn('buildSpatialTree: worker script error')
      cleanup()
      resolve()
    }

    worker.addEventListener('message', handler)
    worker.addEventListener('error',   errorHandler)
    worker.postMessage({ type: 'build-tree', id, buffer: bufferCopy }, [bufferCopy])
  })
}

// ── Validation run ────────────────────────────────────────────────────────────

/**
 * Run validation against a model.
 * Streams partial results into the validation store as each rule completes.
 *
 * @param modelId - The sceneStore/registry ID of the model to validate.
 *                  Falls back to the active model when omitted.
 * @param rules   - Override the stored rules config for this run.
 */
export async function runValidation(modelId?: string, rules?: RulesConfig): Promise<void> {
  // Resolve the target model — explicit arg wins; otherwise use the active scene model
  const resolvedId  = modelId ?? useSceneStore.getState().activeModelId ?? null
  const ifcBuffer   = resolveBuffer(resolvedId ?? undefined)
  const cacheKey    = resolveCacheKey(resolvedId ?? undefined)

  const {
    setValidationStatus, setProgress, addPartialIssues,
    setSpatialTreeForModel, setSpatialTree,
    setResult, cacheResult, cacheResultForModel,
    rules: storedRules,
  } = useValidationStore.getState()

  // ── Pre-flight ────────────────────────────────────────────────────────────
  const bufferError = validateBufferForWorker(ifcBuffer)
  if (bufferError) {
    log.warn('Pre-flight failed:', bufferError.message)
    toast(bufferError.message, 'warning')
    return
  }

  const activeRules = rules ?? storedRules

  // ── Cache check — skip worker if we have a fresh result ──────────────────
  if (cacheKey) {
    const storeState = useValidationStore.getState()
    // Check model-specific cache first, fall back to cacheKey-indexed cache
    const cached =
      (resolvedId ? storeState.cachedResultsByModel[resolvedId] : undefined) ??
      storeState.cachedResults[cacheKey]
    const treeBuilt = resolvedId
      ? (storeState.spatialTrees[resolvedId]?.length ?? 0) > 0
      : storeState.spatialTree.length > 0
    if (cached && !rules && treeBuilt) {
      log.debug('Cache hit — skipping worker', cacheKey)
      setResult(cached)
      return
    }
  }

  setValidationStatus('running')
  setProgress(0)

  const id = `validate-${Date.now()}`
  appBus.emit('validation:started', { runId: id })

  const bufferCopy = ifcBuffer!.slice(0)

  let worker: Worker
  try {
    worker = getWorker()
  } catch (err: unknown) {
    const appErr = toAppError(err, 'WORKER_INIT_FAILED')
    log.error('Worker creation failed:', formatDevError(appErr))
    toastFromError(appErr, 'error', 'Validator')
    setValidationStatus('error', appErr.message)
    throw appErr
  }

  const started = Date.now()
  log.info(
    `Starting validation run ${id} for "${resolvedId ?? 'active'}"`,
    'rules:', Object.keys(activeRules).filter((k) => (activeRules as Record<string, unknown>)[k] === true),
  )

  return new Promise<void>((resolve, reject) => {
    activeReject = reject

    const cleanup = (): void => {
      activeReject = null
      worker.removeEventListener('message', handler)
      worker.removeEventListener('error',   errorHandler)
    }

    const handler = (e: MessageEvent<ValidatorOutMessage>): void => {
      const raw = e.data
      if (!raw || raw.id !== id) return

      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) {
        log.warn('Dropping unrecognised worker message:', formatDevError(parsed.error))
        return
      }

      match(parsed.data)
        .with({ type: 'tree' }, (msg) => {
          const tree = parseSpatialNodeArray(msg.tree, 'validator.worker/tree')
          log.debug(`Spatial tree received for "${resolvedId ?? 'active'}", nodes:`, tree.length)
          if (resolvedId) {
            setSpatialTreeForModel(resolvedId, tree)
          } else {
            setSpatialTree(tree)
          }
        })

        .with({ type: 'partial' }, (msg) => {
          // Stamp each partial issue with the modelId before storing
          const stamped = resolvedId
            ? msg.issues.map((issue) => ({ ...issue, modelId: resolvedId }))
            : msg.issues
          addPartialIssues(stamped)
          setProgress(msg.progress)
          appBus.emit('validation:progress', { runId: id, progress: msg.progress })
        })

        .with({ type: 'done' }, (msg) => {
          const durationMs = Date.now() - started

          const resultParsed = parseValidationResultMsg(msg.result)
          if (!resultParsed.ok) {
            const errMsg = resultParsed.error.message
            log.error('Invalid ValidationResult shape:', formatDevError(resultParsed.error))
            toast(errMsg, 'error')
            setValidationStatus('error', errMsg)
            appBus.emit('validation:failed', { runId: id, error: errMsg })
            cleanup()
            reject(resultParsed.error)
            return
          }

          // Stamp all issues with the modelId
          const result = resolvedId
            ? {
                ...resultParsed.data,
                issues: resultParsed.data.issues.map((issue) => ({ ...issue, modelId: resolvedId })),
              }
            : resultParsed.data

          log.info(
            `Validation complete for "${resolvedId ?? 'active'}" in ${durationMs}ms —`,
            result.stats.total, 'issues',
          )
          setResult(result)

          // Cache under both the OPFS key and the modelId
          if (cacheKey)    cacheResult(cacheKey, result)
          if (resolvedId)  cacheResultForModel(resolvedId, result)

          appBus.emit('validation:complete', { runId: id, result, durationMs })
          cleanup()
          resolve()
        })

        .with({ type: 'error' }, (msg) => {
          const workerErr = new WorkerError('WORKER_CRASHED', msg.message)
          log.error('Worker reported error:', formatDevError(workerErr))
          toast(`Validation error: ${msg.message}`, 'warning')
          setValidationStatus('error', msg.message)
          appBus.emit('validation:failed', { runId: id, error: msg.message })
          cleanup()
          reject(workerErr)
        })

        .with({ type: 'tree-done' },    () => { /* no-op during full validation */ })
        .with({ type: 'takeoff-done' }, () => { /* takeoff runs on a separate worker */ })
        .exhaustive()
    }

    const errorHandler = (e: ErrorEvent): void => {
      disposeValidatorWorker()
      const workerErr = new WorkerError(
        'WORKER_CRASHED',
        `Validator worker crashed: ${e.message}. Validation is temporarily unavailable.`,
        { filename: e.filename, lineno: e.lineno, colno: e.colno },
      )
      log.error('Worker script error — disposing instance:', formatDevError(workerErr))
      toast(workerErr.message, 'error')
      setValidationStatus('error', workerErr.message)
      appBus.emit('validation:failed', { runId: id, error: workerErr.message })
      cleanup()
      reject(workerErr)
    }

    worker.addEventListener('message', handler)
    worker.addEventListener('error',   errorHandler)

    ;(worker.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
      { type: 'validate', id, buffer: bufferCopy, rules: activeRules },
      [bufferCopy],
    )
  })
}
