// ─── SteelTakeoffPanel ────────────────────────────────────────────────────────
// Steel takeoff (Pro): count, length and weight per profile across every
// loaded model. Reads in batches on the main thread with a yield between
// them, so the viewer keeps rendering. Free plans see what it does and the
// plans page; nothing that was free before is behind this.

import React, { useCallback, useMemo, useRef, useState } from 'react'
import type { ViewerAPI } from '../../lib/viewer'
import { ViewportPanel } from '../ViewportPanel'
import RequirePlan from '../pro/RequirePlan'
import { useSceneStore } from '../../stores/sceneStore'
import { useSteelStore } from '../../stores/steelStore'
import { steelClassLabel, steelPlural, useSteelT, type SteelTextKey } from '../../lib/steel/i18n'
import { NO_PROFILE } from '../../lib/steel/takeoff'
import { geometryProfiles } from '../../lib/steel/profiles-run'
import {
  collectSteelParts, steelRows, steelTotals, type CollectedPart, type SteelCollectModel, type SteelPartRef, type SteelRow,
} from '../../lib/steel/collect'
import { steelCsv, steelFileBase, steelXlsx } from '../../lib/steel/export'
import { downloadBlob } from '../compare/ui'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** Extra hook on a row click (after the built-in isolate). */
  onRowAction?: (row: SteelRow, refs: SteelPartRef[]) => void
}

type T = (key: SteelTextKey, vars?: Record<string, string | number>) => string

const btnPrimary = 'h-7 max-md:h-9 px-3 rounded-[6px] text-[11px] max-md:text-[12.5px] font-semibold bg-[var(--accent)] text-[var(--accent-contrast,#fff)] disabled:opacity-40 whitespace-nowrap'
const btn = 'h-7 max-md:h-9 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] max-md:text-[12.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap'

export default function SteelTakeoffPanel({ viewerApiRef, onRowAction }: Props) {
  const { t, lang } = useSteelT()
  const open = useSteelStore((s) => s.open)
  const setOpen = useSteelStore((s) => s.setOpen)
  const close = useCallback(() => {
    setOpen(false)
    try { viewerApiRef.current?.isolateElements([], false) } catch { /* viewer gone */ }
  }, [setOpen, viewerApiRef])
  return (
    <ViewportPanel id="steel-takeoff" open={open} onClose={close} label={t('title')} mobile="sheet" widthPx={520} maxHeight="calc(100dvh - 120px)">
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-[var(--border)] flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
            {t('title')}
            <span className="text-[9.5px] font-mono uppercase tracking-[0.08em] px-1.5 py-[1px] rounded border border-[var(--border)] text-[var(--text-dim)]">Pro</span>
          </div>
          <div className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('subtitle')}</div>
        </div>
        <button type="button" onClick={close} aria-label={t('close')} className="text-[var(--text-dim)] hover:text-[var(--text)] text-[16px] leading-none px-1 max-md:hidden">×</button>
      </div>
      <RequirePlan plan="pro" fallback={<Upsell t={t} />}>
        <SteelWorkspace viewerApiRef={viewerApiRef} t={t} lang={lang} onRowAction={onRowAction} />
      </RequirePlan>
    </ViewportPanel>
  )
}

function Upsell({ t }: { t: T }) {
  return (
    <div className="p-3 space-y-2.5">
      <div className="text-[12px] font-semibold text-[var(--text)]">{t('upsellTitle')}</div>
      <p className="text-[11.5px] leading-relaxed text-[var(--text-dim)]">{t('upsellBody')}</p>
      <a href="/pricing/" className={`${btnPrimary} inline-flex items-center`}>{t('upsellCta')}</a>
    </div>
  )
}

const rowKey = (r: SteelRow): string => `${r.profile}\u0000${r.ifcClass ?? ''}`

