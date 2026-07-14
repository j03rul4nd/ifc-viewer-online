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
import type { RulesConfig, ValidationResult, ValidationIssue, ValidationCategoryType, RuleCoverageEntry, RuleCoverageStatus, ValidationCoverage } from '../types'
import { RULE_METADATA }                      from '../types'
import { recordValidationRun }                from './validation-analytics'
import type { ValidatorOutMessage }            from '../workers/validator.worker'

// ── Quality score ─────────────────────────────────────────────────────────────

/**
 * Penalty weights per category per severity.
 *
 * Keyed by `ValidationCategoryType` (not `string`) on purpose: this makes the map
 * **exhaustive** at compile time. If a new category is added to the union — or a
 * new rule introduces one — `tsc` fails here until a weight is supplied, instead
 * of the score silently falling back to DEFAULT_WEIGHTS and mis-weighting the
 * headline metric. (The inner value stays `Record<string, number>` so indexing by
 * the runtime severity string in `calculateQualityScore` doesn't trip TS7053.)
 */
const CATEGORY_WEIGHTS: Record<ValidationCategoryType, Record<string, number>> = {
  schema:         { error: 5, warning: 1.5, info: 0.3 },
  spatial:        { error: 4, warning: 1.2, info: 0.2 },
  quality:        { error: 3, warning: 1.0, info: 0.2 },
  lod:            { error: 3, warning: 1.0, info: 0.2 },
  iso19650:       { error: 3, warning: 0.8, info: 0.1 },
  classification: { error: 2, warning: 0.6, info: 0.1 },
  mep:            { error: 2, warning: 0.8, info: 0.1 },
  clash:          { error: 4, warning: 1.5, info: 0.2 },
}
const DEFAULT_WEIGHTS: Record<string, number> = { error: 3, warning: 1, info: 0.2 }

// Exported for the score↔metadata contract test (quality-score.test.ts).
export const __scoreWeights = { CATEGORY_WEIGHTS, DEFAULT_WEIGHTS } as const

/**
 * One rule's contribution to the quality-score penalty.
 * `penalty` ≈ the points recovered by clearing that rule (exact away from the
 * 0/100 clamp), so the UI can rank "what to fix first" by real score impact.
 */
export interface ScoreContribution {
  ruleId: string
  category: ValidationCategoryType | 'unknown'
  count: number
  penalty: number
}

/**
 * Break the quality score down into per-rule penalty contributions, sorted by
 * impact (highest first). The rule at the top is the single biggest drag on the
 * score — the most valuable thing to fix.
 *
 * Penalties use **logarithmically diminishing returns**: the first occurrence of
 * a failing rule costs its full category/severity weight, each further one adds
 * less (`weight × (1 + ln(count))`). A single systematic defect (e.g. 5 000
 * elements missing a material) is *one* problem to fix, not 5 000 independent
 * ones; a naive `weight × count` sum would saturate any real model's score to 0.
 */
export function explainQualityScore(result: Pick<ValidationResult, 'issues'>): ScoreContribution[] {
  // Count issues per rule, split by severity.
  const counts = new Map<string, Record<string, number>>()
  for (const issue of result.issues) {
    let bySeverity = counts.get(issue.ruleId)
    if (!bySeverity) counts.set(issue.ruleId, (bySeverity = {}))
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1
  }

  const contributions: ScoreContribution[] = []
  for (const [ruleId, bySeverity] of counts) {
    const meta    = RULE_METADATA[ruleId]
    const weights = (meta ? CATEGORY_WEIGHTS[meta.category] : null) ?? DEFAULT_WEIGHTS
    let penalty = 0, count = 0
    for (const [severity, n] of Object.entries(bySeverity)) {
      penalty += (weights[severity] ?? 0) * (1 + Math.log(n))
      count   += n
    }
    contributions.push({ ruleId, category: meta?.category ?? 'unknown', count, penalty })
  }
  return contributions.sort((a, b) => b.penalty - a.penalty)
}

/**
 * Compute the 0–100 quality score — every rule's penalty subtracted from 100 and
 * clamped to [0, 100]. See explainQualityScore for the penalty model.
 */
export function calculateQualityScore(result: Pick<ValidationResult, 'issues'>): number {
  let penalty = 0
  for (const c of explainQualityScore(result)) penalty += c.penalty
  return Math.max(0, Math.round(100 - penalty))
}

