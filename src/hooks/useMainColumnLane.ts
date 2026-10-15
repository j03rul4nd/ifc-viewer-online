// Publishes the main column's lane geometry without re-rendering App.
//
// `--lane-drawer-h` is how far below the viewer the column continues — the
// height of whatever drawer sits under it. Content panels subtract it from
// their bottom anchor to run over the drawer (ViewportPanel, lib/ui/lane.ts).
// The column width goes to useLaneStore, which decides whether a panel may
// extend at all.
//
// It cannot loop: the variable only moves absolutely positioned panels, and the
// drawer's width reservation is padding, which changes no height.
import { useCallback, useRef } from 'react'
import { useLaneStore } from '../stores/laneStore'

export function useMainColumnLaneRef(): (el: HTMLDivElement | null) => void {
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((column: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!column) return

    const viewer = Array.from(column.children).find(
      (c): c is HTMLElement => c.hasAttribute('data-viewer-area'),
    )
    const sync = () => {
      const drawerH = viewer ? Math.max(0, column.clientHeight - viewer.offsetHeight) : 0
      column.style.setProperty('--lane-drawer-h', `${drawerH}px`)
      useLaneStore.getState().setColumnWidth(column.clientWidth)
    }
    sync()

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync)
      ro.observe(column)
      if (viewer) ro.observe(viewer)
    }

    cleanupRef.current = () => {
      ro?.disconnect()
      column.style.removeProperty('--lane-drawer-h')
      useLaneStore.getState().setColumnWidth(0)
    }
  }, [])
}
