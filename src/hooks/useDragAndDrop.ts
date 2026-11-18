// ─── src/hooks/useDragAndDrop.ts ─────────────────────────────────────────────
// Counter-based drag tracking so nested child elements don't fire false
// DRAG_LEAVE events when the cursor moves over them.
//
// Every file of a drop is passed on (a federated project arrives as several
// IFCs at once). Drags that carry no files — the scene tree's own row DnD, a
// text selection — are ignored, so the dialog never lights up for them.
//
// The drop is stopped here: App listens for drops on `window` to route files
// dropped over the viewer, and a drop the dialog already handled must not be
// handled a second time behind it.

import { useCallback, useRef } from 'react'
import type { UploadEvent } from '../types/upload.types'
import { hasFilePayload } from '../lib/loading/drop-routing'

type Dispatch = (event: UploadEvent) => void

export interface DragHandlers {
  onDragOver:  (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop:      (e: React.DragEvent) => void
}

export function useDragAndDrop(
  dispatch: Dispatch,
  onFiles:  (files: File[]) => void,
  disabled: boolean,
): DragHandlers {
  const enterCount = useRef(0)

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
  }, [disabled])

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    if (disabled) return
    enterCount.current += 1
    if (enterCount.current === 1) dispatch({ type: 'DRAG_ENTER' })
  }, [dispatch, disabled])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    if (disabled) return
    enterCount.current = Math.max(0, enterCount.current - 1)
    if (enterCount.current === 0) dispatch({ type: 'DRAG_LEAVE' })
  }, [dispatch, disabled])

  const onDrop = useCallback((e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    enterCount.current = 0
    dispatch({ type: 'DRAG_LEAVE' })
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }, [dispatch, disabled, onFiles])

  return { onDragOver, onDragEnter, onDragLeave, onDrop }
}
