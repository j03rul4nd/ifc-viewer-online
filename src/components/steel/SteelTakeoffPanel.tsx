// ─── SteelTakeoffPanel ────────────────────────────────────────────────────────
// Steel takeoff (free, any model): count, length and weight per profile across every
// loaded model. Reads in batches on the main thread with a yield between
// them, so the viewer keeps rendering.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewerAPI } from '../../lib/viewer'
import { ViewportPanel } from '../ViewportPanel'
import { useSceneStore } from '../../stores/sceneStore'
import { useSteelStore } from '../../stores/steelStore'
import { steelClassLabel, steelPlural, steelText, useSteelT, type SteelTextKey } from '../../lib/steel/i18n'
import { STEEL_TOUR_STEPS, STEEL_TOUR_UI } from '../../lib/steel/tour'
import { GuidedTourView } from '../workspace/GuidedTour'
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
  // Closing unmounts the workspace (App renders the panel only while open):
  // its cleanup aborts the run and restores the view if it isolated anything.
  const close = useCallback(() => setOpen(false), [setOpen])
  // Phone: the bottom sheet covers the lower part of the canvas, so the view's
  // centre moves into what is left (ViewerAPI bottom inset) and an untouched
  // framing is redone there. Desktop panels float to the side: nothing to do.
  const headRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 767px)').matches) return
    let last = -1
    const tick = (): void => {
      const sheet = headRef.current?.closest<HTMLElement>('[role="dialog"]')
      const top = sheet?.getBoundingClientRect().top
      const inset = top === undefined ? 0 : Math.max(0, Math.round(window.innerHeight - top))
      if (Math.abs(inset - last) < 8) return
      last = inset
      viewerApiRef.current?.setViewportInsets({ bottom: inset })
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => { window.clearInterval(id); viewerApiRef.current?.setViewportInsets({ bottom: 0 }) }
  }, [open, viewerApiRef])
  return (
    <ViewportPanel id="steel-takeoff" open={open} onClose={close} label={t('title')} mobile="sheet" widthPx={520} maxHeight="calc(100dvh - 120px)">
      <div ref={headRef} className="shrink-0 px-3 pt-2.5 pb-2 border-b border-[var(--border)] flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
            {t('title')}
          </div>
          <div className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('subtitle')}</div>
        </div>
        <button type="button" onClick={close} aria-label={t('close')} className="text-[var(--text-dim)] hover:text-[var(--text)] text-[16px] leading-none px-1 max-md:hidden">×</button>
      </div>
      <SteelWorkspace viewerApiRef={viewerApiRef} t={t} lang={lang} onRowAction={onRowAction} />
    </ViewportPanel>
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
  const [noGeometry, setNoGeometry] = useState<string[]>([])
  /** True only while this panel has something isolated: never restore a view it did not change. */
  const isolatedRef = useRef(false)
  const restore = useCallback(() => {
    if (!isolatedRef.current) return
    isolatedRef.current = false
    try { viewerApiRef.current?.isolateElements([], false) } catch { /* viewer gone */ }
  }, [viewerApiRef])
  const panelOpen = useSteelStore((s) => s.open)

  // Unmount: abort the run, restore the view.
  useEffect(() => () => { abortRef.current?.abort(); abortRef.current = null; restore() }, [restore])
  // Closed while still mounted: same.
  useEffect(() => { if (!panelOpen) { abortRef.current?.abort(); abortRef.current = null; restore(); setActive(null) } }, [panelOpen, restore])
  // Another set of models: the table no longer describes the scene.
  const modelsKey = models.map((m) => m.id).join('|')
  const firstModels = useRef(true)
  useEffect(() => {
    if (firstModels.current) { firstModels.current = false; return }
    abortRef.current?.abort(); abortRef.current = null
    restore()
    setActive(null); setRows(null); setParts([]); setNoGeometry([]); setProgress(null)
  }, [modelsKey, restore])
  const n0 = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }), [lang])
  const n1 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [lang])
  const n2 = useMemo(() => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [lang])
  const totals = useMemo(() => (rows ? steelTotals(rows) : null), [rows])

  const run = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    abortRef.current?.abort()
    setError(null)
    const ac = new AbortController()
    abortRef.current = ac
    const mine = () => abortRef.current === ac
    const missing: string[] = []
    try {
      const list: SteelCollectModel[] = models.flatMap((m) => {
        const fragments = viewer.getFragmentsModel(m.id) as SteelCollectModel['fragments'] | null
        return fragments ? [{ id: m.id, fragments }] : []
      })
      setProgress({ done: 0, total: 0 })
      const parts = await collectSteelParts(
        list, (done, total) => { if (mine()) setProgress({ done, total }) }, ac.signal, geometryProfiles,
        (id) => missing.push(models.find((m) => m.id === id)?.fileName ?? id),
      )
      if (!mine()) return
      restore()
      setActive(null)
      setParts(parts)
      setRows(steelRows(parts))
      setNoGeometry(missing)
      if (useSteelStore.getState().autoRun) useSteelStore.getState().consumeAutoRun()
    } catch (e) {
      if (mine() && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mine()) { setProgress(null); abortRef.current = null }
    }
  }, [models, viewerApiRef, restore])

  const isolate = useCallback((r: SteelRow) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const k = rowKey(r)
    if (active === k) { restore(); setActive(null); return }
    viewer.isolateElements(r.refs.map((x) => ({ expressId: x.expressId, modelId: x.modelId })), true)
    isolatedRef.current = true
    setActive(k)
    onRowAction?.(r, r.refs)
  }, [active, onRowAction, viewerApiRef, restore])
  const showAll = useCallback(() => { restore(); setActive(null) }, [restore])
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

  // Demo link: calculate once, as soon as the hall's fragments are in the viewer.
  const autoRun = useSteelStore((s) => s.autoRun)
  useEffect(() => {
    if (!autoRun || models.length === 0) return
    let stopped = false
    let tries = 0
    const attempt = (): void => {
      if (stopped) return
      const viewer = viewerApiRef.current
      if (viewer && models.every((m) => viewer.getFragmentsModel(m.id))) {
        // Consumed only once a run finishes (in run): StrictMode's unmount
        // aborts the first one and the remount must start it again.
        void run()
        return
      }
      if (++tries < 200) window.setTimeout(attempt, 300)
    }
    attempt()
    return () => { stopped = true }
  }, [autoRun, models, run, viewerApiRef])
  const tourOn = useSteelStore((s) => s.tour)
  const tableReady = !!rows && rows.length > 0 && !progress

  if (models.length === 0) return <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('needModel')}</div>

  return (
    <div className="flex flex-col min-h-0">
      {tourOn && tableReady && <SteelTour lang={lang} />}
      <div data-tour="steel-bar" className="shrink-0 px-3 py-2 flex items-center gap-2 border-b border-[var(--border)]">
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
            {rows && rows.length > 0 && <button type="button" data-tour="steel-xlsx" className={btn} onClick={() => void exportXlsx()}>{t('exportXlsx')}</button>}
          </>
        )}
      </div>
      {error && <div className="px-3 py-2 text-[11px] text-[var(--danger,#d9534f)]">{t('error', { error })}</div>}
      {rows && !progress && noGeometry.length > 0 && (
        <div role="status" className="mx-3 mt-2 px-2 py-1.5 rounded-[6px] border border-[var(--border)] text-[11px] text-[var(--text-dim)]">
          {t('noGeometry', { files: noGeometry.join(', ') })}
        </div>
      )}
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
            <table data-tour="steel-table" className="w-full text-[11px] text-[var(--text)] tabular-nums">
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
                {rows.map((r, i) => (
                  <tr key={rowKey(r)} data-tour={i === 0 ? 'steel-row' : undefined} aria-selected={active === rowKey(r)}
                    className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-2)] ${active === rowKey(r) ? 'bg-[var(--surface-2)] outline outline-1 outline-[var(--accent)]' : ''}`}
                    onClick={() => isolate(r)}>
                    <td className={`px-2 py-1 font-medium ${r.profile === NO_PROFILE ? 'text-[var(--text-dim)] italic' : ''}`}>{r.profile === NO_PROFILE ? t('noProfile') : r.profile}</td>
                    <td className="px-2 py-1 text-[var(--text-dim)]">{steelClassLabel(lang, r.ifcClass)}</td>
                    <td className="px-2 py-1 text-right">{n0.format(r.count)}</td>
                    <td className="px-2 py-1 text-right">{n2.format(r.totalLength)}</td>
                    <td className="px-2 py-1 text-right">{n1.format(r.totalWeight)}</td>
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
                  <td className="px-2 py-1.5 text-right">{n1.format(totals.totalWeight)}</td>
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

/** The demo's guided tour, once the table is on screen. Ends for good on close. */
function SteelTour({ lang }: { lang: string }) {
  const [ready, setReady] = useState(false)
  // Let the table settle before the overlay picks its live steps.
  useEffect(() => { const id = window.setTimeout(() => setReady(true), 500); return () => window.clearTimeout(id) }, [])
  const tx = useCallback((text: string, vars?: Record<string, unknown>) =>
    steelText(lang, (STEEL_TOUR_UI[text] ?? text) as SteelTextKey, vars as Record<string, string | number> | undefined), [lang])
  const onClose = useCallback(() => useSteelStore.getState().setTour(false), [])
  if (!ready) return null
  return <GuidedTourView title="tourTitle" steps={STEEL_TOUR_STEPS} onClose={onClose} zIndex={70} tx={tx} />
}
