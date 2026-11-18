// ─── Undo / redo for the studio document ───────────────────────────────────────
// Every edit to the cover (template, colours, text, shots, framing) goes
// through `update`. Consecutive edits that share a `coalesce` key within a
// second — typing a title, dragging a slider — fold into one undo step, so
// Ctrl+Z takes back the whole word, not the last letter.

import { useCallback, useRef, useState } from 'react'

const LIMIT = 60
const COALESCE_MS = 1000

interface State<T> { past: T[]; present: T; future: T[] }

export interface History<T> {
  doc: T
  update: (next: T | ((d: T) => T), coalesce?: string) => void
  /** Change the document without an undo step (the automatic first capture). */
  silently: (next: (d: T) => T) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useHistory<T>(initial: () => T): History<T> {
  const [state, setState] = useState<State<T>>(() => ({ past: [], present: initial(), future: [] }))
  const last = useRef<{ key: string; at: number } | null>(null)

  const update = useCallback((next: T | ((d: T) => T), coalesce?: string) => {
    // Decide merging out here: the updater must stay pure (StrictMode runs it twice).
    const now = Date.now()
    const merge = !!coalesce && last.current?.key === coalesce && now - last.current.at < COALESCE_MS
    last.current = coalesce ? { key: coalesce, at: now } : null
    setState((s) => {
      const value = typeof next === 'function' ? (next as (d: T) => T)(s.present) : next
      if (Object.is(value, s.present)) return s
      if (merge) return { past: s.past, present: value, future: [] }
      return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] }
    })
  }, [])

  const silently = useCallback((next: (d: T) => T) => {
    setState((s) => ({ ...s, present: next(s.present) }))
  }, [])

  const undo = useCallback(() => {
    last.current = null
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s))
  }, [])

  const redo = useCallback(() => {
    last.current = null
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s))
  }, [])

  return { doc: state.present, update, silently, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }
}
