// The change list (M3): ordered by impact, one row per change with its icon +
// letter + colour, the site sentence and the review state. Virtualised above
// 500 rows so a 20 000-change delivery scrolls like a short one.
import React, { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { RevisionChange } from '../../lib/compare/revision-types'
import { GROUP_ICON, GROUP_LETTER, KIND_GROUP, kindColour, type ReviewState, type ShownKind } from '../../lib/compare/revision-view'
import { useRevisionText } from './useRevisionText'

const VIRTUAL_FROM = 500
const ROW_H = 56

export function KindBadge({ kind, size = 22 }: { kind: ShownKind; size?: number }) {
  const g = KIND_GROUP[kind]
  return (
    <span
      // theme-allow-color: white glyph on the change-code colour
      className="shrink-0 inline-flex items-center justify-center rounded-md font-bold leading-none text-white"
      style={{ width: size, height: size, background: kindColour(kind), fontSize: size * 0.5 }}
      aria-hidden
    >
      {GROUP_ICON[g]}<span className="sr-only">{GROUP_LETTER[g]}</span>
    </span>
  )
}

export function ReviewMark({ state }: { state: ReviewState }) {
  const { t } = useRevisionText()
  if (state === 'reviewed') return <span className="text-[var(--ok)] text-[13px]" title={t('rc.review.reviewed')}>✓</span>
  if (state === 'affects_site') return <span className="text-[var(--warning)] text-[13px]" title={t('rc.review.affects_site')}>⚠</span>
  return <span className="text-[var(--text-faint)] text-[10px]" title={t('rc.review.pending')}>●</span>
}

function Row({ c, on, state, mark, twin, onPick }: { c: RevisionChange; on: boolean; state: ReviewState; mark?: string; twin?: boolean; onPick: () => void }) {
  const { phrase, className } = useRevisionText()
  return (
    <button
      type="button" onClick={onPick} data-testid="rc-row" data-gid={c.globalId} aria-current={on || undefined}
      className={`w-full h-[56px] flex items-center gap-2.5 px-2.5 text-left border-b border-[var(--border)] transition-colors
        ${on ? 'bg-[var(--accent)]/15' : 'hover:bg-[var(--bg-hover)]'}`}
    >
      <KindBadge kind={c.kind as ShownKind} />
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[12.5px] text-[var(--text)]">
          {mark ? <b className="font-semibold mr-1">{mark}</b> : null}{c.name || className(c.ifcClass)}
          {/* Two elements with the same mark and name (Revit splits) would read as a duplicate row. */}
          {twin && <span className="ml-1 font-mono text-[10px] text-[var(--text-faint)]">#{c.globalId.slice(-6)}</span>}
        </span>
        <span className="block truncate text-[11px] text-[var(--text-dim)]">{phrase(c)}</span>
      </span>
      <ReviewMark state={state} />
    </button>
  )
}

export default function RevisionList({ rows, selected, reviews, marks, onPick }: {
  rows: RevisionChange[]
  selected: string | null
  reviews: ReadonlyMap<string, ReviewState>
  marks: ReadonlyMap<string, string>
  onPick: (gid: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const virtual = rows.length > VIRTUAL_FROM
  const v = useVirtualizer({ count: virtual ? rows.length : 0, getScrollElement: () => ref.current, estimateSize: () => ROW_H, overscan: 12 })
  const idx = rows.findIndex((r) => r.globalId === selected)
  const twins = React.useMemo(() => {
    const seen = new Map<string, number>()
    const key = (c: RevisionChange) => `${marks.get(c.globalId) ?? ''}|${c.name ?? c.ifcClass}`
    for (const c of rows) seen.set(key(c), (seen.get(key(c)) ?? 0) + 1)
    return new Set(rows.filter((c) => (seen.get(key(c)) ?? 0) > 1).map((c) => c.globalId))
  }, [rows, marks])

  // Keep the selected row in view while stepping with J/K.
  useEffect(() => {
    if (idx < 0) return
    if (virtual) v.scrollToIndex(idx, { align: 'auto' })
    else ref.current?.querySelector(`[data-gid="${CSS.escape(rows[idx].globalId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [idx, virtual]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-testid="rc-list" role="list">
      {virtual ? (
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((it) => {
            const c = rows[it.index]
            return (
              <div key={c.globalId} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${it.start}px)` }} role="listitem">
                <Row c={c} on={c.globalId === selected} state={reviews.get(c.globalId) ?? 'pending'} mark={marks.get(c.globalId)} twin={twins.has(c.globalId)} onPick={() => onPick(c.globalId)} />
              </div>
            )
          })}
        </div>
      ) : rows.map((c) => (
        <div key={c.globalId} role="listitem">
          <Row c={c} on={c.globalId === selected} state={reviews.get(c.globalId) ?? 'pending'} mark={marks.get(c.globalId)} twin={twins.has(c.globalId)} onPick={() => onPick(c.globalId)} />
        </div>
      ))}
    </div>
  )
}
