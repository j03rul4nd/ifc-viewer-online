// ─── useReplayRecorder ────────────────────────────────────────────────────────
// The drawing being redrawn stroke by stroke, as a video file.

import { useCallback } from 'react'
import { activePage } from '../../lib/sketch/document'
import { useSketchStore } from '../../stores/sketchStore'
import { downloadBlob } from './actions'

export function useReplayRecorder(tx: (key: string) => string): (deliver?: (video: Blob) => void) => Promise<void> {
  return useCallback(async (deliver) => {
    const s = useSketchStore.getState()
    const { engine } = s
    if (!engine || s.recording) return
    const canvas = engine.canvas
    const mime = typeof MediaRecorder === 'undefined' ? undefined : ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported?.(m))
    if (!mime || !canvas.captureStream) { s.flash(tx('export.noVideo')); return }
    s.set({ recording: true })
    const stream = canvas.captureStream(30)
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, { mimeType: mime })
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
    try {
      engine.setGuides(false)
      engine.reveal(0)
      engine.renderNow()
      recorder.start()
      const total = activePage(s.history.present).layers.reduce((n, l) => n + l.strokes.length, 0)
      const started = performance.now()
      const duration = Math.max(2500, Math.min(12000, total * 90))
      await new Promise<void>((resolve) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - started) / duration)
          engine.reveal(Math.ceil(k * total))
          engine.renderNow()
          if (k < 1) requestAnimationFrame(step)
          else window.setTimeout(resolve, 900)
        }
        requestAnimationFrame(step)
      })
      recorder.stop()
      await stopped
      const video = new Blob(chunks, { type: mime })
      if (deliver) deliver(video)
      else downloadBlob(video, `sketch-replay.${mime.includes('mp4') ? 'mp4' : 'webm'}`)
    } finally {
      stream.getTracks().forEach((track) => track.stop())
      engine.reveal(null)
      engine.setGuides(true)
      s.set({ recording: false })
    }
  }, [tx])
}
