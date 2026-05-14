// ─── src/hooks/useDragAndDrop.ts ─────────────────────────────────────────────
// Counter-based drag tracking so nested child elements don't fire false
// DRAG_LEAVE events when the cursor moves over them.

import { useCallback, useRef } from 'react'
import type { UploadEvent } from '../types/upload.types'

type Dispatch = (event: UploadEvent) => void

export interface DragHandlers {
  onDragOver:  (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop:      (e: React.DragEvent) => void
}

export function useDragAndDrop(
  dispatch: Dispatch,
  onFile:   (file: File) => void,
  disabled: boolean,
): DragHandlers {
  const enterCount = useRef(0)

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
  }, [disabled])

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (disabled) return
    enterCount.current += 1
    if (enterCount.current === 1) dispatch({ type: 'DRAG_ENTER' })
  }, [dispatch, disabled])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (disabled) return
    enterCount.current = Math.max(0, enterCount.current - 1)
    if (enterCount.current === 0) dispatch({ type: 'DRAG_LEAVE' })
  }, [dispatch, disabled])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    enterCount.current = 0
    dispatch({ type: 'DRAG_LEAVE' })
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [dispatch, disabled, onFile])

  return { onDragOver, onDragEnter, onDragLeave, onDrop }
}