// ─── DaylightRooms ────────────────────────────────────────────────────────────
// Daylight inside each room (IfcSpace): its windows, the sky they really see,
// the average daylight factor, the EN 17037 level it reaches by the daylight-
// factor method, and whether the room is too deep to be lit to the back.

import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import type { AnalysisRun, HeatmapOverride } from '../../lib/solar-analysis/analysis-system'
import type { SensorSet } from '../../lib/solar-analysis/sensors'
import { SENSOR_KINDS } from '../../lib/solar-analysis/sensors'
import { sunPath, type AnalysisPeriod, type SunPathOptions } from '../../lib/solar-analysis/sun-paths'
import { windowFrames, subsetSensors } from '../../lib/solar-analysis/shading-devices'
import { roomDaylight, daylightTargets, type RoomDaylight, type DaylightWindow, type SpaceInfo } from '../../lib/solar-analysis/daylight'
import { roomGrid, internalReflected, gridLevel, roomReflectance, type Tri2, type GridLevel } from '../../lib/solar-analysis/daylight-grid'
import { buildSensorSet } from '../../lib/solar-analysis/sensors'
import { rampColor } from '../../lib/solar-analysis/results'
import { shareOrDownload } from '../../lib/share-file'
import { useSolarReportStore } from '../../stores/solarReportStore'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  north: { x: number; z: number }
  ensureSensors(): Promise<SensorSet>
  runPeriod(period: AnalysisPeriod, minAltitudeDeg: number, sensors: SensorSet): Promise<AnalysisRun>
  pathFor(period: AnalysisPeriod): SunPathOptions
  skyLabel: string
  /** Draw a run with an override (the daylight map on the floors). */
  paint(run: AnalysisRun, override: HeatmapOverride): Promise<void>
  busy: boolean
  onDone(): void
  onError(err: unknown): void
}

const EN_DAY: AnalysisPeriod = { kind: 'day', date: { month: 3, day: 21 } }
const LEVEL_COLOR = { none: '#d9534a', minimum: '#e2a33a', medium: '#7cb85c', high: '#3f9d6a' } as const

interface Inputs {
  spaces: Array<SpaceInfo & { modelId: string; localId: number; floor: Tri2[] }>
  windows: DaylightWindow[]
  targets: ReturnType<typeof daylightTargets>
}

