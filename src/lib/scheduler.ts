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
 *
 * Strategy:
 *   1. Use scheduler.postTask() when available — most accurate priority control.
 *   2. When isInputPending() reports user input is queued, yield via setTimeout(0)
 *      so the browser can process it immediately.
 *   3. When no input is pending, resolve synchronously — no yield needed.
 *      (Skipping the setTimeout avoids an unnecessary 4ms+ task-queue delay
 *       and the comment "skip yield when no input queued" now actually does that.)
 */
export function yieldToMain(priority: SchedulerPriority = 'user-visible'): Promise<void> {
  if (typeof globalThis.scheduler?.postTask === 'function') {
    return globalThis.scheduler.postTask(() => undefined, { priority })
  }

  type NavigatorScheduling = { scheduling: { isInputPending(): boolean } }
  const nav = navigator as unknown as NavigatorScheduling

  if ('scheduling' in navigator && typeof nav.scheduling?.isInputPending === 'function') {
    if (nav.scheduling.isInputPending()) {
      // Input is queued — yield immediately so the browser can handle it
      return new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    // No pending input — skip the yield for performance
    return Promise.resolve()
  }

  // Fallback: always yield once (covers Safari, Firefox, etc.)
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/**
 * Runs `fn` over `items` in chunks, yielding to the browser between chunks
 * so the UI stays responsive during heavy processing loops.
 */
export async function runInChunks<T>(
  items:     T[],
  fn:        (item: T, index: number) => Promise<void> | void,
  chunkSize  = 64,
  priority:  SchedulerPriority = 'background',
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
