import { useEffect, useCallback } from 'react'
import { useEditorStore } from '../stores/editorStore'
import type { EditorCommand } from '../types'

export interface UseEditorHistoryResult {
  undo: () => void
  redo: () => void
  addCommand: (cmd: EditorCommand) => void
  history: EditorCommand[]
  canUndo: boolean
  canRedo: boolean
  pendingCount: number
}

/**
 * Key events one of the hook's listeners has already acted on. Several
 * components mount this hook at once (App, Toolbar, Sidebar, ModelTree, the
 * validation panel), each with its own window listener — without this, one
 * Ctrl+Z undid one step per mounted copy. `defaultPrevented` cannot stand in
 * for it: other handlers may prevent the default on Ctrl+Z for their own reasons.
 */
const handled = new WeakSet<KeyboardEvent>()

export function useEditorHistory(): UseEditorHistoryResult {
  const { undo, redo, addCommand, history, canUndo, canRedo, diffs } = useEditorStore()

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (handled.has(e)) return
      handled.add(e)

      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      // Don't hijack native undo/redo when focus is inside an editable element
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return

      // Read the store now, not the values captured at render: a listener
      // registered before the last change would otherwise act on stale state.
      const state = useEditorStore.getState()
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (state.canUndo) state.undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        if (state.canRedo) state.redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return {
    undo:         useCallback(undo, [undo]),
    redo:         useCallback(redo, [redo]),
    addCommand:   useCallback(addCommand, [addCommand]),
    history,
    canUndo,
    canRedo,
    pendingCount: diffs.length,
  }
}
