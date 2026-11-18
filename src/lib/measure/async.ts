// ─── async helpers for the viewport tools ─────────────────────────────────────
// Worker round-trips that do not come back. A raycast issued while a model is
// still being set up (or torn down) can stay pending forever, and the tools
// process clicks in order — one lost reply used to freeze every click after it.

/** Resolve with `fallback` if `promise` has not settled within `ms` (or rejects). */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(fallback) },
    )
  })
}

/**
 * Run tasks one after another, each with a ceiling, so a task that never
 * settles delays the next by at most `ceilingMs` instead of forever.
 */
export function createTaskQueue(ceilingMs: number, onError?: (err: unknown) => void): (task: () => Promise<void> | void) => Promise<void> {
  let tail: Promise<void> = Promise.resolve()
  return (task) => {
    const run = (): Promise<void> => {
      let result: Promise<void>
      try { result = Promise.resolve(task()) } catch (err) { onError?.(err); return Promise.resolve() }
      return withTimeout(result.catch((err) => { onError?.(err) }), ceilingMs, undefined)
    }
    tail = tail.then(run, run)
    return tail
  }
}