const log = createLogger('Validator')

// ── Coverage helpers ──────────────────────────────────────────────────────────

const COVERAGE_RANK: Record<RuleCoverageStatus, number> = { ok: 0, 'not-run': 1, failed: 2 }

/** Worst (most severe) of two coverage statuses. failed > not-run > ok. */
function worstStatus(a: RuleCoverageStatus | undefined, b: RuleCoverageStatus): RuleCoverageStatus {
  if (a === undefined) return b
  return COVERAGE_RANK[a] >= COVERAGE_RANK[b] ? a : b
}

/**
 * Build a ValidationCoverage from the full attempted-rule set plus whatever
 * per-rule outcomes were reported. Any attempted rule with no reported status is
 * 'not-run' — that's what makes a silent worker failure visible instead of
 * masquerading as a clean pass.
 */
export function buildCoverage(
  attempted: string[],
  known: Map<string, RuleCoverageEntry>,
): ValidationCoverage {
  const entries: RuleCoverageEntry[] = attempted.map(
    (ruleId) => known.get(ruleId) ?? { ruleId, status: 'not-run' },
  )
  let okCount = 0, failedCount = 0, notRunCount = 0
  for (const e of entries) {
    if (e.status === 'ok') okCount++
    else if (e.status === 'failed') failedCount++
    else notRunCount++
  }
  return {
    attempted,
    entries,
    okCount,
    failedCount,
    notRunCount,
    complete: failedCount === 0 && notRunCount === 0,
  }
}

// ── Multi-model result composition ──────────────────────────────────────────────

/**
 * Build the aggregate ValidationResult shown in the panel from per-model results.
 *
 * The store holds one displayed `result`, but the scene can contain several
 * models. Rather than letting each run overwrite the previous model's result,
 * we recompose the displayed result from every model's cached result so the
 * panel always shows issues from ALL validated models. Issues already carry
 * their `modelId` stamp (added in runValidation), so the per-model filter in the
 * panel keeps working.
 *
 * @param perModel  modelId → that model's ValidationResult (from cachedResultsByModel)
 * @param order     modelIds in scene order, so issues stay grouped predictably
 */
export function composeMultiModelResult(
  perModel: Record<string, ValidationResult>,
  order: string[],
): ValidationResult | null {
  const ids = order.filter((id) => perModel[id])
  // Include any cached models not in the provided order (defensive)
  for (const id of Object.keys(perModel)) if (!ids.includes(id)) ids.push(id)
  if (ids.length === 0) return null

  // Single model: return it as-is (no need to recompute identical aggregates).
  if (ids.length === 1) return perModel[ids[0]]

  const allIssues: ValidationIssue[] = []
  const byRule: Record<string, number> = {}
  let errors = 0, warnings = 0, info = 0
  let durationMs = 0

  // Combine coverage defensively: union the attempted sets and keep the worst
  // status seen per rule, so the aggregate can never look "complete" when any
  // single model's run was partial. Skipped entirely when no model carries
  // coverage (legacy cached results) → metadata.coverage stays undefined = "unknown".
  const attemptedSet = new Set<string>()
  const covByRule = new Map<string, RuleCoverageEntry>()
  let anyCoverage = false

  for (const id of ids) {
    const r = perModel[id]
    for (const issue of r.issues) {
      // Ensure the modelId stamp is present even for legacy cached results.
      allIssues.push(issue.modelId ? issue : { ...issue, modelId: id })
    }
    for (const [rule, n] of Object.entries(r.stats.byRule ?? {})) {
      byRule[rule] = (byRule[rule] ?? 0) + n
    }
    errors   += r.stats.errors
    warnings += r.stats.warnings
    info     += r.stats.info
    durationMs += r.durationMs

    const cov = r.metadata?.coverage
    if (cov) {
      anyCoverage = true
      for (const ruleId of cov.attempted) attemptedSet.add(ruleId)
      for (const e of cov.entries) {
        const prev = covByRule.get(e.ruleId)
        covByRule.set(e.ruleId, {
          ruleId: e.ruleId,
          status: worstStatus(prev?.status, e.status),
          error:  e.error ?? prev?.error,
        })
      }
    }
  }

  const coverage = anyCoverage ? buildCoverage([...attemptedSet], covByRule) : undefined

  const merged: ValidationResult = {
    issues: allIssues,
    stats:  { total: allIssues.length, errors, warnings, info, byRule },
    durationMs,
    ...(coverage ? { metadata: { coverage } } : {}),
  }
  return { ...merged, qualityScore: calculateQualityScore(merged) }
}

