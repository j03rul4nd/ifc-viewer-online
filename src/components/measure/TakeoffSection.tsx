// ─── TakeoffSection ───────────────────────────────────────────────────────────
// Quantity takeoff of the current selection, from the quantities the IFC
// carries (Qto_*). Grouped by class, type or storey; one value per kind per
// element (net before gross — see lib/measure/takeoff); coverage shown so a
// partial sum never passes for a complete one. Copy as a table or CSV.
//
// Runs on demand, not on every selection change: reading psets for 2 000
// elements is a few hundred milliseconds the orbit should not pay for.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import type { MeasureSettings } from '../../lib/measure/measure-types'
import {
  computeTakeoff, TAKEOFF_DEFAULT_UNIT, type TakeoffElement, type TakeoffGroupBy, type TakeoffKind, type TakeoffResult,
} from '../../lib/measure/takeoff'
import { decimalSeparator, exportNumber, formatNumber, toDelimited } from '../../lib/measure/measure-math'
import { shareOrDownload } from '../../lib/share-file'
import { trackFeatureUsed } from '../../lib/analytics'
import { fileNameOfModelId } from '../../lib/loading/model-id'

type Kind = Exclude<TakeoffKind, 'count'>
const KINDS: readonly Kind[] = ['length', 'area', 'volume', 'weight']
/** Above this the read is still fine, but say how many before doing it. */
const MAX_ELEMENTS = 5000

export interface SelectionRef { modelId?: string | null; expressId: number }

