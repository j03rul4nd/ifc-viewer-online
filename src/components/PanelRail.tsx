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
// anywhere is in the way somewhere. This viewport is 1168x546 with the tree and
// the validation panel open; there is nowhere to drag it to.

import React from 'react'

export interface RailItem {
  id: string
  /** Tooltip and accessible name. A 44px rail cannot carry a label. */
  label: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
}

interface PanelRailProps {
  items: RailItem[]
}

export function PanelRail({ items }: PanelRailProps) {
  // Nothing applicable means no rail at all, rather than an empty strip that
  // costs width and says nothing.
  if (items.length === 0) return null

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      // Bounded by the same clearance the panels obey, so a rail that grows —
      // loading a scan and a mesh adds two icons — can never reach down into the
      // camera controls. Measured: 8 icons would end at y=394 with the view
      // cube starting at 354. It scrolls instead, which is what the panels do.
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
            'w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors',
            item.open
              // The open panel is marked, so the rail also answers "which one am
              // I in" — the question the closed toolbar menu could not.
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
          ].join(' ')}
        >
          {item.icon}
        </button>
      ))}
    </div>
  )
}
