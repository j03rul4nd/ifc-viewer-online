// ─── ids-runner.ts ────────────────────────────────────────────────────────────
// Main-thread orchestration: parse the .ids XML (DOMParser) if needed, then run
// the check in a dedicated web-ifc worker against the model's IFC buffer.
//
// Protocol v2 (P1-2): progress callbacks + cooperative cancellation. Workers are
// spawned per job and always terminated. AbortControllers live in this module
// keyed by run id — never in the Zustand store (non-serialisable).

import { parseIds } from './ids-parser'
import type { IdsDocument, IdsErrorCode, IdsPhase, IdsResult } from './ids-types'
import { parseIdsWorkerMsg } from '../worker-schemas'
import { createLogger } from '../logger'

const log = createLogger('Ids')

/** Typed failure of an IDS check run (worker/cancel/init errors — not parse errors). */
export class IdsCheckError extends Error {
  constructor(public readonly code: IdsErrorCode, message: string) {
    super(message)
    this.name = 'IdsCheckError'
  }
}

export interface IdsRunOptions {
  /** Abort the run; the worker exits between chunks (2 s grace, then hard terminate). */
  signal?: AbortSignal
  /** Throttled progress (≤ ~10/s): pct 0–100 across open/gather/check phases. */
  onProgress?: (pct: number, phase: IdsPhase) => void
}

export interface IdsRunOutput { doc: IdsDocument; result: IdsResult }

/** After a cancel request the worker gets this long to exit cleanly. */
const CANCEL_GRACE_MS = 2_000

/**
 * Watchdog: if the worker goes silent (no progress/result/error) for this long,
 * assume it hung (corrupt model spinning in web-ifc, lost worker) and fail with
 * `code: 'timeout'`. Reset on every inbound message. 120 s = double the
 * validator's 60 s convention, since IDS gathers large models (plan §8).
 */
const WATCHDOG_MS = 120_000

// Active run controllers keyed by run id. At most one run is active by design
// (the store's startRun is a no-op while running) but the map keeps cancellation
// correct if that ever changes.
const activeRuns = new Map<string, AbortController>()

/** Abort every in-flight IDS run. Safe to call when none is running. */
export function cancelActiveIdsRuns(): void {
  for (const controller of activeRuns.values()) controller.abort()
}

/** True while an IDS check is in flight (used by the HMR orphan guard, §7.11). */
export function hasActiveIdsRun(): boolean {
  return activeRuns.size > 0
}

/**
 * Check an IDS (XML string or pre-parsed document) against an IFC buffer.
 * Throws IdsParseError on bad XML and IdsCheckError on run failures — including
 * `code: 'cancelled'` when aborted.
 */
export async function runIds(
  ids: string | IdsDocument,
  ifcBuffer: ArrayBuffer | Uint8Array,
  options: IdsRunOptions = {},
): Promise<IdsRunOutput> {
  const doc = typeof ids === 'string' ? parseIds(ids) : ids // throws IdsParseError on bad input

  if (options.signal?.aborted) throw new IdsCheckError('cancelled', 'IDS check cancelled')

  const buffer = ifcBuffer instanceof Uint8Array
    ? ifcBuffer.slice().buffer // copy so the transfer doesn't detach the registry's buffer
    : ifcBuffer.slice(0)

  const id = crypto.randomUUID()
  const controller = new AbortController()
  activeRuns.set(id, controller)
  const onExternalAbort = (): void => controller.abort()
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const result = await new Promise<IdsResult>((resolve, reject) => {
      const worker = new Worker(new URL('../../workers/ids.worker.ts', import.meta.url), { type: 'module' })
      let graceTimer: ReturnType<typeof setTimeout> | null = null
      let watchdog: ReturnType<typeof setTimeout> | null = null
      let settled = false
      // Single-shot latch: a late worker message or a timer firing after
      // settlement must never resolve/reject twice or touch a terminated worker.
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        if (graceTimer != null) clearTimeout(graceTimer)
        if (watchdog != null) clearTimeout(watchdog)
        worker.terminate()
        fn()
      }
      const armWatchdog = (): void => {
        if (watchdog != null) clearTimeout(watchdog)
        watchdog = setTimeout(() => {
          log.warn('IDS worker watchdog fired — no message for 120 s, terminating', { id })
          settle(() => reject(new IdsCheckError('timeout', 'IDS check timed out')))
        }, WATCHDOG_MS)
      }

      controller.signal.addEventListener('abort', () => {
        if (settled) return
        worker.postMessage({ type: 'cancel', id })
        graceTimer = setTimeout(() => {
          log.warn('IDS worker did not confirm cancel within grace — terminating', { id })
          settle(() => reject(new IdsCheckError('cancelled', 'IDS check cancelled')))
        }, CANCEL_GRACE_MS)
      }, { once: true })

      worker.onmessage = (e: MessageEvent<unknown>): void => {
        const parsed = parseIdsWorkerMsg(e.data)
        if (!parsed.ok) return // logged inside parseIdsWorkerMsg
        const m = parsed.data
        if (m.id !== id) {
          log.debug('Dropping IDS worker message for stale run', { got: m.id, want: id })
          return
        }
        if (!settled) armWatchdog() // any live message proves the worker is alive
        if (m.type === 'progress') {
          if (!settled) options.onProgress?.(m.pct, m.phase)
          return
        }
        if (m.type === 'result') settle(() => resolve(m.result))
        else settle(() => reject(new IdsCheckError(m.code, m.message)))
      }
      worker.onerror = (e): void => {
        settle(() => reject(new IdsCheckError('unknown', e.message || 'IDS worker error')))
      }

      armWatchdog()
      worker.postMessage({ type: 'check-ids', id, buffer, doc }, [buffer])
    })
    return { doc, result }
  } finally {
    activeRuns.delete(id)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}
