// ─── Toast notification container ─────────────────────────────────────────────
// Renders ephemeral notification toasts in the bottom-right corner.
// Toasts auto-dismiss; click dismisses immediately.

import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useToastStore, type Toast } from '../stores/toastStore'

// ── Per-severity visual style ─────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Toast['severity'], {
  bar:  string
  bg:   string
  text: string
  icon: string
}> = {
  error:   { bar: 'bg-red-500',    bg: 'bg-red-500/10 border-red-500/30',    text: 'text-red-300',    icon: '✕' },
  warning: { bar: 'bg-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', text: 'text-yellow-300', icon: '⚠' },
  success: { bar: 'bg-emerald-500',bg: 'bg-emerald-500/10 border-emerald-500/30',text: 'text-emerald-300',icon: '✓' },
  info:    { bar: 'bg-blue-400',   bg: 'bg-blue-400/10 border-blue-400/30',   text: 'text-blue-300',   icon: 'ℹ' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2.5 w-[340px] pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const s = SEVERITY_STYLE[t.severity]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{   opacity: 0, y: 8,   scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={() => removeToast(t.id)}
              className={`relative overflow-hidden rounded-xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] cursor-pointer pointer-events-auto ${s.bg}`}
            >
              {/* Severity accent bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${s.bar}`} />

              <div className="flex items-start gap-2.5 px-4 py-3 pl-5">
                {/* Icon */}
                <span className={`mt-px text-[13px] font-bold flex-none ${s.text}`}>
                  {s.icon}
                </span>

                {/* Message */}
                <span className={`text-[12.5px] leading-snug flex-1 ${s.text}`}>
                  {t.message}
                </span>

                {/* Dismiss hint */}
                <span className="text-[10px] text-[var(--text-faint)] mt-0.5 flex-none opacity-60">
                  ✕
                </span>
              </div>

              {/* Progress bar (auto-dismiss timer) */}
              <motion.div
                className={`absolute bottom-0 left-0 h-[2px] ${s.bar} opacity-40`}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: t.duration / 1000, ease: 'linear' }}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
