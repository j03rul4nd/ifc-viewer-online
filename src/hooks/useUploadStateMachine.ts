// ─── src/hooks/useUploadStateMachine.ts ──────────────────────────────────────
// Explicit state machine — single source of truth for the upload flow.
// All transitions are defined here; nothing derives state from boolean combos.

import { useReducer } from 'react'
import type { UploadState, UploadEvent } from '../types/upload.types'
import { progressToStage } from '../lib/upload.constants'

const INITIAL: UploadState = { id: 'idle' }

function reduce(state: UploadState, event: UploadEvent): UploadState {
  switch (event.type) {

    case 'DRAG_ENTER':
      return state.id === 'idle' ? { id: 'dragging' } : state

    case 'DRAG_LEAVE':
      return state.id === 'dragging' ? { id: 'idle' } : state

    case 'FILE_PICKED':
      if (
        state.id === 'idle'      || state.id === 'dragging' ||
        state.id === 'error'     || state.id === 'cancelled'
      ) return { id: 'validating', file: event.file }
      return state

    case 'VALIDATION_OK':
      return state.id === 'validating'
        ? { id: 'queued', file: event.file }
        : state

    case 'VALIDATION_ERR':
      return state.id === 'validating'
        ? { id: 'error', file: event.file, error: event.error }
        : state

    case 'PARSE_START':
      return state.id === 'queued'
        ? { id: 'parsing', file: state.file, progress: 0, stage: 'wasm-init' }
        : state

    case 'PARSE_PROGRESS':
      return state.id === 'parsing'
        ? { ...state, progress: event.progress, stage: progressToStage(event.progress) }
        : state

    case 'SCENE_BUILD_START':
      return state.id === 'parsing'
        ? { id: 'building-scene', file: state.file, progress: 95 }
        : state

    case 'SCENE_PROGRESS':
      return state.id === 'building-scene'
        ? { ...state, progress: event.progress }
        : state

    case 'SUCCESS':
      if (state.id === 'parsing' || state.id === 'building-scene') {
        return { id: 'success', file: state.file, durationMs: event.durationMs }
      }
      return state

    case 'ERROR': {
      if (state.id === 'idle' || state.id === 'success') return state
      const file = 'file' in state ? state.file : null
      return { id: 'error', file, error: event.error }
    }

    case 'CANCEL': {
      if (
        state.id === 'queued' ||
        state.id === 'parsing' ||
        state.id === 'building-scene'
      ) {
        const file = 'file' in state ? state.file : null
        return { id: 'cancelled', file }
      }
      return state
    }

    case 'RETRY':
    case 'RESET':
      return { id: 'idle' }

    default:
      return state
  }
}

export interface UploadStateMachine {
  state:     UploadState
  dispatch:  (event: UploadEvent) => void
  canClose:  boolean
  canCancel: boolean
  isActive:  boolean
}

export function useUploadStateMachine(): UploadStateMachine {
  const [state, dispatch] = useReducer(reduce, INITIAL)

  const canClose =
    state.id === 'idle'      || state.id === 'dragging' ||
    state.id === 'success'   || state.id === 'error'    ||
    state.id === 'cancelled'

  const canCancel =
    state.id === 'queued'         ||
    state.id === 'parsing'        ||
    state.id === 'building-scene'

  const isActive =
    state.id === 'validating'     ||
    state.id === 'queued'         ||
    state.id === 'parsing'        ||
    state.id === 'building-scene'

  return { state, dispatch, canClose, canCancel, isActive }
}