// ─── Drawings dock ────────────────────────────────────────────────────────────
// The sheets next to the model: DXF and PDF as references, plans and sections
// cut from the IFC, markup, alignment, export. Lazy, because pdf.js and this
// whole pane mean nothing to someone who never opens a sheet. See docs/DRAWINGS.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import { useDrawingStore, type DrawingTool } from '../../stores/drawingStore'
import { useUIStore } from '../../stores/uiStore'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { bindingState, deviceKey, effectOf } from '../../lib/twin/devices'
import { trackFeatureUsed } from '../../lib/analytics'
import { downloadFile } from '../../lib/share-file'
import { DrawingImportError, importDrawingFile, pdfBytes, rememberPdf, renderPdfPage } from '../../lib/drawing/import-file'
import { buildCut, SKIP_CATEGORIES, type CutPlane } from '../../lib/drawing/plan-cut'
import { drawingToDxf, drawingToPdf, drawingToSvg, pdfHasUnencodable, type PaperSize, type PdfImage, PAPER } from '../../lib/drawing/export'
import { createDrawingOverlay, type DrawingOverlay } from '../../lib/drawing/overlay-3d'
import { IDENTITY, LAYER_PALETTE, robustBounds, type Drawing, type Pt } from '../../lib/drawing/types'
import DrawingCanvas, { type CanvasHandle, type LiveMarker } from './DrawingCanvas'

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

