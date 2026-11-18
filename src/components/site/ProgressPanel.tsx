// ─── ProgressPanel ────────────────────────────────────────────────────────────
// Construction progress per element (light 4D): apply a status to the current
// selection, see % complete per storey or class, colour the model by status,
// save dated snapshots for the monthly certificate and export CSV.
// Not mounted yet: the host passes the element index and the selection.
// Aggregates run chunked (aggregateProgressChunked) so 100k+ elements never
// block the viewer.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewerAPI } from '../../lib/viewer'
import {
  aggregateProgressChunked, compareSnapshots, NO_GROUP, PROGRESS_STATUSES, progressCsv, progressTotals, setProgress,
  stateFromRecords, takeSnapshot,
  type GroupBy, type ProgressElement, type ProgressRow, type ProgressSnapshot, type ProgressState, type ProgressStatus,
} from '../../lib/site/progress'
import { loadProgress, saveProgress } from '../../lib/site/progress-store'
import { applyProgressColors } from '../../lib/site/progress-colors'
import { clearSiteColors, onSiteColorModeChange } from '../../lib/site/site-colors'
import { useProgressT } from '../../lib/site/progress-i18n'
import { downloadBlob } from '../compare/ui'

export interface ProgressPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** Key under which progress is stored (e.g. the federation or file name). */
  projectKey: string
  /** Every element of the loaded models, built off the UI path (e.g. a worker). */
  elements: readonly ProgressElement[]
  /** The current 3D selection. */
  selection: ReadonlyArray<Pick<ProgressElement, 'modelId' | 'expressId' | 'globalId'>>
  onClose?: () => void
}

const btn = 'h-7 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap'
const btnPrimary = 'h-7 px-3 rounded-[6px] text-[11px] font-semibold bg-[var(--accent)] text-[var(--accent-contrast,#fff)] disabled:opacity-40 whitespace-nowrap'
const today = (): string => new Date().toISOString().slice(0, 10)

