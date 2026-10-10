// ─── FloodPanel ───────────────────────────────────────────────────────────────
// The flood study, in the order a coordinator decides it: how fine the grid
// is, where the ground comes from, what the buildings do with the rain, which
// storm and how much the ground absorbs — then build the grid, look at what
// was built, and run it. Once a run exists, the timeline along the bottom
// replays it and the probe reads any point of it. When it finishes, the
// elements the water reaches are listed (here, and as a group in the
// validation panel), and the result exports as an image, a video of the event,
// or a GIS raster of the maximum depth.
//
// Lazy (React.lazy in App), gated by VITE_FEATURE_FLOOD. Strings come from the
// feature's own locale files (i18n.ts), loaded when the panel first mounts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from '../../../components/ViewportPanel'
import { Notice, Segmented, SwitchRow, LookSlider, StatRow, ProgressBar, Button } from '../../../components/geo/ui'
import { useGeoStore } from '../../../stores/geoStore'
import { useUIStore } from '../../../stores/uiStore'
import { shareOrDownload } from '../../../lib/share-file'
import type { ViewerAPI } from '../../../lib/viewer'
import {
  useFloodStore, MANNING, INFILTRATION,
  type InfiltrationPreset, type ManningPreset, type StormPreset, type ViewMode,
} from '../store'
import { ensureFloodI18n, FLOOD_NS } from '../i18n'
import { detectFloodSupport, type FloodSupport } from '../gpu/create'
import { STORM_PRESETS, stormFacts, stormHyetograph } from '../presets'
import { rainDurationS, totalDepthMm } from '../core/hyetograph'
import type { FloodGeoref } from '../raster/georef'
import type { FloodSystemAPI, ResultField, ResultFormat } from '../system'
import { affectedCsv, elevationFrom } from '../validation/affected'
import { DEPTH_STOPS, SPEED_STOPS } from '../view/water-layer'
import { FloodTimeline, fmtTime } from './FloodTimeline'
import { floodOverlay } from './capture-overlay'
import { FloodProbe } from './FloodProbe'
import { HyetographEditor } from './HyetographEditor'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

/** Cells a grid may have: about a 1000 × 1000 on a desktop, a quarter on a phone. */
const maxCells = (): number => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 300_000 : 1_000_000)

// The DEM file the user picked (outside React: a File is not state).
const demRef: { file: File | null } = { file: null }

function fmt(v: number | null | undefined, d = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })
}

/** The model the grid aligns to: the first one with a projected georeference. */
function pickGeoref(viewer: ViewerAPI): FloodGeoref | null {
  const byModel = useGeoStore.getState().georefByModel
  for (const id of viewer.getLoadedModelIds()) {
    const g = byModel[id]
    if (!g || g.eastings === null || g.northings === null) continue
    const c = viewer.getModelCoordination(id) ?? { x: 0, y: 0, z: 0 }
    return {
      eastings: g.eastings, northings: g.northings, rotationDeg: g.rotationDeg ?? 0, scale: g.scale ?? 1,
      heightM: g.heightM, epsg: g.epsgCode, coordination: c,
    }
  }
  return null
}

/** Length of the exported video of the event, wall seconds. */
const VIDEO_SECONDS = 16

/** First container this browser records, or null. */
function videoMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    try { if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' } } catch { /* exotic UA */ }
  }
  return null
}

const fmtDepthScale = (v: number): string => (v < 1 ? `${Math.round(v * 100)} cm` : `${v.toFixed(1)} m`)

const caption = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]'
const selectCls = 'h-[26px] px-1.5 rounded-[7px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[10.5px]'

