// ─── Units panel: dwelling status on the IFC model ────────────────────────────
// Content only: the host (Sidebar / ViewportPanel) mounts it. Reads IfcSpace /
// IfcZone of the loaded models, keeps statuses in IndexedDB per project,
// colours and isolates units in 3D, and round-trips a CSV.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewerAPI } from '../../lib/viewer'
import { useSceneStore } from '../../stores/sceneStore'
import { downloadBlob } from '../compare/ui'
import {
  UNIT_STATUSES, NO_STOREY, applyStates, collectUnits, countByStatus, groupByStorey, mergeCsv, statesOf, unitsCsv,
  type Unit, type UnitStatus, type UnitsFragmentsLike,
} from '../../lib/site/units'
import { loadUnitStates, projectKey, saveUnitStates } from '../../lib/site/unit-store'
import { STATUS_COLORS, applyUnitColors, clearUnitColors, isolateUnits } from '../../lib/site/unit-colors'
import { useUnitsT, type UnitsTextKey } from '../../lib/site/units-i18n'

interface Props { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }

const btn = 'h-7 max-md:h-9 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] max-md:text-[12.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap'
const btnPrimary = 'h-7 max-md:h-9 px-3 rounded-[6px] text-[11px] max-md:text-[12.5px] font-semibold bg-[var(--accent)] text-[var(--accent-contrast,#fff)] disabled:opacity-40 whitespace-nowrap'
const input = 'h-7 max-md:h-9 px-2 rounded-[6px] border border-[var(--border)] bg-transparent text-[11px] text-[var(--text)]'

