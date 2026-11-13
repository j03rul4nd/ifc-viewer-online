// Revision compare workspace (spec 10 M2–M7, V2.4; 05-ux §3–§7). Sits over
// the 3D view instead of a dialog: the list is the axis, the model is the
// context of each change.
//   desktop — top bar (sides, local badge, view modes, counter, tolerances,
//             exports), list + filters on the left, the change card with its
//             before/after table at the bottom;
//   phone / tablet portrait — compact bar, big prev / next, and a MobileSheet:
//             peek = card, half = list, full = table.
// While it is open it owns the overlay channel (validation / IDS paused).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewerAPI } from '../../lib/viewer'
import type { RevisionChange } from '../../lib/compare/revision-types'
import {
  colourTokens, facets, filterChanges, isInferredMatch, KIND_GROUP, kindColour, markIndex, readableClass,
  reviewCounts, SHOWN_KINDS, sortByImpact, tableRows, GROUP_ICON, type ShownKind,
} from '../../lib/compare/revision-view'
import { locateRevision, planRevisionOverlay } from '../../lib/compare/overlay'
import { applyRevisionColours, applyRevisionVisibility, clearRevisionPaint, showWholeSide } from '../../lib/compare/view-paint'
import { clearArrows, drawArrows } from '../../lib/compare/view-arrows'
import { startCurtain, type CurtainHandle } from '../../lib/compare/view-split'
import { MobileSheet } from '../mobile/MobileSheet'
import { recomputeDiff, useRevisionStore, type ViewMode } from './revisionStore'
import RevisionList, { KindBadge } from './RevisionList'
import { useRevisionText } from './useRevisionText'

