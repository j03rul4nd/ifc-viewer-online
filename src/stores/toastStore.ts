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
  /** Auto-dismiss delay in ms. */
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  addToast:    (opts: { message: string; severity: ToastSeverity; duration?: number }) => void
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

      addToast({ message, severity, duration }) {
        const id  = crypto.randomUUID()
        const dur = duration ?? DEFAULT_DURATION[severity]

        set(
          (s) => ({ toasts: [...s.toasts, { id, message, severity, duration: dur }] }),
          false,
          'addToast',
        )

        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }), false, 'autoRemoveToast')
        }, dur)
      },

      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }), false, 'removeToast'),

      clearAll: () => set({ toasts: [] }, false, 'clearAll'),
    }),
    { name: 'ToastStore', enabled: import.meta.env.DEV },
  ),
)

// ── Convenience helpers (callable from anywhere, including lib/ modules) ────────

export function toast(
  message: string,
  severity: ToastSeverity = 'info',
  opts?: { duration?: number },
): void {
  useToastStore.getState().addToast({ message, severity, duration: opts?.duration })
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