export default function FloodPanel({ viewerApiRef }: Props) {
  // The namespace is added at run time (i18n.ts), outside the app's typed
  // resources on purpose — so its t is fixed here, untyped.
  const { i18n } = useTranslation()
  const [ready, setReady] = useState(false)
  const t = useMemo(
    () => (i18n.getFixedT as (lng: string, ns: string) => unknown)(i18n.language, FLOOD_NS) as (key: string, opts?: Record<string, unknown>) => string,
    // `ready` flips once the bundle is in: a new t then reads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, i18n.language, ready],
  )
  const s = useFloodStore()
  const mapOn = useGeoStore((g) => g.mapMode === 'on')
  const reliefOn = useGeoStore((g) => g.mapMode === 'on' && g.terrainEnabled && g.terrainStatus === 'ready')
  const [support, setSupport] = useState<FloodSupport | null>(null)
  const [sys, setSys] = useState<FloodSystemAPI | null>(null)
  const [editRain, setEditRain] = useState(false)
  const [field, setField] = useState<ResultField>('hMax')
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [recording, setRecording] = useState<number | null>(null)
  const sysRef = useRef<FloodSystemAPI | null>(null)
  const tRef = useRef<(key: string, opts?: Record<string, unknown>) => string>(() => '')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    void ensureFloodI18n(i18n.language).then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [i18n.language])

  useEffect(() => {
    if (!s.panelOpen || support) return
    void detectFloodSupport().then(setSupport)
  }, [s.panelOpen, support])

  // Leaving the scene (models removed, panel unmounted) takes the study with it.
  useEffect(() => () => {
    sysRef.current?.clear()
    useFloodStore.getState().set({ status: 'idle', report: null, stats: null, perf: null, backend: null, probe: null, probing: false, affected: null })
  }, [])

  // Every capture of the water carries its legend, the instant and the disclaimer.
  tRef.current = t
  useEffect(() => {
    if (!sys) return
    sys.setCaptureOverlay(floodOverlay(() => {
      const tt = tRef.current
      const st = useFloodStore.getState()
      const tl = sys.getTimeline()
      if (!tl.endS) return null
      const speedView = st.viewMode === 'speed'
      return {
        title: tt(`view.${st.viewMode}`),
        subtitle: tt('capture.time', { t: fmtTime(tl.viewT), end: fmtTime(tl.endS) }),
        stops: speedView ? SPEED_STOPS : DEPTH_STOPS,
        format: speedView ? (v) => `${v} m/s` : fmtDepthScale,
        disclaimer: tt('capture.disclaimer'),
      }
    }))
    return () => sys.setCaptureOverlay(null)
  }, [sys])

  // The probe: while armed, a click on the scene reads the water there.
  useEffect(() => {
    const sy = sysRef.current
    if (!sy) return
    sy.setProbing(s.probing, (r) => useFloodStore.getState().set({ probe: r, probeBusy: false }))
    return () => sy.setProbing(false)
  }, [s.probing, sys])

  const system = useCallback(async (): Promise<FloodSystemAPI | null> => {
    const v = viewerApiRef.current
    if (!v) return null
    if (!sysRef.current) {
      sysRef.current = await v.getFlood()
      setSys(sysRef.current)
    }
    return sysRef.current
  }, [viewerApiRef])

  const prepare = useCallback(async () => {
    const v = viewerApiRef.current
    const sy = await system()
    if (!v || !sy) return
    const st = useFloodStore.getState()
    st.set({ status: 'preparing', stage: null, error: null, report: null, stats: null, perf: null, probe: null, probing: false })
    try {
      const report = await sy.prepare({
        cellM: st.cellM,
        marginM: st.marginM,
        maxCells: maxCells(),
        roofRunoff: st.roofRunoff,
        manning: MANNING[st.manning],
        includeMapBuildings: st.includeMapBuildings,
        useMapTerrain: st.useMapTerrain,
        demFile: demRef.file,
        georef: pickGeoref(v),
        plane: { y: st.planeAuto ? null : st.planeY, slopePct: st.slopePct, towardsDeg: st.slopeTowardsDeg },
        onStage: (stage) => useFloodStore.getState().set({ stage }),
      })
      sy.setView({ mode: st.viewMode, threshold: st.threshold, showGround: st.showGround, particles: st.particles })
      useFloodStore.getState().set({ status: 'ready', stage: null, report, planeY: st.planeAuto ? report.planeY : st.planeY })
    } catch (err) {
      useFloodStore.getState().set({ status: 'error', stage: null, error: (err as Error)?.message ?? String(err) })
    }
  }, [system, viewerApiRef])

  const analyze = useCallback(async () => {
    const sy = sysRef.current
    if (!sy) return
    useFloodStore.getState().set({ affectedBusy: true })
    try {
      const affected = await sy.analyzeAffected()
      useFloodStore.getState().set({ affected, affectedBusy: false })
    } catch (err) {
      useFloodStore.getState().set({ affectedBusy: false, error: (err as Error)?.message ?? String(err) })
    }
  }, [])

  const run = useCallback(async () => {
    const sy = await system()
    if (!sy?.isPrepared()) return
    const st = useFloodStore.getState()
    const edge = st.boundary
    st.set({ status: 'running', stats: null, perf: null, error: null, probe: null, affected: null })
    sy.start({
      hyetograph: st.hyetograph,
      durationS: rainDurationS(st.hyetograph) + st.drainMin * 60,
      params: {
        boundary: { west: edge, east: edge, south: edge, north: edge },
        wetThreshold: st.threshold,
        infiltration: st.infiltration === 'none' ? null : INFILTRATION[st.infiltration],
      },
      speed: 'max',
    }, {
      onReady: (r) => useFloodStore.getState().set({ backend: r }),
      onStats: (stats, perf) => useFloodStore.getState().set({ stats, perf }),
      onState: (x) => {
        if (x.finished) {
          useFloodStore.getState().set({ status: 'finished' })
          void analyze()
        } else if (x.running) useFloodStore.getState().set({ status: 'running' })
      },
      onError: (m) => useFloodStore.getState().set({ status: 'error', error: m }),
    })
  }, [system, analyze])

  const clear = useCallback(() => {
    sysRef.current?.clear()
    useFloodStore.getState().set({ status: 'idle', report: null, stats: null, perf: null, backend: null, error: null, probe: null, probing: false, affected: null })
  }, [])

  const exportPng = useCallback(async () => {
    const v = viewerApiRef.current
    if (!v) return
    const url = v.takeSnapshot(2)
    if (!url) return
    const blob = await (await fetch(url)).blob()
    const tl = sysRef.current?.getTimeline()
    await shareOrDownload(blob, `flood-${useFloodStore.getState().viewMode}-${fmtTime(tl?.viewT ?? 0).replace(':', 'h')}.png`)
  }, [viewerApiRef])

  const exportRaster = useCallback(async (format: ResultFormat) => {
    const sy = sysRef.current
    if (!sy) return
    const f = await sy.exportResult(format, field)
    if (!f) return
    const tt = tRef.current
    setExportNote(f.georeferenced && f.crs ? tt('export.crs', { crs: f.crs }) : tt('export.local'))
    await shareOrDownload(f.blob, `flood-${field === 'hMax' ? 'max-depth' : field === 'vMax' ? 'max-speed' : 'arrival-time'}.${f.ext}`)
  }, [field])

  const exportAffected = useCallback(async () => {
    const a = useFloodStore.getState().affected
    if (!a) return
    await shareOrDownload(new Blob([affectedCsv(a.elements, elevationFrom(a.datum))], { type: 'text/csv' }), 'flood-affected-elements.csv')
  }, [])

  /**
   * The whole event replayed from the snapshots in VIDEO_SECONDS, recorded
   * from the viewer's recording surface (the 3-D view plus every capture
   * overlay: measurements and this feature's legend).
   */
  const recordVideo = useCallback(async () => {
    const v = viewerApiRef.current
    const sy = sysRef.current
    const fmt = videoMime()
    if (!v || !sy || !fmt) return
    const tl0 = sy.getTimeline()
    if (!tl0.finished) return
    const rec = v.acquireRecordingCanvas()
    const stream = rec.canvas.captureStream(30)
    const mr = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>((r) => { mr.onstop = () => r() })
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    setRecording(0)
    try {
      sy.seek(0)
      await wait(400)
      mr.start(250)
      await wait(300)
      const endS = tl0.endS
      await new Promise<void>((resolve) => {
        const un = sy.subscribe((st) => {
          setRecording(Math.round((st.viewT / endS) * 100))
          if (!st.playing) { un(); resolve() }
        })
        sy.setPlayback(true, endS / VIDEO_SECONDS)
      })
      await wait(600) // hold the last frame
      mr.stop()
      await stopped
    } finally {
      rec.release()
      for (const tr of stream.getTracks()) tr.stop()
      sy.setPlayback(false, useFloodStore.getState().replaySpeed)
      setRecording(null)
    }
    if (chunks.length) await shareOrDownload(new Blob(chunks, { type: fmt.mime }), `flood-event.${fmt.ext}`)
  }, [viewerApiRef])

  const setView = useCallback((p: Partial<{ viewMode: ViewMode; threshold: number; showGround: boolean; particles: boolean }>) => {
    useFloodStore.getState().set(p)
    const st = useFloodStore.getState()
    sysRef.current?.setView({ mode: st.viewMode, threshold: st.threshold, showGround: st.showGround, particles: st.particles })
  }, [])

  if (!ready) return null

  const busy = s.status === 'preparing'
  const running = s.status === 'running'
  const rep = s.report
  const totalS = rainDurationS(s.hyetograph) + s.drainMin * 60
  const progress = s.stats ? Math.min(1, s.stats.t / totalS) : null
  const unsupported = support !== null && !support.supported
  const runExists = s.status === 'running' || s.status === 'paused' || s.status === 'finished'
  const finished = s.status === 'finished'
  const canVideo = videoMime() !== null

  return (
    <>
      <ViewportPanel
        id="flood"
        open={s.panelOpen}
        onClose={() => s.setPanelOpen(false)}
        label={t('title')}
        mobile="sheet"
        widthPx={340}
        anchor="top"
        maxHeight="calc(100vh - 140px)"
      >
        <div className="flex-1 min-h-0 overflow-y-auto text-[11.5px] text-[var(--text-dim)]">
          <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)] flex items-center justify-between">
            <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">{t('title')}</div>
            <button onClick={() => s.setPanelOpen(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]" title={t('close')}>✕</button>
          </div>

          <div className="p-3 flex flex-col gap-3">
            <Notice tone="warn">{t('disclaimer')}</Notice>
            {unsupported && <Notice tone="danger">{t('unsupported')}</Notice>}

            {/* ── Grid ─────────────────────────────────────────────────── */}
            <section className="flex flex-col gap-1.5">
              <div className={caption}>{t('grid.title')}</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('grid.cell')}</span>
                <Segmented
                  label={t('grid.cell')}
                  value={String(s.cellM) as '1' | '2' | '5'}
                  options={[{ id: '1', label: '1 m' }, { id: '2', label: '2 m' }, { id: '5', label: '5 m' }]}
                  onChange={(v) => s.set({ cellM: Number(v) })}
                />
              </div>
              <LookSlider label={t('grid.margin')} value={s.marginM} min={10} max={400} step={10} format={(v) => `${v} m`} onChange={(v) => s.set({ marginM: v })} />
            </section>

            {/* ── Ground ───────────────────────────────────────────────── */}
            <section className="flex flex-col gap-1.5">
              <div className={caption}>{t('ground.title')}</div>
              <div className="text-[10px] leading-snug text-[var(--text-faint)]">{t('ground.order')}</div>
              <SwitchRow
                compact
                label={t('ground.useMap')}
                checked={s.useMapTerrain && reliefOn}
                disabled={!reliefOn}
                note={reliefOn ? undefined : t('ground.mapOff')}
                onChange={(v) => s.set({ useMapTerrain: v })}
              />
              <div className="flex items-center gap-1.5">
                <Button onClick={() => fileInput.current?.click()}>{t('ground.importDem')}</Button>
                {s.demName ? (
                  <>
                    <span className="truncate text-[10.5px] text-[var(--text)]" title={s.demName}>{s.demName}</span>
                    <button className="ml-auto text-[var(--text-faint)] hover:text-[var(--text)]" title={t('ground.removeDem')}
                      onClick={() => { demRef.file = null; s.set({ demName: null }) }}>✕</button>
                  </>
                ) : <span className="text-[10px] text-[var(--text-faint)]">{t('ground.demFormats')}</span>}
                <input ref={fileInput} type="file" accept=".asc,.tif,.tiff" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    demRef.file = f
                    s.set({ demName: f?.name ?? null })
                    e.target.value = ''
                  }} />
              </div>
              <details className="text-[10.5px]">
                <summary className="cursor-pointer text-[var(--text-faint)] hover:text-[var(--text-dim)]">{t('ground.plane.title')}</summary>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  <SwitchRow compact label={t('ground.plane.auto')} checked={s.planeAuto} onChange={(v) => s.set({ planeAuto: v })} />
                  {!s.planeAuto && (
                    <LookSlider label={t('ground.plane.level')} value={s.planeY} min={-20} max={20} step={0.05} format={(v) => `${v.toFixed(2)}`} onChange={(v) => s.set({ planeY: v })} />
                  )}
                  <LookSlider label={t('ground.plane.slope')} value={s.slopePct} min={0} max={8} step={0.25} format={(v) => `${v.toFixed(2)}%`} onChange={(v) => s.set({ slopePct: v })} />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('ground.plane.towards')}</span>
                    <Segmented
                      label={t('ground.plane.towards')}
                      value={String(s.slopeTowardsDeg) as '0' | '90' | '180' | '270'}
                      options={[{ id: '90', label: t('dir.n') }, { id: '0', label: t('dir.e') }, { id: '270', label: t('dir.s') }, { id: '180', label: t('dir.w') }]}
                      onChange={(v) => s.set({ slopeTowardsDeg: Number(v) })}
                    />
                  </div>
                </div>
              </details>
            </section>

            {/* ── Buildings ────────────────────────────────────────────── */}
            <section className="flex flex-col gap-1.5">
              <div className={caption}>{t('buildings.title')}</div>
              <SwitchRow compact label={t('buildings.map')} checked={s.includeMapBuildings && mapOn} disabled={!mapOn}
                note={mapOn ? undefined : t('buildings.mapOff')} onChange={(v) => s.set({ includeMapBuildings: v })} />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('buildings.roofs')}</span>
                <Segmented
                  label={t('buildings.roofs')}
                  value={s.roofRunoff}
                  options={[{ id: 'perimeter', label: t('buildings.perimeter') }, { id: 'drained', label: t('buildings.drained') }]}
                  onChange={(v) => s.set({ roofRunoff: v })}
                />
              </div>
            </section>

            {/* ── Rain ─────────────────────────────────────────────────── */}
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <div className={caption}>{t('rain.title')}</div>
                <button className="ml-auto text-[10.5px] text-[var(--accent-2)] hover:underline" onClick={() => setEditRain((v) => !v)}>
                  {editRain ? t('rain.doneEditing') : t('rain.edit')}
                </button>
              </div>
              <select
                value={s.storm ?? 'custom'}
                onChange={(e) => {
                  const p = e.target.value as StormPreset | 'custom'
                  if (p !== 'custom') s.set({ storm: p, hyetograph: stormHyetograph(p) })
                }}
                className={`${selectCls} h-[28px] text-[11px]`}
                aria-label={t('rain.title')}
              >
                {STORM_PRESETS.map((p) => {
                  const f = stormFacts(p)
                  return <option key={p} value={p}>{t(`rain.presets.${p}`, { mm: f.depthMm, min: f.minutes, peak: f.peakMmH })}</option>
                })}
                {s.storm === null && <option value="custom">{t('rain.custom')}</option>}
              </select>
              {editRain
                ? <HyetographEditor value={s.hyetograph} onChange={(h) => s.set({ hyetograph: h, storm: null })} t={t} />
                : (
                  <div className="text-[10px] text-[var(--text-faint)]">
                    {t('rain.facts', { mm: Math.round(totalDepthMm(s.hyetograph)), min: Math.round(rainDurationS(s.hyetograph) / 60), peak: Math.round(Math.max(...s.hyetograph.intensityMmH)) })}
                  </div>
                )}
              <LookSlider label={t('rain.after')} value={s.drainMin} min={0} max={180} step={5} format={(v) => `${v} min`} onChange={(v) => s.set({ drainMin: v })} />
            </section>

            {/* ── Surface ──────────────────────────────────────────────── */}
            <section className="flex flex-col gap-1.5">
              <div className={caption}>{t('surface.section')}</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('surface.title')}</span>
                <select value={s.manning} onChange={(e) => s.set({ manning: e.target.value as ManningPreset })} className={`flex-1 ${selectCls}`} aria-label={t('surface.title')}>
                  {(Object.keys(MANNING) as ManningPreset[]).map((m) => <option key={m} value={m}>{t(`surface.${m}`, { n: MANNING[m] })}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('infiltration.title')}</span>
                <select value={s.infiltration} onChange={(e) => s.set({ infiltration: e.target.value as InfiltrationPreset })} className={`flex-1 ${selectCls}`} aria-label={t('infiltration.title')}>
                  <option value="none">{t('infiltration.none')}</option>
                  {(Object.keys(INFILTRATION) as Array<Exclude<InfiltrationPreset, 'none'>>).map((k) => (
                    <option key={k} value={k}>{t(`infiltration.${k}`, { f0: INFILTRATION[k].initialMmH, fc: INFILTRATION[k].finalMmH })}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('edges.title')}</span>
                <Segmented label={t('edges.title')} value={s.boundary}
                  options={[{ id: 'free', label: t('edges.free') }, { id: 'closed', label: t('edges.closed') }]}
                  onChange={(v) => s.set({ boundary: v })} />
              </div>
            </section>

            {/* ── Build and run ────────────────────────────────────────── */}
            <div className="flex items-center gap-2">
              <Button variant="primary" disabled={busy || unsupported || running} onClick={() => { void prepare() }}>
                {rep ? t('actions.rebuild') : t('actions.prepare')}
              </Button>
              {rep && (
                <Button variant="primary" disabled={unsupported || running} onClick={() => { void run() }}>
                  {runExists ? t('actions.rerun') : t('actions.run')}
                </Button>
              )}
              {(rep || runExists) && <button className="ml-auto text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text)]" onClick={clear}>{t('actions.clear')}</button>}
            </div>
            {busy && (
              <div className="flex flex-col gap-1">
                <ProgressBar value={null} />
                <span className="text-[10px] text-[var(--text-faint)]">{t(`stage.${s.stage ?? 'geometry'}`)}</span>
              </div>
            )}
            {s.status === 'error' && s.error && <Notice tone="danger">{s.error}</Notice>}

            {rep && (
              <section className="flex flex-col gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]/40 p-2.5">
                <div className="flex items-center">
                  <div className={caption}>{t('report.title')}</div>
                  <button className="ml-auto text-[10.5px] text-[var(--accent-2)] hover:underline" onClick={() => sysRef.current?.frame()}>{t('report.frame')}</button>
                </div>
                <StatRow label={t('report.grid')} value={`${rep.nx} × ${rep.ny} · ${fmt(rep.dx, 2)} m`} />
                <StatRow label={t('report.ground')} value={t(`source.${rep.terrain}`)} />
                {rep.mapTerrain && <StatRow label={t('report.dem')} value={t(`demSource.${rep.mapTerrain.source ?? 'unknown'}`)} />}
                <StatRow label={t('report.obstacles')} value={`${rep.obstacleCells.toLocaleString()} · ${t('report.canopies', { n: rep.canopyCells.toLocaleString() })}`} />
                <StatRow label={t('report.relief')} value={`${fmt(rep.zMin, 1)} … ${fmt(rep.zMax, 1)} m`} />
                {rep.coarsened && <Notice tone="info">{t('report.coarsened', { dx: fmt(rep.dx, 2) })}</Notice>}
                {rep.terrain === 'plane' && <Notice tone="warn">{t('report.planeWarn', { y: fmt(rep.planeY, 2) })}</Notice>}
                {rep.mapTerrain?.source === 'terrarium' && <Notice tone="warn">{t('report.coarseDem')}</Notice>}
                {rep.dem?.notes.map((n) => <Notice key={n} tone={n === 'reprojected' || n === 'sameCrs' ? 'muted' : 'warn'}>{t(`demNote.${n}`)}</Notice>)}
              </section>
            )}

            {runExists && (
              <section className="flex flex-col gap-1.5">
                <ProgressBar value={progress} />
                <StatRow label={t('live.time')} value={`${fmt((s.stats?.t ?? 0) / 60, 1)} / ${fmt(totalS / 60, 0)} min`} />
                <StatRow label={t('live.maxDepth')} value={`${fmt(s.stats?.hMax, 2)} m`} />
                <StatRow label={t('live.volume')} value={`${fmt(s.stats?.volume, 0)} m³`} />
                {s.stats && s.stats.infiltratedVolume > 0 && <StatRow label={t('live.infiltrated')} value={`${fmt(s.stats.infiltratedVolume, 0)} m³`} />}
                <StatRow label={t('live.outflow')} value={`${fmt(s.stats?.outflowVolume, 0)} m³`} />
                <StatRow label={t('live.mass')} value={s.stats ? s.stats.massError.toExponential(1) : '—'} tone={s.stats && Math.abs(s.stats.massError) > 1e-3 ? 'warn' : 'normal'} />
                {s.backend && (
                  <div className="text-[9.5px] font-mono text-[var(--text-faint)] truncate" title={s.backend.device}>
                    {s.backend.backend.toUpperCase()} · {s.backend.device}{s.perf ? ` · ×${fmt(s.perf.speedup, 0)}` : ''}
                  </div>
                )}
              </section>
            )}

            {rep && (
              <section className="flex flex-col gap-1.5">
                <div className={caption}>{t('view.title')}</div>
                <Segmented label={t('view.title')} value={s.viewMode}
                  options={[{ id: 'now', label: t('view.now') }, { id: 'max', label: t('view.max') }, { id: 'speed', label: t('view.speed') }]}
                  onChange={(v) => setView({ viewMode: v })} />
                <SwitchRow compact label={t('view.particles')} checked={s.particles} onChange={(v) => setView({ particles: v })} />
                <LookSlider label={t('view.threshold')} value={s.threshold * 100} min={1} max={30} step={1} format={(v) => `${v} cm`} onChange={(v) => setView({ threshold: v / 100 })} />
                {(rep.terrain === 'plane' || rep.terrain === 'dem') && (
                  <SwitchRow compact label={t('view.ground')} checked={s.showGround} onChange={(v) => setView({ showGround: v })} />
                )}
              </section>
            )}

            {/* ── Elements the water reaches ───────────────────────────── */}
            {runExists && (
              <section className="flex flex-col gap-1.5">
                <div className={caption}>{t('affected.panelTitle')}</div>
                {s.affectedBusy
                  ? <span className="text-[10.5px] text-[var(--text-faint)]">{t('affected.busy')}</span>
                  : s.affected
                    ? (
                      <div className="text-[10.5px] leading-snug text-[var(--text-dim)]">
                        {s.affected.total === 0 ? t('affected.none', { checked: s.affected.checked }) : t('affected.summary', { n: s.affected.total, checked: s.affected.checked })}
                        {' '}{s.affected.finished ? t('affected.atEnd', { t: fmtTime(s.affected.t) }) : t('affected.partial', { t: fmtTime(s.affected.t) })}
                      </div>
                    )
                    : <span className="text-[10.5px] text-[var(--text-faint)]">{t('affected.pending')}</span>}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button disabled={s.affectedBusy || running} onClick={() => { void analyze() }}>
                    {s.affected ? t('affected.reanalyze') : t('affected.analyze')}
                  </Button>
                  {s.affected && s.affected.total > 0 && (
                    <>
                      <Button onClick={() => useUIStore.getState().setValidationPanelOpen(true)}>{t('affected.open')}</Button>
                      <Button onClick={() => { void exportAffected() }}>CSV</Button>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* ── Export ───────────────────────────────────────────────── */}
            {runExists && (
              <section className="flex flex-col gap-1.5">
                <div className={caption}>{t('export.title')}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button onClick={() => { void exportPng() }}>{t('export.png')}</Button>
                  {recording === null
                    ? <Button disabled={!finished || !canVideo} onClick={() => { void recordVideo() }}>{t('export.video')}</Button>
                    : <Button onClick={() => sysRef.current?.setPlayback(false)}>{t('export.stop', { pct: recording })}</Button>}
                </div>
                {!canVideo
                  ? <span className="text-[10px] text-[var(--text-faint)]">{t('export.noVideo')}</span>
                  : !finished && <span className="text-[10px] text-[var(--text-faint)]">{t('export.videoNeedsEnd')}</span>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('export.field')}</span>
                  <Segmented label={t('export.field')} value={field}
                    options={[{ id: 'hMax', label: t('export.fields.hMax') }, { id: 'vMax', label: t('export.fields.vMax') }, { id: 'tWet', label: t('export.fields.tWet') }]}
                    onChange={(v) => setField(v)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <Button onClick={() => { void exportRaster('geotiff') }}>GeoTIFF</Button>
                  <Button onClick={() => { void exportRaster('asc') }}>ASC</Button>
                  <Button onClick={() => { void exportRaster('csv') }}>CSV</Button>
                </div>
                <span className="text-[10px] leading-snug text-[var(--text-faint)]">{exportNote ?? t('export.rasterNote')}</span>
              </section>
            )}
          </div>
        </div>
      </ViewportPanel>
      {runExists && <FloodTimeline system={sys} t={t} />}
      {runExists && <FloodProbe system={sys} t={t} />}
    </>
  )
}
