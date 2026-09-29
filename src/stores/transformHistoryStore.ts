// ─── Transform history store ──────────────────────────────────────────────────
// Undo / redo for scene placement (IFC pivots + point-cloud offsets), and the
// "temporary look" mode.
//
// A snapshot is the placement of EVERY member, not a diff: a group move touches
// a dozen things, and restoring the before-state wholesale is the only undo
// that cannot drift out of step with what was applied.
//
// Temporary mode: the user wants to shove a building aside to look behind it,
// not to recalibrate it. Entering the mode remembers the placement; leaving it
// either restores that placement ("Restore") or keeps the moves ("Keep"). The
// history keeps working inside the mode.
//
// Session-only on purpose. Placement itself persists where it always did; the
// undo stack of a previous visit is not something anyone expects back.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ModelTransform } from '../types'
import type { AlignmentOffset } from '../lib/pointcloud/pc-types'

export interface PlacementSnapshot {
  models: Record<string, ModelTransform>
  clouds: Record<string, AlignmentOffset>
  label?: string
}

const MAX_DEPTH = 50

interface TransformHistoryStore {
  past: PlacementSnapshot[]
  future: PlacementSnapshot[]
  /** Placement to return to when temporary mode ends with "Restore". */
  tempBase: PlacementSnapshot | null

  /** Record the state BEFORE a change. Clears redo. */
  record: (before: PlacementSnapshot) => void
  /** Pop an undo step; `current` becomes the redo step. Returns what to apply. */
  undo: (current: PlacementSnapshot) => PlacementSnapshot | null
  redo: (current: PlacementSnapshot) => PlacementSnapshot | null
  beginTemporary: (current: PlacementSnapshot) => void
  /** End temporary mode; returns the snapshot to restore, or null to keep. */
  endTemporary: (restore: boolean) => PlacementSnapshot | null
  clearHistory: () => void
}

export const useTransformHistoryStore = create<TransformHistoryStore>()(
  devtools(
    (set, get) => ({
      past: [],
      future: [],
      tempBase: null,

      record: (before) => set((s) => ({
        past: [...s.past, before].slice(-MAX_DEPTH),
        future: [],
      }), false, 'record'),

      undo: (current) => {
        const { past, future } = get()
        const prev = past[past.length - 1]
        if (!prev) return null
        set({ past: past.slice(0, -1), future: [current, ...future].slice(0, MAX_DEPTH) }, false, 'undo')
        return prev
      },

      redo: (current) => {
        const { past, future } = get()
        const next = future[0]
        if (!next) return null
        set({ past: [...past, current].slice(-MAX_DEPTH), future: future.slice(1) }, false, 'redo')
        return next
      },

      beginTemporary: (current) => set({ tempBase: current }, false, 'beginTemporary'),

      endTemporary: (restore) => {
        const base = get().tempBase
        set({ tempBase: null }, false, 'endTemporary')
        return restore ? base : null
      },

      clearHistory: () => set({ past: [], future: [], tempBase: null }, false, 'clearHistory'),
    }),
    { name: 'TransformHistoryStore', enabled: import.meta.env.DEV },
  ),
)