function useNarrow(): boolean {
  const q = '(max-width: 767px), (max-width: 1024px) and (orientation: portrait)'
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

const panel = 'bg-[var(--bg-surface)] backdrop-blur-md border border-[var(--border-strong)] [[data-theme=light]_&]:bg-[var(--bg-surface)] [[data-theme=light]_&]:backdrop-blur-none'
const chip = 'h-8 px-2.5 rounded-full border text-[11.5px] inline-flex items-center gap-1.5 transition-colors'
const sel = 'h-9 sm:h-8 px-2 rounded-lg border border-[var(--border-control)] bg-[var(--bg-surface)] text-[12px] sm:text-[11.5px] text-[var(--text-dim)] w-full min-w-0'

// ── Before / after table (M4) ────────────────────────────────────────────────

function ChangeTable({ c }: { c: RevisionChange }) {
  const { t } = useRevisionText()
  const rows = tableRows(c)
  if (c.kind === 'added' || c.kind === 'removed') {
    return <p className="m-0 text-[11.5px] text-[var(--text-dim)]">{t(`rc.table.${c.kind}`, { file: c.headFile ?? c.baseFile ?? '' })}</p>
  }
  if (!rows.length) return <p className="m-0 text-[11.5px] text-[var(--text-faint)]">{t('rc.table.empty')}</p>
  return (
    <div className="overflow-x-auto" data-testid="rc-table">
      <table className="w-full text-[11.5px] border-collapse">
        <thead>
          <tr className="text-left text-[10.5px] text-[var(--text-faint)]">
            <th className="py-1 pr-3 font-medium">{t('rc.table.field')}</th>
            <th className="py-1 pr-3 font-medium">{t('rc.table.before')}</th>
            <th className="py-1 pr-3 font-medium">{t('rc.table.after')}</th>
            <th className="py-1 font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border)] align-top">
              <td className="py-1 pr-3 text-[var(--text)] break-all">{r.field === 'raw' ? r.label : t(`rc.field.${r.field}`)}</td>
              <td className="py-1 pr-3 text-[var(--text-faint)] break-all">{r.before}</td>
              <td className="py-1 pr-3 text-[var(--text)] break-all">{r.after}</td>
              <td className="py-1 tabular-nums whitespace-nowrap text-[var(--text-dim)]">{r.delta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── The card of the change on screen ─────────────────────────────────────────

function ChangeCard({ c, index, total, mark, onPrev, onNext, onFrame, table, onTable }: {
  c: RevisionChange | null; index: number; total: number; mark?: string
  onPrev: () => void; onNext: () => void; onFrame: () => void
  table: boolean; onTable?: () => void
}) {
  const { t, phrase } = useRevisionText()
  const { reviews, setReview } = useRevisionStore()
  if (!c) return <p className="m-0 p-3 text-[12px] text-[var(--text-faint)]">{t('rc.none')}</p>
  const state = reviews.get(c.globalId) ?? 'pending'
  const others = c.kinds.filter((k) => k !== c.kind && k !== 'unchanged') as ShownKind[]
  const nav = 'h-11 min-w-11 px-3 rounded-xl border border-[var(--border)] text-[var(--text)] text-[15px] hover:bg-[var(--bg-hover)] disabled:opacity-30'
  return (
    <div className="flex flex-col gap-2" data-testid="rc-card">
      <div className="flex items-start gap-2.5">
        <KindBadge kind={c.kind as ShownKind} size={28} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[var(--text)] truncate">
            {mark ? `${mark} · ` : ''}{c.name || readableClass(c.ifcClass)}
            <span className="font-normal text-[var(--text-faint)]"> · {readableClass(c.ifcClass)}{c.storey ? ` · ${c.storey}` : ''}</span>
          </div>
          <div className="text-[12.5px]" style={{ color: kindColour(c.kind) }} data-testid="rc-phrase">{phrase(c)}</div>
          <div className="flex flex-wrap gap-x-2 text-[10.5px] text-[var(--text-faint)]">
            <span>{t(`rc.kind.${c.kind}`)}</span>
            {others.map((k) => <span key={k}>+ {t(`rc.kind.${k}`)}</span>)}
            {isInferredMatch(c) && (
              <span className="text-[var(--warning)]" data-testid="rc-match">
                {t('rc.match', { method: t(`rc.method.${c.match.method}`), pct: Math.round(c.match.confidence * 100) })}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-faint)]" data-testid="rc-position">{index + 1} / {total}</span>
      </div>
      {table && <ChangeTable c={c} />}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" className={nav} onClick={onPrev} aria-label={t('rc.prev')} title={`${t('rc.prev')} (K)`}>‹</button>
        <button
          type="button" onClick={() => setReview(c.globalId, state === 'reviewed' ? 'pending' : 'reviewed')} aria-pressed={state === 'reviewed'} title="R"
          className={`h-11 px-3 rounded-xl border text-[12px] ${state === 'reviewed' ? 'border-[var(--ok)] text-[var(--ok)] bg-[var(--ok)]/10' : 'border-[var(--border)] text-[var(--text-dim)]'}`}
        >✓ {t('rc.review.reviewed')}</button>
        <button
          type="button" onClick={() => setReview(c.globalId, state === 'affects_site' ? 'pending' : 'affects_site')} aria-pressed={state === 'affects_site'} title="S"
          className={`h-11 px-3 rounded-xl border text-[12px] ${state === 'affects_site' ? 'border-[var(--warning)] text-[var(--warning)] bg-[var(--warning)]/10' : 'border-[var(--border)] text-[var(--text-dim)]'}`}
        >⚠ {t('rc.review.affects_site')}</button>
        <button type="button" className={nav} onClick={onNext} aria-label={t('rc.next')} title={`${t('rc.next')} (J)`}>›</button>
        <span className="flex-1" />
        <button type="button" onClick={onFrame} title="F" className="h-9 px-3 rounded-full border border-[var(--border)] text-[11.5px] text-[var(--accent)]">{t('rc.frame')}</button>
        {onTable && <button type="button" onClick={onTable} aria-expanded={table} className="h-9 px-3 rounded-full border border-[var(--border)] text-[11.5px] text-[var(--text-dim)]">{t('rc.table.toggle')} {table ? '▾' : '▴'}</button>}
      </div>
    </div>
  )
}

// ── Filters (M3) ─────────────────────────────────────────────────────────────

function Filters({ counts, storeys, files, classes }: { counts: Record<ShownKind, number>; storeys: string[]; files: string[]; classes: string[] }) {
  const { t } = useRevisionText()
  const { filter, setFilter } = useRevisionStore()
  const toggle = (k: ShownKind): void => {
    const s = new Set(filter.kinds)
    if (s.has(k)) s.delete(k); else s.add(k)
    if (s.size) setFilter({ kinds: [...s] })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('rc.filter.kind')}>
        {SHOWN_KINDS.filter((k) => counts[k] > 0).map((k) => {
          const on = filter.kinds.includes(k)
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => toggle(k)} data-testid={`rc-kind-${k}`}
              className={`${chip} ${on ? 'text-[var(--text)]' : 'opacity-45 border-dashed text-[var(--text-faint)]'}`}
              style={{ borderColor: on ? kindColour(k) : 'var(--border)' }}>
              <span style={{ color: kindColour(k) }} aria-hidden>{GROUP_ICON[KIND_GROUP[k]]}</span>
              {t(`rc.kind.${k}`)} <b className="tabular-nums font-medium">{counts[k]}</b>
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <select className={sel} value={filter.storey} onChange={(e) => setFilter({ storey: e.target.value })} aria-label={t('rc.filter.storey')}>
          <option value="">{t('rc.filter.anyStorey')}</option>
          {storeys.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={sel} value={filter.file} onChange={(e) => setFilter({ file: e.target.value })} aria-label={t('rc.filter.file')}>
          <option value="">{t('rc.filter.anyFile')}</option>
          {files.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={sel} value={filter.cls} onChange={(e) => setFilter({ cls: e.target.value })} aria-label={t('rc.filter.class')}>
          <option value="">{t('rc.filter.anyClass')}</option>
          {classes.map((s) => <option key={s} value={s}>{readableClass(s)}</option>)}
        </select>
        <select className={sel} value={filter.review} onChange={(e) => setFilter({ review: e.target.value as typeof filter.review })} aria-label={t('rc.filter.review')}>
          <option value="">{t('rc.filter.anyReview')}</option>
          {(['pending', 'reviewed', 'affects_site'] as const).map((s) => <option key={s} value={s}>{t(`rc.review.${s}`)}</option>)}
        </select>
      </div>
      <input
        type="search" value={filter.marks} onChange={(e) => setFilter({ marks: e.target.value })} placeholder={t('rc.filter.marks')}
        aria-label={t('rc.filter.marks')}
        className="h-9 sm:h-8 px-3 rounded-lg border border-[var(--border)] bg-transparent text-[12px] text-[var(--text)] w-full"
      />
    </div>
  )
}

// ── Tolerances (M5) ──────────────────────────────────────────────────────────

function Tolerances({ onClose }: { onClose: () => void }) {
  const { t } = useRevisionText()
  const { diff, diffMs } = useRevisionStore()
  const o = diff?.options
  const [move, setMove] = useState(() => String(Math.round((o?.moveTolerance ?? 0.005) * 1000)))
  const [size, setSize] = useState(() => String(Math.round((o?.sizeTolerance ?? 0.005) * 1000)))
  const [vol, setVol] = useState(() => String(Math.round((o?.volumeTolerance ?? 0.01) * 1000) / 10))
  const [busy, setBusy] = useState(false)
  const apply = async (): Promise<void> => {
    const n = (s: string, d: number) => { const x = Number(s.replace(',', '.')); return Number.isFinite(x) && x >= 0 ? x : d }
    setBusy(true)
    await recomputeDiff({ ...useRevisionStore.getState().options, moveTolerance: n(move, 5) / 1000, sizeTolerance: n(size, 5) / 1000, volumeTolerance: n(vol, 1) / 100 })
    setBusy(false)
  }
  const field = (label: string, v: string, set: (s: string) => void, unit: string, id: string) => (
    <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)]">
      <span className="flex-1">{label}</span>
      <input data-testid={id} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} className="w-16 h-8 px-2 rounded-md border border-[var(--border)] bg-transparent text-right text-[var(--text)] tabular-nums" />
      <span className="w-7 text-[var(--text-faint)]">{unit}</span>
    </label>
  )
  return (
    <div className={`${panel} absolute right-0 top-full mt-1 w-[260px] p-3 rounded-xl shadow-lg flex flex-col gap-2 z-10`} data-testid="rc-tolerances">
      <div className="text-[12px] font-semibold text-[var(--text)]">{t('rc.tol.title')}</div>
      {field(t('rc.tol.move'), move, setMove, 'mm', 'rc-tol-move')}
      {field(t('rc.tol.size'), size, setSize, 'mm', 'rc-tol-size')}
      {field(t('rc.tol.volume'), vol, setVol, '%', 'rc-tol-volume')}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void apply()} disabled={busy} className="h-8 px-3 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] text-[12px] disabled:opacity-50">{t('rc.tol.apply')}</button>
        <button type="button" onClick={onClose} className="h-8 px-3 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-dim)]">{t('rc.tol.close')}</button>
        <span className="ml-auto text-[10.5px] text-[var(--text-faint)] tabular-nums">{t('rc.tol.took', { ms: diffMs })}</span>
      </div>
      <p className="m-0 text-[10.5px] text-[var(--text-faint)]">{t('rc.tol.hint')}</p>
    </div>
  )
}

// ── Workspace ────────────────────────────────────────────────────────────────

export interface RevisionExportSlot {
  /** T4 wires PDF / XLSX / BCF here: receives the diff, the filtered list and the review states. */
  render?: (ctx: { rows: RevisionChange[]; reviews: ReadonlyMap<string, string> }) => React.ReactNode
}

/** Export buttons: T4 replaces this slot (PDF / XLSX / BCF). Kept disabled until then. */
export const revisionExportSlot: RevisionExportSlot = {}

export default function RevisionWorkspace({ viewerApiRef, onClose, onBack }: {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onClose: () => void
  onBack: () => void
}) {
  const { t, phrase, num } = useRevisionText()
  const st = useRevisionStore()
  const { diff, a, b, filter, selected, reviews, view, blinkSide, curtain } = st
  const narrow = useNarrow()
  const [showFilters, setShowFilters] = useState(!narrow)
  const [showTol, setShowTol] = useState(false)
  const [table, setTable] = useState(!narrow)
  const [detent, setDetent] = useState(0)
  const [fps, setFps] = useState(0)

  const sorted = useMemo(() => sortByImpact(diff?.changes ?? []), [diff])
  const marks = useMemo(() => markIndex([...a.snapshots, ...b.snapshots], diff?.options.markProperties ?? []), [a.snapshots, b.snapshots, diff])
  const fac = useMemo(() => facets(sorted), [sorted])
  const rows = useMemo(() => filterChanges(sorted, filter, marks, reviews), [sorted, filter, marks, reviews])
  const counts = useMemo(() => reviewCounts(sorted, reviews), [sorted, reviews])
  const idx = rows.findIndex((r) => r.globalId === selected)
  const current = idx >= 0 ? rows[idx] : null
  const idsA = useMemo(() => Object.values(a.modelIds), [a.modelIds])
  const idsB = useMemo(() => Object.values(b.modelIds), [b.modelIds])

  useEffect(() => { useRevisionStore.getState().setActive(true); return () => useRevisionStore.getState().setActive(false) }, [])

  // ── 3D: overlay + colours + arrows, following the filters (05-ux §4) ──
  const plan = useMemo(() => planRevisionOverlay(rows, b.modelIds, a.modelIds), [rows, a.modelIds, b.modelIds])
  const paintSeq = useRef(0)
  const repaint = useCallback(async (): Promise<void> => {
    const v = viewerApiRef.current
    if (!v) return
    const seq = ++paintSeq.current
    v.setValidationHighlights(plan.issues, true, { ghostOpacity: 0.12, severities: { error: true, warning: true, info: true } })
    await new Promise((r) => setTimeout(r, 30))
    if (seq !== paintSeq.current) return
    const mode = useRevisionStore.getState().view
    if (mode === 'changes') await applyRevisionVisibility(v, plan)
    else await showWholeSide(v, idsA)
    await applyRevisionColours(v, plan)
  }, [plan, idsA, viewerApiRef])

  useEffect(() => { void repaint() }, [repaint, view])

  useEffect(() => {
    const v = viewerApiRef.current
    if (!v) return
    if (view !== 'changes') { clearArrows(v); return }
    const specs = plan.arrows.map((ar) => {
      const c = rows.find((r) => r.globalId === ar.globalId)
      return { ...ar, text: `${num(Math.round((c?.delta?.moveDistance ?? 0) * 1000))} mm` }
    })
    void drawArrows(v, specs, selected)
  }, [plan, view, selected, rows, num, viewerApiRef])

  // Blink: one side at a time in the same viewport.
  useEffect(() => {
    const v = viewerApiRef.current
    if (!v) return
    const showA = view !== 'blink' || blinkSide === 'a'
    const showB = view !== 'blink' || blinkSide === 'b'
    for (const id of idsA) v.setModelVisible(id, showA)
    for (const id of idsB) v.setModelVisible(id, showB)
  }, [view, blinkSide, idsA, idsB, viewerApiRef])

  // Curtain: clip A to the left of the handle and B to the right (view-split.ts).
  const split = useRef<CurtainHandle | null>(null)
  useEffect(() => {
    const v = viewerApiRef.current
    if (!v || view !== 'curtain') return
    split.current = startCurtain(v, idsA, idsB, useRevisionStore.getState().curtain)
    const iv = window.setInterval(() => setFps(Math.round(split.current?.fps() ?? 0)), 1000)
    return () => { window.clearInterval(iv); split.current?.dispose(); split.current = null }
  }, [view, idsA, idsB, viewerApiRef])
  useEffect(() => { split.current?.setCurtain(curtain) }, [curtain])

  // Leaving: give the overlay channel back, show A whole, drop arrows / split.
  useEffect(() => () => {
    const v = viewerApiRef.current
    split.current?.dispose(); split.current = null
    if (!v) return
    clearArrows(v)
    for (const id of [...idsA, ...idsB]) v.setModelVisible(id, true)
    void clearRevisionPaint(v, idsA)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──
  const frame = useCallback((c: RevisionChange | null): void => {
    const v = viewerApiRef.current
    if (!v || !c) return
    const at = locateRevision(c, b.modelIds, a.modelIds)
    if (!at) return
    const t0 = performance.now()
    // Frame without selecting: a selection opens the properties panel over the
    // model, and the kind colour already marks the element.
    v.focusElement(at.expressId, at.modelId)
    ;(window as unknown as { __rcFrameMs?: number }).__rcFrameMs = performance.now() - t0
  }, [a.modelIds, b.modelIds, plan, viewerApiRef])

  const pick = useCallback((gid: string): void => {
    useRevisionStore.getState().select(gid)
    frame(rows.find((r) => r.globalId === gid) ?? null)
  }, [rows, frame])

  const step = useCallback((d: number): void => {
    if (!rows.length) return
    const next = ((idx < 0 ? (d > 0 ? -1 : 0) : idx) + d + rows.length) % rows.length
    pick(rows[next].globalId)
  }, [rows, idx, pick])

  // Open on the change of most impact (M6).
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || !rows.length) return
    opened.current = true
    const gid = selected && rows.some((r) => r.globalId === selected) ? selected : rows[0].globalId
    window.setTimeout(() => pick(gid), 250)
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // The scene finishes loading after the list is up: frame the change on screen then.
  const hasScene = idsA.length + idsB.length > 0
  useEffect(() => { if (hasScene && current) window.setTimeout(() => frame(current), 400) }, [hasScene]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: J/K or ↓/↑ step, R reviewed, S affects site, F frame, Space blink.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const s = useRevisionStore.getState()
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); step(1) }
      else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
      else if (k === 'r' && current) { e.preventDefault(); s.setReview(current.globalId, s.reviews.get(current.globalId) === 'reviewed' ? 'pending' : 'reviewed') }
      else if (k === 's' && current) { e.preventDefault(); s.setReview(current.globalId, s.reviews.get(current.globalId) === 'affects_site' ? 'pending' : 'affects_site') }
      else if (k === 'f') { e.preventDefault(); frame(current) }
      else if (e.key === ' ' && s.view === 'blink') { e.preventDefault(); s.setBlinkSide(s.blinkSide === 'a' ? 'b' : 'a') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, current, frame])

  // Curtain drag.
  const drag = useRef(false)
  useEffect(() => {
    const move = (e: PointerEvent): void => { if (drag.current) useRevisionStore.getState().setCurtain(e.clientX / window.innerWidth) }
    const up = (): void => { drag.current = false }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  if (!diff) return null
  const sideName = (files: File[]) => (files.length === 1 ? files[0].name : t('rc.drop.files', { count: files.length }))
  const modes: ViewMode[] = ['changes', 'curtain', 'blink']
  const exportsNode = revisionExportSlot.render?.({ rows, reviews }) ?? (
    <div className="flex items-center gap-1" data-testid="rc-export-slot">
      {(['pdf', 'xlsx', 'bcf'] as const).map((k) => (
        <button key={k} type="button" disabled title={t('rc.export.soon')} className="h-8 px-2.5 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-faint)] opacity-50 cursor-not-allowed">{t(`rc.export.${k}`)}</button>
      ))}
    </div>
  )

  const notices = (
    <>
      <div className="text-[10.5px] text-[var(--text-faint)]" data-testid="rc-paused">{t('rc.paused')}</div>
      {diff.guidRegenerated && <div className="px-3 py-2 rounded-lg text-[11.5px] border border-[var(--warning)] text-[var(--warning)] bg-[var(--warning)]/10" data-testid="rc-guid-warning" role="alert">{t('rc.guidRegenerated')}</div>}
      {diff.originShift && <div className="px-3 py-1.5 rounded-lg text-[11px] border border-[var(--border)] text-[var(--text-dim)]">{t('rc.originShift', { x: num(diff.originShift[0] * 1000), y: num(diff.originShift[1] * 1000), z: num(diff.originShift[2] * 1000) })}</div>}
    </>
  )

  const counter = (
    <span className="text-[12px] text-[var(--text-dim)] whitespace-nowrap" data-testid="rc-counter">
      <b className="text-[var(--text)] tabular-nums">{t('rc.counter.changes', { count: counts.total })}</b>
      {' · '}<span className="tabular-nums">{t('rc.counter.reviewed', { count: counts.reviewed })}</span>
      {counts.affects > 0 && <span className="text-[var(--warning)] tabular-nums"> · ⚠ {counts.affects}</span>}
    </span>
  )

  const modeBar = (
    <div className="flex gap-0.5 p-0.5 rounded-lg border border-[var(--border)]" role="tablist" aria-label={t('rc.view.label')}>
      {modes.map((m) => (
        <button key={m} type="button" role="tab" aria-selected={view === m} onClick={() => st.setView(m)} data-testid={`rc-view-${m}`}
          className={`h-8 px-2.5 rounded-md text-[11.5px] whitespace-nowrap ${view === m ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
          {t(`rc.view.${m}`)}
        </button>
      ))}
    </div>
  )

  const card = (
    <ChangeCard
      c={current} index={idx} total={rows.length} mark={current ? marks.get(current.globalId) : undefined}
      onPrev={() => step(-1)} onNext={() => step(1)} onFrame={() => frame(current)}
      table={narrow ? detent === 2 : table} onTable={narrow ? undefined : () => setTable((x) => !x)}
    />
  )

  const blinkBadge = view === 'blink' && (
    <button type="button" onClick={() => st.setBlinkSide(blinkSide === 'a' ? 'b' : 'a')} data-testid="rc-blink"
      className={`fixed z-[61] left-1/2 -translate-x-1/2 ${narrow ? 'top-[112px]' : 'top-[64px]'} h-10 px-4 rounded-full text-[13px] font-semibold border border-[var(--border-strong)] ${panel}`}>
      {blinkSide === 'a' ? `A · ${sideName(a.files)}` : `B · ${sideName(b.files)}`} <span className="text-[var(--text-faint)] font-normal">({t('rc.view.blinkHint')})</span>
    </button>
  )

  const curtainHandle = view === 'curtain' && (
    <div
      className="fixed z-[55] top-0 bottom-0 w-8 -ml-4 cursor-ew-resize touch-none flex justify-center"
      style={{ left: `${curtain * 100}%` }}
      onPointerDown={(e) => { drag.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
      data-testid="rc-curtain" role="slider" aria-label={t('rc.view.curtain')} aria-valuenow={Math.round(curtain * 100)} aria-valuemin={5} aria-valuemax={95}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') st.setCurtain(curtain - 0.02); if (e.key === 'ArrowRight') st.setCurtain(curtain + 0.02) }}
    >
      <div className="w-[3px] h-full bg-[var(--text-primary)] shadow-[0_0_0_1px_var(--scrim)]" />
      <div className="absolute top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-[var(--text-primary)] text-[var(--bg)] text-[13px] font-bold flex items-center justify-center shadow-lg">A|B</div>
    </div>
  )

  const fpsBadge = view === 'curtain' && fps > 0 && (
    <span className="fixed z-[55] right-3 bottom-3 px-2 py-0.5 rounded-md text-[10.5px] tabular-nums text-[var(--text-faint)] bg-[var(--scrim)]" data-testid="rc-fps">{fps} FPS</span>
  )

  const header = (
    <div className={`${panel} fixed z-[60] top-2 left-2 right-2 rounded-2xl px-2 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]`} style={colourTokens()} data-testid="rc-header">
      <button type="button" onClick={onBack} className="h-8 px-2 rounded-md text-[12px] text-[var(--text-dim)] hover:text-[var(--text)]" title={t('rc.back')}>◀ <span className="hidden sm:inline">{t('rc.back')}</span></button>
      <span className="text-[12.5px] font-semibold text-[var(--text)] hidden md:inline">{t('rc.title')}</span>
      <span className="min-w-0 flex items-center gap-1 text-[11.5px]">
        <span className="truncate max-w-[22vw] text-[var(--text-dim)]" title={a.files.map((f) => f.name).join('\n')}>A: {sideName(a.files)}</span>
        <span className="text-[var(--text-faint)]">→</span>
        <span className="truncate max-w-[22vw] text-[var(--text)]" title={b.files.map((f) => f.name).join('\n')}>B: {sideName(b.files)}</span>
      </span>
      <span className="text-[10.5px] px-2 h-6 inline-flex items-center rounded-full border border-[var(--border)] text-[var(--text-dim)]" title={t('rc.local')}>🔒 <span className="hidden sm:inline ml-1">{t('rc.localShort')}</span></span>
      <span className="flex-1" />
      {!narrow && counter}
      {modeBar}
      <div className="relative">
        <button type="button" onClick={() => setShowTol((x) => !x)} aria-expanded={showTol} data-testid="rc-tol-toggle"
          className="h-8 px-2.5 rounded-md border border-[var(--border)] text-[11.5px] text-[var(--text-dim)] hover:text-[var(--text)]">⚙ <span className="hidden sm:inline">{t('rc.tol.title')}</span></button>
        {showTol && <Tolerances onClose={() => setShowTol(false)} />}
      </div>
      {!narrow && exportsNode}
      <button type="button" onClick={onClose} className="h-8 w-8 rounded-full text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]" aria-label={t('dock.close')}>✕</button>
    </div>
  )

  if (narrow) {
    return (
      <div style={colourTokens()}>
        {header}
        <div className={`${panel} fixed z-[60] left-2 right-2 top-[calc(env(safe-area-inset-top)+96px)] rounded-xl px-2 py-1 flex items-center gap-2`}>
          <button type="button" onClick={() => step(-1)} className="h-11 w-14 rounded-lg border border-[var(--border)] text-[18px] text-[var(--text)]" aria-label={t('rc.prev')}>◀</button>
          <div className="flex-1 min-w-0 text-center">{counter}<div className="text-[11px] text-[var(--text-faint)] tabular-nums">{idx + 1} / {rows.length}</div></div>
          <button type="button" onClick={() => step(1)} className="h-11 w-14 rounded-lg border border-[var(--border)] text-[18px] text-[var(--text)]" aria-label={t('rc.next')}>▶</button>
        </div>
        {blinkBadge}{curtainHandle}{fpsBadge}
        <MobileSheet open onClose={onClose} snapPoints={[0.24, 0.55, 0.92]} detentIndex={detent} onDetentChange={setDetent} label={t('rc.title')}>
          <div className="flex flex-col gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] min-h-0 h-full">
            {card}
            {notices}
            {detent >= 1 && (
              <>
                <button type="button" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters} className="self-start h-9 px-3 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-dim)]">{t('rc.filter.toggle')}</button>
                {showFilters && <Filters counts={fac.kinds} storeys={fac.storeys} files={fac.files} classes={fac.classes} />}
                <div className="flex flex-col min-h-[240px] h-[50dvh] rounded-xl border border-[var(--border)] overflow-hidden">
                  <RevisionList rows={rows} selected={selected} reviews={reviews} marks={marks} onPick={pick} />
                </div>
                {exportsNode}
              </>
            )}
          </div>
        </MobileSheet>
      </div>
    )
  }

  return (
    <div style={colourTokens()}>
      {header}
      {blinkBadge}{curtainHandle}{fpsBadge}
      <aside className={`${panel} fixed z-[59] left-2 top-[64px] bottom-2 w-[348px] rounded-2xl flex flex-col overflow-hidden`} data-testid="rc-panel">
        <div className="p-3 flex flex-col gap-2 border-b border-[var(--border)]">
          {notices}
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--text)]">{t('rc.list', { count: rows.length })}</span>
            <button type="button" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters} className="h-7 px-2.5 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)]">{t('rc.filter.toggle')}</button>
          </div>
          {showFilters && <Filters counts={fac.kinds} storeys={fac.storeys} files={fac.files} classes={fac.classes} />}
          <div className="text-[10.5px] text-[var(--text-faint)]">{t('rc.keys')}</div>
        </div>
        <RevisionList rows={rows} selected={selected} reviews={reviews} marks={marks} onPick={pick} />
      </aside>
      <section className={`${panel} fixed z-[59] left-[364px] right-2 bottom-2 max-h-[44vh] overflow-y-auto rounded-2xl p-3`}>
        {card}
      </section>
      <span className="sr-only" aria-live="polite">{current ? phrase(current) : ''}</span>
    </div>
  )
}
