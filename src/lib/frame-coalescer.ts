/**
 * Collapse an arbitrary number of expensive invalidations into one call on the
 * next animation frame. Camera input can arrive much faster than the display;
 * doing fragments work for every raw event only adds latency.
 */
export function createFrameCoalescer(
  task: () => void,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): { request(): void; dispose(): void } {
  let handle: number | null = null
  let disposed = false

  return {
    request(): void {
      if (disposed || handle !== null) return
      handle = schedule(() => {
        handle = null
        if (!disposed) task()
      })
    },
    dispose(): void {
      disposed = true
      if (handle !== null) cancel(handle)
      handle = null
    },
  }
}
