// ─── PanelRail ────────────────────────────────────────────────────────────────
// The minimised form of a floating panel. See docs/PANEL_RAIL.md for the study.
//
// Until now a panel was either open or it did not exist. Nine of them lived
// behind two toolbar menus — Vista > Escena, Herramientas > Medir — so nothing
// on screen said the panels existed, nothing said which one was open, switching
// between two of them took four clicks, and there was no way to park one.
//
// This is the pattern VS Code made universal and Onshape, Speckle, Spline and
// Autodesk's viewer all landed on: a permanent rail of icons on the edge, one
// per applicable tool. The panel opens in the lane beside it, and the rail is
// what it collapses back to. Same control both ways — the rule the docked
// columns already follow.
//
// Not draggable, deliberately. Free positioning is what the 3ds Max / Rhino
// generation offered and the reason that generation lost: a panel that can be
// anywhere is in the way somewhere. Content panels already take the whole lane:
// at 1440x900 with the validation drawer open a panel is 788px tall, running
// from the toolbar down over the drawer. There is nowhere better to drag it to.

import React, { useEffect, useRef, useState } from 'react'
import { overflowEdges, overflowMask, type OverflowEdges } from '../lib/ui/panel-rail'

/**
 * One tool, in the form both surfaces read.
 *
 * The desktop rail draws this as a 32px icon; the mobile sheet draws the same
 * item as an icon with its label under it. Neither decides what is in the list.
 * See docs/MOBILE_TOOLS.md.
 */
export interface RailItem {
  id: string
  /** Tooltip and accessible name on the rail; the visible label on mobile. */
  label: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  /** A count worth surfacing — clip planes, loaded models. */
  badge?: number
  /** Something is active inside the tool, when a count would be misleading. */
  dot?: boolean
}

interface PanelRailProps {
  items: RailItem[]
}

export function PanelRail({ items }: PanelRailProps) {
  // The rail scrolls under `no-scrollbar` once it holds more icons than fit
  // (an IFC + scan + layer + clip scene has 11; at 1366x643 only ~6 show).
  // A fade on the clipped edge is the cue that there is more.
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState<OverflowEdges>({ top: false, bottom: false })
  const hasItems = items.length > 0
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const next = overflowEdges(el)
      setEdges((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => { ro?.disconnect(); el.removeEventListener('scroll', measure) }
  }, [hasItems, items.length])

  // Nothing applicable means no rail at all, rather than an empty strip that
  // costs width and says nothing.
  if (!hasItems) return null

  const mask = overflowMask(edges)
  return (
    <div
      ref={ref}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      role="toolbar"
      aria-orientation="vertical"
      // Bounded by the camera-button reserve (--viewport-chrome-clearance, now
      // 68px): the rail sits right above that button, so a rail that grows —
      // loading a scan and a mesh adds two icons — can never reach down into
      // it. It scrolls instead. Panels no longer read this token: they sit
      // left of the button, so only the rail needs the reserve.
      className="absolute top-14 right-3 z-[19] flex flex-col gap-1 p-1 rounded-xl glass-md border border-[var(--border)] pointer-events-auto select-none overflow-y-auto no-scrollbar max-h-[calc(100%-3.5rem-var(--viewport-chrome-clearance))]"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onToggle}
          title={item.label}
          aria-label={item.label}
          // `aria-pressed` rather than `aria-expanded`: the rail button is a
          // toggle for a region that lives beside it, not a disclosure for
          // content inside the button.
          aria-pressed={item.open}
          className={[
            'relative w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors',
            item.open
              // The open panel is marked, so the rail also answers "which one am
              // I in" — the question the closed toolbar menu could not.
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
          ].join(' ')}
        >
          {item.icon}
          {/* State the rail could not show before: a tool that is doing
              something while parked. Positioned over the icon because the rail
              has no room beside it. */}
          {(item.badge != null || item.dot) && (
            <span
              aria-hidden
              className={[
                'absolute -top-0.5 -right-0.5 rounded-full text-[9px] font-semibold leading-none',
                'flex items-center justify-center',
                item.badge != null ? 'min-w-[14px] h-[14px] px-1' : 'w-[7px] h-[7px]',
                item.open ? 'bg-white text-[var(--accent)]' : 'bg-[var(--accent)] text-white',
              ].join(' ')}
            >
              {item.badge != null ? item.badge : ''}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