export default function UnitsPanel({ viewerApiRef }: Props) {
  const { t, lang } = useUnitsT()
  const models = useSceneStore((s) => s.models)
  const project = useMemo(() => projectKey(models.map((m) => m.fileName ?? m.id)), [models])
  const [units, setUnits] = useState<Unit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<UnitStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [colorOn, setColorOn] = useState(false)
  const [isolated, setIsolated] = useState<string | null>(null)
  const painted = useRef<Map<string, number[]>>(new Map())
  const fileRef = useRef<HTMLInputElement>(null)
  const sl = useCallback((s: UnitStatus) => t(`s_${s}` as UnitsTextKey), [t])
  const n1 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [lang])

  const uncolor = useCallback(async () => {
    const v = viewerApiRef.current
    if (v && painted.current.size) await clearUnitColors(v, painted.current)
    painted.current = new Map()
  }, [viewerApiRef])
  const unisolate = useCallback(() => {
    const v = viewerApiRef.current
    if (v && isolated) { try { isolateUnits(v, [], false) } catch { /* viewer gone */ } }
    setIsolated(null)
  }, [viewerApiRef, isolated])

  // Restore the view on unmount.
  const cleanupRef = useRef({ uncolor, unisolate })
  cleanupRef.current = { uncolor, unisolate }
  useEffect(() => () => { void cleanupRef.current.uncolor(); cleanupRef.current.unisolate() }, [])

  const run = useCallback(async () => {
    const v = viewerApiRef.current
    if (!v) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const list = models.flatMap((m) => {
        const f = v.getFragmentsModel(m.id) as UnitsFragmentsLike | null
        return f ? [{ id: m.id, fragments: f }] : []
      })
      const read = await collectUnits(list)
      let states = {}
      try { states = await loadUnitStates(project) } catch { /* no persistence */ }
      setUnits(applyStates(read, states))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }, [models, project, viewerApiRef])

  // Models changed: the old list no longer applies.
  useEffect(() => { setUnits(null); setIsolated(null); painted.current = new Map() }, [project])

  const commit = useCallback((next: Unit[]) => {
    setUnits(next)
    saveUnitStates(project, statesOf(next)).catch(() => setMessage(t('saveFailed')))
  }, [project, t])

  const patch = (id: string, p: Partial<Unit>) => units && commit(units.map((u) => (u.id === id ? { ...u, ...p } : u)))

  // Colour follows the statuses while the toggle is on.
  useEffect(() => {
    const v = viewerApiRef.current
    if (!v || !units) return
    let live = true
    void (async () => {
      await uncolor()
      if (live && colorOn) painted.current = await applyUnitColors(v, units)
    })()
    return () => { live = false }
  }, [colorOn, units, viewerApiRef, uncolor])

  const isolate = (u: Unit) => {
    const v = viewerApiRef.current
    if (!v) return
    if (isolated === u.id) { unisolate(); return }
    isolateUnits(v, [u]); setIsolated(u.id)
  }

  const exportCsv = () => {
    if (!units) return
    downloadBlob(new Blob(['﻿' + unitsCsv(units)], { type: 'text/csv;charset=utf-8' }), 'units.csv')
  }
  const importCsv = async (file: File) => {
    if (!units) return
    const r = mergeCsv(units, await file.text())
    commit(r.units)
    setMessage(t('imported', { matched: r.matched, unmatched: r.unmatched.length, bad: r.badStatus }))
  }

  const visible = useMemo(() => {
    if (!units) return []
    const q = query.trim().toLowerCase()
    return units.filter((u) => (filter === 'all' || u.status === filter)
      && (!q || u.name.toLowerCase().includes(q) || (u.buyer ?? '').toLowerCase().includes(q)))
  }, [units, filter, query])
  const groups = useMemo(() => groupByStorey(visible), [visible])
  const counts = useMemo(() => countByStatus(units ?? []), [units])

  if (models.length === 0) return <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('needModel')}</div>

  return (
    <div className="flex flex-col min-h-0 text-[var(--text)]">
      <div className="px-3 pt-3 pb-1">
        <div className="text-[13px] font-semibold">{t('title')}</div>
        <div className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('subtitle')}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-[var(--border)]">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void run()}>
          {busy ? t('reading') : units ? t('rerun') : t('run')}
        </button>
        {units && units.length > 0 && <>
          <label className="flex items-center gap-1 text-[11px]">
            <input type="checkbox" checked={colorOn} onChange={(e) => setColorOn(e.target.checked)} />{t('colorBy')}
          </label>
          {isolated && <button type="button" className={btn} onClick={unisolate}>{t('showAll')}</button>}
          <button type="button" className={btn} onClick={() => fileRef.current?.click()}>{t('importCsv')}</button>
          <button type="button" className={btn} onClick={exportCsv}>{t('exportCsv')}</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importCsv(f) }} />
        </>}
      </div>
      {error && <div className="px-3 py-2 text-[11px] text-[var(--danger,#d9534f)]">{t('error', { error })}</div>}
      {message && <div className="px-3 py-2 text-[11px] text-[var(--text-dim)]" aria-live="polite">{message}</div>}
      {units && units.length === 0 && <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('empty')}</div>}
      {units && units.length > 0 && <>
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {UNIT_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-[10.5px] border ${filter === s ? 'border-[var(--accent)]' : 'border-transparent'}`}>
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS[s] }} />
              {sl(s)} <span className="text-[var(--text-dim)]">{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 px-3 pb-2">
          <input className={`${input} flex-1`} value={query} placeholder={t('search')} aria-label={t('search')} onChange={(e) => setQuery(e.target.value)} />
          <select className={input} value={filter} aria-label={t('status')} onChange={(e) => setFilter(e.target.value as UnitStatus | 'all')}>
            <option value="all">{t('filterAll')}</option>
            {UNIT_STATUSES.map((s) => <option key={s} value={s}>{sl(s)}</option>)}
          </select>
        </div>
        <div className="overflow-auto min-h-0 px-1 pb-2">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[var(--text-dim)]">
                <th className="px-2 py-1 font-medium">{t('unit')}</th>
                <th className="px-2 py-1 font-medium text-right">{t('area')}</th>
                <th className="px-2 py-1 font-medium">{t('status')}</th>
                <th className="px-2 py-1 font-medium">{t('buyer')}</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.storey}>
                <tr><td colSpan={4} className="px-2 pt-2 pb-1 text-[10.5px] font-semibold text-[var(--text-dim)]">
                  {g.storey === NO_STOREY ? t('noStorey') : g.storey} · {g.units.length}
                </td></tr>
                {g.units.map((u) => (
                  <tr key={u.id} className={`border-t border-[var(--border)] ${isolated === u.id ? 'bg-[var(--surface-2,rgba(127,127,127,.12))]' : ''}`}>
                    <td className="px-2 py-1">
                      <button type="button" title={t('isolate')} className="text-left hover:underline" onClick={() => isolate(u)}>
                        <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: STATUS_COLORS[u.status] }} />{u.name}
                      </button>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{u.area === null ? '—' : n1.format(u.area)}</td>
                    <td className="px-2 py-1">
                      <select className={input} value={u.status} aria-label={`${t('status')} ${u.name}`}
                        onChange={(e) => patch(u.id, { status: e.target.value as UnitStatus })}>
                        {UNIT_STATUSES.map((s) => <option key={s} value={s}>{sl(s)}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input className={`${input} w-full`} defaultValue={u.buyer ?? ''} aria-label={`${t('buyer')} ${u.name}`}
                        onBlur={(e) => { const b = e.target.value.trim() || undefined; if (b !== u.buyer) patch(u.id, { buyer: b }) }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </>}
    </div>
  )
}
