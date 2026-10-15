import { useEffect, useState } from 'react'
import { createFileDragTracker, type FileDragState } from '../lib/loading/file-drag'
import { anyModalOpen } from '../lib/ui/modal-stack'

const IDLE: FileDragState = { active: false, count: 0 }

/**
 * Window-level "files are being dragged over the app" state, for the drop
 * overlay. Purely observational: it never calls preventDefault — App's drop
 * handler keeps that job, so drop semantics are unchanged. drop/dragend are
 * read in the capture phase so a drop zone that stops propagation still
 * clears the overlay.
 */
export function useFileDragActive(enabled: boolean): FileDragState {
  const [state, setState] = useState<FileDragState>(IDLE)

  useEffect(() => {
    if (!enabled) { setState(IDLE); return }
    const tracker = createFileDragTracker(setState)
    const onEnter = (e: DragEvent): void => {
      if (anyModalOpen()) return
      tracker.enter(e.dataTransfer)
    }
    const onOver = (e: DragEvent): void => tracker.over(e.dataTransfer)
    const onLeave = (e: DragEvent): void => {
      const leftWindow = e.relatedTarget === null && (
        e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight
      )
      tracker.leave(e.dataTransfer, leftWindow)
    }
    const onDrop = (): void => tracker.drop()
    const onEnd = (): void => tracker.end()
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', onEnd, true)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', onEnd, true)
      tracker.dispose()
      setState(IDLE)
    }
  }, [enabled])

  return state
}
