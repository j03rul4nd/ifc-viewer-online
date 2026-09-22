import React from 'react'
import * as Icons from '../Icons'
import { analyzeTable, compareCells, filterRows, parseCell, toneLabel } from '../../lib/blog-table'
import { editorialCopy, type EditorialCopy } from '../../lib/blog-editorial-copy'
import './editorial.css'

// ─── SmartTable ──────────────────────────────────────────────────────────────
// One table block, four presentations — chosen from the table's SHAPE (see
// lib/blog-table.ts) and the width of the column it actually sits in, not the
// viewport, so a table inside a narrow layout behaves like one on a phone.
//
//   table   it fits: a plain <table>, with sort/filter once rows are many.
//   scroll  it doesn't fit, but there is room to read a grid: horizontal
//           scroll, sticky first column, edge shadows where content hides.
//   cards   phone + prose table: one card per row (records: extras folded).
//   focus   phone + verdict matrix: row names next to ONE chosen column.

export type TableLayout = 'auto' | 'scroll' | 'cards'

interface SmartTableProps {
  headers: string[]
  rows: string[][]
  caption?: string
  rowHeaders?: boolean
  layout?: TableLayout
  lang?: string
}

/** Below this inline size a grid of more than two columns stops being readable. */
const NARROW_PX = 600
/** Records cards show this many fields before folding the rest. */
const RECORD_VISIBLE = 2
/** Beyond this many rows the table scrolls inside itself with a pinned header. */
const TALL_ROWS = 10

type SortState = { col: number; dir: 'asc' | 'desc' } | null

function useInlineSize<T extends HTMLElement>(): [React.RefObject<T>, number | null] {
  const ref = React.useRef<T>(null)
  const [width, setWidth] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export function Cell({ value }: { value: string }) {
  const { tone, text } = parseCell(value)
  if (!tone) return <>{value}</>
  const Icon = tone === 'yes' ? Icons.Check : tone === 'no' ? Icons.X : Icons.Warn
  const glyphStripped = text !== value.trim()
  return (
    <span className="ed-pill" data-tone={tone}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      <span>
        {glyphStripped && text && <span className="sr-only">{toneLabel(tone)}: </span>}
        {text || toneLabel(tone)}
      </span>
    </span>
  )
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      <path d="M5 1.5 8 4.5H2z" fill="currentColor" opacity={dir === 'asc' ? 1 : 0.3} />
      <path d="M5 8.5 2 5.5h6z" fill="currentColor" opacity={dir === 'desc' ? 1 : 0.3} />
    </svg>
  )
}

