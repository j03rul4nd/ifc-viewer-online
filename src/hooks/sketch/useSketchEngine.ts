// ─── useSketchEngine ──────────────────────────────────────────────────────────
// Owns the renderer's life and keeps it in step with the store. Follows the page
// through a store subscription, so React renders nothing for this.

import { useEffect, type RefObject } from 'react'
import { activePage } from '../../lib/sketch/document'
import { SketchRenderer } from '../../lib/sketch/renderer'
import { useSketchStore } from '../../stores/sketchStore'

export function useSketchEngine(canvasRef: RefObject<HTMLCanvasElement>, boxRef: RefObject<HTMLElement>, onFailed: () => void): void {
  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    const store = useSketchStore
    let engine: SketchRenderer
    try {
      engine = new SketchRenderer(canvas, store.getState().plane)
    } catch {
      onFailed()
      return
    }
    // A phone drops the GPU under pressure or when the app goes to the background.
    // The document is untouched: everything is rebuilt from it when it returns.
    engine.onContextLost = () => store.getState().set({ gpuLost: true })
    engine.onContextRestored = () => store.getState().set({ gpuLost: false })
    engine.setOrbit(store.getState().orbit)
    store.getState().set({ engine })

    const syncPage = () => {
      const { history, images } = store.getState()
      const page = activePage(history.present)
      engine.syncLayers(page.layers)
      engine.setBackground(history.present.paper, history.present.background)
      const bg = history.present.background?.imageId ?? null
      void engine.setBackgroundImage(bg, images.find((i) => i.id === bg)?.blob)
      void engine.syncPlaced(page.placed, (id) => images.find((i) => i.id === id)?.blob)
      // Undo or a page change can take selected strokes away.
      const ids = new Set(store.getState().selection)
      engine.setSelection(ids.size ? page.layers.flatMap((l) => l.strokes).filter((s) => ids.has(s.id)) : [])
    }
    syncPage()
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.history.present !== prev.history.present || s.images !== prev.images) syncPage()
    })

    // A fold, a Split View or a rotation arrives as a new size, nothing more.
    const resize = () => {
      engine.resize(box.clientWidth, box.clientHeight)
      engine.renderNow()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(box)

    return () => {
      observer.disconnect()
      unsubscribe()
      store.getState().set({ engine: null })
      engine.dispose()
    }
  }, [boxRef, canvasRef, onFailed])
}
