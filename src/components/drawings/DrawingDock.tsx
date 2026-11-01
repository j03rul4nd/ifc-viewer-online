// ─── Drawings dock ────────────────────────────────────────────────────────────
// The sheets next to the model: DXF and PDF as references, plans and sections
// cut from the IFC and the scan, markup, alignment, export. Lazy, because pdf.js
// and this whole pane mean nothing to someone who never opens a sheet. This file
// owns the frame and the canvas; the inspector is DrawingPanels. See docs/DRAWINGS.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import { useDrawingStore, withIds, type DrawingTool } from '../../stores/drawingStore'
import { useUIStore } from '../../stores/uiStore'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { bindingState, deviceKey, effectOf } from '../../lib/twin/devices'
import { trackFeatureUsed } from '../../lib/analytics'
import { downloadFile } from '../../lib/share-file'
import { DrawingImportError, importDrawingFile, pdfBytes, readPdfVectors, rememberPdf, renderPdfPage } from '../../lib/drawing/import-file'
import { drawingToDxf, drawingToPdf, drawingToSvg, pdfHasUnencodable, type PdfImage } from '../../lib/drawing/export'
import { loadSheets, saveSheets } from '../../lib/drawing/persist'
import { createDrawingOverlay, type DrawingOverlay } from '../../lib/drawing/overlay-3d'
import { IDENTITY, robustBounds, type Drawing, type Pt } from '../../lib/drawing/types'
import DrawingCanvas, { type CanvasHandle, type LiveMarker } from './DrawingCanvas'
import { btn, CreatePanel, cutPlan, field, INSPECTOR_TABS, LayersPanel, OutputPanel, ScenePanel, SheetPanel, type InspectorTab, type OutputOptions } from './DrawingPanels'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** Fixed box in the window; App computes it next to the viewer. */
  style: React.CSSProperties
  /** Width handle for the desktop dock. */
  onResize?: (px: number) => void
}

const TOOLS: { id: DrawingTool; glyph: string }[] = [
  { id: 'select', glyph: 'M3 2l9 5-4 1-1 4z' },
  { id: 'pan', glyph: 'M7 1v12M1 7h12M7 1L5 3M7 1l2 2M7 13l-2-2M7 13l2-2M1 7l2-2M1 7l2 2M13 7l-2-2M13 7l-2 2' },
  { id: 'line', glyph: 'M2 12L12 2' },
  { id: 'polyline', glyph: 'M1 12l4-8 4 5 4-7' },
  { id: 'rect', glyph: 'M2 3h10v8H2z' },
  { id: 'circle', glyph: 'M7 2a5 5 0 1 0 0 10A5 5 0 0 0 7 2z' },
  { id: 'text', glyph: 'M2 3h10M7 3v9M5 12h4' },
  { id: 'dimension', glyph: 'M1 4v6M13 4v6M1 7h12M1 7l2-1.5M1 7l2 1.5M13 7l-2-1.5M13 7l-2 1.5' },
  { id: 'calibrate', glyph: 'M1 5h12v4H1zM4 5v2M7 5v2M10 5v2' },
  { id: 'align', glyph: 'M3 3a1.5 1.5 0 1 0 0 .01M11 11a1.5 1.5 0 1 0 0 .01M4 4l6 6' },
]

const TAB_KEY = 'ifc-drawings-tab:v1'
const readTab = (): InspectorTab => {
  try { const v = localStorage.getItem(TAB_KEY) as InspectorTab | null; return v && INSPECTOR_TABS.includes(v) ? v : 'create' } catch { return 'create' }
}

/** `?drawings=plan`: a link that opens with the first plan cut, for articles and demos. */
const deepLink = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('drawings'))

