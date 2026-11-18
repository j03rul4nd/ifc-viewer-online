// ─── Toast notification container ─────────────────────────────────────────────
// Renders ephemeral notification toasts.
// Desktop: bottom-right corner, fixed 340px wide.
// Mobile:  bottom-center, full-width with horizontal padding.
//
// A toast is heard as well as seen — for a skipped duplicate it is the only
// feedback there is. What is read out goes through two screen-reader-only
// regions (polite, and assertive for errors) holding just the new messages,
// plus a word that an option waits in the notification: a live stack would
// re-read the buttons ("Close") with every toast, and an alert nested in it is
// announced twice by some readers. A toast's countdown pauses while the
// pointer is over it or focus is inside it; one with an action closes only
// from its ✕ — a slightly missed tap on the action must not throw the action
// away — and a toast that leaves while focus is in it, however it leaves,
// hands focus back to where the user came from.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useToastStore, runToastAction, pauseToast, resumeToast, type Toast } from '../stores/toastStore'

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

// The countdown bar is a CSS animation, not a framer one: it has to freeze
// with the timer (animation-play-state).
const TIMER_KEYFRAMES = '@keyframes toast-countdown { from { transform: scaleX(1) } to { transform: scaleX(0) } }'

/** How long an announcement stays in its region: long enough to be read, not left for browse mode to find later. */
const ANNOUNCEMENT_MS = 7000

// ── Component ─────────────────────────────────────────────────────────────────

function ToastItem({ t, closeLabel, onClose }: { t: Toast; closeLabel: string; onClose: () => void }) {
  const s = SEVERITY_STYLE[t.severity]
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  // Where focus was before it came into this toast: where it goes back when
  // the toast closes under it, instead of falling to <body>.
  const returnTo = useRef<HTMLElement | null>(null)
  const card = useRef<HTMLDivElement>(null)
  // False from the moment the toast leaves the store — by its buttons, by a
  // newer toast replacing it, by a reset — while it still animates out.
  const present = useIsPresent()

  useEffect(() => {
    if (!paused) return
    pauseToast(t.id)
    return () => resumeToast(t.id)
  }, [paused, t.id])

  useEffect(() => {
    if (present || !card.current?.contains(document.activeElement)) return
    const target = returnTo.current
    if (target && target.isConnected && typeof target.focus === 'function') target.focus()
  }, [present])

  return (
    <motion.div
      ref={card}
      layout
      initial={{ opacity: 0, y: 18, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{   opacity: 0, y: 8,   scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={t.actionLabel ? undefined : onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => {
        // Only a real origin: coming back from another window focuses the
        // same element again with no relatedTarget, and must not forget it.
        const from = e.relatedTarget as HTMLElement | null
        if (from && !e.currentTarget.contains(from)) returnTo.current = from
        setFocused(true)
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      className={`relative overflow-hidden rounded-xl border -webkit-backdrop-filter backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] pointer-events-auto ${t.actionLabel ? '' : 'cursor-pointer'} ${s.bg}`}
      style={{ WebkitBackdropFilter: 'blur(20px)' }}
    >
      {/* Severity accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${s.bar}`} />

      <div className="flex items-start gap-2.5 px-4 py-3 pl-5">
        {/* Icon */}
        <span aria-hidden="true" className={`mt-px text-[13px] font-bold flex-none ${s.text}`}>
          {s.icon}
        </span>

        {/* Message, and its one action when it has one. min-w-0 + wrapping
            anywhere: a file name without spaces must not push the ✕ out. */}
        <span className={`text-[12.5px] leading-snug flex-1 min-w-0 [overflow-wrap:anywhere] ${s.text}`}>
          {t.message}
          {t.actionLabel && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runToastAction(t.id) }}
              className="block mt-1 -ml-1.5 min-h-[28px] px-1.5 rounded-md text-left text-[11.5px] font-semibold underline underline-offset-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
            >
              {t.actionLabel}
            </button>
          )}
        </span>

        {/* Close */}
        <button
          type="button"
          aria-label={closeLabel}
          title={closeLabel}
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className={`-mr-2 -mt-1.5 flex-none w-7 h-7 grid place-items-center rounded-md text-[11px] opacity-75 hover:opacity-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current ${s.text}`}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* Countdown bar (auto-dismiss timer); freezes while the toast is paused.
          A toast that stays until closed has none. */}
      {t.duration > 0 && (
        <div
          aria-hidden="true"
          className={`absolute bottom-0 left-0 right-0 h-[2px] origin-left ${s.bar} opacity-40`}
          style={{
            animation: `toast-countdown ${t.duration}ms linear forwards`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      )}
    </motion.div>
  )
}

/**
 * What the screen-reader regions say: the toasts added since the last render
 * (all of them, in order), each with a word about its option when it has one.
 * Only additions are read — a toast leaving says nothing — the same message
 * twice is read twice (a no-break space toggles, so the text changes), and a
 * region empties again after a while rather than keeping old news around.
 */
function useAnnouncements(toasts: Toast[], optionText: (label: string) => string): { polite: string; assertive: string } {
  const [spoken, setSpoken] = useState({ polite: '', assertive: '' })
  const seen = useRef(new Set<string>())
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const polite: string[] = []
    const assertive: string[] = []
    const current = new Set(toasts.map((t) => t.id))
    for (const t of toasts) {
      if (seen.current.has(t.id)) continue
      seen.current.add(t.id)
      const text = t.actionLabel ? `${t.message}. ${optionText(t.actionLabel)}` : t.message
      ;(t.severity === 'error' ? assertive : polite).push(text)
    }
    for (const id of seen.current) if (!current.has(id)) seen.current.delete(id)
    if (polite.length === 0 && assertive.length === 0) return
    const next = (prev: string, parts: string[]): string => {
      if (parts.length === 0) return prev
      const text = parts.join(' ')
      return prev === text ? `${text}\u00a0` : text
    }
    setSpoken((prev) => ({ polite: next(prev.polite, polite), assertive: next(prev.assertive, assertive) }))
    if (clearTimer.current !== null) clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => {
      clearTimer.current = null
      setSpoken({ polite: '', assertive: '' })
    }, ANNOUNCEMENT_MS)
  }, [toasts, optionText])
  useEffect(() => () => { if (clearTimer.current !== null) clearTimeout(clearTimer.current) }, [])
  return spoken
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  const { t: tc } = useTranslation('common')
  const closeLabel = tc('actions.close')
  const optionText = useCallback((label: string) => tc('actions.optionAvailable', { label }), [tc])
  const spoken = useAnnouncements(toasts, optionText)

  return (
    <>
      <style>{TIMER_KEYFRAMES}</style>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-toast-announcer="polite">{spoken.polite}</div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true" data-toast-announcer="assertive">{spoken.assertive}</div>
      {/* Desktop: bottom-right, fixed width.
          Mobile: bottom-center, full-width minus safe horizontal insets. */}
      <div
        className="fixed z-[300] flex flex-col gap-2.5 pointer-events-none
                   bottom-5 right-5 w-[340px]
                   xs:bottom-5 xs:right-5 xs:w-[340px]
                   max-xs:bottom-0 max-xs:right-0 max-xs:left-0 max-xs:w-auto max-xs:px-3"
        style={{
          // On very small screens, respect safe area at bottom
          paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
        }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} t={t} closeLabel={closeLabel} onClose={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}
