// ─── Reading progress bar ──────────────────────────────────────────────────────
// Thin accent-colored bar fixed at the top of the viewport that fills
// proportionally as the user scrolls. Attaches to the nearest scrollable
// ancestor (the blog's `overflow-y-auto` container), not to window —
// because the blog route renders inside an `absolute inset-0 overflow-y-auto`
// div, and window.scroll never fires in that layout.

import { useState, useEffect, useRef } from 'react'

/** Walks up the DOM from `el` and returns the first overflow-scrollable ancestor. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node && node !== document.documentElement) {
    const style = window.getComputedStyle(node)
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

export function useReadingProgress(): number {
  const [progress, setProgress] = useState(0)
  const markerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Give the DOM a frame to paint, then find the scroll container
    const frame = requestAnimationFrame(() => {
      const scrollable = findScrollParent(markerRef.current)
      if (!scrollable) return

      const update = (): void => {
        const total = scrollable.scrollHeight - scrollable.clientHeight
        setProgress(total > 0 ? Math.min((scrollable.scrollTop / total) * 100, 100) : 0)
      }

      scrollable.addEventListener('scroll', update, { passive: true })
      update()

      return () => scrollable.removeEventListener('scroll', update)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return progress
}

export default function ReadingProgress() {
  const progress = useReadingProgress()
  // Invisible 0×0 marker so we can walk up to the scroll container
  const markerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const scrollable = findScrollParent(markerRef.current)
      if (!scrollable) return

      const update = (): void => {
        const total = scrollable.scrollHeight - scrollable.clientHeight
        const pct   = total > 0 ? Math.min((scrollable.scrollTop / total) * 100, 100) : 0
        const bar   = document.getElementById('reading-progress-bar')
        if (bar) bar.style.width = `${pct}%`
      }

      scrollable.addEventListener('scroll', update, { passive: true })
      update()

      return () => scrollable.removeEventListener('scroll', update)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <>
      {/* Invisible anchor — lets us walk up to the scroll container */}
      <div ref={markerRef} style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} />

      {/* Progress bar — fixed to viewport top */}
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 right-0 z-50 h-[2px] pointer-events-none"
        style={{ background: 'var(--surface-2)' }}
      >
        <div
          id="reading-progress-bar"
          className="h-full"
          style={{
            width:      '0%',
            background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%)',
            transition: 'width 80ms linear',
          }}
        />
      </div>
    </>
  )
}
