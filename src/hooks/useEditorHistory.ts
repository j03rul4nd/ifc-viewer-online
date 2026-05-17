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

export function useEditorHistory(): UseEditorHistoryResult {
  const { undo, redo, addCommand, history, canUndo, canRedo, diffs } = useEditorStore()

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      // Don't hijack native undo/redo when focus is inside an editable element
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo) undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        if (canRedo) redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canUndo, canRedo, undo, redo])

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
