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
import type { RulesConfig, ValidationResult, ValidationIssue } from '../types'
import { RULE_METADATA }                      from '../types'
import { recordValidationRun }                from './validation-analytics'
import type { ValidatorOutMessage }            from '../workers/validator.worker'

// ── Quality score ─────────────────────────────────────────────────────────────

/** Penalty weights per category per severity */
const CATEGORY_WEIGHTS: Record<string, Record<string, number>> = {
  schema:         { error: 5, warning: 1.5, info: 0.3 },
  spatial:        { error: 4, warning: 1.2, info: 0.2 },
  quality:        { error: 3, warning: 1.0, info: 0.2 },
  lod:            { error: 3, warning: 1.0, info: 0.2 },
  iso19650:       { error: 3, warning: 0.8, info: 0.1 },
  classification: { error: 2, warning: 0.6, info: 0.1 },
  mep:            { error: 2, warning: 0.8, info: 0.1 },
  clash:          { error: 4, warning: 1.5, info: 0.2 },
}
const DEFAULT_WEIGHTS = { error: 3, warning: 1, info: 0.2 }

function calculateQualityScore(result: ValidationResult): number {
  let penalty = 0
  for (const issue of result.issues) {
    const meta     = RULE_METADATA[issue.ruleId]
    const weights  = (meta ? CATEGORY_WEIGHTS[meta.category] : null) ?? DEFAULT_WEIGHTS
    penalty += weights[issue.severity] ?? 0
  }
  return Math.max(0, Math.round(100 - penalty))
}

const log = createLogger('Validator')

// ── Worker pool ───────────────────────────────────────────────────────────────
// Two long-lived workers are kept warm to allow rule-parallel execution.
// Pool slot 0 (primary): runs ~half the rules + spatial tree building.
// Pool slot 1 (secondary): runs the other ~half, skipTree=true.

const _pool: Array<Worker | null> = [null, null]

function getPoolWorker(slot: 0 | 1): Worker {
  if (!_pool[slot]) {
    _pool[slot] = new Worker(
      new URL('../workers/validator.worker.ts', import.meta.url),
      { type: 'module' },
    )
    _pool[slot]!.addEventListener('error', () => {
      // Automatically reset slot so the next call spawns a fresh worker
      _pool[slot] = null
    })
  }
  return _pool[slot]!
}

/** Terminate and clear the validator worker pool. */
export function disposeValidatorWorker(): void {
  for (let i = 0; i < _pool.length; i++) {
    _pool[i]?.terminate()
    _pool[i] = null
  }
  log.debug('Worker pool disposed')
}

// ── Rule splitting helper ─────────────────────────────────────────────────────

/**
 * Build a filtered RulesConfig that only has the rules in `subset` set to true.
 * Non-boolean config fields (namingConventionPatterns, requiredPsets, etc.) are preserved.
 */
function subsetRules(rules: RulesConfig, subset: Set<string>): RulesConfig {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rules)) {
    result[key] = (typeof value === 'boolean') ? (value && subset.has(key)) : value
  }
  return result as RulesConfig
}

