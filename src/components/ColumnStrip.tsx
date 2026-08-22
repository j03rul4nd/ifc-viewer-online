// ─── ColumnStrip ──────────────────────────────────────────────────────────────
// What a docked column leaves behind when it is collapsed.
//
// The rule, in one sentence: A COLUMN COLLAPSES IN PLACE. It leaves a strip on
// its own edge that still says what it is, and that strip is the same control
// that brings it back.
//
// That is the validation panel's behaviour, generalised — it was the only one of
// the three that got it right. The tree could only be toggled from a menu two
// clicks away and left nothing behind, so the way back was somewhere else
// entirely. The sidebar left a chevron floating in a corner it had never
// occupied, with its state in component-local `useState`, so it forgot itself on
// remount and nothing else could open it. Three surfaces, three different
// answers to "how do I get that back", which is the whole complaint.
//
// Deliberately NOT the floating panels' rule. Those share one slot and so only
// one may be open; columns are layout regions that sit beside each other and are
// meant to be open together. What they share is the toggle, not exclusivity.

import React from 'react'

export type ColumnEdge = 'left' | 'right' | 'bottom'

interface ColumnStripProps {
  /** Which edge of the viewport this column lives on. */
  edge: ColumnEdge
  /** What the column is, shown on the strip so it is identifiable while closed. */
  label: string
  onExpand: () => void
  /** Optional summary — a count, a chart — so the strip is worth its space. */
  children?: React.ReactNode
  /**
   * Extra classes for the caller's own layout concerns — chiefly hiding the
   * strip below the desktop breakpoint, where the column becomes a drawer or a
   * sheet and a desktop rail would be a second, wrong way in.
   */
  className?: string
}

/** The chevron points the way the column will come FROM when it opens. */
function Chevron({ edge }: { edge: ColumnEdge }) {
  const path = edge === 'left' ? 'M5 2l5 5-5 5'
    : edge === 'right' ? 'M9 2L4 7l5 5'
      : 'M2 9l5-5 5 5'
  return (
    <svg
      width="11" height="11" viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={path} />
    </svg>
  )
}

export function ColumnStrip({ edge, label, onExpand, children, className }: ColumnStripProps) {
  const vertical = edge !== 'bottom'
  return (
    <button
      type="button"
      onClick={onExpand}
      title={label}
      aria-label={label}
      aria-expanded={false}
      className={[
        'group flex items-center bg-[var(--surface)] hover:bg-[var(--surface-2)]',
        'active:bg-[var(--surface-2)] transition-colors shrink-0 text-left',
        vertical
          // A narrow rail down the viewport's own edge, with the name running
          // along it — the column is still identifiable at 28px wide.
          ? `w-7 h-full flex-col justify-start gap-2 py-3 ${edge === 'left'
            ? 'border-r border-[var(--border)]' : 'border-l border-[var(--border)]'}`
          : 'w-full h-10 xs:h-9 gap-2 px-3 border-t border-[var(--border)]',
        className ?? '',
      ].join(' ')}
    >
      <span className="text-[var(--text-faint)] group-hover:text-[var(--text-dim)] transition-colors">
        <Chevron edge={edge} />
      </span>
      <span
        className={[
          'text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]',
          vertical ? 'whitespace-nowrap' : 'shrink-0',
        ].join(' ')}
        style={vertical
          // Reads bottom-to-top on the left rail and top-to-bottom on the right,
          // so in both cases it runs away from the viewport corner rather than
          // into it.
          ? { writingMode: 'vertical-rl', transform: edge === 'left' ? 'rotate(180deg)' : undefined }
          : undefined}
      >
        {label}
      </span>
      {children}
    </button>
  )
}
