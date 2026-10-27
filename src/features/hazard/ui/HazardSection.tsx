// ─── "Rain & slopes" section of the flood panel ──────────────────────────────
// Before the grid is built: load the study area (KMZ/KML) so the grid covers
// it. Once built: soil and runout parameters, run the sweep, then the storm's
// timeline, the layer, the maquette and the critical-rain table with exports.
// Indicative only, and it says so.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Notice, Segmented, SwitchRow, LookSlider, StatRow, ProgressBar, Button } from '../../../components/geo/ui'
import { shareOrDownload } from '../../../lib/share-file'
import type { ViewerAPI } from '../../../lib/viewer'
import { useFloodStore } from '../../flood/store'
import { ensureHazardI18n, HAZARD_NS } from '../i18n'
import { useHazardStore } from '../store'
import { parseKmlOrKmz } from '../io/kml'
import { hazardRainSteps } from '../rain'
import { anchorOnKmz } from '../anchor'
import { DRY_UNSTABLE, P_STOPS, Q_STOPS, type HazardLayerKind } from '../view/hazard-layer'
import type { HazardSystemAPI } from '../system'
import type { LandCover, Moisture, SoilGroup } from '../core/scs-cn'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  caption: string
  selectCls: string
  mapOn: boolean
}

/** A study area to try the tool on: Quebrada Quirio, Chosica (Lima). Made-up placemarks. */
const EXAMPLE_URL = `${import.meta.env.BASE_URL}samples/hazard/chosica-example.kml`
const EXAMPLE_NAME = 'chosica-example.kml'

const COVERS: LandCover[] =['forest', 'shrub', 'grass', 'crop', 'bare', 'urban']

/**
 * The flood grid the last study ran on. The section unmounts whenever the
 * panel closes; the study must outlive that and only go stale with the grid.
 */
let studiedReport: unknown = null