export default function SmartTable({ headers, rows, caption, rowHeaders = true, layout = 'auto', lang = 'en' }: SmartTableProps) {
  const copy = editorialCopy(lang)
  const shape = React.useMemo(() => analyzeTable(headers, rows, rowHeaders), [headers, rows, rowHeaders])
  const [boxRef, width] = useInlineSize<HTMLElement>()
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<SortState>(null)
  // Matrix focus: which data column sits next to the row names. -1 = all.
  const [focusCol, setFocusCol] = React.useState(rowHeaders ? 1 : 0)
  const captionId = React.useId()
  const countId = React.useId()

  const narrow = width !== null && width < NARROW_PX
  const overflows = width !== null && width < shape.minWidth
  let mode: 'table' | 'scroll' | 'cards' | 'focus'
  if (layout === 'cards') mode = 'cards'
  else if (layout === 'scroll') mode = overflows ? 'scroll' : 'table'
  else if (narrow && shape.kind === 'matrix') mode = focusCol < 0 ? 'scroll' : 'focus'
  else if (narrow) mode = 'cards'
  else mode = overflows ? 'scroll' : 'table'

  const visibleRows = React.useMemo(() => {
    const filtered = filterRows(rows, query)
    if (!sort) return filtered
    const sorted = [...filtered].sort((a, b) => compareCells(a[sort.col] ?? '', b[sort.col] ?? ''))
    return sort.dir === 'desc' ? sorted.reverse() : sorted
  }, [rows, query, sort])

  const toggleSort = (col: number) =>
    setSort((s) => (s?.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null))

  const showFocusChips = narrow && shape.kind === 'matrix' && layout === 'auto'
  const showToolbar = shape.searchable || showFocusChips

  return (
    <figure className="ed-focus my-8" ref={boxRef} aria-labelledby={caption ? captionId : undefined}>
      {showToolbar && (
        <div className="mb-3 flex flex-col gap-2.5">
          {shape.searchable && (
            <div className="flex items-center gap-3">
              <label className="relative flex-1 max-w-[320px]">
                <span className="sr-only">{copy.searchRows}</span>
                <Icons.Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
                  placeholder={copy.searchPlaceholder}
                  aria-describedby={countId}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent-2)]"
                />
              </label>
              <output id={countId} aria-live="polite" className="text-[12px] tabular-nums text-[var(--text-faint)]">
                {copy.rowsShown(visibleRows.length, rows.length)}
              </output>
            </div>
          )}
          {showFocusChips && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">
                {copy.focusColumn}
              </span>
              <div className="ed-chips min-w-0" role="group" aria-label={copy.focusColumn}>
                {headers.map((h, ci) => (rowHeaders && ci === 0 ? null : (
                  <button key={ci} type="button" className="ed-chip" aria-pressed={focusCol === ci} onClick={() => setFocusCol(ci)}>
                    {h}
                  </button>
                )))}
                <button type="button" className="ed-chip" aria-pressed={focusCol < 0} onClick={() => setFocusCol(-1)}>
                  {copy.allColumns}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-[var(--text-dim)]">
          {copy.noRows}{' '}
          <button type="button" onClick={() => setQuery('')} className="ml-1 underline underline-offset-2 text-[var(--accent-2)]">
            {copy.clearSearch}
          </button>
        </div>
      ) : mode === 'cards' ? (
        <TableCards headers={headers} rows={visibleRows} rowHeaders={rowHeaders} fold={shape.kind === 'records'} copy={copy} />
      ) : (
        <GridTable
          headers={headers}
          rows={visibleRows}
          rowHeaders={rowHeaders}
          columns={mode === 'focus' ? [0, focusCol] : headers.map((_, i) => i)}
          sortable={shape.sortable && mode !== 'focus'}
          sort={sort}
          onSort={toggleSort}
          tall={rows.length > TALL_ROWS}
          caption={caption}
          copy={copy}
        />
      )}

      {caption && (
        <figcaption id={captionId} className="mt-2.5 px-1 text-[12px] leading-[1.6] text-[var(--text-faint)]">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

// ─── Grid (table / scroll / focus) ───────────────────────────────────────────

function GridTable({ headers, rows, rowHeaders, columns, sortable, sort, onSort, tall, caption, copy }: {
  headers: string[]
  rows: string[][]
  rowHeaders: boolean
  columns: number[]
  sortable: boolean
  sort: SortState
  onSort: (col: number) => void
  tall: boolean
  caption?: string
  copy: EditorialCopy
}) {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = React.useState(false)

  // Edge shadows: a cue that content continues, updated on scroll and resize.
  const syncEdges = React.useCallback(() => {
    const el = scrollRef.current
    const frame = frameRef.current
    if (!el || !frame) return
    const max = el.scrollWidth - el.clientWidth
    frame.dataset.moreStart = String(el.scrollLeft > 2)
    frame.dataset.moreEnd = String(el.scrollLeft < max - 2)
    const sticky = el.querySelector<HTMLElement>('thead .ed-sticky')
    frame.style.setProperty('--ed-sticky-w', sticky ? `${sticky.offsetWidth}px` : '0px')
    setOverflowing(max > 2)
  }, [])

  React.useLayoutEffect(() => {
    syncEdges()
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(syncEdges)
    ro.observe(el)
    return () => ro.disconnect()
  }, [syncEdges, columns.length])

  const wide = columns.length > 4

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface)]">
      <div ref={frameRef} className="ed-scroll-frame">
        <div
          ref={scrollRef}
          className="ed-scroll"
          data-tall={tall}
          onScroll={syncEdges}
          // Only a scrollable region needs to be reachable by keyboard.
          tabIndex={overflowing ? 0 : undefined}
          role={overflowing ? 'region' : undefined}
          aria-label={overflowing ? copy.tableRegion(caption ?? headers.join(', ')) : undefined}
        >
          <table className={`ed-table w-full border-separate border-spacing-0 ${wide ? 'text-[12.5px]' : 'text-[13.5px]'}`}>
            <thead>
              <tr>
                {columns.map((ci) => {
                  const dir = sort?.col === ci ? sort.dir : null
                  const sticky = rowHeaders && ci === 0
                  return (
                    <th
                      key={ci}
                      scope="col"
                      aria-sort={sortable ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                      className={`${sticky ? 'ed-sticky' : ''} px-3.5 py-2.5 text-left align-bottom text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)] border-b border-[var(--border)]`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => onSort(ci)}
                          className="-mx-1 -my-1 inline-flex items-center gap-1.5 rounded px-1 py-1 text-left uppercase tracking-[0.07em] hover:text-[var(--text)]"
                        >
                          <span>{headers[ci]}</span>
                          <SortIcon dir={dir} />
                        </button>
                      ) : headers[ci]}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.join('␟') + ri}>
                  {columns.map((ci) => {
                    const cell = row[ci] ?? ''
                    const last = ri === rows.length - 1 ? '' : 'border-b border-[var(--border)]'
                    if (rowHeaders && ci === 0) {
                      return (
                        <th
                          key={ci}
                          scope="row"
                          className={`ed-sticky ${last} px-3.5 py-3 text-left align-top font-medium text-[var(--text)] leading-[1.5] min-w-[112px] max-w-[200px]`}
                        >
                          {cell}
                        </th>
                      )
                    }
                    return (
                      <td key={ci} className={`${last} px-3.5 py-3 align-top leading-[1.6] text-[var(--text-dim)] ${wide ? 'min-w-[108px]' : ''} max-w-[340px]`}>
                        <Cell value={cell} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {overflowing && (
        <p className="flex items-center gap-1.5 border-t border-[var(--border)] px-3.5 py-2 text-[11px] text-[var(--text-faint)]" aria-hidden="true">
          <Icons.ArrowRight size={12} />
          {copy.scrollHint}
        </p>
      )}
    </div>
  )
}

// ─── Cards (stack / records) ─────────────────────────────────────────────────

function TableCards({ headers, rows, rowHeaders, fold, copy }: {
  headers: string[]
  rows: string[][]
  rowHeaders: boolean
  fold: boolean
  copy: EditorialCopy
}) {
  const first = rowHeaders ? 1 : 0
  return (
    <ul className="space-y-2.5" role="list">
      {rows.map((row, ri) => {
        const fields = headers.map((h, ci) => ({ h, v: row[ci] ?? '', ci })).slice(first)
        const shown = fold ? fields.slice(0, RECORD_VISIBLE) : fields
        const folded = fold ? fields.slice(RECORD_VISIBLE) : []
        return (
          <li key={row.join('␟') + ri} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
            {rowHeaders && (
              <p className="text-[14.5px] font-semibold leading-snug tracking-tight text-[var(--text)]">{row[0]}</p>
            )}
            <FieldList fields={shown} className={rowHeaders ? 'mt-2.5' : ''} />
            {folded.length > 0 && (
              <details className="ed-details mt-2.5 border-t border-[var(--border)] pt-2">
                <summary className="flex min-h-[40px] items-center gap-1.5 text-[12.5px] font-medium text-[var(--accent-2)]">
                  <Icons.Chevron size={13} className="ed-caret" aria-hidden="true" />
                  {copy.moreDetails(folded.length)}
                </summary>
                <FieldList fields={folded} className="mt-1" />
              </details>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function FieldList({ fields, className = '' }: { fields: Array<{ h: string; v: string; ci: number }>; className?: string }) {
  return (
    <dl className={`grid gap-2.5 ${className}`}>
      {fields.map(({ h, v, ci }) => (
        <div key={ci}>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--text-faint)]">{h}</dt>
          <dd className="mt-0.5 text-[14px] leading-[1.6] text-[var(--text-dim)]"><Cell value={v} /></dd>
        </div>
      ))}
    </dl>
  )
}