export default function DrawingDock({ viewerApiRef, style, onResize }: Props) {
  const { t } = useTranslation('drawings')
  const s = useDrawingStore()
  const active = s.drawings.find((d) => d.id === s.activeId) ?? null
  const canvas = useRef<CanvasHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [side, setSide] = useState(true)
  const [tab, setTabState] = useState<InspectorTab>(readTab)
  const setTab = (next: InspectorTab) => { setTabState(next); setSide(true); try { localStorage.setItem(TAB_KEY, next) } catch { /* a convenience */ } }
  const [pdfInfo, setPdfInfo] = useState<Record<string, { lines: number; texts: number }>>({})
  const [ask, setAsk] = useState<{ kind: 'text'; at: Pt } | { kind: 'length'; units: number } | null>(null)
  const [askValue, setAskValue] = useState('')

  const fmt = useCallback((m: number) => (m >= 100 ? `${m.toFixed(1)} m` : m >= 1 ? `${m.toFixed(2)} m` : `${(m * 1000).toFixed(0)} mm`), [])

  // The properties column would take what is left of the model's half.
  useEffect(() => { useUIStore.getState().setSidebarExpanded(false) }, [])

  // ── Import
  const open = useCallback(async (files: File[]) => {
    setError(null); setNotice(null); setBusy(true)
    try {
      for (const file of files) {
        try {
          const r = await importDrawingFile(file)
          const id = useDrawingStore.getState().addDrawing(r.input)
          if (r.pdf) rememberPdf(id, r.pdf)
          if (r.pdfVectors) {
            const { lines, texts, truncated } = r.pdfVectors
            setPdfInfo((m) => ({ ...m, [id]: { lines, texts } }))
            if (truncated) setNotice(t('import.pdfTruncated'))
          }
          trackFeatureUsed({ feature: 'drawing_import' })
          const skipped = Object.entries(r.input.skipped ?? {})
          if (skipped.length) setNotice(t('import.skipped', { list: skipped.map(([k, n]) => `${k} ×${n}`).join(', ') }))
        } catch (err) {
          const code = err instanceof DrawingImportError ? err.code : 'unknown'
          const detail = err instanceof DrawingImportError ? err.detail : String(err)
          setError(t(`errors.${code}`, { name: file.name, detail }))
          if (code === 'dwg') trackFeatureUsed({ feature: 'drawing_dwg_refused' })
        }
      }
    } finally { setBusy(false) }
  }, [t])

  const pendingCount = s.pendingFiles.length
  useEffect(() => {
    if (pendingCount) void open(useDrawingStore.getState().takePendingFiles())
  }, [pendingCount, open])

  // ── Saved in this browser
  const [storageFailed, setStorageFailed] = useState(false)
  const hydrated = useRef(!!deepLink()) // a demo link neither reads nor overwrites someone's sheets
  useEffect(() => {
    if (hydrated.current) return
    let dead = false
    void loadSheets().then((list) => {
      if (dead) return
      for (const x of list) if (x.pdf) rememberPdf(x.drawing.id, x.pdf)
      useDrawingStore.getState().hydrate(list.map((x) => x.drawing))
    }).catch(() => setStorageFailed(true)).finally(() => { hydrated.current = true })
    return () => { dead = true }
  }, [])
  const saved = useRef(new Map<string, Drawing>())
  useEffect(() => {
    if (deepLink()) return
    const id = setTimeout(() => {
      if (!hydrated.current) return
      const list = useDrawingStore.getState().drawings
      const put = list.filter((d) => saved.current.get(d.id) !== d).map((drawing) => ({ drawing, pdf: pdfBytes(drawing.id), order: list.indexOf(drawing) }))
      if (!put.length && saved.current.size === list.length) return
      saveSheets(put, list.map((d) => d.id))
        .then(() => { saved.current = new Map(list.map((d) => [d.id, d])); setStorageFailed(false) })
        .catch(() => setStorageFailed(true))
    }, 800)
    return () => clearTimeout(id)
  }, [s.drawings])

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null)
    // A frame for "working" to paint: the soups are read on this thread.
    await new Promise((r) => setTimeout(r, 30))
    try { await work() } catch (err) {
      setError(t('errors.cutFailed', { detail: err instanceof Error ? err.message : String(err) }))
    } finally { setBusy(false) }
  }, [t])
  const shared = { viewerApiRef, active, busy, run, fail: setError, say: setNotice }

  // ── Deep link: the plan appears by itself once the models are in
  useEffect(() => {
    if (deepLink() !== 'plan') return
    let dead = false
    let tries = 0
    const tick = async () => {
      if (dead) return
      const api = viewerApiRef.current
      const box = api?.drawingSceneBounds()
      if (!api || !box) { if (tries++ < 180) setTimeout(() => void tick(), 1000); return }
      const levels = await api.getStoreyLevels().catch(() => [])
      const baseY = levels[0]?.y ?? box.min.y
      await run(async () => {
        const c = await cutPlan(api, baseY + 1.2, { beyond: 2.5, poche: true })
        if (dead || !c.entities.length) return
        const st = useDrawingStore.getState()
        const id = st.addDrawing({ name: t('generate.planName', { level: levels[0]?.name ?? '', height: 1.2 }), source: 'plan', layers: c.layers, entities: c.entities, metresPerUnit: 1, placement: IDENTITY, elevation: baseY })
        st.patch(id, { in3d: true })
        setTab('scene')
      })
    }
    void tick()
    return () => { dead = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3D overlay
  const overlay = useRef<DrawingOverlay | null>(null)
  useEffect(() => {
    const anyIn3d = s.drawings.some((d) => d.in3d)
    const api = viewerApiRef.current
    if (!api) return
    if (anyIn3d && !overlay.current) {
      const host = api.drawingHost()
      overlay.current = createDrawingOverlay(host.scene, host.requestRender)
    }
    overlay.current?.sync(s.drawings)
  }, [s.drawings, viewerApiRef])
  useEffect(() => () => { overlay.current?.dispose(); overlay.current = null }, [])

  // ── Live data + camera
  const bindings = useTwinDeviceStore((st) => st.bindings)
  const readings = useTwinDeviceStore((st) => st.readings)
  const [centers, setCenters] = useState<Map<string, { x: number; y: number }>>(new Map())
  const guids = useMemo(() => bindings.flatMap((b) => b.targets.map((x) => x.globalId)).filter(Boolean).join('|'), [bindings])
  useEffect(() => {
    const api = viewerApiRef.current
    if (!api || !guids || !s.liveData) { setCenters(new Map()); return }
    let dead = false
    void api.drawingElementCenters(guids.split('|')).then((m) => { if (!dead) setCenters(m) })
    return () => { dead = true }
  }, [guids, viewerApiRef, s.liveData])
  const markers = useMemo<LiveMarker[]>(() => {
    if (!s.liveData || active?.source === 'section') return []
    const out: LiveMarker[] = []
    for (const b of bindings) {
      const r = readings.get(deviceKey(b.sourceId, b.deviceId))
      const prop = r?.props.find((p) => typeof p.value === 'number') ?? r?.props[0]
      for (const target of b.targets) {
        const c = centers.get(target.globalId)
        if (!c) continue
        const color = effectOf(b, bindingState(b, r, Date.now()))?.color ?? (r ? '#4cc38a' : '#8a93a6')
        out.push({ x: c.x, y: c.y, color, label: prop ? `${b.name}: ${String(prop.value)}` : b.name })
      }
    }
    return out
  }, [bindings, readings, centers, s.liveData, active?.source])

  const [camera, setCamera] = useState<ReturnType<ViewerAPI['drawingCamera']>>(null)
  useEffect(() => {
    if (active?.source === 'section') { setCamera(null); return }
    const id = setInterval(() => {
      const c = viewerApiRef.current?.drawingCamera() ?? null
      setCamera((old) => (old && c && Math.abs(old.x - c.x) + Math.abs(old.y - c.y) + Math.abs(old.dx - c.dx) + Math.abs(old.dy - c.dy) < 1e-3 ? old : c))
    }, 250)
    return () => clearInterval(id)
  }, [viewerApiRef, active?.source])

  // ── Forms inside the canvas flow
  const submitAsk = (e: React.FormEvent) => {
    e.preventDefault()
    if (!active || !ask) return
    const st = useDrawingStore.getState()
    if (ask.kind === 'text' && askValue.trim()) {
      // Readable whatever the units: a sixtieth of what the sheet spans.
      const span = robustBounds(active)
      st.addEntities(active.id, [{
        kind: 'text', at: ask.at, layer: st.activeLayer ?? active.layers[0].name, color: null,
        height: span ? Math.max(span.maxX - span.minX, span.maxY - span.minY) / 60 : 0.25 / active.placement.scale, rotation: 0, text: askValue.trim(), align: 'left',
      }])
    } else if (ask.kind === 'length') {
      const metres = Number(askValue.replace(',', '.'))
      if (metres > 0 && ask.units > 0) {
        const metresPerUnit = metres / ask.units
        st.edit(active.id, (d) => ({ metresPerUnit, placement: { ...d.placement, scale: metresPerUnit } }))
        st.setTool('select')
        setNotice(t('calibrate.done', { value: metresPerUnit.toPrecision(4) }))
      }
    }
    setAsk(null); setAskValue('')
  }

  // ── Export
  const [output, setOutput] = useState<OutputOptions>({ paper: 'A3', title: '', project: '', author: '' })
  const sheetOptsFor = (d: Drawing) => ({ paper: output.paper, title: output.title || d.name, project: output.project, author: output.author, date: new Date().toISOString().slice(0, 10) })
  const sheetOpts = () => sheetOptsFor(active!)
  const exportAs = async (kind: 'dxf' | 'svg' | 'pdf') => {
    if (!active) return
    setNotice(null)
    const base = active.name.replace(/[^\p{L}\p{N}._ -]+/gu, '_') || 'drawing'
    if (kind === 'dxf') {
      downloadFile(new Blob([drawingToDxf(active)], { type: 'application/dxf' }), `${base}.dxf`)
      if (active.page) setNotice(t('export.dxfNoPage'))
    } else if (kind === 'svg') {
      downloadFile(new Blob([drawingToSvg(active, sheetOpts())], { type: 'image/svg+xml' }), `${base}.svg`)
    } else {
      let jpeg: PdfImage | undefined
      if (active.page) jpeg = await pageToJpeg(active.page.url)
      const bytes = drawingToPdf(active, sheetOpts(), jpeg)
      downloadFile(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }), `${base}.pdf`)
      if (pdfHasUnencodable(active)) setNotice(t('export.pdfLatin'))
    }
    trackFeatureUsed({ feature: 'drawing_export' })
  }
  /** Every sheet, as PDF and DXF, numbered in sheet order: what a handover asks for. */
  const exportAll = () => run(async () => {
    const { zipSync } = await import('fflate')
    const files: Record<string, Uint8Array> = {}
    const enc = new TextEncoder()
    const list = useDrawingStore.getState().drawings
    for (const [i, d] of list.entries()) {
      const base = `${String(i + 1).padStart(2, '0')}-${d.name.replace(/[^\p{L}\p{N}._ -]+/gu, '_') || 'sheet'}`
      files[`${base}.pdf`] = drawingToPdf(d, sheetOptsFor(d), d.page ? await pageToJpeg(d.page.url) : undefined)
      files[`${base}.dxf`] = enc.encode(drawingToDxf(d))
    }
    const bytes = zipSync(files, { level: 6 })
    downloadFile(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' }), `${output.project.replace(/[^\p{L}\p{N}._ -]+/gu, '_') || 'sheets'}.zip`)
    trackFeatureUsed({ feature: 'drawing_export_all' })
  })

  const changePage = async (delta: number) => {
    if (!active?.page) return
    const bytes = pdfBytes(active.id)
    const next = active.page.pageNumber + delta
    if (!bytes || next < 1 || next > active.page.pageCount) return
    setBusy(true)
    try {
      const page = await renderPdfPage(bytes, next)
      const vectors = await readPdfVectors(bytes, next).catch(() => null)
      s.patch(active.id, { page })
      // The page's vectors go with the page; what the user drew on Markup stays.
      s.edit(active.id, (d) => {
        const own = d.entities.filter((e) => e.layer !== 'PDF lines' && e.layer !== 'PDF text')
        return {
          entities: [...own, ...withIds(vectors?.entities ?? [])],
          layers: [...d.layers.filter((l) => l.name !== 'PDF lines' && l.name !== 'PDF text'), ...(vectors?.layers ?? [])],
        }
      })
      if (vectors) setPdfInfo((m) => ({ ...m, [active.id]: { lines: vectors.lines, texts: vectors.texts } }))
    } catch (err) { setError(String(err)) } finally { setBusy(false) }
  }

  const startResize = (e: React.PointerEvent) => {
    if (!onResize) return
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => onResize(window.innerWidth - ev.clientX)
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up) }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  return (
    <section
      aria-label={t('title')} style={style}
      className="fixed z-30 flex flex-col bg-[var(--bg)] border-l border-[var(--border)] text-[var(--text)]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void open(Array.from(e.dataTransfer.files)) }}
    >
      {onResize && <div onPointerDown={startResize} className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-10" style={{ touchAction: 'none' }} />}

      <header className="shrink-0 flex items-center gap-1 px-1.5 h-9 border-b border-[var(--border)]">
        <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)] mr-1 max-sm:hidden">{t('title')}</span>
        <div role="tablist" aria-label={t('sheet')} className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {s.drawings.length === 0 && <span className="text-[11px] text-[var(--text-faint)] px-1">{t('none')}</span>}
          {s.drawings.map((d) => (
            <button
              key={d.id} type="button" role="tab" aria-selected={d.id === s.activeId} title={d.name} onClick={() => s.setActive(d.id)}
              className={`shrink-0 max-w-[150px] truncate h-7 px-2 rounded-md text-[11px] ${d.id === s.activeId ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'} ${d.visible ? '' : 'opacity-50'}`}
            >{d.name}</button>
          ))}
        </div>
        <button type="button" className={btn} onClick={() => fileInput.current?.click()}>{t('import.button')}</button>
        <input ref={fileInput} type="file" hidden multiple accept=".dxf,.dwg,.pdf" data-testid="drawing-file"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void open(f) }} />
        <button type="button" className={btn} title={t('blank')} aria-label={t('blank')} onClick={() => s.addDrawing({ name: t('blankName', { n: s.drawings.length + 1 }), source: 'blank', layers: [], entities: [], metresPerUnit: 1, placement: IDENTITY })}>+</button>
        <button type="button" aria-label={t('close')} className={btn} onClick={() => s.setPanelOpen(false)}>×</button>
      </header>

      <div role="toolbar" aria-label={t('tools.label')} className="shrink-0 flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-[var(--border)]">
        {TOOLS.map((tool) => (
          <button
            key={tool.id} type="button" title={t(`tools.${tool.id}`)} aria-label={t(`tools.${tool.id}`)} aria-pressed={s.tool === tool.id}
            disabled={!active && tool.id !== 'pan' && tool.id !== 'select'}
            onClick={() => s.setTool(tool.id)}
            className={`w-8 h-7 grid place-items-center rounded-md disabled:opacity-40 ${s.tool === tool.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'}`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={tool.glyph} /></svg>
          </button>
        ))}
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" className={btn} onClick={s.undoEdit} disabled={!active || !s.undo[active.id]?.length}>{t('undo')}</button>
        <button type="button" className={btn} onClick={s.redoEdit} disabled={!active || !s.redo[active.id]?.length}>{t('redo')}</button>
        <span className="text-[10px] text-[var(--text-faint)] ml-1 truncate">{t(`hints.${s.tool}`)}</span>
      </div>

      {(error || notice) && (
        <div role={error ? 'alert' : 'status'} className={`shrink-0 px-2 py-1.5 text-[11px] leading-snug border-b border-[var(--border)] ${error ? 'text-[var(--danger)]' : 'text-[var(--text-dim)]'}`}>
          {error ?? notice}
          <button type="button" className="ml-2 underline" onClick={() => { setError(null); setNotice(null) }}>{t('dismiss')}</button>
        </div>
      )}
      {ask && (
        <form onSubmit={submitAsk} className="shrink-0 flex items-center gap-1 p-1.5 border-b border-[var(--border)]">
          <label className="text-[11px] text-[var(--text-dim)]">{ask.kind === 'text' ? t('ask.text') : t('ask.length')}</label>
          <input autoFocus className={`${field} flex-1`} value={askValue} onChange={(e) => setAskValue(e.target.value)} onKeyDown={(e) => e.stopPropagation()} inputMode={ask.kind === 'length' ? 'decimal' : 'text'} />
          <button className={btn} type="submit">{t('ask.ok')}</button>
          <button className={btn} type="button" onClick={() => setAsk(null)}>{t('ask.cancel')}</button>
        </form>
      )}

      <div className="flex-1 min-h-0 flex max-md:flex-col">
        <div className="relative flex-1 min-h-0 min-w-0 flex">
          <DrawingCanvas
            ref={canvas} markers={markers} camera={camera} formatLength={fmt}
            onAskText={(at) => { setAsk({ kind: 'text', at }); setAskValue('') }}
            onAskLength={(units) => { setAsk({ kind: 'length', units }); setAskValue('') }}
          />
          {s.drawings.length === 0 && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none p-6 text-center">
              <div className="max-w-[320px]">
                <p className="text-[13px] text-[#e6e6e6] mb-1">{t('empty.title')}</p>
                <p className="text-[11px] text-[#9aa3b5] leading-relaxed">{t('empty.body')}</p>
              </div>
            </div>
          )}
          {busy && <span role="status" className="absolute top-2 left-2 text-[11px] px-2 py-1 rounded bg-black/70 text-white">{t('working')}</span>}
        </div>

        {side && (
          <aside className="shrink-0 w-[286px] max-md:w-full max-md:max-h-[42%] flex flex-col border-l max-md:border-l-0 max-md:border-t border-[var(--border)] text-[11px]">
            <div role="tablist" aria-label={t('inspector')} className="shrink-0 grid grid-cols-5 border-b border-[var(--border)]">
              {INSPECTOR_TABS.map((id) => (
                <button
                  key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`h-8 px-0.5 truncate text-[10.5px] border-b-2 ${tab === id ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]'}`}
                >{t(`tabs.${id}`)}</button>
              ))}
            </div>
            <div role="tabpanel" className="flex-1 min-h-0 overflow-y-auto">
              {tab === 'scene' && <ScenePanel {...shared} markerCount={markers.length} />}
              {tab === 'create' && <CreatePanel {...shared} />}
              {tab === 'layers' && <LayersPanel {...shared} />}
              {tab === 'sheet' && <SheetPanel {...shared} onPage={(d) => void changePage(d)} pdfInfo={active ? pdfInfo[active.id] : undefined} />}
              {tab === 'output' && <OutputPanel {...shared} options={output} setOptions={setOutput} onExport={(k) => void exportAs(k)} onExportAll={() => void exportAll()} sheetCount={s.drawings.length} />}
            </div>
          </aside>
        )}
      </div>

      <footer className="shrink-0 flex items-center gap-1 px-1.5 h-8 border-t border-[var(--border)] text-[10.5px] text-[var(--text-dim)]">
        {active && <span className="truncate" title={t('status.layer')}>{s.activeLayer ?? '—'}</span>}
        {active && <span className="font-mono text-[var(--text-faint)] max-sm:hidden">{active.entities.length.toLocaleString()}</span>}
        {storageFailed && <span className="text-[var(--danger)] truncate">{t('status.notSaved')}</span>}
        <span className="ml-auto" />
        <button type="button" className={btn} onClick={() => canvas.current?.fit()}>{t('fit')}</button>
        <button type="button" className={btn} aria-pressed={s.paper} onClick={() => s.setPaper(!s.paper)}>{s.paper ? t('dark') : t('paper')}</button>
        <button type="button" className={btn} aria-pressed={side} onClick={() => setSide(!side)}>{t('panel')}</button>
      </footer>
    </section>
  )
}

async function pageToJpeg(url: string): Promise<PdfImage> {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.9))
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height }
}