export default function HazardSection({ viewerApiRef, caption, selectCls, mapOn }: Props) {
  const { i18n } = useTranslation()
  const [ready, setReady] = useState(false)
  const t = useMemo(
    () => (i18n.getFixedT as (lng: string, ns: string) => unknown)(i18n.language, HAZARD_NS) as (key: string, opts?: Record<string, unknown>) => string,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, i18n.language, ready],
  )
  const h = useHazardStore()
  const floodReport = useFloodStore((s) => s.report)
  const floodBusy = useFloodStore((s) => s.status === 'preparing')
  const hyetograph = useFloodStore((s) => s.hyetograph)
  const sysRef = useRef<HazardSystemAPI | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(true)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let alive = true
    void ensureHazardI18n(i18n.language).then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [i18n.language])

  // Reopened panel: reattach to the study that is still on screen.
  useEffect(() => {
    void viewerApiRef.current?.getHazard().then((sys) => { sysRef.current = sys })
  }, [viewerApiRef])

  // A new grid (or none) makes the last study stale — not the panel closing and opening.
  useEffect(() => {
    if (floodReport === studiedReport) return
    studiedReport = floodReport
    void viewerApiRef.current?.getHazard().then((sys) => sys.clear())
    useHazardStore.getState().set({ status: 'idle', report: null, rows: [], steps: [], step: 0, progress: null })
    setPlaying(false)
  }, [floodReport, viewerApiRef])

  // Storm playback: one step every 600 ms.
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const st = useHazardStore.getState()
      const next = st.step + 1
      if (next >= st.steps.length) { setPlaying(false); return }
      st.set({ step: next })
      sysRef.current?.setStep(next)
    }, 600)
    return () => window.clearInterval(id)
  }, [playing])

  const system = async (): Promise<HazardSystemAPI | null> => {
    const v = viewerApiRef.current
    if (!v) return null
    sysRef.current ??= await v.getHazard()
    return sysRef.current
  }

  const loadKmz = async (file: File): Promise<void> => {
    try {
      const placemarks = parseKmlOrKmz(new Uint8Array(await file.arrayBuffer()))
      // Nothing else places the scene: the KMZ does, so the map can open on it.
      const anchored = anchorOnKmz(placemarks, file.name, (viewerApiRef.current?.getLoadedModelIds().length ?? 0) > 0)
      const sys = await system()
      const extentPoints = mapOn ? sys?.extentOf(placemarks) ?? null : null
      h.set({ kmzName: file.name, placemarks, extentPoints, anchored, error: placemarks.length ? null : t('kmz.empty') })
    } catch (err) {
      h.set({ kmzName: null, placemarks: null, extentPoints: null, anchored: false, error: t('kmz.failed', { message: (err as Error)?.message ?? String(err) }) })
    }
  }

  const run = async (): Promise<void> => {
    const sys = await system()
    if (!sys) return
    const st = useHazardStore.getState()
    const rain = hazardRainSteps(hyetograph, st.maxRainMm, 10)
    st.set({ status: 'running', error: null, progress: { done: 0, of: rain.cumRainMm.length }, steps: rain.cumRainMm, minutes: rain.minutes, stormSteps: rain.stormSteps, step: 0, rows: [], report: null })
    setPlaying(false)
    try {
      await sys.run({
        placemarks: st.placemarks,
        soilGroup: st.soilGroup,
        moisture: st.moisture,
        fallbackCover: st.fallbackCover,
        soil: {
          mean: { cohesionKPa: st.cohesionKPa, frictionDeg: st.frictionDeg, unitWeightKNm3: st.unitWeightKNm3, depthM: st.depthM },
          cov: { cohesionKPa: 0.4, frictionDeg: 0.1, unitWeightKNm3: 0.05, depthM: 0.3 },
        },
        travelAngleDeg: st.travelAngleDeg,
        failThreshold: st.failThreshold,
        runoffThresholdMm: st.runoffThresholdMm,
        cumRainMm: rain.cumRainMm,
        samples: st.samples,
      }, {
        onProgress: (done, of) => useHazardStore.getState().set({ progress: { done, of }, step: done - 1 }),
        onDone: (report, rows) => {
          sys.setLayer(useHazardStore.getState().layer)
          sys.setBlock(useHazardStore.getState().block)
          sys.setLabelsVisible(useHazardStore.getState().labels)
          // Open on the end of the storm itself, not the ladder beyond it.
          const k = Math.max(0, rain.stormSteps - 1)
          sys.setStep(k)
          useHazardStore.getState().set({ status: 'done', report, rows, progress: null, step: k })
        },
        onError: (message) => useHazardStore.getState().set({ status: 'error', error: message, progress: null }),
      })
    } catch (err) {
      useHazardStore.getState().set({ status: 'error', error: (err as Error)?.message ?? String(err), progress: null })
    }
  }

  const exportTable = async (kind: 'csv' | 'geojson'): Promise<void> => {
    const sys = sysRef.current
    if (!sys) return
    const text = kind === 'csv'
      ? sys.exportCsv([t('table.csv.id'), t('table.csv.name'), t('table.csv.kind'), t('table.csv.rain'), t('table.csv.cause'), t('table.csv.dry')])
      : sys.exportGeoJson()
    if (!text) return
    const type = kind === 'csv' ? 'text/csv' : 'application/geo+json'
    await shareOrDownload(new Blob([kind === 'csv' ? `﻿${text}` : text], { type }), `critical-rainfall.${kind}`)
  }

  const running = h.status === 'running'
  const done = h.status === 'done'
  const stepRain = h.steps[h.step]
  const stepMin = h.minutes[h.step]
  const legend = h.layer === 'runoff' ? Q_STOPS : h.layer === 'susceptibility' ? P_STOPS : null

  return (
    <section className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--border)] p-2.5">
      <button className="flex items-center text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className={caption}>{t('title')}</div>
        <span className="ml-auto text-[10px] text-[var(--text-faint)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          <div className="text-[10.5px] leading-snug text-[var(--text-faint)]">{t('intro')}</div>

          {/* ── Study area ── */}
          <div className="flex items-center gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={running}>{h.kmzName ? t('kmz.replace') : t('kmz.load')}</Button>
            <span className="truncate text-[10.5px] text-[var(--text-faint)]">{h.kmzName ?? t('kmz.none')}</span>
            {h.kmzName && (
              <button className="ml-auto text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text)]"
                onClick={() => h.set({ kmzName: null, placemarks: null, extentPoints: null, anchored: false })}>{t('kmz.remove')}</button>
            )}
            <input ref={fileRef} type="file" accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadKmz(f) }} />
          </div>
          {!h.kmzName && (
            <button className="self-start text-[10.5px] text-[var(--accent-2)] hover:underline" disabled={running}
              onClick={() => {
                void fetch(EXAMPLE_URL).then((r) => r.blob()).then((b) => loadKmz(new File([b], EXAMPLE_NAME)))
              }}>{t('kmz.example')}</button>
          )}
          {h.kmzName === EXAMPLE_NAME && <Notice tone="warn">{t('kmz.exampleNote')}</Notice>}
          {!mapOn && <Notice tone="info">{h.anchored ? t('kmz.anchored') : t('kmz.needsMap')}</Notice>}
          {h.placemarks && floodReport && !floodBusy && h.status === 'idle' && <Notice tone="muted">{t('kmz.rebuild')}</Notice>}

          {/* ── Soil ── */}
          <div className="flex items-center gap-2">
            <span className="w-[74px] text-[10px] text-[var(--text-faint)]">{t('soil.group')}</span>
            <Segmented label={t('soil.group')} size="xs" value={h.soilGroup}
              options={(['A', 'B', 'C', 'D'] as SoilGroup[]).map((g) => ({ id: g, label: g }))}
              onChange={(v) => h.set({ soilGroup: v })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[74px] text-[10px] text-[var(--text-faint)]">{t('soil.moisture')}</span>
            <select value={h.moisture} onChange={(e) => h.set({ moisture: e.target.value as Moisture })} className={`flex-1 ${selectCls}`} aria-label={t('soil.moisture')}>
              {(['I', 'II', 'III'] as Moisture[]).map((m) => <option key={m} value={m}>{t(`soil.amc.${m}`)}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[74px] text-[10px] text-[var(--text-faint)]">{t('soil.cover')}</span>
            <select value={h.fallbackCover} onChange={(e) => h.set({ fallbackCover: e.target.value as LandCover })} className={`flex-1 ${selectCls}`} aria-label={t('soil.cover')}>
              {COVERS.map((c) => <option key={c} value={c}>{t(`cover.${c}`)}</option>)}
            </select>
          </div>
          <LookSlider label={t('soil.cohesion')} value={h.cohesionKPa} min={0} max={30} step={0.5} format={(v) => `${v} kPa`} onChange={(v) => h.set({ cohesionKPa: v })} />
          <LookSlider label={t('soil.friction')} value={h.frictionDeg} min={15} max={45} step={1} format={(v) => `${v}°`} onChange={(v) => h.set({ frictionDeg: v })} />
          <LookSlider label={t('soil.depth')} value={h.depthM} min={0.3} max={5} step={0.1} format={(v) => `${v.toFixed(1)} m`} onChange={(v) => h.set({ depthM: v })} />
          <LookSlider label={t('soil.weight')} value={h.unitWeightKNm3} min={14} max={22} step={0.5} format={(v) => `${v} kN/m³`} onChange={(v) => h.set({ unitWeightKNm3: v })} />
          <LookSlider label={t('runout.angle')} value={h.travelAngleDeg} min={6} max={25} step={1} format={(v) => `${v}°`} onChange={(v) => h.set({ travelAngleDeg: v })} />
          <LookSlider label={t('runout.maxRain')} value={h.maxRainMm} min={50} max={600} step={10} format={(v) => `${v} mm`} onChange={(v) => h.set({ maxRainMm: v })} />

          <div className="flex items-center gap-2">
            <Button variant="primary" disabled={!floodReport || floodBusy || running} onClick={() => { void run() }}>
              {done ? t('actions.rerun') : t('actions.run')}
            </Button>
            {!floodReport && <span className="text-[10px] text-[var(--text-faint)]">{t('actions.needsGrid')}</span>}
          </div>
          {running && h.progress && (
            <div className="flex flex-col gap-1">
              <ProgressBar value={h.progress.done / Math.max(1, h.progress.of)} />
              <span className="text-[10px] text-[var(--text-faint)]">{t('actions.progress', { done: h.progress.done, of: h.progress.of })}</span>
            </div>
          )}
          {h.error && <Notice tone="danger">{h.error}</Notice>}

          {/* ── Results ── */}
          {(done || (running && h.steps.length > 0)) && (
            <>
              <div className="flex items-center gap-2">
                <button className="h-[24px] w-[28px] rounded-[7px] border border-[var(--border)] text-[11px]" disabled={!done}
                  aria-label={playing ? t('timeline.pause') : t('timeline.play')}
                  onClick={() => {
                    if (!playing && h.step >= h.steps.length - 1) { h.set({ step: 0 }); sysRef.current?.setStep(0) }
                    setPlaying((v) => !v)
                  }}>{playing ? '❚❚' : '▶'}</button>
                <input type="range" className="flex-1" min={0} max={Math.max(0, h.steps.length - 1)} value={h.step} disabled={!done}
                  aria-label={t('timeline.label')}
                  onChange={(e) => { const k = Number(e.target.value); h.set({ step: k }); sysRef.current?.setStep(k); setPlaying(false) }} />
              </div>
              <div className="text-[10.5px] text-[var(--text)]">
                {stepRain !== undefined && (stepMin !== null && stepMin !== undefined
                  ? t('timeline.storm', { mm: Math.round(stepRain), min: Math.round(stepMin) })
                  : t('timeline.beyond', { mm: Math.round(stepRain) }))}
              </div>
              <Segmented<HazardLayerKind> label={t('layer.title')} value={h.layer}
                options={[{ id: 'susceptibility', label: t('layer.susceptibility') }, { id: 'runoff', label: t('layer.runoff') }, { id: 'debris', label: t('layer.debris') }]}
                onChange={(v) => { h.set({ layer: v }); sysRef.current?.setLayer(v) }} />
              {legend && (
                <div className="flex items-center gap-1">
                  <span className="text-[9.5px] text-[var(--text-faint)]">{h.layer === 'runoff' ? '0 mm' : '0 %'}</span>
                  <div className="h-[8px] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${legend.map(([, c]) => c).join(', ')})` }} />
                  <span className="text-[9.5px] text-[var(--text-faint)]">{h.layer === 'runoff' ? `${legend[legend.length - 1][0]} mm` : '100 %'}</span>
                </div>
              )}
              <div className="text-[10px] text-[var(--text-faint)]">{t(`layer.note.${h.layer}`)}</div>
              <button className="self-start text-[10.5px] text-[var(--accent-2)] hover:underline" onClick={() => sysRef.current?.frame()}>{t('view.frame')}</button>
              <SwitchRow compact label={t('view.block')} checked={h.block} onChange={(v) => { h.set({ block: v }); sysRef.current?.setBlock(v) }} />
              <SwitchRow compact label={t('view.labels')} checked={h.labels} onChange={(v) => { h.set({ labels: v }); sysRef.current?.setLabelsVisible(v) }} />
            </>
          )}

          {done && h.report && (
            <section className="flex flex-col gap-1">
              <StatRow label={t('report.grid')} value={`${h.report.nx} × ${h.report.ny} · ${h.report.dx.toFixed(1)} m`} />
              <StatRow label={t('report.cn')} value={Number.isFinite(h.report.meanCn) ? h.report.meanCn.toFixed(0) : '—'} />
              <StatRow label={t('report.elements')} value={t(`report.source.${h.report.source}`, h.report.counts)} />
              {h.report.dryCells > 0 && (
                <Notice tone="warn">
                  <span className="mr-1 inline-block h-[8px] w-[8px] rounded-[2px] align-middle" style={{ background: DRY_UNSTABLE }} />
                  {t('report.dry', { ha: (h.report.dryCells * h.report.dx * h.report.dx / 10000).toFixed(1) })}
                </Notice>
              )}
              {h.report.coarsen > 1 && <Notice tone="muted">{t('report.coarsened', { k: h.report.coarsen })}</Notice>}
              {h.report.outside > 0 && <Notice tone="warn">{t('report.outside', { n: h.report.outside })}</Notice>}

              <div className="mt-1 flex items-center">
                <div className={caption}>{t('table.title')}</div>
                <button className="ml-auto text-[10.5px] text-[var(--accent-2)] hover:underline" onClick={() => { void exportTable('csv') }}>CSV</button>
                <button className="ml-2 text-[10.5px] text-[var(--accent-2)] hover:underline" onClick={() => { void exportTable('geojson') }}>GeoJSON</button>
              </div>
              {h.rows.length === 0
                ? <div className="text-[10.5px] text-[var(--text-faint)]">{t('table.empty')}</div>
                : (
                  <div className="max-h-[220px] overflow-auto rounded-[8px] border border-[var(--border)]">
                    <table className="w-full text-[10.5px]">
                      <thead className="sticky top-0 bg-[var(--surface-2)] text-[var(--text-faint)]">
                        <tr><th className="px-1.5 py-1 text-left font-medium">{t('table.element')}</th><th className="px-1.5 py-1 text-right font-medium">{t('table.rain')}</th></tr>
                      </thead>
                      <tbody>
                        {h.rows.slice(0, 300).map((r) => (
                          <tr key={r.id} className="border-t border-[var(--border)]">
                            <td className="px-1.5 py-1">
                              <div className="truncate max-w-[170px]" title={r.name}>{r.name}</div>
                              <div className="text-[9.5px] text-[var(--text-faint)]">{t(`kind.${r.kind}`)}{r.cause ? ` · ${t(`cause.${r.cause}`)}` : ''}</div>
                              {r.dryUnstable && <div className="text-[9.5px]" style={{ color: DRY_UNSTABLE }}>{t('table.dry')}</div>}
                            </td>
                            <td className={`px-1.5 py-1 text-right tabular-nums ${r.rainMm !== null && stepRain !== undefined && stepRain >= r.rainMm ? 'text-[var(--danger,#d9442b)] font-semibold' : ''}`}>
                              {r.rainMm === null ? t('table.never', { mm: h.maxRainMm }) : `${Math.round(r.rainMm)} mm`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </section>
          )}

          <Notice tone="muted">{t('disclaimer')}</Notice>
        </>
      )}
    </section>
  )
}
