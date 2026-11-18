// ─── Inline confirm focus ─────────────────────────────────────────────────────
// "Cancel all" and "Clear cache" ask inline: the trigger is replaced by the
// question and Yes / No. Replacing the focused button drops keyboard focus to
// <body> — the next Tab starts at the top of the page, and a screen reader
// hears nothing. This hook moves focus to the answer when the question
// appears, and back when it goes: to wherever the closing action said
// (`returnTo`), else to `fallback` — the confirm can also close by itself
// (the last load finished while it was open), and then its trigger is gone.
//
// Focus is only handed back while it is still ours to give: on <body> (the
// answer just unmounted) or inside `scope`. A user who has moved on — clicked
// a row, tabbed elsewhere — is left where they are.

import { useCallback, useEffect, useRef, type RefObject } from 'react'

export interface ConfirmFocusRefs {
  /** The button that takes focus when the question appears (usually "No"). */
  answer: RefObject<HTMLElement | null>
  /** The element holding trigger + question; focus inside it is "ours". */
  scope: RefObject<HTMLElement | null>
  /** Where focus goes when the closing action named nothing that still exists. */
  fallback: () => HTMLElement | null
}

/** Returns `returnTo(target)`: call it just before closing the question. */
export function useConfirmFocus(open: boolean, refs: ConfirmFocusRefs): (target: () => HTMLElement | null) => void {
  const wasOpen = useRef(false)
  const next = useRef<(() => HTMLElement | null) | null>(null)
  const latest = useRef(refs)
  latest.current = refs

  useEffect(() => {
    const { answer, scope, fallback } = latest.current
    if (open) {
      wasOpen.current = true
      answer.current?.focus({ preventScroll: true })
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    const pick = next.current
    next.current = null
    const active = typeof document !== 'undefined' ? document.activeElement : null
    const ours = !active || active === document.body || (scope.current != null && scope.current.contains(active))
    if (!ours) return
    const named = pick?.() ?? null
    const target = named && named.isConnected ? named : fallback()
    target?.focus({ preventScroll: true })
  }, [open])

  return useCallback((target: () => HTMLElement | null) => { next.current = target }, [])
}
