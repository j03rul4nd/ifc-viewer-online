import { create } from 'zustand'
import type { EditDiff, EditorCommand } from '../types'

interface EditorStore {
  diffs: EditDiff[]
  history: EditorCommand[]
  historyIndex: number   // points to last applied command; -1 = empty
  selection: number[]   // expressIds

  addCommand: (cmd: EditorCommand) => void
  undo: () => void
  redo: () => void
  clearHistory: () => void
  setSelection: (expressIds: number[]) => void

  canUndo: boolean
  canRedo: boolean
}

function flattenDiffs(history: EditorCommand[], upTo: number): EditDiff[] {
  return history.slice(0, upTo + 1).flatMap((c) => c.diffs)
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  diffs: [],
  history: [],
  historyIndex: -1,
  selection: [],
  canUndo: false,
  canRedo: false,

  addCommand: (cmd) =>
    set((s) => {
      // Discard any redo history beyond current index
      const truncated = s.history.slice(0, s.historyIndex + 1)
      const history = [...truncated, cmd]
      const historyIndex = history.length - 1
      return {
        history,
        historyIndex,
        diffs: flattenDiffs(history, historyIndex),
        canUndo: historyIndex >= 0,
        canRedo: false,
      }
    }),

  undo: () =>
    set((s) => {
      if (s.historyIndex < 0) return s
      const historyIndex = s.historyIndex - 1
      return {
        historyIndex,
        diffs: historyIndex < 0 ? [] : flattenDiffs(s.history, historyIndex),
        canUndo: historyIndex >= 0,
        canRedo: true,
      }
    }),

  redo: () =>
    set((s) => {
      if (s.historyIndex >= s.history.length - 1) return s
      const historyIndex = s.historyIndex + 1
      return {
        historyIndex,
        diffs: flattenDiffs(s.history, historyIndex),
        canUndo: true,
        canRedo: historyIndex < s.history.length - 1,
      }
    }),

  clearHistory: () =>
    set({ diffs: [], history: [], historyIndex: -1, canUndo: false, canRedo: false }),

  setSelection: (expressIds) => set({ selection: expressIds }),
}))
