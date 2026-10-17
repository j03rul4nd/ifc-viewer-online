import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { appBus }   from '../lib/event-bus'
import type { EditDiff, EditorCommand } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

/** An element the user has selected, scoped to its model when that is known. */
export interface SelectionRef {
  expressId: number
  modelId?:  string
}

interface EditorStore {
  diffs:        EditDiff[]
  history:      EditorCommand[]
  /** Index of last applied command; -1 means nothing applied. */
  historyIndex: number
  /**
   * What the tree highlights. A bare expressId is NOT enough once more than one
   * model is loaded — every IFC numbers from #1, so #348 exists in all of them.
   * The modelId is optional because some callers genuinely do not know it (a
   * click in the 3D scene resolves it later); the tree resolves those against
   * the loaded trees rather than highlighting the number everywhere it appears.
   */
  selection:    SelectionRef[]

  canUndo: boolean
  canRedo: boolean

  addCommand:          (cmd: EditorCommand) => void
  /** Undo the last step. Adjacent commands sharing a `batchId` are one step. */
  undo:                () => void
  /** Redo the next step. Adjacent commands sharing a `batchId` are one step. */
  redo:                () => void
  /**
   * Undo the batch `batchId` — only when it is the last thing applied. Returns
   * false (and changes nothing) when a later edit sits on top of it: undoing
   * the batch from under that edit would undo the edit too.
   */
  undoBatch:           (batchId: string) => boolean
  clearHistory:        () => void
  setSelection:        (refs: SelectionRef[]) => void
  /**
   * Drop every pending edit on one element. Diff-level: a command that also
   * edits other elements (a batch rename) keeps their diffs, and only a command
   * left with no diffs disappears. What was undone stays undone.
   */
  discardForElement:   (expressId: number, modelId?: string) => void
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
        // A batch (one command per model) is one step: walk down over every
        // adjacent command that carries the top command's batchId.
        const top = s.history[s.historyIndex]
        let historyIndex = s.historyIndex - 1
        if (top?.batchId) {
          while (historyIndex >= 0 && s.history[historyIndex].batchId === top.batchId) historyIndex--
        }
        const undone = s.history.slice(historyIndex + 1, s.historyIndex + 1).reverse()
        set(
          {
            historyIndex,
            diffs:   historyIndex < 0 ? [] : flattenDiffs(s.history, historyIndex),
            canUndo: historyIndex >= 0,
            canRedo: true,
          },
          false,
          'undo',
        )
        for (const command of undone) appBus.emit('editor:undone', { command })
      },

      redo: () => {
        const s = get()
        if (s.historyIndex >= s.history.length - 1) return
        const next = s.history[s.historyIndex + 1]
        let historyIndex = s.historyIndex + 1
        if (next?.batchId) {
          while (historyIndex + 1 < s.history.length && s.history[historyIndex + 1].batchId === next.batchId) historyIndex++
        }
        const redone = s.history.slice(s.historyIndex + 1, historyIndex + 1)
        set(
          {
            historyIndex,
            diffs:   flattenDiffs(s.history, historyIndex),
            canUndo: true,
            canRedo: historyIndex < s.history.length - 1,
          },
          false,
          'redo',
        )
        for (const command of redone) appBus.emit('editor:redone', { command })
      },

      undoBatch: (batchId) => {
        const s = get()
        const top = s.historyIndex >= 0 ? s.history[s.historyIndex] : undefined
        if (!top || top.batchId !== batchId) return false
        get().undo()
        return true
      },

      clearHistory: () => {
        set(
          { diffs: [], history: [], historyIndex: -1, canUndo: false, canRedo: false },
          false,
          'clearHistory',
        )
        appBus.emit('editor:history-cleared', undefined)
      },

      setSelection: (refs) =>
        set({ selection: refs }, false, 'setSelection'),

      discardForElement: (expressId, modelId) => {
        set((s) => {
          // Drop this element's diffs, not whole commands: a batch rename holds
          // hundreds of elements, and discarding one of them must not discard
          // the rest. Only a command left with no diffs goes.
          const kept: EditorCommand[] = []
          let applied = 0
          s.history.forEach((cmd, i) => {
            const touches = !(modelId && cmd.modelId && cmd.modelId !== modelId)
            const diffs = touches ? cmd.diffs.filter((d) => d.expressId !== expressId) : cmd.diffs
            if (diffs.length === 0) return
            kept.push(diffs.length === cmd.diffs.length ? cmd : { ...cmd, diffs })
            if (i <= s.historyIndex) applied++
          })
          // Commands the user had undone stay undone: the new index counts only
          // the survivors that were applied before.
          const historyIndex = applied - 1
          return {
            history:      kept,
            historyIndex,
            diffs:        historyIndex < 0 ? [] : flattenDiffs(kept, historyIndex),
            canUndo:      historyIndex >= 0,
            canRedo:      historyIndex < kept.length - 1,
          }
        }, false, 'discardForElement')
        appBus.emit('editor:history-cleared', undefined)
      },
    }),
    { name: 'EditorStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectCanUndo    = (s: EditorStore) => s.canUndo
export const selectCanRedo    = (s: EditorStore) => s.canRedo
export const selectDiffCount  = (s: EditorStore) => s.diffs.length
export const selectSelection  = (s: EditorStore) => s.selection

// ── Pending edits for one element ─────────────────────────────────────────────

/** Uncommitted edits on a single element, by field and by property. */
export interface PendingEdits {
  /** RENAME field → new value. */
  renames: Map<string, string>
  /** SET_PROPERTY propExpressId (as string) → new value. */
  properties: Map<string, string>
}

/**
 * What is pending on `expressId` in `modelId`.
 *
 * Walks the HISTORY rather than the flattened `diffs`, because the modelId
 * lives on the command and flattening throws it away — the one thing that says
 * which model an edit belongs to. Reading `diffs` instead is how renaming a
 * storey in one model came out looking like a pending rename on the
 * same-numbered storey in every other loaded model.
 *
 * A command with no modelId (single-model history, or an older session) counts
 * for whoever asks: it cannot be attributed, and dropping it would hide a real
 * pending edit.
 */
export function pendingEditsFor(expressId: number, modelId?: string): PendingEdits {
  const { history, historyIndex } = useEditorStore.getState()
  const renames = new Map<string, string>()
  const properties = new Map<string, string>()
  for (let i = 0; i <= historyIndex; i++) {
    const command = history[i]
    if (!command) continue
    if (modelId && command.modelId && command.modelId !== modelId) continue
    for (const diff of command.diffs) {
      if (diff.type === 'RENAME' && diff.expressId === expressId) {
        renames.set(diff.field, diff.newValue)
      }
      if (diff.type === 'SET_PROPERTY' && diff.expressId === expressId) {
        properties.set(String(diff.propExpressId), diff.newValue)
      }
    }
  }
  return { renames, properties }
}
