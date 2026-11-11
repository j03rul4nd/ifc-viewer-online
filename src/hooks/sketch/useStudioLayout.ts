// ─── useStudioLayout ──────────────────────────────────────────────────────────
// The studio's own box, folded with whatever hinge the browser reports. Half
// open like a laptop (Z Flip's Flex mode, Fold on a table), the drawing takes the
// flat lower half, where the hand rests, and the references stand up behind it.

import { useEffect, useState, type RefObject } from 'react'
import { resolveStudioLayout, type StudioLayout } from '../../lib/sketch/layout'
import { readSegments, resolveDualLayout, type DualLayout } from '../../lib/ui/display-segments'

export interface StudioGeometry { width: number; height: number; layout: StudioLayout; hardware: DualLayout | null }

function measure(root: HTMLElement | null, drawingOnRight: boolean): StudioGeometry {
  const width = root?.clientWidth || 390
  const height = root?.clientHeight || 700
  const segments = readSegments(window as unknown as Parameters<typeof readSegments>[0])
  const stacked = segments.length === 2 && segments[0].y !== segments[1].y
  const hardware = resolveDualLayout({ segments, viewportWidth: width, viewportHeight: height, pref: 'auto', coarsePointer: false, swap: stacked || drawingOnRight })
  return { width, height, hardware, layout: resolveStudioLayout(width, height, hardware) }
}

export function useStudioLayout(rootRef: RefObject<HTMLElement>, drawingOnRight: boolean): StudioGeometry {
  const [geo, setGeo] = useState<StudioGeometry>(() => measure(null, drawingOnRight))
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const update = () => setGeo(measure(root, drawingOnRight))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    // A fold can change the segments without changing the size.
    const queries = ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)'].map((q) => window.matchMedia(q))
    queries.forEach((m) => m.addEventListener?.('change', update))
    return () => {
      observer.disconnect()
      queries.forEach((m) => m.removeEventListener?.('change', update))
    }
  }, [rootRef, drawingOnRight])
  return geo
}
