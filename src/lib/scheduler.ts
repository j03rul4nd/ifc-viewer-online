// ─── CPU scheduler helpers ────────────────────────────────────────────────────
// Uses scheduler.postTask() where available, falls back to setTimeout(0).
// All feature detection is runtime-only (no UA sniffing).

export type SchedulerPriority = 'user-blocking' | 'user-visible' | 'background'

declare global {
  interface Scheduler {
    postTask<T>(
      callback: () => T | Promise<T>,
      options?: { priority?: SchedulerPriority; delay?: number },
    ): Promise<T>
  }
  // eslint-disable-next-line no-var
  var scheduler: Scheduler | undefined
}

/**
 * Yields control back to the browser event loop.
 * Priorities map directly to the Scheduler API; ignored on fallback.
 */
export function yieldToMain(priority: SchedulerPriority = 'user-visible'): Promise<void> {
  if (typeof globalThis.scheduler?.postTask === 'function') {
    return globalThis.scheduler.postTask(() => undefined, { priority })
  }
  // isInputPending hint: skip yield when no input is queued (best-effort)
  if (
    'scheduling' in navigator &&
    (navigator as unknown as { scheduling: { isInputPending(): boolean } }).scheduling.isInputPending()
  ) {
    return new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  return new Promise<void>(resolve => setTimeout(resolve, 0))
}

/**
 * Runs `fn` over `items` in chunks, yielding to the browser between each chunk
 * so the UI stays responsive during heavy processing loops.
 */
export async function runInChunks<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void> | void,
  chunkSize = 64,
  priority: SchedulerPriority = 'background',
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    for (let j = 0; j < chunk.length; j++) {
      await fn(chunk[j], i + j)
    }
    if (i + chunkSize < items.length) {
      await yieldToMain(priority)
    }
  }
}