export default function ProgressPanel({ viewerApiRef, projectKey, elements, selection, onClose }: ProgressPanelProps) {
  const { t, lang } = useProgressT()
  const [state, setState] = useState<ProgressState>(() => new Map())
  const [snapshots, setSnapshots] = useState<ProgressSnapshot[]>([])
  const [status, setStatus] = useState<ProgressStatus>('done')
  const [percent, setPercent] = useState(50)
  const [date, setDate] = useState(today)
  const [by, setBy] = useState<GroupBy>('storey')
  const [rows, setRows] = useState<ProgressRow[] | null>(null)
  const [colour, setColour] = useState(false)
  const [compareDate, setCompareDate] = useState('')
  const [saveError, setSaveError] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    loaded.current = false
    let alive = true
    loadProgress(projectKey).then((s) => {
      if (!alive) return
      setState(stateFromRecords(s?.records ?? [])); setSnapshots(s?.snapshots ?? []); loaded.current = true
    }).catch(() => { if (alive) { loaded.current = true; setSaveError(true) } })
    return () => { alive = false }
  }, [projectKey])

  useEffect(() => {
    if (!loaded.current) return
    saveProgress(projectKey, { records: [...state.values()], snapshots }).then(() => setSaveError(false), () => setSaveError(true))
  }, [projectKey, state, snapshots])

  useEffect(() => {
    const ac = new AbortController()
    setRows(null)
    aggregateProgressChunked(elements, state, by, { signal: ac.signal }).then(setRows, () => { /* aborted */ })
    return () => ac.abort()
  }, [elements, state, by])

  useEffect(() => { void applyProgressColors(viewerApiRef.current, state, colour) }, [viewerApiRef, state, colour])
  // Unit colouring took over: this toggle goes off. Unmount restores the palette.
  useEffect(() => onSiteColorModeChange((m) => { if (m !== 'progress') setColour(false) }), [])
  useEffect(() => () => { void clearSiteColors('progress') }, [])
  useEffect(() => { setColour(false) }, [projectKey])

  const apply = useCallback(() => {
    if (selection.length === 0) return
    setState((s) => setProgress(s, selection, { status, percent: status === 'in_progress' ? percent : undefined, date }))
  }, [selection, status, percent, date])

  const deltas = useMemo(() => {
    const from = snapshots.find((s) => s.date === compareDate)
    if (!from) return null
    return new Map(compareSnapshots(elements, from, takeSnapshot(state, today()), by).map((d) => [d.key, d]))
  }, [snapshots, compareDate, elements, state, by])

  const exportCsv = useCallback(() => {
    downloadBlob(new Blob(['﻿' + progressCsv(elements, state)], { type: 'text/csv;charset=utf-8' }), `progress-${today()}.csv`)
  }, [elements, state])

  const snapshot = useCallback(() => {
    const d = date || today()
    setSnapshots((s) => [...s.filter((x) => x.date !== d), takeSnapshot(state, d)].sort((a, b) => a.date.localeCompare(b.date)))
  }, [state, date])

  const pct = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }), [lang])
  const totals = rows ? progressTotals(rows) : null
  const label = (k: string): string => (k === NO_GROUP ? t('noStorey') : by === 'ifcClass' ? k.replace(/^IFC/i, '') : k)

  return (
    <div className="flex flex-col min-h-0 text-[var(--text)]" aria-label={t('title')}>
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-[var(--border)] flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold">{t('title')}</div>
          <div className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('subtitle')}</div>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label={t('close')} className="text-[var(--text-dim)] hover:text-[var(--text)] text-[16px] leading-none px-1">×</button>}
      </div>
      {elements.length === 0 ? <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('needModel')}</div> : (
        <>
          <div className="px-3 py-2 border-b border-[var(--border)] flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-dim)] w-full">{selection.length ? t('selection', { n: selection.length }) : t('noSelection')}</span>
            <select aria-label={t('title')} className={btn} value={status} onChange={(e) => setStatus(e.target.value as ProgressStatus)}>
              {PROGRESS_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
            </select>
            {status === 'in_progress' && (
              <input aria-label={t('percent')} type="number" min={0} max={100} className={`${btn} w-16`} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
            )}
            <input aria-label={t('date')} type="date" className={btn} value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="button" className={btnPrimary} disabled={selection.length === 0} onClick={apply}>{t('apply')}</button>
          </div>
          <div className="px-3 py-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--border)]">
            <button type="button" className={btn} aria-pressed={by === 'storey'} onClick={() => setBy('storey')}>{t('byStorey')}</button>
            <button type="button" className={btn} aria-pressed={by === 'ifcClass'} onClick={() => setBy('ifcClass')}>{t('byClass')}</button>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={colour} onChange={(e) => setColour(e.target.checked)} />{t('colour')}</label>
            <button type="button" className={btn} onClick={exportCsv}>{t('exportCsv')}</button>
            <button type="button" className={btn} onClick={snapshot}>{t('snapshot')}</button>
            {snapshots.length > 0 && (
              <select aria-label={t('compareWith')} className={btn} value={compareDate} onChange={(e) => setCompareDate(e.target.value)}>
                <option value="">{t('compareWith')}</option>
                {snapshots.map((s) => <option key={s.date} value={s.date}>{s.date}</option>)}
              </select>
            )}
          </div>
          {saveError && <div className="px-3 py-1.5 text-[11px] text-[var(--danger,#d9534f)]">{t('saveError')}</div>}
          <div className="flex-1 min-h-0 overflow-auto px-3 py-2 space-y-2">
            {!rows ? <div className="text-[11px] text-[var(--text-dim)]" aria-live="polite">{t('computing')}</div> : (
              <>
                {totals && <ProgressBar label={t('total')} row={totals} pct={pct} t={t} />}
                {rows.map((r) => {
                  const d = deltas?.get(r.key)
                  return <ProgressBar key={r.key} label={label(r.key)} row={r} pct={pct} t={t}
                    delta={d ? t('delta', { delta: (d.delta >= 0 ? '+' : '') + pct.format(d.delta), date: compareDate }) : undefined} />
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ProgressBar({ label, row, pct, t, delta }: {
  label: string; row: ProgressRow; pct: Intl.NumberFormat
  t: ReturnType<typeof useProgressT>['t']; delta?: string
}) {
  const main = row.percentVolume ?? row.percentCount
  const w = (n: number): string => `${row.total ? (n / row.total) * 100 : 0}%`
  return (
    <div className="text-[11px]">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 truncate font-medium">{label}</span>
        <span className="tabular-nums">{pct.format(main)} %</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-2,#0001)] overflow-hidden flex" role="img"
        aria-label={`${t('done')} ${row.done} · ${t('in_progress')} ${row.inProgress} · ${t('not_started')} ${row.notStarted}`}>
        <div style={{ width: w(row.done) }} className="bg-[var(--success,#3a9d5d)]" />
        <div style={{ width: w(row.inProgress) }} className="bg-[var(--warning,#d9a33a)]" />
      </div>
      <div className="text-[10px] text-[var(--text-dim)] flex gap-2">
        <span>{t('elements', { n: row.total })}</span>
        {delta && <span>{delta}</span>}
      </div>
    </div>
  )
}
