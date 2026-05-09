// ─── Toast notification store ─────────────────────────────────────────────────
// Lightweight Zustand store for ephemeral user-facing messages.
// Usage:
//   import { toast } from '../stores/toastStore'
//   toast('File loaded', 'success')
//   toast('Worker failed: ' + err.message, 'error')

import { create } from 'zustand'

export type ToastSeverity = 'error' | 'warning' | 'info' | 'success'

export interface Toast {
  id: string
  message: string
  severity: ToastSeverity
  /** Auto-dismiss delay in ms. Defaults to 5000 (errors) or 3500 (others). */
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (opts: { message: string; severity: ToastSeverity; duration?: number }) => void
  removeToast: (id: string) => void
  clearAll: () => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast({ message, severity, duration }) {
    const id  = crypto.randomUUID()
    const dur = duration ?? (severity === 'error' ? 5000 : 3500)

    set((s) => ({ toasts: [...s.toasts, { id, message, severity, duration: dur }] }))

    // Auto-dismiss
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, dur)
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearAll:    ()   => set({ toasts: [] }),
}))

// ── Convenience helper (callable from anywhere, including workers) ─────────────

export function toast(message: string, severity: ToastSeverity = 'info', duration?: number): void {
  useToastStore.getState().addToast({ message, severity, duration })
}
