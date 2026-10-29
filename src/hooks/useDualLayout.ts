// ─── useDualLayout ────────────────────────────────────────────────────────────
// The live dual-screen layout: the segments the browser reports, folded with
// the user's preference by resolveDualLayout. null = the normal app.
//
// Listens to what can change the geometry — resize, the segment media queries
// (they fire on fold/unfold even when the size does not change), orientation
// and device posture — and coalesces them into one read per frame, so a fold
// animation does not re-render the app dozens of times.

import { useEffect, useState } from 'react'
import { canOfferSplit, readSegments, resolveDualLayout, type DualLayout } from '../lib/ui/display-segments'
import { useDualScreenStore } from '../stores/dualScreenStore'

interface Geometry {
  segments: ReturnType<typeof readSegments>
  width: number
  height: number
  coarse: boolean
}

const WATCHED_QUERIES = [
  '(horizontal-viewport-segments: 2)',
  '(vertical-viewport-segments: 2)',
  '(pointer: coarse)',
]

function measure(): Geometry {
  return {
    segments: readSegments(window as unknown as Parameters<typeof readSegments>[0]),
    width: window.innerWidth,
    height: window.innerHeight,
    coarse: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  }
}

function sameGeometry(a: Geometry, b: Geometry): boolean {
  return a.width === b.width && a.height === b.height && a.coarse === b.coarse &&
    JSON.stringify(a.segments) === JSON.stringify(b.segments)
}

export interface DualLayoutState {
  layout: DualLayout | null
  /** The user could turn a split on here (hardware pair, or a wide touch screen). */
  canSplit: boolean
  /** The browser reports two usable segments. */
  hardware: boolean
}

export function useDualLayout(): DualLayoutState {
  const [geo, setGeo] = useState<Geometry | null>(() => (typeof window === 'undefined' ? null : measure()))
  const pref = useDualScreenStore((s) => s.pref)
  const swap = useDualScreenStore((s) => s.swap)

  useEffect(() => {
    let raf = 0
    const schedule = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const next = measure()
        setGeo((prev) => (prev && sameGeometry(prev, next) ? prev : next))
      })
    }
    window.addEventListener('resize', schedule)
    screen.orientation?.addEventListener?.('change', schedule)
    const posture = (navigator as Navigator & { devicePosture?: EventTarget }).devicePosture
    posture?.addEventListener?.('change', schedule)
    const mqls = WATCHED_QUERIES.map((q) => window.matchMedia?.(q)).filter(Boolean) as MediaQueryList[]
    mqls.forEach((m) => m.addEventListener('change', schedule))
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
      screen.orientation?.removeEventListener?.('change', schedule)
      posture?.removeEventListener?.('change', schedule)
      mqls.forEach((m) => m.removeEventListener('change', schedule))
    }
  }, [])

  if (!geo) return { layout: null, canSplit: false, hardware: false }
  return {
    hardware: resolveDualLayout({ segments: geo.segments, viewportWidth: geo.width, viewportHeight: geo.height, pref: 'auto', coarsePointer: geo.coarse, swap })?.source === 'hardware',
    layout: resolveDualLayout({
      segments: geo.segments,
      viewportWidth: geo.width,
      viewportHeight: geo.height,
      pref,
      coarsePointer: geo.coarse,
      swap,
    }),
    canSplit: canOfferSplit({ segments: geo.segments, viewportWidth: geo.width, coarsePointer: geo.coarse }),
  }
}
