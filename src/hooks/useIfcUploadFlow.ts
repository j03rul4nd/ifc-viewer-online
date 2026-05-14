// ─── src/hooks/useIfcUploadFlow.ts ───────────────────────────────────────────
// Orchestrator. Connects the state machine with:
//   - the validation pipeline
//   - the drag-and-drop handlers
//   - the parent App.tsx props (isLoading, loadProgress, loadError, loadDone)
//
// This is the ONLY hook UploadOverlay.tsx calls.

import { useCallback, useEffect, useRef } from 'react'
import { useUploadStateMachine }  from './useUploadStateMachine'
import { useIfcValidation }       from './useIfcValidation'
import { useDragAndDrop }         from './useDragAndDrop'
import type { UploadOverlayProps } from '../types/upload.types'
import { makeError }              from '../lib/upload.utils'

type FlowInput = Pick<
  UploadOverlayProps,
  'onClose' | 'onLoad' | 'isLoading' | 'loadProgress' | 'loadError' | 'loadDone' | 'onCancel'
>

export function useIfcUploadFlow({
  onClose,
  onLoad,
  isLoading,
  loadProgress,
  loadError,
  loadDone,
  onCancel,
}: FlowInput) {
  const { state, dispatch, canClose, canCancel, isActive } = useUploadStateMachine()
  const { validate } = useIfcValidation(dispatch)

  const startTimeRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── When queued → trigger parent loader ──────────────────────────────────
  useEffect(() => {
    if (state.id === 'queued') {
      startTimeRef.current = Date.now()
      onLoad(state.file)
      dispatch({ type: 'PARSE_START' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.id])

  // ── Forward parent isLoading / loadProgress ───────────────────────────────
  // App.tsx drives progress via the existing `progress.percent` from useIfcLoader.
  useEffect(() => {
    if (!isLoading) return
    if (state.id === 'parsing') {
      if (loadProgress >= 95) {
        dispatch({ type: 'SCENE_BUILD_START' })
      } else {
        dispatch({ type: 'PARSE_PROGRESS', progress: loadProgress })
      }
    } else if (state.id === 'building-scene') {
      dispatch({ type: 'SCENE_PROGRESS', progress: loadProgress })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, loadProgress])

  // ── Forward parent loadDone (optional prop) ───────────────────────────────
  useEffect(() => {
    if (!loadDone) return
    if (state.id === 'parsing' || state.id === 'building-scene') {
      const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0
      dispatch({ type: 'SUCCESS', durationMs })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDone])

  // ── Fallback: parent signals done via isLoading flipping to false ─────────
  // Keeps backward-compat with App.tsx which doesn't pass loadDone yet.
  const prevIsLoadingRef = useRef(isLoading)
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current
    prevIsLoadingRef.current = isLoading

    if (wasLoading && !isLoading && !loadError) {
      if (state.id === 'parsing' || state.id === 'building-scene') {
        const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0
        dispatch({ type: 'SUCCESS', durationMs })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  // ── Forward parent loadError ──────────────────────────────────────────────
  const prevLoadErrorRef = useRef(loadError)
  useEffect(() => {
    if (loadError === prevLoadErrorRef.current) return
    prevLoadErrorRef.current = loadError
    if (!loadError) return
    if (
      state.id === 'queued'         ||
      state.id === 'parsing'        ||
      state.id === 'building-scene'
    ) {
      dispatch({
        type: 'ERROR',
        error: makeError('PARSE_FAILED', loadError, /* retryable */ true),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError])

  // ── File pick ──────────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    resetInput()
    void validate(file)
  }, [validate])

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const dragDisabled = isActive || state.id === 'success'
  const dragHandlers = useDragAndDrop(dispatch, handleFile, dragDisabled)

  // ── Close (guarded) ───────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (!canClose) return
    dispatch({ type: 'RESET' })
    onClose()
  }, [canClose, dispatch, onClose])

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (!canCancel) return
    dispatch({ type: 'CANCEL' })
    onCancel?.()
  }, [canCancel, dispatch, onCancel])

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    dispatch({ type: 'RETRY' })
    resetInput()
  }, [dispatch])

  // ── Input change ──────────────────────────────────────────────────────────
  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }, [handleFile])

  return {
    state,
    fileInputRef,
    canClose,
    canCancel,
    isActive,
    dragHandlers,
    handleClose,
    handleCancel,
    handleRetry,
    onFileInputChange,
    openFilePicker: () => fileInputRef.current?.click(),
  }
}