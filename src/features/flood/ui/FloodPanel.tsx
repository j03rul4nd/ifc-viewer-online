// ─── FloodPanel ───────────────────────────────────────────────────────────────
// The flood study, in the order a coordinator decides it: how fine the grid
// is, where the ground comes from, what the buildings do with the rain, which
// storm — then build the grid, look at what was built, and run it.
//
// Lazy (React.lazy in App), gated by VITE_FEATURE_FLOOD. Strings come from the
// feature's own locale files (i18n.ts), loaded when the panel first mounts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from '../../../components/ViewportPanel'
import { Notice, Segmented, SwitchRow, LookSlider, StatRow, ProgressBar, Button } from '../../../components/geo/ui'
import { useGeoStore } from '../../../stores/geoStore'
import type { ViewerAPI } from '../../../lib/viewer'
import { useFloodStore, MANNING, type ManningPreset, type Speed, type StormPreset } from '../store'
import { ensureFloodI18n, FLOOD_NS } from '../i18n'
import { detectFloodSupport, type FloodSupport } from '../gpu/create'
import { STORM_PRESETS, stormFacts, stormHyetograph } from '../presets'
import { rainDurationS } from '../core/hyetograph'
import type { FloodGeoref } from '../raster/georef'
import type { FloodSystemAPI } from '../system'

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
  const sysRef = useRef<FloodSystemAPI | null>(null)
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
    useFloodStore.getState().set({ status: 'idle', report: null, stats: null, perf: null, backend: null })
  }, [])

  const system = useCallback(async (): Promise<FloodSystemAPI | null> => {
    const v = viewerApiRef.current
    if (!v) return null
    sysRef.current ??= await v.getFlood()
    return sysRef.current
  }, [viewerApiRef])

  const prepare = useCallback(async () => {
    const v = viewerApiRef.current
    const sys = await system()
    if (!v || !sys) return
    const st = useFloodStore.getState()
    st.set({ status: 'preparing', stage: null, error: null, report: null, stats: null, perf: null })
    try {
      const report = await sys.prepare({
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
      sys.setView({ mode: st.viewMode, threshold: st.threshold, showGround: st.showGround })
      useFloodStore.getState().set({ status: 'ready', stage: null, report, planeY: st.planeAuto ? report.planeY : st.planeY })
    } catch (err) {
      useFloodStore.getState().set({ status: 'error', stage: null, error: (err as Error)?.message ?? String(err) })
    }
  }, [system, viewerApiRef])

  const run = useCallback(async () => {
    const sys = await system()
    if (!sys?.isPrepared()) return
    const st = useFloodStore.getState()
    const hyetograph = stormHyetograph(st.storm)
    const edge = st.boundary
    st.set({ status: 'running', stats: null, perf: null, error: null })
    sys.start({
      hyetograph,
      durationS: rainDurationS(hyetograph) + st.drainMin * 60,
      params: { boundary: { west: edge, east: edge, south: edge, north: edge } },
      speed: st.speed,
    }, {
      onReady: (r) => useFloodStore.getState().set({ backend: r }),
      onStats: (stats, perf) => useFloodStore.getState().set({ stats, perf }),
      onState: (x) => {
        const cur = useFloodStore.getState().status
        if (x.finished) useFloodStore.getState().set({ status: 'finished' })
        else if (!x.running && cur === 'running') useFloodStore.getState().set({ status: 'paused' })
        else if (x.running) useFloodStore.getState().set({ status: 'running' })
      },
      onError: (m) => useFloodStore.getState().set({ status: 'error', error: m }),
    })
  }, [system])

  const togglePause = useCallback(async () => {
    const sys = await system()
    const st = useFloodStore.getState()
    if (st.status === 'running') sys?.pause()
    else if (st.status === 'paused') sys?.play(st.speed)
  }, [system])

  const clear = useCallback(async () => {
    sysRef.current?.clear()
    useFloodStore.getState().set({ status: 'idle', report: null, stats: null, perf: null, backend: null, error: null })
  }, [])

  const setView = useCallback((p: Partial<{ viewMode: 'now' | 'max'; threshold: number; showGround: boolean }>) => {
    useFloodStore.getState().set(p)
    const st = useFloodStore.getState()
    sysRef.current?.setView({ mode: st.viewMode, threshold: st.threshold, showGround: st.showGround })
  }, [])

  const setSpeed = useCallback((sp: Speed) => {
    useFloodStore.getState().set({ speed: sp })
    if (useFloodStore.getState().status === 'running') sysRef.current?.play(sp)
  }, [])

  if (!ready) return null

  const busy = s.status === 'preparing'
  const running = s.status === 'running' || s.status === 'paused'
  const rep = s.report
  const hyeto = stormHyetograph(s.storm)
  const totalS = rainDurationS(hyeto) + s.drainMin * 60
  const progress = s.stats ? Math.min(1, s.stats.t / totalS) : null
  const unsupported = support !== null && !support.supported
  const facts = stormFacts(s.storm)

  return (
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('grid.title')}</div>
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('ground.title')}</div>
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('buildings.title')}</div>
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

          {/* ── Rain and surface ─────────────────────────────────────── */}
          <section className="flex flex-col gap-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('rain.title')}</div>
            <select
              value={s.storm}
              onChange={(e) => s.set({ storm: e.target.value as StormPreset })}
              className="h-[28px] px-2 rounded-[7px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[11px]"
              aria-label={t('rain.title')}
            >
              {STORM_PRESETS.map((p) => {
                const f = stormFacts(p)
                return <option key={p} value={p}>{t(`rain.presets.${p}`, { mm: f.depthMm, min: f.minutes, peak: f.peakMmH })}</option>
              })}
            </select>
            <div className="text-[10px] text-[var(--text-faint)]">{t('rain.facts', { mm: facts.depthMm, min: facts.minutes, peak: facts.peakMmH })}</div>
            <LookSlider label={t('rain.after')} value={s.drainMin} min={0} max={180} step={5} format={(v) => `${v} min`} onChange={(v) => s.set({ drainMin: v })} />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('surface.title')}</span>
              <select
                value={s.manning}
                onChange={(e) => s.set({ manning: e.target.value as ManningPreset })}
                className="flex-1 h-[26px] px-1.5 rounded-[7px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[10.5px]"
                aria-label={t('surface.title')}
              >
                {(Object.keys(MANNING) as ManningPreset[]).map((m) => (
                  <option key={m} value={m}>{t(`surface.${m}`, { n: MANNING[m] })}</option>
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
            {rep && !running && (
              <Button variant="primary" disabled={unsupported} onClick={() => { void run() }}>
                {s.status === 'finished' ? t('actions.rerun') : t('actions.run')}
              </Button>
            )}
            {running && <Button onClick={() => { void togglePause() }}>{s.status === 'running' ? t('actions.pause') : t('actions.resume')}</Button>}
            {(rep || running) && <button className="ml-auto text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text)]" onClick={() => { void clear() }}>{t('actions.clear')}</button>}
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
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('report.title')}</div>
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

          {(running || s.status === 'finished') && (
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('speed.title')}</span>
                <Segmented label={t('speed.title')} value={String(s.speed) as '60' | '300' | '1200' | 'max'}
                  options={[{ id: '60', label: '1 min/s' }, { id: '300', label: '5 min/s' }, { id: '1200', label: '20 min/s' }, { id: 'max', label: t('speed.max') }]}
                  onChange={(v) => setSpeed(v === 'max' ? 'max' : (Number(v) as Speed))} />
              </div>
              <ProgressBar value={progress} />
              <StatRow label={t('live.time')} value={`${fmt((s.stats?.t ?? 0) / 60, 1)} / ${fmt(totalS / 60, 0)} min`} />
              <StatRow label={t('live.flooded')} value={`${fmt((s.stats?.floodedArea ?? 0) / 10_000, 2)} ha`} />
              <StatRow label={t('live.maxDepth')} value={`${fmt(s.stats?.hMax, 2)} m`} />
              <StatRow label={t('live.volume')} value={`${fmt(s.stats?.volume, 0)} m³`} />
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
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('view.title')}</div>
              <Segmented label={t('view.title')} value={s.viewMode}
                options={[{ id: 'now', label: t('view.now') }, { id: 'max', label: t('view.max') }]}
                onChange={(v) => setView({ viewMode: v })} />
              <LookSlider label={t('view.threshold')} value={s.threshold * 100} min={1} max={30} step={1} format={(v) => `${v} cm`} onChange={(v) => setView({ threshold: v / 100 })} />
              {(rep.terrain === 'plane' || rep.terrain === 'dem') && (
                <SwitchRow compact label={t('view.ground')} checked={s.showGround} onChange={(v) => setView({ showGround: v })} />
              )}
            </section>
          )}
        </div>
      </div>
    </ViewportPanel>
  )
}
