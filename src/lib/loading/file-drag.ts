// ─── File drag tracker ────────────────────────────────────────────────────────
// Is the user dragging files over the window right now? Browsers make this
// harder than it looks:
//   • dragenter/dragleave fire for every child element, so a depth counter is
//     needed — and it drifts when a drop zone stops propagation;
//   • Safari reports relatedTarget null on EVERY dragleave, so "left the
//     window" also needs the pointer to be outside the viewport;
//   • a drag that ends outside the page fires no drop and sometimes no leave.
// The tracker therefore also resets on drop/dragend and after `idleMs` with no
// dragover. dragover arrives every ~350 ms (±200) while the pointer is still,
// so the idle window is 1000 ms — shorter flickers.
//
// Pure: no DOM listeners here (see hooks/useFileDragActive.ts). Only drags that
// carry files count; the scene tree's own row drags never light it up.

import { hasFilePayload, type DataTransferLike } from './drop-routing'

export interface FileDragState {
  active: boolean
  /** Files in the drag, from items.length; 0 when the browser does not say. */
  count: number
}

export interface FileDragTrackerOptions {
  idleMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface FileDragTracker {
  enter(dt: DataTransferLike | null | undefined): void
  over(dt: DataTransferLike | null | undefined): void
  leave(dt: DataTransferLike | null | undefined, leftWindow: boolean): void
  drop(): void
  end(): void
  dispose(): void
}

export function createFileDragTracker(
  onChange: (state: FileDragState) => void,
  opts: FileDragTrackerOptions = {},
): FileDragTracker {
  const idleMs = opts.idleMs ?? 1000
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let depth = 0
  let state: FileDragState = { active: false, count: 0 }
  let timer: unknown = null

  const emit = (next: FileDragState): void => {
    if (next.active === state.active && next.count === state.count) return
    state = next
    onChange(state)
  }
  const stopTimer = (): void => {
    if (timer !== null) { clearTimer(timer); timer = null }
  }
  const armTimer = (): void => {
    stopTimer()
    timer = setTimer(() => { timer = null; reset() }, idleMs)
  }
  const reset = (): void => {
    depth = 0
    stopTimer()
    emit({ active: false, count: 0 })
  }

  return {
    enter(dt) {
      if (!hasFilePayload(dt)) return
      depth += 1
      emit({ active: true, count: dt?.items?.length ?? 0 })
      armTimer()
    },
    over(dt) {
      if (!state.active || !hasFilePayload(dt)) return
      armTimer()
    },
    leave(dt, leftWindow) {
      if (!state.active) return
      if (leftWindow) { reset(); return }
      if (!hasFilePayload(dt)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) reset()
    },
    drop: reset,
    end: reset,
    dispose: stopTimer,
  }
}
