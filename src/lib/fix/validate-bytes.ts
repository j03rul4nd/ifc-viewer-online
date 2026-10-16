// ─── Validate an exported IFC in isolation ────────────────────────────────────
// The "after" half of a batch fix: run the validator on the bytes the export
// produced, and hand the result back — nothing else. No validation store
// writes, no cache, no run history, no appBus events, no spatial tree. That is
// the whole point: the headline score, the run diff, the certificate, the
// benchmark and `validation_completed` all stay on the original file, and only
// the fixed-file card ever sees this result.
//
// Its own dedicated worker, not the launcher's pool, so it can never collide
// with a normal run's active promise or be torn down by cancelValidation. One
// worker runs every rule, which is slower than the two-worker pool and fine
// for a check the user is not blocked on.

import type { RuleCoverageEntry, RulesConfig, ValidationIssue, ValidationResult } from '../../types'
import { buildCoverage, calculateQualityScore, WATCHDOG_SILENCE_MS } from '../validator'
import { parseValidationResultMsg, parseValidatorMsg } from '../worker-schemas'
import { WorkerError } from '../errors'
import { useValidationStore } from '../../stores/validationStore'

export interface ValidateBytesOptions {
  /** Stamped on every issue, as a normal run stamps them. */
  modelId: string
  /** Defaults to the validation store's current rules — what Re-validate would use. */
  rules?: RulesConfig
  /** 0–99 while rules run; 100 once the result is built. */
  onProgress?: (pct: number) => void
  signal?: AbortSignal
  /** Injected in tests. */
  createWorker?: () => Worker
}

const defaultWorker = (): Worker =>
  new Worker(new URL('../../workers/validator.worker.ts', import.meta.url), { type: 'module' })

function abortError(): Error {
  return typeof DOMException === 'function'
    ? new DOMException('The check was cancelled', 'AbortError')
    : Object.assign(new Error('The check was cancelled'), { name: 'AbortError' })
}

export function validateBytes(bytes: Uint8Array, opts: ValidateBytesOptions): Promise<ValidationResult> {
  const { modelId, onProgress, signal } = opts
  const rules = opts.rules ?? useValidationStore.getState().rules

  if (signal?.aborted) return Promise.reject(abortError())
  if (!bytes || bytes.byteLength === 0) return Promise.reject(new Error('No IFC bytes to check'))

  const enabledRuleKeys = Object.entries(rules).filter(([, v]) => v === true).map(([k]) => k)

  // Same per-issue treatment as the launcher's applyOverride: the user's
  // severity overrides, then the model stamp, so the score is comparable.
  const applyOverride = (i: ValidationIssue): ValidationIssue => {
    const sev = rules.severityOverrides?.[i.ruleId]
    const next = sev && sev !== i.severity ? { ...i, severity: sev } : i
    return { ...next, modelId }
  }

  let worker: Worker
  try {
    worker = (opts.createWorker ?? defaultWorker)()
  } catch (err) {
    return Promise.reject(new WorkerError('WORKER_INIT_FAILED', err instanceof Error ? err.message : String(err)))
  }

  const id = `fix-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const started = Date.now()

  return new Promise<ValidationResult>((resolve, reject) => {
    const issues: ValidationIssue[] = []
    const cov = new Map<string, RuleCoverageEntry>()
    let clashCapped: { checkedCount: number; totalCount: number } | undefined
    let unreadable = 0
    let lastRuleId: string | null = null
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (): void => {
      settled = true
      if (timer !== null) { clearTimeout(timer); timer = null }
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }
    const fail = (err: Error): void => {
      if (settled) return
      finish()
      reject(err)
    }

    // A wedged synchronous rule loop blocks the worker's own timers, so only
    // the main thread can notice the silence — same schedule as a normal run.
    const resetWatchdog = (): void => {
      if (settled) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        const where = lastRuleId ? ` after ${lastRuleId}` : ''
        fail(new WorkerError(
          'WORKER_TIMEOUT',
          `The check stalled${where} — no progress for ${WATCHDOG_SILENCE_MS / 1000}s.`,
        ))
      }, WATCHDOG_SILENCE_MS)
    }

    const finalize = (): void => {
      let errors = 0, warnings = 0, info = 0
      const byRule: Record<string, number> = {}
      for (const issue of issues) {
        byRule[issue.ruleId] = (byRule[issue.ruleId] ?? 0) + 1
        if (issue.severity === 'error')        errors++
        else if (issue.severity === 'warning') warnings++
        else                                   info++
      }
      const coverage = buildCoverage(enabledRuleKeys, cov, unreadable)
      const merged = {
        issues,
        stats: { total: issues.length, errors, warnings, info, byRule },
        durationMs: Date.now() - started,
        metadata: { coverage, ...(clashCapped ? { clashCapped } : {}) },
      }
      const parsed = parseValidationResultMsg(merged)
      if (!parsed.ok) { fail(parsed.error); return }
      // The schema drops modelId (the worker never sends one): stamp it again.
      const stamped: ValidationResult = {
        ...parsed.data,
        issues: parsed.data.issues.map((i) => ({ ...i, modelId })),
      }
      const result: ValidationResult = { ...stamped, qualityScore: calculateQualityScore(stamped) }
      finish()
      onProgress?.(100)
      resolve(result)
    }

    const onMessage = (e: MessageEvent): void => {
      const raw = e.data as { id?: unknown } | null
      if (settled || !raw || raw.id !== id) return
      resetWatchdog()
      const parsed = parseValidatorMsg(raw)
      if (!parsed.ok) return // an unrecognised message is dropped, as the launcher does
      const msg = parsed.data
      switch (msg.type) {
        case 'partial':
          lastRuleId = msg.ruleId
          if (msg.status) cov.set(msg.ruleId, { ruleId: msg.ruleId, status: msg.status, ...(msg.error ? { error: msg.error } : {}) })
          for (const i of msg.issues) issues.push(applyOverride(i as ValidationIssue))
          onProgress?.(Math.min(msg.progress, 99))
          break
        case 'done':
          if (msg.result.metadata?.clashCapped) clashCapped = msg.result.metadata.clashCapped
          unreadable += msg.result.unreadableEntities ?? 0
          finalize()
          break
        case 'error':
          fail(new WorkerError('WORKER_CRASHED', msg.message))
          break
        default:
          break // tree / takeoff / cobie messages are not ours
      }
    }

    const onError = (e: ErrorEvent): void => {
      fail(new WorkerError('WORKER_CRASHED', e.message || 'Validator worker script error — WASM may have failed to initialise'))
    }
    const onAbort = (): void => fail(abortError())

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort)

    // Always a copy: the caller keeps `bytes` (they are what gets downloaded).
    const buffer = bytes.slice().buffer as ArrayBuffer
    resetWatchdog()
    worker.postMessage({ type: 'validate', id, buffer, rules, skipTree: true }, [buffer])
  })
}
