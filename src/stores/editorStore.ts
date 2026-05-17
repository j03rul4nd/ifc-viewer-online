import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { appBus }   from '../lib/event-bus'
import type { EditDiff, EditorCommand } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface EditorStore {
  diffs:        EditDiff[]
  history:      EditorCommand[]
  /** Index of last applied command; -1 means nothing applied. */
  historyIndex: number
  selection:    number[]  // expressIds

  canUndo: boolean
  canRedo: boolean

  addCommand:   (cmd: EditorCommand) => void
  undo:         () => void
  redo:         () => void
  clearHistory: () => void
  setSelection: (expressIds: number[]) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function flattenDiffs(history: EditorCommand[], upTo: number): EditDiff[] {
  return history.slice(0, upTo + 1).flatMap((c) => c.diffs)
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorStore>()(
  devtools(
    (set, get) => ({
      diffs:        [],
      history:      [],
      historyIndex: -1,
      selection:    [],
      canUndo:      false,
      canRedo:      false,

      addCommand: (cmd) => {
        set(
          (s) => {
            const truncated    = s.history.slice(0, s.historyIndex + 1)
            const history      = [...truncated, cmd]
            const historyIndex = history.length - 1
            return {
              history,
              historyIndex,
              diffs:   flattenDiffs(history, historyIndex),
              canUndo: historyIndex >= 0,
              canRedo: false,
            }
          },
          false,
          'addCommand',
        )
        appBus.emit('editor:command-applied', { command: cmd })
      },

      undo: () => {
        const s = get()
        if (s.historyIndex < 0) return
        const cmd = s.history[s.historyIndex]
        set(
          (st) => {
            const historyIndex = st.historyIndex - 1
            return {
              historyIndex,
              diffs:   historyIndex < 0 ? [] : flattenDiffs(st.history, historyIndex),
              canUndo: historyIndex >= 0,
              canRedo: true,
            }
          },
          false,
          'undo',
        )
        if (cmd) appBus.emit('editor:undone', { command: cmd })
      },

      redo: () => {
        const s = get()
        if (s.historyIndex >= s.history.length - 1) return
        const cmd = s.history[s.historyIndex + 1]
        set(
          (st) => {
            const historyIndex = st.historyIndex + 1
            return {
              historyIndex,
              diffs:   flattenDiffs(st.history, historyIndex),
              canUndo: true,
              canRedo: historyIndex < st.history.length - 1,
            }
          },
          false,
          'redo',
        )
        if (cmd) appBus.emit('editor:redone', { command: cmd })
      },

      clearHistory: () => {
        set(
          { diffs: [], history: [], historyIndex: -1, canUndo: false, canRedo: false },
          false,
          'clearHistory',
        )
        appBus.emit('editor:history-cleared', undefined)
      },

      setSelection: (expressIds) =>
        set({ selection: expressIds }, false, 'setSelection'),
    }),
    { name: 'EditorStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectCanUndo    = (s: EditorStore) => s.canUndo
export const selectCanRedo    = (s: EditorStore) => s.canRedo
export const selectDiffCount  = (s: EditorStore) => s.diffs.length
export const selectSelection  = (s: EditorStore) => s.selection
