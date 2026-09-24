// ─── Viewer-side cancellation and settle helpers ──────────────────────────────
// The pure half of the viewer's loading hooks (viewer.ts cannot be unit-tested:
// it needs WebGL, three and the fragments workers). Everything here decides
// something the viewer then acts on — is this error a cancel, which model gets
// the focus back, has a model stopped streaming — so the decisions are tested
// in plain node and the viewer keeps only the side effects.

/** How `waitForModelIdle` ended. */
export type ModelIdleResult = 'idle' | 'timeout' | 'missing' | 'aborted'

/**
 * The one error a cancelled load rejects with. A DOMException named
 * `AbortError` is what `fetch` and every other platform API throw on abort, so
 * callers classify a viewer cancel with the same check as a download cancel.
 */
export function loadCancelledError(): DOMException {
  return new DOMException('Load cancelled', 'AbortError')
}

/** Throw the cancel error when the signal has fired. */
export function throwIfLoadAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw loadCancelledError()
}

/** True for an AbortError from any source (ours, fetch, a worker wrapper). */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

/**
 * True when fragments rejected a `core.load` because `core.abort(modelId)` won.
 *
 * `instanceof LoadAbortedError` is NOT enough and is why this exists: the error
 * is thrown inside the fragments worker, and the worker bridge rejects the
 * main-thread promise with `error.toString()` — a plain STRING,
 * "LoadAbortedError: Fragments: Load of model … was aborted." — not the class.
 * The name check covers builds that do forward the instance.
 */
export function isFragmentsLoadAborted(err: unknown): boolean {
  if (typeof err === 'string') return err.includes('LoadAbortedError')
  if (typeof err !== 'object' || err === null) return false
  const e = err as { name?: unknown; message?: unknown }
  if (e.name === 'LoadAbortedError') return true
  return typeof e.message === 'string' && e.message.includes('LoadAbortedError')
}

/**
 * A fragments progress value as a fraction, or null when it is not a real
 * measurement. fragments types `progress` as a number, but it crosses a worker
 * boundary; anything that is not a finite number is reported as "no fraction"
 * rather than invented, and a stray 1.0000001 is not allowed past 1.
 */
export function stageFraction(progress: unknown): number | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null
  return Math.min(1, Math.max(0, progress))
}

/**
 * Which model becomes active after a load that was not committed is undone:
 * the one that was active before it started, when it is still loaded (a
 * cancelled load must leave the scene as it found it), else the first model
 * still loaded — the same promotion `removeModel` does — else none.
 */
export function pickActiveAfterDiscard(
  previousId: string | null,
  loadedIds: Iterable<string>,
): string | null {
  let first: string | null = null
  for (const id of loadedIds) {
    if (id === previousId) return id
    if (first === null) first = id
  }
  return first
}

export interface IdlePollOptions {
  /** Give up after this long (wall clock, not poll count). */
  timeoutMs: number
  signal?: AbortSignal
  /** Poll period in ms (default 100). */
  intervalMs?: number
  /** Consecutive not-busy polls needed before calling the model idle (default 2). */
  settlePolls?: number
}

/**
 * Poll `probe` until the model settles.
 *
 * `probe` returns true while the model is busy, false when it is not, and null
 * when the model is gone (removed, or the probe itself threw — a disposed
 * model's getters can). One not-busy reading is not enough: the flag can drop
 * for an instant between rounds of streaming work (the worker has answered,
 * the next view update has not gone out yet), and a single poll can land in
 * that gap. Two consecutive readings one interval apart rarely both do.
 *
 * Timers, not requestAnimationFrame: a hidden pane or a background tab never
 * fires rAF, and a background stream phase must still end (as `timeout`) rather
 * than hang its job. The deadline is wall-clock for the same reason — a
 * background tab clamps timers to ~1 s, so counting polls would stretch a
 * 30 s budget to five minutes.
 */
export function pollModelIdle(
  probe: () => boolean | null,
  opts: IdlePollOptions,
): Promise<ModelIdleResult> {
  const intervalMs = Math.max(1, opts.intervalMs ?? 100)
  const settlePolls = Math.max(1, Math.floor(opts.settlePolls ?? 2))
  const deadline = Date.now() + Math.max(0, opts.timeoutMs)
  const { signal } = opts

  return new Promise<ModelIdleResult>((resolve) => {
    if (signal?.aborted) { resolve('aborted'); return }

    let timer: ReturnType<typeof setTimeout> | null = null
    let streak = 0
    let settled = false

    const finish = (result: ModelIdleResult): void => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const onAbort = (): void => finish('aborted')
    signal?.addEventListener('abort', onAbort, { once: true })

    const tick = (): void => {
      timer = null
      if (settled) return
      let busy: boolean | null
      try {
        busy = probe()
      } catch {
        busy = null
      }
      if (busy === null) { finish('missing'); return }
      streak = busy ? 0 : streak + 1
      if (streak >= settlePolls) { finish('idle'); return }
      if (Date.now() >= deadline) { finish('timeout'); return }
      timer = setTimeout(tick, intervalMs)
    }

    tick()
  })
}
