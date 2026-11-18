// ─── Toast notification store ─────────────────────────────────────────────────
// Usage:
//   toast('File loaded', 'success')
//   toastFromError(err)               // extracts .message automatically
//   toast('Worker failed', 'error', { duration: 8000 })

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export type ToastSeverity = 'error' | 'warning' | 'info' | 'success'

export interface Toast {
  id:       string
  message:  string
  severity: ToastSeverity
  /** Auto-dismiss delay in ms; 0 = stays until it is closed (or its action used). */
  duration: number
  /** Label of the toast's one action button, when it has one (see runToastAction). */
  actionLabel?: string
}

/**
 * The action behind each toast's button, by toast id. Kept OUT of the store:
 * the store holds serialisable state only (it is inspected in devtools and
 * snapshot in tests), and a callback is not state.
 */
const actions = new Map<string, () => void>()

/**
 * Each toast's auto-dismiss timer, by id — outside the store for the same
 * reason. A timer pauses while the toast is hovered or holds focus: a toast
 * with a button must not vanish under the pointer, or while a keyboard user
 * is on its button (WCAG 2.2.1).
 */
interface DismissTimer {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}
const timers = new Map<string, DismissTimer>()

function forget(id: string): void {
  const timer = timers.get(id)
  if (timer?.handle != null) clearTimeout(timer.handle)
  timers.delete(id)
  actions.delete(id)
}

function arm(id: string, ms: number): void {
  const timer: DismissTimer = { handle: null, remaining: ms, startedAt: Date.now() }
  timer.handle = setTimeout(() => {
    forget(id)
    useToastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }), false, 'autoRemoveToast')
  }, ms)
  timers.set(id, timer)
}

/** Stop a toast's auto-dismiss countdown (pointer over it, focus inside it). */
export function pauseToast(id: string): void {
  const timer = timers.get(id)
  if (!timer || timer.handle === null) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
}

/** Restart a paused countdown with the time it had left. */
export function resumeToast(id: string): void {
  const timer = timers.get(id)
  if (!timer || timer.handle !== null) return
  arm(id, timer.remaining)
}

/** Run a toast's action (once) and dismiss it. */
export function runToastAction(id: string): void {
  const run = actions.get(id)
  actions.delete(id)
  useToastStore.getState().removeToast(id)
  try { run?.() } catch { /* an action failing must not break the toast stack */ }
}

interface ToastStore {
  toasts: Toast[]
  addToast:    (opts: { message: string; severity: ToastSeverity; duration?: number; actionLabel?: string }) => string
  removeToast: (id: string) => void
  clearAll:    () => void
}

const DEFAULT_DURATION: Record<ToastSeverity, number> = {
  error:   6000,
  warning: 4500,
  info:    3500,
  success: 3000,
}

export const useToastStore = create<ToastStore>()(
  devtools(
    (set) => ({
      toasts: [],

      addToast({ message, severity, duration, actionLabel }) {
        const id  = crypto.randomUUID()
        const dur = duration ?? DEFAULT_DURATION[severity]

        set(
          (s) => ({ toasts: [...s.toasts, { id, message, severity, duration: dur, ...(actionLabel ? { actionLabel } : {}) }] }),
          false,
          'addToast',
        )

        if (dur > 0) arm(id, dur)
        return id
      },

      removeToast: (id) => {
        forget(id)
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }), false, 'removeToast')
      },

      clearAll: () => {
        for (const id of [...timers.keys()]) forget(id)
        actions.clear()
        set({ toasts: [] }, false, 'clearAll')
      },
    }),
    { name: 'ToastStore', enabled: import.meta.env.DEV },
  ),
)

// ── Convenience helpers (callable from anywhere, including lib/ modules) ────────

/** Show a toast; returns its id (to close it early with removeToast). */
export function toast(
  message: string,
  severity: ToastSeverity = 'info',
  opts?: {
    /** ms before it closes by itself; 0 = stays until closed. */
    duration?: number
    /** One button on the toast ("Load a copy anyway"). Clicking it runs `run` and dismisses the toast. */
    action?: { label: string; run: () => void }
  },
): string {
  const id = useToastStore.getState().addToast({
    message, severity, duration: opts?.duration, actionLabel: opts?.action?.label,
  })
  if (opts?.action) actions.set(id, opts.action.run)
  return id
}

/** Extract the message from any Error-like and show it as a toast. */
export function toastFromError(
  error: unknown,
  severity: ToastSeverity = 'error',
  prefix?: string,
): void {
  const message = error instanceof Error ? error.message : String(error)
  toast(prefix ? `${prefix}: ${message}` : message, severity)
}
