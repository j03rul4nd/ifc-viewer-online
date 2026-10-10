// ─── validation-queue.ts ──────────────────────────────────────────────────────
// Validation for callers that are not a person pressing the button: the
// auto-validation after a load (`?validate`, the SDK's `validate: true`) and
// the SDK's `validate()`. One run at a time, in the order asked, each settling
// with its own model's result or a reason.
//
// Why a queue and not the hook's `run`: that `run` was the closure of the
// LAST RENDER, and its `canRun` was decided there. The loading manager fires
// its idle edge in the same tick as the commit, before React renders again, so
// for the first model the auto-validation ran a closure that still believed
// the scene was empty — and returned without doing anything. No error, no
// event: an SDK host waited for `validation-completed` forever and
// getValidation() said null. Here everything is read when the run starts.
//
// And validation is a single global run (two pool workers, one store), so a
// second caller waits for the first instead of being dropped — or worse, of
// starting a run over it.

import { runValidation } from './validator'
import { modelRegistry } from './model-registry'
import { useValidationStore } from '../stores/validationStore'
import { useSceneStore } from '../stores/sceneStore'
import type { ValidationResult } from '../types'

export class ValidationRunError extends Error {
  readonly modelId: string | null
  constructor(message: string, modelId: string | null) {
    super(message)
    this.name = 'ValidationRunError'
    this.modelId = modelId
  }
}

export interface QueuedValidationResult {
  modelId: string
  /** That model's own result (also with several models, where the panel shows all of them). */
  result: ValidationResult
}

export interface QueuedValidationOptions {
  /** Re-run even when a result for the model is cached. */
  force?: boolean
  /** The run is about to start, on this model (after any queued run before it). */
  onStart?: (modelId: string) => void
}

export interface ValidationQueueState {
  status: 'idle' | 'running' | 'done' | 'error'
  /** The model validating now, or the one the last queued run was about. */
  modelId: string | null
  /** 0–100 while running. */
  progress: number
  /** Why the last run failed, when it did. */
  error: string | null
  /** Runs waiting behind the current one. */
  queued: number
}

let chain: Promise<unknown> = Promise.resolve()
let queued = 0
let running: string | null = null
// The last queued run, and the displayed result when it ended: a failure is
// news only until a newer result (from any run) replaces that one.
let last: { modelId: string; error: string | null; result: ValidationResult | null } | null = null

/** Resolve once no validation is running (a person may have started one). */
function whenIdle(): Promise<void> {
  if (useValidationStore.getState().validationStatus !== 'running') return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = useValidationStore.subscribe((s) => {
      if (s.validationStatus === 'running') return
      unsubscribe()
      resolve()
    })
  })
}

function targetModel(modelId: string | undefined): string {
  const scene = useSceneStore.getState()
  const id = modelId ?? scene.activeModelId ?? scene.models[0]?.id ?? null
  if (!id) throw new ValidationRunError('No model is loaded — load one before validating.', null)
  if (!modelRegistry.get(id)) {
    throw new ValidationRunError(`No model with id "${id}" is loaded (getModels() lists the ids).`, id)
  }
  const bytes = modelRegistry.getBuffer(id)
  if (!bytes || bytes.byteLength === 0) {
    // runValidation's pre-flight would only toast this and return: from a
    // queue that is a run that silently never happened.
    throw new ValidationRunError(`The IFC data of "${id}" is not available, so it cannot be validated — load the file again.`, id)
  }
  return id
}

async function runOne(modelId: string | undefined, opts: QueuedValidationOptions): Promise<QueuedValidationResult> {
  queued--
  await whenIdle()
  let id: string | null = null
  try {
    id = targetModel(modelId)
    running = id
    opts.onStart?.(id)
    try {
      await runValidation(id, undefined, opts.force === true)
    } catch (err) {
      const s = useValidationStore.getState()
      const reason = s.validationStatus === 'cancelled'
        ? 'Validation was cancelled'
        : s.validationError ?? (err instanceof Error ? err.message : String(err))
      throw new ValidationRunError(reason, id)
    }
    const s = useValidationStore.getState()
    if (s.validationStatus === 'error') throw new ValidationRunError(s.validationError ?? 'Validation failed', id)
    const result = s.cachedResultsByModel[id] ?? s.result
    if (!result) throw new ValidationRunError('Validation ended without a result', id)
    last = { modelId: id, error: null, result: s.result }
    return { modelId: id, result }
  } catch (err) {
    const e = err instanceof ValidationRunError ? err : new ValidationRunError(err instanceof Error ? err.message : String(err), id)
    last = { modelId: e.modelId ?? id ?? '', error: e.message, result: useValidationStore.getState().result }
    throw e
  } finally {
    running = null
  }
}

/**
 * Validate a model (default: the active one, else the first) after every run
 * queued before it. Resolves with that model's result; rejects with a
 * ValidationRunError that says why — no model, unknown id, no IFC data,
 * cancelled, or the validator's own failure.
 */
export function queueValidation(modelId?: string, opts: QueuedValidationOptions = {}): Promise<QueuedValidationResult> {
  queued++
  const run = (): Promise<QueuedValidationResult> => runOne(modelId, opts)
  const p = chain.then(run, run)
  chain = p.catch(() => undefined)
  return p
}

/** Where validation stands — for a host that asks while it runs. */
export function getValidationQueueState(): ValidationQueueState {
  const s = useValidationStore.getState()
  const isRunning = s.validationStatus === 'running'
  const queueError = last?.error && last.result === s.result ? last.error : null
  const error = queueError ?? (s.validationStatus === 'error' ? s.validationError ?? 'Validation failed' : null)
  return {
    status: isRunning ? 'running' : error ? 'error' : s.result ? 'done' : 'idle',
    modelId: running ?? last?.modelId ?? null,
    progress: isRunning ? s.progress : s.result ? 100 : 0,
    error: isRunning ? null : error,
    queued: Math.max(0, queued),
  }
}

/** Test seam. */
export function __resetValidationQueue(): void {
  chain = Promise.resolve()
  queued = 0
  running = null
  last = null
}