const btn = 'h-7 px-2 rounded-md text-[11px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-40 whitespace-nowrap'
const field = 'h-7 px-1.5 rounded-md text-[11px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] min-w-0'

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

  // ── Generate from the IFC
  const [levels, setLevels] = useState<{ name: string; y: number }[]>([])
  const [levelIdx, setLevelIdx] = useState(0)
  const [cutHeight, setCutHeight] = useState(1.2)
  const [cutKind, setCutKind] = useState<'plan' | 'sectionX' | 'sectionY'>('plan')
  const [cutPos, setCutPos] = useState(50)
  const [hasModels, setHasModels] = useState(false)

  useEffect(() => {
    const api = viewerApiRef.current
    setHasModels(!!api?.drawingSceneBounds())
    if (api) void api.getStoreyLevels().then((l) => setLevels(l)).catch(() => setLevels([]))
    // Re-read when the pane opens or the sheet changes: models come and go.
  }, [viewerApiRef, s.activeId, s.panelOpen])

  const generate = async () => {
    const api = viewerApiRef.current
    const box = api?.drawingSceneBounds()
    if (!api || !box) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const frac = cutPos / 100
      const level = levels[levelIdx]
      const plane: CutPlane = cutKind === 'plan'
        ? { kind: 'plan', y: (level?.y ?? box.min.y) + cutHeight }
        : cutKind === 'sectionX'
          ? { kind: 'sectionX', x: box.min.x + (box.max.x - box.min.x) * frac }
          : { kind: 'sectionY', z: box.min.z + (box.max.z - box.min.z) * frac }
      const soups = await api.collectDrawingSoups(SKIP_CATEGORIES)
      const cut = buildCut(soups, plane)
      if (!cut.entities.length) { setError(t('errors.emptyCut')); return }
      const st = useDrawingStore.getState()
      const name = cutKind === 'plan'
        ? t('generate.planName', { level: level?.name ?? '', height: cutHeight })
        : t('generate.sectionName', { axis: cutKind === 'sectionX' ? 'X' : 'Y', pos: Math.round(cutPos) })
      // A section lives in its own plane: sheets of the plan must not lie over it.
      if (cutKind !== 'plan') for (const d of st.drawings) st.patch(d.id, { visible: false })
      st.addDrawing({
        name, source: cutKind === 'plan' ? 'plan' : 'section', layers: cut.layers, entities: cut.entities,
        metresPerUnit: 1, placement: IDENTITY, elevation: cutKind === 'plan' ? Math.round((level?.y ?? box.min.y) * 1000) / 1000 : 0,
      })
      trackFeatureUsed({ feature: 'drawing_generate' })
    } catch (err) {
      setError(t('errors.cutFailed', { detail: err instanceof Error ? err.message : String(err) }))
    } finally { setBusy(false) }
  }

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

  // ── Layers
  const addLayer = () => {
    if (!active) return
    let n = active.layers.length
    let name = `${t('layers.new')} ${n}`
    while (active.layers.some((l) => l.name === name)) name = `${t('layers.new')} ${++n}`
    s.edit(active.id, (d) => ({ layers: [...d.layers, { name, color: LAYER_PALETTE[n % LAYER_PALETTE.length], visible: true, locked: false }] }))
    s.setActiveLayer(name)
  }
  const patchLayer = (name: string, p: Partial<Drawing['layers'][number]>) => {
    if (active) s.edit(active.id, (d) => ({ layers: d.layers.map((l) => (l.name === name ? { ...l, ...p } : l)) }))
  }
  const deleteLayer = (name: string) => {
    if (!active || active.layers.length < 2) return
    s.edit(active.id, (d) => ({ layers: d.layers.filter((l) => l.name !== name), entities: d.entities.filter((e) => e.layer !== name) }))
    if (s.activeLayer === name) s.setActiveLayer(active.layers.find((l) => l.name !== name)?.name ?? null)
  }

  // ── Export
  const [paper, setPaper] = useState<PaperSize>('A3')
  const [title, setTitle] = useState('')
  const [project, setProject] = useState('')
  const [author, setAuthor] = useState('')
  const sheetOpts = () => ({ paper, title: title || active?.name || '', project, author, date: new Date().toISOString().slice(0, 10) })
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

  const changePage = async (delta: number) => {
    if (!active?.page) return
    const bytes = pdfBytes(active.id)
    const next = active.page.pageNumber + delta
    if (!bytes || next < 1 || next > active.page.pageCount) return
    setBusy(true)
    try { s.patch(active.id, { page: await renderPdfPage(bytes, next) }) } catch (err) { setError(String(err)) } finally { setBusy(false) }
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

      <header className="shrink-0 flex flex-wrap items-center gap-1 p-1.5 border-b border-[var(--border)]">
        <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)] mr-1">{t('title')}</span>
        <select aria-label={t('sheet')} className={`${field} flex-1 max-w-[220px]`} value={s.activeId ?? ''} onChange={(e) => s.setActive(e.target.value)}>
          {s.drawings.length === 0 && <option value="">{t('none')}</option>}
          {s.drawings.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button type="button" className={btn} onClick={() => fileInput.current?.click()}>{t('import.button')}</button>
        <input ref={fileInput} type="file" hidden multiple accept=".dxf,.dwg,.pdf" data-testid="drawing-file"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void open(f) }} />
        <button type="button" className={btn} title={t('blank')} onClick={() => s.addDrawing({ name: t('blankName', { n: s.drawings.length + 1 }), source: 'blank', layers: [], entities: [], metresPerUnit: 1, placement: IDENTITY })}>+</button>
        <button type="button" className={btn} onClick={() => canvas.current?.fit()}>{t('fit')}</button>
        <button type="button" className={btn} aria-pressed={s.paper} onClick={() => s.setPaper(!s.paper)}>{s.paper ? t('dark') : t('paper')}</button>
        <button type="button" className={btn} aria-pressed={side} onClick={() => setSide(!side)}>{t('panel')}</button>
        <button type="button" aria-label={t('close')} className={`${btn} ml-auto`} onClick={() => s.setPanelOpen(false)}>×</button>
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
          <aside className="shrink-0 w-[230px] max-md:w-full max-md:max-h-[38%] overflow-y-auto border-l max-md:border-l-0 max-md:border-t border-[var(--border)] text-[11px]">
            <Section title={t('generate.title')}>
              {!hasModels && <p className="text-[var(--text-faint)]">{t('generate.needModel')}</p>}
              <select aria-label={t('generate.kind')} className={`${field} w-full mb-1`} value={cutKind} onChange={(e) => setCutKind(e.target.value as typeof cutKind)}>
                <option value="plan">{t('generate.plan')}</option>
                <option value="sectionX">{t('generate.sectionX')}</option>
                <option value="sectionY">{t('generate.sectionY')}</option>
              </select>
              {cutKind === 'plan' ? (
                <div className="flex gap-1 mb-1">
                  <select aria-label={t('generate.level')} className={`${field} flex-1`} value={levelIdx} onChange={(e) => setLevelIdx(Number(e.target.value))}>
                    {levels.length === 0 && <option value={0}>{t('generate.base')}</option>}
                    {levels.map((l, i) => <option key={`${l.name}-${i}`} value={i}>{l.name}</option>)}
                  </select>
                  <label className="flex items-center gap-1" title={t('generate.height')}>
                    <input aria-label={t('generate.height')} type="number" step="0.1" className={`${field} w-14`} value={cutHeight} onChange={(e) => setCutHeight(Number(e.target.value) || 0)} onKeyDown={(e) => e.stopPropagation()} /> m
                  </label>
                </div>
              ) : (
                <input aria-label={t('generate.position')} type="range" min={0} max={100} value={cutPos} onChange={(e) => setCutPos(Number(e.target.value))} className="w-full mb-1" />
              )}
              <button type="button" className={`${btn} w-full`} disabled={!hasModels || busy} onClick={() => void generate()}>{t('generate.run')}</button>
            </Section>

            {active && (
              <Section title={t('sheetSection')}>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={active.visible} onChange={(e) => s.patch(active.id, { visible: e.target.checked })} /> {t('visible')}</label>
                  {active.source !== 'section' && (
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={active.in3d} onChange={(e) => s.patch(active.id, { in3d: e.target.checked })} /> {t('in3d')}</label>
                  )}
                  {active.in3d && (
                    <label className="flex items-center gap-1">{t('elevation')}
                      <input type="number" step="0.5" className={`${field} w-16`} value={active.elevation} onChange={(e) => s.patch(active.id, { elevation: Number(e.target.value) || 0 })} onKeyDown={(e) => e.stopPropagation()} /> m
                    </label>
                  )}
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.liveData} onChange={(e) => s.setLiveData(e.target.checked)} /> {t('live', { count: markers.length })}</label>
                  {active.page && active.page.pageCount > 1 && (
                    <div className="flex items-center gap-1">
                      <button type="button" className={btn} onClick={() => void changePage(-1)} disabled={active.page.pageNumber <= 1}>‹</button>
                      <span>{t('page', { n: active.page.pageNumber, total: active.page.pageCount })}</span>
                      <button type="button" className={btn} onClick={() => void changePage(1)} disabled={active.page.pageNumber >= active.page.pageCount}>›</button>
                    </div>
                  )}
                  <p className="text-[var(--text-faint)]">{active.metresPerUnit ? t('units', { value: active.metresPerUnit.toPrecision(4) }) : t('noUnits')}</p>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className={btn} onClick={() => s.edit(active.id, (d) => ({ placement: { ...IDENTITY, scale: d.metresPerUnit ?? 1 } }))}>{t('fileCoords')}</button>
                    <button type="button" className={btn} onClick={() => s.removeDrawing(active.id)}>{t('remove')}</button>
                  </div>
                </div>
              </Section>
            )}

            {active && (
              <Section title={t('layers.title', { count: active.layers.length })} action={<button type="button" className={btn} onClick={addLayer}>+</button>}>
                <ul className="flex flex-col gap-0.5 max-h-[240px] overflow-y-auto">
                  {active.layers.map((l) => (
                    <li key={l.name} className={`flex items-center gap-1 rounded px-0.5 ${s.activeLayer === l.name ? 'bg-[var(--surface-2)]' : ''}`}>
                      <input type="checkbox" aria-label={t('layers.visible', { name: l.name })} checked={l.visible} onChange={(e) => patchLayer(l.name, { visible: e.target.checked })} />
                      <input type="color" aria-label={t('layers.color', { name: l.name })} value={l.color} onChange={(e) => patchLayer(l.name, { color: e.target.value })} className="w-4 h-4 p-0 border-0 bg-transparent shrink-0" />
                      <button type="button" className="flex-1 min-w-0 truncate text-left" title={l.name} onClick={() => s.setActiveLayer(l.name)}>{l.name}</button>
                      <button type="button" aria-label={t('layers.lock', { name: l.name })} aria-pressed={l.locked} className={l.locked ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'} onClick={() => patchLayer(l.name, { locked: !l.locked })}>{l.locked ? '■' : '□'}</button>
                      <button type="button" aria-label={t('layers.delete', { name: l.name })} className="text-[var(--text-faint)] hover:text-[var(--danger)]" onClick={() => deleteLayer(l.name)}>×</button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {active && (
              <Section title={t('export.title')}>
                <div className="flex flex-col gap-1">
                  <input aria-label={t('export.sheetTitle')} placeholder={t('export.sheetTitle')} className={field} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                  <input aria-label={t('export.project')} placeholder={t('export.project')} className={field} value={project} onChange={(e) => setProject(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                  <input aria-label={t('export.author')} placeholder={t('export.author')} className={field} value={author} onChange={(e) => setAuthor(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                  <select aria-label={t('export.paper')} className={field} value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
                    {(Object.keys(PAPER) as PaperSize[]).map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <button type="button" className={`${btn} flex-1`} onClick={() => void exportAs('dxf')}>DXF</button>
                    <button type="button" className={`${btn} flex-1`} onClick={() => void exportAs('svg')}>SVG</button>
                    <button type="button" className={`${btn} flex-1`} onClick={() => void exportAs('pdf')}>PDF</button>
                  </div>
                </div>
              </Section>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-2 border-b border-[var(--border)]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--text-faint)] truncate">{title}</h3>
        {action}
      </div>
      {children}
    </div>
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