export function TakeoffSection({ selection, viewerApiRef, settings, onFlash }: {
  selection: readonly SelectionRef[]
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  settings: MeasureSettings
  onFlash(message: string): void
}) {
  const { t } = useTranslation('measurement')
  const [elements, setElements] = useState<TakeoffElement[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<TakeoffGroupBy>('class')

  // A new selection makes the old takeoff wrong: drop it rather than show it.
  useEffect(() => { setElements(null) }, [selection])

  const run = useCallback(async () => {
    const api = viewerApiRef.current
    if (!api) return
    setLoading(true)
    try {
      const byModel = new Map<string, number[]>()
      for (const s of selection.slice(0, MAX_ELEMENTS)) {
        if (!s.modelId) continue
        const list = byModel.get(s.modelId) ?? []
        list.push(s.expressId)
        byModel.set(s.modelId, list)
      }
      const out: TakeoffElement[] = []
      for (const [modelId, ids] of byModel) {
        const rows = await api.getElementsDetail(ids, modelId)
        for (const r of rows) {
          if (!r.data) continue
          out.push({ ifcClass: r.data.ifcClass, typeName: r.data.typeName, storey: r.data.storey, model: fileNameOfModelId(modelId), quantitySets: r.data.quantitySets })
        }
      }
      setElements(out)
      trackFeatureUsed({ feature: 'takeoff' })
    } finally {
      setLoading(false)
    }
  }, [selection, viewerApiRef])

  const result: TakeoffResult | null = useMemo(() => (elements ? computeTakeoff(elements, groupBy) : null), [elements, groupBy])
  const shownKinds = useMemo(() => (result ? KINDS.filter((k) => result.rows.some((r) => r.measures[k])) : []), [result])

  const unitOf = (k: Kind, unit: string | null) => unit ?? TAKEOFF_DEFAULT_UNIT[k]
  const fmt = (v: number) => formatNumber(v, v !== 0 && Math.abs(v) < 10 ? 3 : 2, settings.locale)

  const buildRows = useCallback((): string[][] => {
    if (!result) return []
    const header = [t(`takeoff.groupBy.${groupBy}`), t('takeoff.count')]
    for (const k of shownKinds) header.push(t(`takeoff.kinds.${k}`), t('export.unit'), t('takeoff.coverage'), t('takeoff.source'))
    const rows = [header]
    for (const r of result.rows) {
      const row = [r.label ?? t('takeoff.none'), String(r.count)]
      for (const k of shownKinds) {
        const m = r.measures[k]
        if (!m) { row.push('', '', `0/${r.count}`, ''); continue }
        row.push(m.mixedUnits ? '' : exportNumber(m.total, 3, settings.locale), m.mixedUnits ? t('takeoff.mixed') : unitOf(k, m.unit), `${m.covered}/${r.count}`, m.sources.join(' · '))
      }
      rows.push(row)
    }
    return rows
  }, [result, groupBy, shownKinds, settings.locale, t])

  const copy = useCallback(async () => {
    const rows = buildRows()
    try { await navigator.clipboard.writeText(toDelimited(rows, '\t')); onFlash(t('actions.copiedAll', { count: rows.length - 1 })) } catch { onFlash(t('actions.copyFailed')) }
  }, [buildRows, onFlash, t])

  const csv = useCallback(() => {
    const rows = buildRows()
    const sep = decimalSeparator(settings.locale) === ',' ? ';' : ','
    const blob = new Blob(['﻿' + toDelimited(rows, sep)], { type: 'text/csv;charset=utf-8' })
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    void shareOrDownload(blob, `${t('takeoff.filename')}-${stamp}.csv`)
  }, [buildRows, settings.locale, t])

  if (selection.length === 0) return null

  return (
    <div className="border-b border-[var(--border)] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="text-[9.5px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)] flex-1">{t('takeoff.title')}</div>
        {!result && (
          <button type="button" onClick={() => void run()} disabled={loading}
            className="px-2 py-1 rounded-[6px] text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--surface-2)] disabled:opacity-50">
            {loading ? t('takeoff.loading') : t('takeoff.run', { count: Math.min(selection.length, MAX_ELEMENTS) })}
          </button>
        )}
      </div>
      {!result && <div className="mt-0.5 text-[9.5px] leading-snug text-[var(--text-faint)]">{t('takeoff.hint')}</div>}
      {result && (
        <>
          <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label={t('takeoff.groupLabel')}>
            {(['class', 'type', 'storey', 'model'] as const).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={groupBy === g} onClick={() => setGroupBy(g)}
                className={['px-1.5 py-0.5 rounded-full text-[10px] border', groupBy === g ? 'border-[var(--accent)] text-[var(--text)] bg-[rgba(94,106,210,0.12)]' : 'border-[var(--border)] text-[var(--text-dim)]'].join(' ')}>
                {t(`takeoff.groupBy.${g}`)}
              </button>
            ))}
          </div>
          <div className="mt-1.5 max-h-[220px] overflow-auto rounded-[6px] border border-[var(--border)]">
            <table className="w-full text-[10.5px] tabular-nums">
              <thead className="sticky top-0 bg-[var(--surface-2)] text-[var(--text-faint)]">
                <tr>
                  <th className="text-left font-medium px-1.5 py-1">{t(`takeoff.groupBy.${groupBy}`)}</th>
                  <th className="text-right font-medium px-1.5 py-1">{t('takeoff.count')}</th>
                  {shownKinds.map((k) => <th key={k} className="text-right font-medium px-1.5 py-1">{t(`takeoff.kinds.${k}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.key} className="border-t border-[var(--border)]">
                    <td className="px-1.5 py-1 text-[var(--text-dim)] max-w-[110px] truncate" title={r.label ?? ''}>{r.label ?? t('takeoff.none')}</td>
                    <td className="px-1.5 py-1 text-right font-mono text-[var(--text)]">{r.count}</td>
                    {shownKinds.map((k) => {
                      const m = r.measures[k]
                      if (!m) return <td key={k} className="px-1.5 py-1 text-right text-[var(--text-faint)]">—</td>
                      const partial = m.covered < r.count
                      return (
                        <td key={k} className="px-1.5 py-1 text-right font-mono text-[var(--text)] whitespace-nowrap"
                          title={`${m.sources.join(' · ')} — ${t('takeoff.coverageOf', { covered: m.covered, count: r.count })}`}>
                          {m.mixedUnits ? t('takeoff.mixed') : `${fmt(m.total)} ${unitOf(k, m.unit)}`}
                          {partial && <span className="ml-0.5 text-[#FFB224]" aria-label={t('takeoff.partial')}>*</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.withoutQuantities > 0 && (
            <div className="mt-1 text-[9.5px] leading-snug text-[#FFB224]">
              {t('takeoff.missing', { count: result.withoutQuantities, total: result.count })}
            </div>
          )}
          <div className="mt-1 text-[9.5px] leading-snug text-[var(--text-faint)]">{t('takeoff.note')}</div>
          <div className="mt-1 flex items-center gap-1">
            <button type="button" onClick={() => void copy()} className="px-2 py-1 rounded-[6px] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]">{t('actions.copyAll')}</button>
            <button type="button" onClick={csv} className="px-2 py-1 rounded-[6px] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]">{t('actions.export')}</button>
            <div className="flex-1" />
            <button type="button" onClick={() => void run()} className="px-2 py-1 rounded-[6px] text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text)]">{t('takeoff.refresh')}</button>
          </div>
        </>
      )}
    </div>
  )
}
