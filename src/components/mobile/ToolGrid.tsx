// ─── ToolGrid ─────────────────────────────────────────────────────────────────
// The mobile form of the panel rail. Same catalogue, different device.
//
// The sheet used to carry a hand-written row of four buttons — measure, section,
// plans, scene — in a different file from the rail, listing tools by name. It
// was a second copy of "what tools exist", and it had already fallen four behind:
// Map, Sun, Point cloud and Mesh had no mobile entry point at all. Not hidden,
// not disabled — absent.
//
// So this renders whatever the catalogue holds, and holds no opinion of its own.
// A tool added next year appears here the day it is stated in App.tsx.
//
// Why not the rail itself: it is icon-only and learnable through hover, which
// touch does not have; its targets are 32px, under what a thumb wants; and it
// lives on a side edge, where the thumb rests and the OS keeps its back gesture.
// See docs/MOBILE_TOOLS.md.

import React from 'react'
import type { RailItem } from '../PanelRail'

interface ToolGridProps {
  items: RailItem[]
  /** Tapping a tool dismisses the sheet: you asked for the tool, not the menu. */
  onPick: () => void
}

export function ToolGrid({ items, onPick }: ToolGridProps) {
  if (items.length === 0) return null

  return (
    // Wraps rather than being a fixed row of four. Nine tools fit; twelve will.
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => { item.onToggle(); onPick() }}
          aria-pressed={item.open}
          className={[
            // 44px+ of target: the rail's 32px is a pointer measurement.
            'relative flex flex-col items-center justify-center gap-1.5 h-[68px] rounded-2xl',
            'active:scale-[0.96] transition-transform',
            item.open ? 'text-white' : 'text-[rgba(255,255,255,0.62)]',
          ].join(' ')}
          style={{
            background: item.open ? 'rgba(94,106,210,0.20)' : 'rgba(255,255,255,0.05)',
            border: item.open ? '0.5px solid rgba(94,106,210,0.42)' : '0.5px solid transparent',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span className="relative flex items-center justify-center">
            {/* The catalogue's icons are sized for a 32px rail button. Touch
                wants them bigger, and the catalogue should not have to know
                which surface is asking. */}
            {React.isValidElement(item.icon)
              ? React.cloneElement(item.icon as React.ReactElement<{ size?: number }>, { size: 22 })
              : item.icon}
            {(item.badge != null || item.dot) && (
              <span
                aria-hidden
                className={[
                  'absolute -top-1 -right-2 rounded-full text-[9px] font-semibold leading-none',
                  'flex items-center justify-center text-white',
                  item.badge != null ? 'min-w-[14px] h-[14px] px-1' : 'w-[7px] h-[7px]',
                ].join(' ')}
                style={{ background: 'var(--accent)' }}
              >
                {item.badge != null ? item.badge : ''}
              </span>
            )}
          </span>
          {/* Always a label. On touch it is not decoration — it is the only
              thing that explains the icon, because there is no hover. */}
          <span className="text-[10px] font-medium leading-none text-center px-1 truncate max-w-full">
            {item.label}
          </span>
        </button>
      ))}
    </div>
  )
}