// Backward-compat alias — buildSpatialTree / runValidation used to call getWorker()
function getWorker(): Worker { return getPoolWorker(0) }

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

  // ── Rule splitting — distribute enabled rules across 2 pool workers ─────────
  const enabledRuleKeys = Object.entries(activeRules)
    .filter(([, v]) => v === true)
    .map(([k]) => k)

  const useTwoWorkers = enabledRuleKeys.length >= 4
  const midpoint      = Math.ceil(enabledRuleKeys.length / 2)
  const subset0       = new Set(enabledRuleKeys.slice(0, midpoint))
  const subset1       = new Set(enabledRuleKeys.slice(midpoint))

  const rules0 = useTwoWorkers ? subsetRules(activeRules, subset0) : activeRules
  const rules1 = useTwoWorkers ? subsetRules(activeRules, subset1) : null

  const started = Date.now()
  log.info(
    `Starting validation run ${id} for "${resolvedId ?? 'active'}" (${useTwoWorkers ? '2 workers' : '1 worker'})`,
    'rules:', enabledRuleKeys,
  )

  // ── Acquire workers ────────────────────────────────────────────────────────
  let worker0: Worker
  let worker1: Worker | null = null
  try {
    worker0 = getPoolWorker(0)
    if (useTwoWorkers) worker1 = getPoolWorker(1)
  } catch (err: unknown) {
    const appErr = toAppError(err, 'WORKER_INIT_FAILED')
    log.error('Worker creation failed:', formatDevError(appErr))
    toastFromError(appErr, 'error', 'Validator')
    setValidationStatus('error', appErr.message)
    throw appErr
  }

  return new Promise<void>((resolve, reject) => {
    activeReject = reject

    // Track both workers completing (or just the one if no split)
    let w0Done = false
    let w1Done = !useTwoWorkers  // mark done immediately if not used
    const w0Issues: ValidationIssue[] = []
    const w1Issues: ValidationIssue[] = []
    let w0Progress = 0
    let w1Progress = 0
    let w0Error: WorkerError | null = null

    const cleanup = (): void => {
      activeReject = null
      worker0.removeEventListener('message', handler0)
      worker0.removeEventListener('error',   errorHandler0)
      worker1?.removeEventListener('message', handler1)
      worker1?.removeEventListener('error',   errorHandler1)
    }

    const tryFinalize = (): void => {
      if (!w0Done || !w1Done) return

      if (w0Error) {
        // error already toasted by errorHandler0
        cleanup()
        reject(w0Error)
        return
      }

      const durationMs  = Date.now() - started
      const allIssues   = [...w0Issues, ...w1Issues]

      const byRule: Record<string, number> = {}
      let errors = 0, warnings = 0, info = 0
      for (const issue of allIssues) {
        byRule[issue.ruleId] = (byRule[issue.ruleId] ?? 0) + 1
        if (issue.severity === 'error')        errors++
        else if (issue.severity === 'warning') warnings++
        else                                   info++
      }

      const mergedResult = {
        issues:    allIssues,
        stats:     { total: allIssues.length, errors, warnings, info, byRule },
        durationMs,
      }

      const resultParsed = parseValidationResultMsg(mergedResult)
      if (!resultParsed.ok) {
        const errMsg = resultParsed.error.message
        log.error('Invalid merged ValidationResult shape:', formatDevError(resultParsed.error))
        toast(errMsg, 'error')
        setValidationStatus('error', errMsg)
        appBus.emit('validation:failed', { runId: id, error: errMsg })
        cleanup()
        reject(resultParsed.error)
        return
      }

      const stampedResult = resolvedId
        ? { ...resultParsed.data, issues: resultParsed.data.issues.map((issue) => ({ ...issue, modelId: resolvedId })) }
        : resultParsed.data
      const result = { ...stampedResult, qualityScore: calculateQualityScore(stampedResult) }

      log.info(
        `Validation complete for "${resolvedId ?? 'active'}" in ${durationMs}ms —`,
        result.stats.total, 'issues',
      )
      setResult(result)

      const storeSnap = useValidationStore.getState()
      recordValidationRun({
        timestamp:     Date.now(),
        profileId:     storeSnap.activeProfileId,
        rulesRun:      [...new Set(result.issues.map((i) => i.ruleId))],
        durationMs:    result.durationMs,
        issuesByRule:  result.stats.byRule,
        qualityScore:  result.qualityScore ?? 100,
        modelFileName: resolvedId ?? 'unknown',
      })

      if (cacheKey)   cacheResult(cacheKey, result)
      if (resolvedId) cacheResultForModel(resolvedId, result)

      appBus.emit('validation:complete', { runId: id, result, durationMs })
      cleanup()
      resolve()
    }

    // ── Worker 0 message handler ──────────────────────────────────────────────

    const handler0 = (e: MessageEvent<ValidatorOutMessage>): void => {
      const raw = e.data
      if (!raw || raw.id !== id) return

      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) { log.warn('Dropping unrecognised w0 message:', formatDevError(parsed.error)); return }

      match(parsed.data)
        .with({ type: 'tree' }, (msg) => {
          const tree = parseSpatialNodeArray(msg.tree, 'validator.worker/tree')
          log.debug(`Spatial tree received for "${resolvedId ?? 'active'}", nodes:`, tree.length)
          if (resolvedId) setSpatialTreeForModel(resolvedId, tree)
          else            setSpatialTree(tree)
        })
        .with({ type: 'partial' }, (msg) => {
          const stamped = resolvedId ? msg.issues.map((i) => ({ ...i, modelId: resolvedId })) : msg.issues
          w0Issues.push(...stamped)
          addPartialIssues(stamped)
          w0Progress = msg.progress
          const combined = Math.round((w0Progress + w1Progress) / (useTwoWorkers ? 2 : 1))
          setProgress(Math.min(combined, 99))
          appBus.emit('validation:progress', { runId: id, progress: combined })
        })
        .with({ type: 'done' }, () => { w0Done = true; tryFinalize() })
        .with({ type: 'error' }, (msg) => {
          w0Error = new WorkerError('WORKER_CRASHED', msg.message)
          log.error('Worker 0 reported error:', formatDevError(w0Error))
          toast(`Validation error: ${msg.message}`, 'warning')
          setValidationStatus('error', msg.message)
          appBus.emit('validation:failed', { runId: id, error: msg.message })
          w0Done = true; w1Done = true
          tryFinalize()
        })
        .with({ type: 'tree-done' },    () => { /* no-op */ })
        .with({ type: 'takeoff-done' }, () => { /* no-op */ })
        .exhaustive()
    }

    // ── Worker 1 message handler ──────────────────────────────────────────────

    const handler1 = (e: MessageEvent<ValidatorOutMessage>): void => {
      const raw = e.data
      if (!raw || raw.id !== id) return

      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) { log.warn('Dropping unrecognised w1 message:', formatDevError(parsed.error)); return }

      match(parsed.data)
        .with({ type: 'tree' },         () => { /* worker 1 skips tree, but guard here anyway */ })
        .with({ type: 'partial' }, (msg) => {
          const stamped = resolvedId ? msg.issues.map((i) => ({ ...i, modelId: resolvedId })) : msg.issues
          w1Issues.push(...stamped)
          addPartialIssues(stamped)
          w1Progress = msg.progress
          const combined = Math.round((w0Progress + w1Progress) / 2)
          setProgress(Math.min(combined, 99))
          appBus.emit('validation:progress', { runId: id, progress: combined })
        })
        .with({ type: 'done' }, () => { w1Done = true; tryFinalize() })
        .with({ type: 'error' }, (msg) => {
          // Secondary worker error: log it but don't fail the whole run (primary results still valid)
          log.warn('Worker 1 reported error (non-fatal):', msg.message)
          w1Done = true
          tryFinalize()
        })
        .with({ type: 'tree-done' },    () => { /* no-op */ })
        .with({ type: 'takeoff-done' }, () => { /* no-op */ })
        .exhaustive()
    }

    // ── Error handlers ────────────────────────────────────────────────────────

    const errorHandler0 = (e: ErrorEvent): void => {
      _pool[0] = null
      const workerErr = new WorkerError(
        'WORKER_CRASHED',
        `Validator worker crashed: ${e.message}. Validation is temporarily unavailable.`,
        { filename: e.filename, lineno: e.lineno, colno: e.colno },
      )
      log.error('Worker 0 script error — disposing instance:', formatDevError(workerErr))
      toast(workerErr.message, 'error')
      setValidationStatus('error', workerErr.message)
      appBus.emit('validation:failed', { runId: id, error: workerErr.message })
      cleanup()
      reject(workerErr)
    }

    const errorHandler1 = (e: ErrorEvent): void => {
      _pool[1] = null
      log.warn('Worker 1 script error (non-fatal):', e.message)
      w1Done = true
      tryFinalize()
    }

    // ── Wire listeners + dispatch ─────────────────────────────────────────────

    worker0.addEventListener('message', handler0)
    worker0.addEventListener('error',   errorHandler0)
    worker1?.addEventListener('message', handler1)
    worker1?.addEventListener('error',   errorHandler1)

    // Buffer: worker 0 gets the transfer; worker 1 gets a slice (safe copy)
    const buf1 = useTwoWorkers ? bufferCopy.slice(0) : null

    ;(worker0.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
      { type: 'validate', id, buffer: bufferCopy, rules: rules0, skipTree: false },
      [bufferCopy],
    )
    if (worker1 && rules1 && buf1) {
      ;(worker1.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
        { type: 'validate', id, buffer: buf1, rules: rules1, skipTree: true },
        [buf1],
      )
    }
  })
}
