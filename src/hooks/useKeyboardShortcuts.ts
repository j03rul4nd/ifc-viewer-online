import { useEffect, useRef } from 'react'

type ShortcutHandler = (e: KeyboardEvent) => void

export interface Shortcut {
  /** e.g. 'z', 'y', 'Escape' */
  key:      string
  ctrl?:    boolean
  shift?:   boolean
  alt?:     boolean
  /** Skip when focus is inside an input / textarea / contenteditable */
  skipInEditable?: boolean
  handler:  () => void
}

/**
 * Register global keyboard shortcuts.
 * Accepts a factory function so shortcuts can reference the latest state
 * without needing to re-register the listener on every render.
 */
export function useKeyboardShortcuts(getShortcuts: () => Shortcut[]): void {
  // Keep a ref to the latest shortcut list — avoids stale closure issues
  // without re-attaching the window listener on every render.
  const getShortcutsRef = useRef(getShortcuts)
  getShortcutsRef.current = getShortcuts

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const shortcuts = getShortcutsRef.current()
      for (const s of shortcuts) {
        const keyMatch   = e.key.toLowerCase() === s.key.toLowerCase()
        const ctrlMatch  = (s.ctrl  ?? false) === (e.ctrlKey || e.metaKey)
        const shiftMatch = (s.shift ?? false) === e.shiftKey
        const altMatch   = (s.alt   ?? false) === e.altKey

        if (!keyMatch || !ctrlMatch || !shiftMatch || !altMatch) continue

        if (s.skipInEditable !== false) {
          // Default: skip when focus is inside an editable element
          const target = e.target as HTMLElement
          if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
          ) continue
        }

        e.preventDefault()
        s.handler()
        break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, []) // empty deps — listener is registered once, reads fresh shortcuts via ref
}