function SteelWorkspace({ viewerApiRef, t, lang, onRowAction }: { viewerApiRef: Props['viewerApiRef']; t: T; lang: string; onRowAction?: Props['onRowAction'] }) {
  const models = useSceneStore((s) => s.models)
  const [rows, setRows] = useState<SteelRow[] | null>(null)
  const [parts, setParts] = useState<CollectedPart[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const n0 = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }), [lang])
  const n2 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [lang])
  const totals = useMemo(() => (rows ? steelTotals(rows) : null), [rows])

  const run = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    setError(null)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const list: SteelCollectModel[] = models.flatMap((m) => {
        const fragments = viewer.getFragmentsModel(m.id) as SteelCollectModel['fragments'] | null
        return fragments ? [{ id: m.id, fragments }] : []
      })
      setProgress({ done: 0, total: 0 })
      const parts = await collectSteelParts(list, (done, total) => setProgress({ done, total }), ac.signal, geometryProfiles)
      viewer.isolateElements([], false)
      setActive(null)
      setParts(parts)
      setRows(steelRows(parts))
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }, [models, viewerApiRef])

  const isolate = useCallback((r: SteelRow) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const k = rowKey(r)
    if (active === k) { viewer.isolateElements([], false); setActive(null); return }
    viewer.isolateElements(r.refs.map((x) => ({ expressId: x.expressId, modelId: x.modelId })), true)
    setActive(k)
    onRowAction?.(r, r.refs)
  }, [active, onRowAction, viewerApiRef])
  const showAll = useCallback(() => { viewerApiRef.current?.isolateElements([], false); setActive(null) }, [viewerApiRef])
  const fileBase = useMemo(() => steelFileBase(models.map((m) => m.fileName)), [models])
  const modelName = useCallback((id: string) => models.find((m) => m.id === id)?.fileName ?? id, [models])
  const exportCsv = useCallback(() => { if (rows) downloadBlob(new Blob([steelCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`) }, [rows, fileBase])
  const exportXlsx = useCallback(async () => {
    if (!rows) return
    try {
      const bytes = await steelXlsx(rows, parts, modelName)
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase}.xlsx`)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [rows, parts, modelName, fileBase])

  if (models.length === 0) return <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('needModel')}</div>

  return (
    <div className="flex flex-col min-h-0">
      <div className="shrink-0 px-3 py-2 flex items-center gap-2 border-b border-[var(--border)]">
        {progress ? (
          <>
            <span className="text-[11px] text-[var(--text-dim)] flex-1" aria-live="polite">{t('reading', { done: progress.done, total: progress.total })}</span>
            <button type="button" className={btn} onClick={() => abortRef.current?.abort()}>{t('cancel')}</button>
          </>
        ) : (
          <>
            <button type="button" className={btnPrimary} onClick={() => void run()}>{rows ? t('rerun') : t('run')}</button>
            <span className="flex-1" />
            {active && <button type="button" className={btn} onClick={showAll}>{t('showAll')}</button>}
            {rows && rows.length > 0 && <button type="button" className={btn} onClick={exportCsv}>{t('exportCsv')}</button>}
            {rows && rows.length > 0 && <button type="button" className={btn} onClick={() => void exportXlsx()}>{t('exportXlsx')}</button>}
          </>
        )}
      </div>
      {error && <div className="px-3 py-2 text-[11px] text-[var(--danger,#d9534f)]">{t('error', { error })}</div>}
      {rows && !progress && rows.length === 0 && (
        <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('empty')}</div>
      )}
      {rows && !progress && rows.length > 0 && totals && (
        <>
          {totals.missingWeight > 0 && (
            <div role="status" className="mx-3 mt-2 px-2 py-1.5 rounded-[6px] border border-[var(--border)] text-[11px] text-[var(--warning,#e0a030)]">
              {steelPlural(lang, 'missingWarn', totals.missingWeight)}
            </div>
          )}
          <div className="px-3 pt-2 text-[10.5px] text-[var(--text-dim)]">{t('isolateHint')}</div>
          <div className="overflow-auto min-h-0 px-1 pb-2">
            <table className="w-full text-[11px] text-[var(--text)] tabular-nums">
              <thead className="text-[var(--text-dim)] text-left">
                <tr>
                  <th className="px-2 py-1.5 font-medium">{t('profile')}</th>
                  <th className="px-2 py-1.5 font-medium">{t('cls')}</th>
                  <th className="px-2 py-1.5 font-medium text-right">{t('count')}</th>
                  <th className="px-2 py-1.5 font-medium text-right">{t('length')}</th>
                  <th className="px-2 py-1.5 font-medium text-right">{t('weight')}</th>
                  <th className="px-2 py-1.5 font-medium">{t('material')}</th>
                  <th className="px-2 py-1.5 font-medium text-right">{t('noWeight')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={rowKey(r)} aria-selected={active === rowKey(r)}
                    className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-2)] ${active === rowKey(r) ? 'bg-[var(--surface-2)] outline outline-1 outline-[var(--accent)]' : ''}`}
                    onClick={() => isolate(r)}>
                    <td className={`px-2 py-1 font-medium ${r.profile === NO_PROFILE ? 'text-[var(--text-dim)] italic' : ''}`}>{r.profile === NO_PROFILE ? t('noProfile') : r.profile}</td>
                    <td className="px-2 py-1 text-[var(--text-dim)]">{steelClassLabel(lang, r.ifcClass)}</td>
                    <td className="px-2 py-1 text-right">{n0.format(r.count)}</td>
                    <td className="px-2 py-1 text-right">{n2.format(r.totalLength)}</td>
                    <td className="px-2 py-1 text-right">{n0.format(r.totalWeight)}</td>
                    <td className="px-2 py-1 text-[var(--text-dim)] truncate max-w-[120px]" title={r.materials.join(', ')}>{r.materials.join(', ')}</td>
                    <td className="px-2 py-1 text-right">{r.missingWeight > 0 ? n0.format(r.missingWeight) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border-strong)] font-semibold">
                  <td className="px-2 py-1.5" colSpan={2}>{t('total')}</td>
                  <td className="px-2 py-1.5 text-right">{n0.format(totals.count)}</td>
                  <td className="px-2 py-1.5 text-right">{n2.format(totals.totalLength)}</td>
                  <td className="px-2 py-1.5 text-right">{n0.format(totals.totalWeight)}</td>
                  <td />
                  <td className="px-2 py-1.5 text-right">{totals.missingWeight > 0 ? n0.format(totals.missingWeight) : ''}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