export default function DaylightRooms(p: Props) {
  const { t, i18n } = useTranslation('solar')
  const [inputs, setInputs] = useState<Inputs | null>(null)
  /** Point-by-point result: per room, the share of its plane over each target and the level. */
  const [grid, setGrid] = useState<{ byRoom: Map<string, { level: GridLevel; share: Record<'d100' | 'd300' | 'd500' | 'd750', number>; median: number; points: number; onReflections: boolean; irc: number }>; spacing: number; points: number; T: number; R: number; image: string | null } | null>(null)
  const [gridProgress, setGridProgress] = useState<number | null>(null)
  const [working, setWorking] = useState(false)
  const [T, setT] = useState(68)
  const [R, setR] = useState(50)
  const nf = (v: number, d = 1) => v.toLocaleString(i18n.language, { maximumFractionDigits: d, minimumFractionDigits: d })

  const rooms = useMemo<RoomDaylight[] | null>(() => {
    if (!inputs) return null
    return roomDaylight(inputs.spaces, inputs.windows, inputs.targets, { transmittance: T / 100, reflectance: R / 100, backReflectance: R / 100 })
      .sort((a, b) => a.df - b.df)
  }, [inputs, T, R])

  const summary = useMemo(() => {
    if (!rooms) return null
    const lit = rooms.filter((r) => r.windows > 0)
    const by = { none: 0, minimum: 0, medium: 0, high: 0 }
    for (const r of lit) by[r.level]++
    return { rooms: rooms.length, lit: lit.length, by, deep: lit.filter((r) => r.depth > r.depthLimit).length }
  }, [rooms])

  // The report follows what is shown.
  React.useEffect(() => {
    if (!rooms || !inputs || !summary) return
    useSolarReportStore.getState().set({
      daylight: {
        targets: inputs.targets, transmittance: T / 100, reflectance: R / 100, sky: p.skyLabel, summary,
        rooms: rooms.map((r) => {
          const g = grid?.byRoom.get(r.key)
          return {
            label: r.label, floorArea: r.floorArea, windows: r.windows, df: r.df, theta: r.theta, level: r.level, tooDeep: r.windows > 0 && r.depth > r.depthLimit,
            ...(g ? { grid: { level: g.level, share300: g.share.d300, share100: g.share.d100, median: g.median, onReflections: g.onReflections } } : {}),
          }
        }),
        ...(grid ? { gridImage: grid.image, gridSpacing: grid.spacing, gridPoints: grid.points } : {}),
      },
    })
  }, [rooms, inputs, summary, T, R, p.skyLabel, grid])

  const calculate = useCallback(async () => {
    const viewer = p.viewerApiRef.current
    if (!viewer) return
    setWorking(true)
    try {
      const sa = await viewer.getSolarAnalysis()
      const spaces = await sa.getSpaces()
      if (!spaces.length) throw new Error(t('daylight.noSpaces'))
      const all = await p.ensureSensors()
      const windowKind = SENSOR_KINDS.indexOf('window')
      const sensors = subsetSensors(all, (i) => all.kind[i] === windowKind)
      if (!sensors.count) throw new Error(t('shading.noWindows'))
      // Any run gives the windows' sky view; the EN 17037 day is the cheapest.
      const run = await p.runPeriod(EN_DAY, 0, sensors)
      const frames = windowFrames(sensors, run.stats, p.north)
      const sky = new Map(run.stats.map((s) => [`${s.element.modelId}:${s.element.localId}`, s]))
      const windows: DaylightWindow[] = frames.map((f) => {
        const st = sky.get(`${f.modelId}:${f.localId}`)
        return {
          key: `${f.modelId}:${f.localId}`, label: `${(st?.element.category ?? '').replace(/^IFC/, '').toLowerCase()} #${f.localId}`,
          center: f.center, n: { x: f.n.x, z: f.n.z }, width: f.width, height: f.height,
          skyView: st?.skyView ?? 0, glassShare: st?.element.category.toUpperCase() === 'IFCWINDOW' ? 0.8 : 1,
        }
      })
      const year = sunPath({ kind: 'year' }, { ...p.pathFor({ kind: 'year' }), stepMinutes: 60, stepDays: 7, binDeg: 0 })
      const targets = daylightTargets(year.samples.map((s) => ({ dhi: s.irradiance.dhi, hours: s.hours })))
      setInputs({ spaces, windows, targets })
      setGrid(null)
      p.onDone()
    } catch (err) {
      p.onError(err)
    } finally {
      setWorking(false)
    }
  }, [p, t])

  const runGrid = useCallback(async () => {
    const viewer = p.viewerApiRef.current
    if (!viewer || !inputs || !rooms) return
    setGridProgress(0)
    try {
      const sa = await viewer.getSolarAnalysis()
      const totalArea = inputs.spaces.reduce((a, sp) => a + (sp.box.max.x - sp.box.min.x) * (sp.box.max.z - sp.box.min.z), 0)
      // ~25 000 points at most: 0.5 m in a flat, coarser in a tower.
      const spacing = Math.max(0.5, Math.round(Math.sqrt(totalArea / 25000) * 4) / 4)
      const pts: number[] = []
      const roomOf: number[] = []
      inputs.spaces.forEach((sp, k) => {
        for (const q of roomGrid(sp.box, sp.floor, spacing)) { pts.push(q.x, q.y, q.z); roomOf.push(k) }
      })
      if (!pts.length) throw new Error(t('daylight.noGrid'))
      // Out of the way for the pass: the glass (light goes through) and the room volumes.
      const hide = new Map<string, number[]>()
      for (const w of inputs.windows) {
        const [modelId, id] = w.key.split(':')
        hide.set(modelId, [...(hide.get(modelId) ?? []), Number(id)])
      }
      for (const sp of inputs.spaces) hide.set(sp.modelId, [...(hide.get(sp.modelId) ?? []), sp.localId])
      const sc = await sa.daylightPass(new Float32Array(pts), [...hide.entries()].map(([modelId, ids]) => ({ modelId, ids })), {
        directions: 400, onProgress: (f) => setGridProgress(f),
      })
      // DF per point = T · SC + the room's internally reflected component.
      const byKey = new Map(rooms.map((r) => [r.key, r]))
      const irc = inputs.spaces.map((sp) => {
        const r = byKey.get(sp.key)
        if (!r || !r.windows) return 0
        const L = sp.box.max.x - sp.box.min.x, W = sp.box.max.z - sp.box.min.z, H = sp.box.max.y - sp.box.min.y
        const obstruction = Math.max(0, Math.min(80, (1 - r.theta / 90) * 90))
        const inner = 2 * (L * W + L * H + W * H)
        return internalReflected({ transmittance: T / 100, glazedArea: r.glazedArea, innerArea: inner, reflectance: roomReflectance(R / 100, inner, r.glazedArea), obstructionDeg: obstruction })
      })
      const df = new Float32Array(sc.length)
      const sky = new Float32Array(sc.length)
      for (let i = 0; i < sc.length; i++) { sky[i] = (T / 100) * sc[i] * 100; df[i] = sky[i] + irc[roomOf[i]] }
      const tg = inputs.targets
      const targets = { d100: (100 / tg.medianLux) * 100, d300: tg.minimum, d500: tg.medium, d750: tg.high }
      const per = new Map<string, number[]>()
      const perSky = new Map<string, number[]>()
      roomOf.forEach((k, i) => {
        const key = inputs.spaces[k].key
        const l = per.get(key) ?? []; l.push(df[i]); per.set(key, l)
        const m = perSky.get(key) ?? []; m.push(sky[i]); perSky.set(key, m)
      })
      const byRoom = new Map([...per.entries()].map(([key, v]) => {
        const g = gridLevel(v, targets)
        // Would it pass on the sky it sees alone? If not, it passes on the reflections.
        const skyOnly = gridLevel(perSky.get(key) ?? [], targets)
        return [key, { ...g, points: v.length, onReflections: g.level !== 'none' && skyOnly.level === 'none', irc: irc[inputs.spaces.findIndex((sp) => sp.key === key)] }]
      }))
      // The map on the floors.
      const sensors = buildSensorSet([{ kind: 'ground', element: null, samples: Array.from({ length: sc.length }, (_, i) => ({ x: pts[i * 3], y: pts[i * 3 + 1], z: pts[i * 3 + 2], nx: 0, ny: 1, nz: 0, area: spacing * spacing })) }], { ground: spacing, surface: spacing })
      const zeros = () => new Float32Array(sensors.count)
      const run: AnalysisRun = {
        sensors, result: { sunHours: zeros(), probableSunHours: zeros(), directWh: zeros(), diffuseWh: zeros(), reflectedWh: zeros(), skyCos: zeros(), days: 1 },
        stats: [], instants: 400, rawInstants: 400, period: { kind: 'day', date: { month: 3, day: 21 } }, skyView: zeros(), open: new Uint8Array(sensors.count).fill(1), albedo: 0,
      }
      const top = Math.max(1, Math.ceil(targets.d750 * 1.5))
      await p.paint(run, { meaning: 'df', values: df, secondary: sky, range: { min: 0, max: top }, color: rampColor })
      // No picture: from outside, the façade hides a map that lies on the floors inside.
      setGrid({ byRoom, spacing, points: sc.length, T, R, image: null })
      p.onDone()
    } catch (err) {
      p.onError(err)
    } finally {
      setGridProgress(null)
    }
  }, [p, inputs, rooms, T, R, t])

  const frame = useCallback((key: string) => {
    const s = inputs?.spaces.find((x) => x.key === key)
    if (s) p.viewerApiRef.current?.frameElements([s.localId], s.modelId)
  }, [inputs, p.viewerApiRef])

  const exportCsv = useCallback(() => {
    if (!rooms || !inputs) return
    const lines = [`# target DF: minimum ${inputs.targets.minimum.toFixed(2)} %, medium ${inputs.targets.medium.toFixed(2)} %, high ${inputs.targets.high.toFixed(2)} % (median diffuse ${Math.round(inputs.targets.medianLux)} lx); T ${T} %, R ${R} %`,
      'room,floor_m2,windows,glazed_m2,theta_deg,df_pct,en17037_level,depth_m,depth_limit_m']
    for (const r of rooms) lines.push([`"${r.label.replace(/"/g, '""')}"`, r.floorArea.toFixed(1), r.windows, r.glazedArea.toFixed(2), r.theta.toFixed(0), r.df.toFixed(2), r.level, r.depth.toFixed(1), r.depthLimit.toFixed(1)].join(','))
    void shareOrDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), 'solar-daylight.csv')
  }, [rooms, inputs, T, R])

  return (
    <div className="flex flex-col gap-1.5 text-[10.5px]">
      <label className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-1.5">
        <span>{t('daylight.transmittance')}</span>
        <input type="range" min={40} max={85} step={1} value={T} onChange={(e) => setT(Number(e.target.value))} className="accent-[var(--accent)]" />
        <span className="font-mono tabular-nums text-right text-[var(--text)]">{T} %</span>
      </label>
      <label className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-1.5">
        <span>{t('daylight.reflectance')}</span>
        <input type="range" min={20} max={80} step={1} value={R} onChange={(e) => setR(Number(e.target.value))} className="accent-[var(--accent)]" />
        <span className="font-mono tabular-nums text-right text-[var(--text)]">{R} %</span>
      </label>
      <div className="flex items-center gap-1.5">
        <button disabled={p.busy || working} onClick={() => { void calculate() }} className="px-2.5 py-1.5 rounded-[8px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
          {working ? t('daylight.working') : rooms ? t('daylight.recalc') : t('daylight.calc')}
        </button>
        {rooms && (
          <button disabled={p.busy || working || gridProgress !== null} onClick={() => { void runGrid() }} title={t('daylight.gridHint')}
            className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40">
            {gridProgress !== null ? t('daylight.gridWorking', { pct: Math.round(gridProgress * 100) }) : grid ? t('daylight.gridAgain') : t('daylight.grid')}
          </button>
        )}
        {rooms && <button onClick={exportCsv} className="ml-auto px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">CSV</button>}
      </div>
      {grid && (grid.T !== T || grid.R !== R) && <p className="text-[9.5px] text-[#F5A623]">{t('daylight.gridStale')}</p>}
      {!rooms && <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('daylight.hint')}</p>}
      {rooms && inputs && summary && (
        <>
          <div className="text-[var(--text)]">{t('daylight.summary', { ok: summary.lit - summary.by.none, lit: summary.lit, rooms: summary.rooms })}</div>
          <div className="flex h-2 rounded-full overflow-hidden">
            {(['none', 'minimum', 'medium', 'high'] as const).map((k) => <div key={k} style={{ width: `${(summary.by[k] / Math.max(1, summary.lit)) * 100}%`, background: LEVEL_COLOR[k] }} />)}
          </div>
          <div className="text-[9.5px] text-[var(--text-faint)]">
            {t('daylight.targets', { min: nf(inputs.targets.minimum), med: nf(inputs.targets.medium), high: nf(inputs.targets.high), lux: Math.round(inputs.targets.medianLux / 100) * 100 })}
          </div>
          {grid && (() => {
            const lit = rooms.filter((r) => grid.byRoom.has(r.key) && r.windows > 0)
            const ok = lit.filter((r) => grid.byRoom.get(r.key)!.level !== 'none').length
            const refl = lit.filter((r) => grid.byRoom.get(r.key)!.onReflections).length
            return <>
              <div className="text-[var(--text)] font-medium">{t('daylight.gridSummary', { ok, lit: lit.length, points: grid.points.toLocaleString(i18n.language), spacing: grid.spacing })}</div>
              {refl > 0 && <p className="text-[9.5px] text-[#F5A623] leading-snug">{t('daylight.onReflections', { n: refl })}</p>}
            </>
          })()}
          <div className={`grid ${grid ? 'grid-cols-[1fr_2.6rem_3.2rem_3rem]' : 'grid-cols-[1fr_3rem_2.4rem_3.4rem]'} gap-x-2 text-[9.5px] text-[var(--text-faint)] mt-1`}>
            <span>{t('daylight.room')}</span>
            {grid ? <><span className="text-right">FLD</span><span className="text-right" title={t('daylight.shareHint')}>≥300lx</span><span className="text-right">≥100lx</span></>
              : <><span className="text-right">m²</span><span className="text-right">{t('daylight.win')}</span><span className="text-right">FLD</span></>}
          </div>
          <div className="flex flex-col max-h-[220px] overflow-y-auto">
            {rooms.map((r) => (
              <button key={r.key} onClick={() => frame(r.key)} className={`grid ${grid ? 'grid-cols-[1fr_2.6rem_3.2rem_3rem]' : 'grid-cols-[1fr_3rem_2.4rem_3.4rem]'} gap-x-2 text-left hover:bg-[var(--surface-2)] rounded px-0.5`}
                title={r.windows ? t('daylight.rowHint', { theta: Math.round(r.theta), depth: nf(r.depth), limit: nf(r.depthLimit) }) : t('daylight.noWindows')}>
                <span className="truncate flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.windows ? LEVEL_COLOR[grid?.byRoom.get(r.key)?.level ?? r.level] : 'var(--border-strong)' }} />
                  {r.label}{r.windows > 0 && r.depth > r.depthLimit && <span className="text-[#F5A623]" title={t('daylight.tooDeep')}> ⚠</span>}
                </span>
                {grid ? (() => {
                  const g = grid.byRoom.get(r.key)
                  return <>
                    <span className="font-mono tabular-nums text-right">{r.windows ? nf(r.df) : '—'}</span>
                    <span className={`font-mono tabular-nums text-right ${g && g.share.d300 >= 0.5 ? 'text-[#4caf7a]' : 'text-[#e2603a]'}`}>{g ? `${Math.round(g.share.d300 * 100)}%` : '—'}</span>
                    <span className={`font-mono tabular-nums text-right ${g && g.share.d100 >= 0.95 ? 'text-[#4caf7a]' : 'text-[#e2603a]'}`}>{g ? `${Math.round(g.share.d100 * 100)}%` : '—'}</span>
                  </>
                })() : <>
                  <span className="font-mono tabular-nums text-right">{nf(r.floorArea, 0)}</span>
                  <span className="font-mono tabular-nums text-right">{r.windows}</span>
                  <span className="font-mono tabular-nums text-right text-[var(--text)]">{r.windows ? `${nf(r.df)} %` : '—'}</span>
                </>}
              </button>
            ))}
          </div>
          {summary.deep > 0 && <p className="text-[9.5px] text-[#F5A623] leading-snug">{t('daylight.deepNote', { n: summary.deep })}</p>}
          <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('daylight.note')}</p>
        </>
      )}
    </div>
  )
}
