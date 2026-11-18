// ─── src/hooks/useUploadStateMachine.ts ──────────────────────────────────────
// Explicit state machine — single source of truth for the import dialog.
// All transitions are defined here; nothing derives state from boolean combos.
//
//   idle ⇄ dragging
//     └─ FILES_ADDED ─▶ preparing ──(last ENTRY_PREPARED)──▶ submitting (fast path)
//                          ▲                               ├▶ review ──SUBMIT──▶ submitting
//                          └──── FILES_ADDED (append) ─────├▶ duplicate ─SUBMIT─▶ submitting
//                                                          └▶ error ──FILES_ADDED─▶ preparing
//
// The dialog stopped tracking loads when the loading system landed: there is
// no parsing / building / success state any more, because a submitted file is
// a background job the Loading Center shows. `submitting` is the hand-over —
// the flow hook performs it once and closes.
//
// The per-row decisions (statuses, defaults, what a submit takes) live in
// lib/upload.utils.ts as plain functions; this reducer only sequences them.

import { useReducer } from 'react'
import type { UploadEntry, UploadEvent, UploadState } from '../types/upload.types'
import {
  allPrepared,
  applyDefaultChecks,
  entryStatuses,
  isSelectable,
  planAfterPrepare,
  resolveBatchName,
  selectForSubmit,
} from '../lib/upload.utils'
import { assertNever } from '../lib/invariant'
import { createLogger } from '../lib/logger'

const log = createLogger('UploadSM')

export const INITIAL_UPLOAD_STATE: UploadState = { id: 'idle' }

type SelectionId = 'preparing' | 'review' | 'duplicate'
type Selection = Extract<UploadState, { id: SelectionId }>

function isSelection(state: UploadState): state is Selection {
  return state.id === 'preparing' || state.id === 'review' || state.id === 'duplicate'
}

/** Leave `preparing` once every row is checked: fast path, review, duplicate or error. */
function settle(state: Selection): UploadState {
  if (!allPrepared(state.entries)) return state
  const entries = applyDefaultChecks(state.entries)
  const plan = planAfterPrepare(entries)
  switch (plan) {
    case 'fast': {
      const chosen = selectForSubmit(entries, 'all')
      return {
        id: 'submitting',
        entries: chosen,
        batchName: null,
        createGroup: false,
        origin: chosen[0].origin,
      }
    }
    case 'error':
      return { id: 'error', entries }
    case 'duplicate':
      return { ...state, id: 'duplicate', entries }
    case 'review':
      return { ...state, id: 'review', entries }
    default:
      return assertNever(plan, 'PreparedPlan')
  }
}

// ── Reducer ────────────────────────────────────────────────────────────────────

export function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  switch (event.type) {

    case 'DRAG_ENTER':
      if (state.id === 'idle') return { id: 'dragging' }
      if (isSelection(state) && !state.dragOver) return { ...state, dragOver: true }
      return state

    case 'DRAG_LEAVE':
      if (state.id === 'dragging') return { id: 'idle' }
      if (isSelection(state) && state.dragOver) return { ...state, dragOver: false }
      return state

    case 'FILES_ADDED': {
      if (state.id === 'submitting') return state
      // Append to a live selection; start over from idle or from an all-invalid one.
      const base: UploadEntry[] = isSelection(state) ? state.entries : []
      const known = new Set(base.map((e) => e.file))
      const added = event.entries.filter((e) => !known.has(e.file))
      if (added.length === 0) {
        return isSelection(state) ? { ...state, dragOver: false } : state
      }
      return {
        id: 'preparing',
        entries: [...base, ...added],
        batch: isSelection(state) ? state.batch : { name: null, createGroup: true },
        dragOver: false,
      }
    }

    case 'ENTRY_PREPARED': {
      if (!isSelection(state)) return state
      let hit = false
      const entries = state.entries.map((e) => {
        if (e.key !== event.key || e.check !== null) return e
        hit = true
        return { ...e, check: event.check }
      })
      // A result for a row that is gone (reset, or a de-duplicated add) is dropped.
      if (!hit) return state
      const next = { ...state, entries }
      return state.id === 'preparing' ? settle(next) : next
    }

    case 'TOGGLE': {
      // Also while `preparing`: files appended to a reviewed selection are
      // checked with the list still on screen, and its rows stay usable.
      if (state.id !== 'review' && state.id !== 'preparing') return state
      const statuses = entryStatuses(state.entries)
      if (!isSelectable(statuses.get(event.key))) return state
      return {
        ...state,
        entries: state.entries.map((e) => e.key === event.key ? { ...e, checked: !e.checked } : e),
      }
    }

    case 'SET_BATCH_NAME':
      return isSelection(state) ? { ...state, batch: { ...state.batch, name: event.name } } : state

    case 'SET_CREATE_GROUP':
      return isSelection(state) ? { ...state, batch: { ...state.batch, createGroup: event.value } } : state

    case 'SUBMIT': {
      const allowed =
        (state.id === 'review' && event.scope !== 'duplicate') ||
        (state.id === 'duplicate' && event.scope === 'duplicate')
      if (!allowed || !isSelection(state)) return state
      const chosen = selectForSubmit(state.entries, event.scope)
      if (chosen.length === 0) return state
      return {
        id: 'submitting',
        entries: chosen,
        batchName: resolveBatchName(state.batch, chosen),
        createGroup: chosen.length > 1 && state.batch.createGroup,
        // One submitFiles call carries one origin. A selection that mixes picks
        // and drops reports its first file's; both origins are disk-backed and
        // treated alike by the manager.
        origin: chosen[0].origin,
      }
    }

    case 'RESET':
      return INITIAL_UPLOAD_STATE

    default:
      // TypeScript ensures all UploadEvent variants are handled above.
      // This line fails to compile if a new event type is added without a case.
      return assertNever(event, 'UploadEvent reducer')
  }
}

/** Wraps reducer with dev-only transition logging. */
function loggedReduce(state: UploadState, event: UploadEvent): UploadState {
  const next = uploadReducer(state, event)
  if (import.meta.env.DEV && next.id !== state.id) {
    log.debug(`${state.id} → ${next.id}  (${event.type})`)
  }
  return next
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UploadStateMachine {
  state:     UploadState
  dispatch:  (event: UploadEvent) => void
  /** The dialog may be dismissed (everything except the hand-over itself). */
  canClose:  boolean
  /** Work is running that the user is waiting on (drives the top activity bar). */
  isActive:  boolean
}

export function useUploadStateMachine(): UploadStateMachine {
  const [state, dispatch] = useReducer(loggedReduce, INITIAL_UPLOAD_STATE)
  const canClose = state.id !== 'submitting'
  const isActive = state.id === 'preparing'
  return { state, dispatch, canClose, isActive }
}