/**
 * Recompose and publish the aggregate result from all per-model cached results.
 * Called after each per-model run finishes so the panel reflects every model,
 * and after a model is removed so its issues drop out of the displayed result.
 *
 * Exported so App.tsx can call it after removing a model from the scene.
 */
export function publishAggregateResult(): void {
  const vs = useValidationStore.getState()
  const order = useSceneStore.getState().models.map((m) => m.id)
  const aggregate = composeMultiModelResult(vs.cachedResultsByModel, order)
  if (aggregate) {
    vs.setResult(aggregate)
  } else {
    // No validated models remain — clear the displayed result.
    vs.setValidationStatus('idle')
  }
}

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
// Clears the active run's watchdog timer (null when idle). Lets cancelValidation
// tear the timer down so it can't fire onto an already-cancelled run.
let activeWatchdogClear: (() => void) | null = null

/** Silence timeout (ms) before the watchdog declares a run hung and terminates it. */
const WATCHDOG_SILENCE_MS = 60_000

/**
 * Cancel a running validation.
 * Sets status to 'cancelled', terminates the worker, and rejects the active promise.
 * No-ops if validation is not currently running.
 */
export function cancelValidation(): void {
  const { validationStatus, setValidationStatus } = useValidationStore.getState()
  if (validationStatus !== 'running') return
  log.info('Cancelling validation')
  activeWatchdogClear?.()
  activeWatchdogClear = null
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
          if (msg.decomp) {
            useValidationStore.getState().setDecompMapForModel(resolvedId, new Map(msg.decomp))
          }
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
 * @param force   - When true, bypass the OPFS result cache and always run the
 *                  worker. Pass true when the user explicitly triggers a re-run
 *                  so that changed profiles / rules always take effect.
 */
export async function runValidation(modelId?: string, rules?: RulesConfig, force = false): Promise<void> {
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

  // Apply per-rule severity overrides + the model stamp to each streamed issue,
  // so the displayed severity, the E/W/I counts and the score all reflect the
  // user's chosen severity (Phase 3). Returns the same object when nothing changes.
  const applyOverride = (i: ValidationIssue, modelId: string | null): ValidationIssue => {
    const sev = activeRules.severityOverrides?.[i.ruleId]
    const next = sev && sev !== i.severity ? { ...i, severity: sev } : i
    return modelId ? { ...next, modelId } : next
  }

  // ── Cache check — skip worker if we have a fresh result ──────────────────
  // Bypassed when `force` is true (explicit user re-run) so that changed
  // profiles / rule configs are always reflected in the new result.
  if (cacheKey && !force) {
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
    let clashCapped: { checkedCount: number; totalCount: number } | undefined

    // Per-rule coverage reported by the workers (key: ruleId). The launcher owns
    // the full attempted set (enabledRuleKeys) and gap-fills the rest as not-run.
    const cov = new Map<string, RuleCoverageEntry>()

    // Watchdog. A wedged synchronous rule loop blocks the worker event loop, so
    // an in-worker timeout can't fire — only terminate() from the main thread can
    // stop it. We reset a silence timer on every worker message; if it elapses we
    // declare the run hung. `settled` guarantees the first terminal event wins, so
    // a `done` arriving 1 ms after the watchdog can't flip error → complete.
    let settled = false
    let lastRuleId: string | null = null
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null
    const clearWatchdog = (): void => {
      if (watchdogTimer !== null) { clearTimeout(watchdogTimer); watchdogTimer = null }
    }

    const cleanup = (): void => {
      activeReject = null
      activeWatchdogClear = null
      clearWatchdog()
      worker0.removeEventListener('message', handler0)
      worker0.removeEventListener('error',   errorHandler0)
      worker1?.removeEventListener('message', handler1)
      worker1?.removeEventListener('error',   errorHandler1)
    }

    const onWatchdogFire = (): void => {
      if (settled) return
      settled = true
      const where = lastRuleId ? ` after ${lastRuleId}` : ''
      const message =
        `Validation stalled${where} — no progress for ${WATCHDOG_SILENCE_MS / 1000}s. ` +
        `The model may be too large or malformed for this check. Try disabling clash detection or splitting the model.`
      log.error(message)
      disposeValidatorWorker()
      setValidationStatus('error', message)
      appBus.emit('validation:failed', { runId: id, error: message })
      cleanup()
      reject(new WorkerError('WORKER_TIMEOUT', message))
    }
    const resetWatchdog = (): void => {
      if (settled) return
      clearWatchdog()
      watchdogTimer = setTimeout(onWatchdogFire, WATCHDOG_SILENCE_MS)
    }
    activeWatchdogClear = clearWatchdog

    const tryFinalize = (): void => {
      if (settled) return
      if (!w0Done || !w1Done) return

      if (w0Error) {
        // error already toasted by errorHandler0
        settled = true
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

      // Honest coverage: gap-fill every enabled rule the workers didn't report
      // (silent secondary-worker failure, terminate, etc.) as 'not-run'.
      const coverage = buildCoverage(enabledRuleKeys, cov)
      const mergedResult = {
        issues:    allIssues,
        stats:     { total: allIssues.length, errors, warnings, info, byRule },
        durationMs,
        metadata:  { coverage, ...(clashCapped ? { clashCapped } : {}) },
      }

      const resultParsed = parseValidationResultMsg(mergedResult)
      if (!resultParsed.ok) {
        const errMsg = resultParsed.error.message
        log.error('Invalid merged ValidationResult shape:', formatDevError(resultParsed.error))
        toast(errMsg, 'error')
        settled = true
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

      const storeSnap = useValidationStore.getState()
      recordValidationRun({
        timestamp:     Date.now(),
        profileId:     storeSnap.activeProfileId,
        // Rules that actually ran clean — NOT derived from issues. A clean rule
        // produces no issues yet did run; a crashed rule produces none either.
        rulesRun:      coverage.entries.filter((e) => e.status === 'ok').map((e) => e.ruleId),
        durationMs:    result.durationMs,
        issuesByRule:  result.stats.byRule,
        qualityScore:  result.qualityScore ?? 100,
        modelFileName: resolvedId ?? 'unknown',
      })

      if (cacheKey)   cacheResult(cacheKey, result)
      if (resolvedId) cacheResultForModel(resolvedId, result)

      // Publish the displayed result. With several models in the scene we show
      // the AGGREGATE of every model's cached result (so the panel lists issues
      // from all models, not just the one just validated). With a single model
      // (or none) we show this run's result directly.
      const sceneModelCount = useSceneStore.getState().models.length
      if (resolvedId && sceneModelCount > 1) {
        publishAggregateResult()
      } else {
        setResult(result)
      }

      settled = true
      appBus.emit('validation:complete', { runId: id, result, durationMs })
      cleanup()
      resolve()
    }

    // ── Worker 0 message handler ──────────────────────────────────────────────

    const handler0 = (e: MessageEvent<ValidatorOutMessage>): void => {
      const raw = e.data
      if (!raw || raw.id !== id) return
      resetWatchdog()

      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) { log.warn('Dropping unrecognised w0 message:', formatDevError(parsed.error)); return }

      match(parsed.data)
        .with({ type: 'tree' }, (msg) => {
          const tree = parseSpatialNodeArray(msg.tree, 'validator.worker/tree')
          log.debug(`Spatial tree received for "${resolvedId ?? 'active'}", nodes:`, tree.length)
          if (resolvedId) {
            setSpatialTreeForModel(resolvedId, tree)
            if (msg.decomp) {
              useValidationStore.getState().setDecompMapForModel(resolvedId, new Map(msg.decomp))
            }
          } else {
            setSpatialTree(tree)
          }
        })
        .with({ type: 'partial' }, (msg) => {
          lastRuleId = msg.ruleId
          if (msg.status) cov.set(msg.ruleId, { ruleId: msg.ruleId, status: msg.status, ...(msg.error ? { error: msg.error } : {}) })
          const stamped = msg.issues.map((i) => applyOverride(i, resolvedId))
          w0Issues.push(...stamped)
          addPartialIssues(stamped)
          w0Progress = msg.progress
          const combined = Math.round((w0Progress + w1Progress) / (useTwoWorkers ? 2 : 1))
          setProgress(Math.min(combined, 99))
          appBus.emit('validation:progress', { runId: id, progress: combined })
        })
        .with({ type: 'done' }, (msg) => {
          if (msg.result?.metadata?.clashCapped) clashCapped = msg.result.metadata.clashCapped
          w0Done = true; tryFinalize()
        })
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
        .with({ type: 'cobie-done' },   () => { /* no-op */ })
        .exhaustive()
    }

    // ── Worker 1 message handler ──────────────────────────────────────────────

    const handler1 = (e: MessageEvent<ValidatorOutMessage>): void => {
      const raw = e.data
      if (!raw || raw.id !== id) return
      resetWatchdog()

      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) { log.warn('Dropping unrecognised w1 message:', formatDevError(parsed.error)); return }

      match(parsed.data)
        .with({ type: 'tree' },         () => { /* worker 1 skips tree, but guard here anyway */ })
        .with({ type: 'partial' }, (msg) => {
          lastRuleId = msg.ruleId
          if (msg.status) cov.set(msg.ruleId, { ruleId: msg.ruleId, status: msg.status, ...(msg.error ? { error: msg.error } : {}) })
          const stamped = msg.issues.map((i) => applyOverride(i, resolvedId))
          w1Issues.push(...stamped)
          addPartialIssues(stamped)
          w1Progress = msg.progress
          const combined = Math.round((w0Progress + w1Progress) / 2)
          setProgress(Math.min(combined, 99))
          appBus.emit('validation:progress', { runId: id, progress: combined })
        })
        .with({ type: 'done' }, (msg) => {
          if (msg.result?.metadata?.clashCapped) clashCapped = msg.result.metadata.clashCapped
          w1Done = true; tryFinalize()
        })
        .with({ type: 'error' }, (msg) => {
          // Secondary worker error: log it but don't fail the whole run (primary results still valid)
          log.warn('Worker 1 reported error (non-fatal):', msg.message)
          w1Done = true
          tryFinalize()
        })
        .with({ type: 'tree-done' },    () => { /* no-op */ })
        .with({ type: 'takeoff-done' }, () => { /* no-op */ })
        .with({ type: 'cobie-done' },   () => { /* no-op */ })
        .exhaustive()
    }

    // ── Error handlers ────────────────────────────────────────────────────────

    const errorHandler0 = (e: ErrorEvent): void => {
      if (settled) return
      settled = true
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

    // Start the silence watchdog now that work has been dispatched.
    resetWatchdog()
  })
}

// ── Multi-model validation ──────────────────────────────────────────────────────

/**
 * Validate EVERY model currently in the scene, in sequence, then show the
 * aggregate result (issues from all models) in the panel.
 *
 * This is what the main "Validate" / "Re-validate" button should call when more
 * than one model is loaded, so the user sees the full picture instead of only
 * the active model. Each model is validated by the existing single-model
 * `runValidation`, which caches its result per model; after each one finishes we
 * recompose the displayed aggregate from `cachedResultsByModel`.
 *
 * Runs sequentially (not in parallel) on purpose: the two-worker pool is already
 * saturated by a single model's rule split, so parallel models would contend for
 * the same workers and serialise anyway — sequencing keeps progress readable and
 * memory bounded.
 *
 * @param rules  Override the stored rules config for this run.
 * @param force  Bypass the per-model result cache (use for explicit user re-runs).
 */
export async function runValidationAll(rules?: RulesConfig, force = false): Promise<void> {
  const models = useSceneStore.getState().models
  const ids = models.map((m) => m.id)

  // Zero or one model → defer to the normal single-model path (active model).
  if (ids.length <= 1) {
    return runValidation(ids[0], rules, force)
  }

  log.info(`Validating all ${ids.length} scene models sequentially`)

  let firstError: unknown = null
  for (const id of ids) {
    try {
      await runValidation(id, rules, force)
    } catch (err) {
      // Keep going so one bad model doesn't hide the others' results.
      firstError = firstError ?? err
      log.warn(`runValidationAll: model "${id}" failed — continuing`, err)
    }
  }

  // Final recompose so the panel shows every model's issues, regardless of which
  // model's run happened to finish last (or errored).
  publishAggregateResult()

  if (firstError) throw firstError
}
