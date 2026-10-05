// ─── SolarAnalysisPanel ───────────────────────────────────────────────────────
// Sun hours, irradiation and the site's climate, measured on the IFC itself.
// An architect's questions, in order: what is the climate here; where does the
// sun reach and for how long (site, façades, windows, roofs — with the city
// around it when the map is on); which windows fail EN 17037 sunlight
// exposure; which glazing will overheat and which earns winter heat; and where
// on the plan each kind of room belongs.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from '../ViewportPanel'
import { useSolarStore } from '../../stores/solarStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useSolarAnalysisStore, type PeriodChoice, type SkyModel, type Precision } from '../../stores/solarAnalysisStore'
import type { ViewerAPI } from '../../lib/viewer'
import type { AnalysisRun, HoverInfo } from '../../lib/solar-analysis/analysis-system'
import type { SensorSet, SensorKind } from '../../lib/solar-analysis/sensors'
import type { AnalysisPeriod } from '../../lib/solar-analysis/sun-paths'
import { KEY_DATES } from '../../lib/solar-analysis/sun-paths'
import { fetchClimate, fetchTypicalSky, cachedTypicalSky, skyAt, seasonRange, type ClimateSummary } from '../../lib/solar-analysis/climate'
import { metricValue, metricUnit, rampCss, SOLAR_METRICS, type ElementStat, type SolarMetric } from '../../lib/solar-analysis/results'
import { ALBEDOS } from '../../lib/solar-analysis/irradiance'
import { sunAlmanac } from '../../lib/solar/astronomy'
import {
  en17037Findings, summarizeEn17037, summerGainFindings, winterGainFindings, orientationTable,
  type SolarFinding, type OrientationRow,
} from '../../lib/solar-analysis/findings'
import { northDirection } from '../../lib/geo/geo-math'
import { issuesToBcfTopics, downloadBcfBlob } from '../../lib/bcf'
import type { ValidationIssue } from '../../types'
import { shareOrDownload } from '../../lib/share-file'
import { useSolarReportStore, type HeatmapSection } from '../../stores/solarReportStore'

const PointProbe = React.lazy(() => import('./PointProbe'))
const ShadingDesigner = React.lazy(() => import('./ShadingDesigner'))
const PvDesigner = React.lazy(() => import('./PvDesigner'))
const VariantCompare = React.lazy(() => import('./VariantCompare'))
const DaylightRooms = React.lazy(() => import('./DaylightRooms'))

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

const KINDS: SensorKind[] = ['ground', 'facade', 'window', 'roof']
const PERIODS: PeriodChoice[] = ['winterSolstice', 'summerSolstice', 'equinox', 'enReference', 'coldSeason', 'hotSeason', 'year', 'customDay']
const SKY_MODELS: SkyModel[] = ['measured', 'clearness', 'clear']
const PRECISIONS: Precision[] = ['fast', 'standard', 'fine']
/** Minutes between instants and sky-patch size (degrees), per precision. */
const PRECISION: Record<Precision, { dayStep: number; longStep: number; binDeg: number }> = {
  fast: { dayStep: 15, longStep: 20, binDeg: 3 },
  standard: { dayStep: 6, longStep: 10, binDeg: 2 },
  fine: { dayStep: 2, longStep: 5, binDeg: 1 },
}

/** The value an element is listed by, for a metric. */
const statValue = (metric: SolarMetric) => (x: ElementStat): number =>
  metric === 'sunHours' ? x.sunHoursPerDay
    : metric === 'probableSun' ? x.probableSunPerDay
      : metric === 'irradiation' ? x.irradiationKwh
        : x.skyView * 100

// The heavy state: sensors and the last runs, outside React.
const ref: {
  sensors: SensorSet | null
  sensorsKey: string
  last: AnalysisRun | null
  /** Sky model the last displayed run used. */
  lastSky: SkyModel
  /** What the last displayed run measured, for people. */
  lastLabel: string
  en: { run: AnalysisRun; findings: SolarFinding[] } | null
  seasons: { summer: AnalysisRun; winter: AnalysisRun; summerFindings: SolarFinding[]; winterFindings: SolarFinding[]; rooms: OrientationRow[] } | null
} = { sensors: null, sensorsKey: '', last: null, lastSky: 'clear', lastLabel: '', en: null, seasons: null }

const fmt = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '—')

export default function SolarAnalysisPanel({ viewerApiRef }: Props) {
  const { t, i18n } = useTranslation('solar')
  const s = useSolarAnalysisStore()
  const location = useSolarStore((x) => x.location)
  const timeZone = useSolarStore((x) => x.timeZone)
  const models = useSceneStore((x) => x.models)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [enMinAlt, setEnMinAlt] = useState(10)
  const abortRef = useRef<AbortController | null>(null)
  const effectiveSkyRef = useRef<SkyModel>('clear')

  const south = (location?.lat ?? 0) < 0
  const north = useMemo(() => {
    const n = northDirection(((location?.yawDeg ?? 0) * Math.PI) / 180)
    return { x: n.x, z: n.z }
  }, [location?.yawDeg])
  const monthName = useCallback((m: number) => new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15))), [i18n.language])

  // ── Climate ──────────────────────────────────────────────────────────────
  const loadClimate = useCallback(async () => {
    if (!location) return
    s.setClimate(null, 'loading')
    // The daily normals and the hourly sky are two requests to the same
    // service under the same consent; the sky is a bonus — the analysis falls
    // back to the monthly clearness without it.
    const [c, sky] = await Promise.allSettled([fetchClimate(location.lat, location.lon), fetchTypicalSky(location.lat, location.lon)])
    if (sky.status === 'fulfilled') s.setSky(sky.value)
    if (c.status === 'fulfilled') s.setClimate(c.value, 'done')
    else s.setClimate(null, 'error', c.reason instanceof Error ? c.reason.message : String(c.reason))
  }, [location, s])

  // A cached climate for this place shows up without asking again.
  useEffect(() => {
    if (!location || s.climate) return
    try {
      const hit = localStorage.getItem(`ifc.climate.v1.${location.lat.toFixed(2)},${location.lon.toFixed(2)}`)
      if (hit) s.setClimate(JSON.parse(hit) as ClimateSummary, 'done')
    } catch { /* no storage */ }
    const sky = cachedTypicalSky(location.lat, location.lon)
    if (sky) s.setSky(sky)
  }, [location, s])

  // ── Periods ──────────────────────────────────────────────────────────────
  const periodFor = useCallback((p: PeriodChoice, climate: ClimateSummary | null): AnalysisPeriod => {
    const winter = south ? KEY_DATES.juneSolstice : KEY_DATES.decemberSolstice
    const summer = south ? KEY_DATES.decemberSolstice : KEY_DATES.juneSolstice
    switch (p) {
      case 'winterSolstice': return { kind: 'day', date: winter }
      case 'summerSolstice': return { kind: 'day', date: summer }
      case 'equinox': return { kind: 'day', date: KEY_DATES.marchEquinox }
      case 'enReference': return { kind: 'day', date: { month: 3, day: 21 } }
      case 'customDay': return { kind: 'day', date: s.customDay }
      case 'year': return { kind: 'year' }
      case 'hotSeason': {
        const months = climate?.hotMonths ?? (south ? [12, 1, 2] : [6, 7, 8])
        return { kind: 'range', ...seasonRange(months) }
      }
      case 'coldSeason': {
        const months = climate?.coldMonths ?? (south ? [6, 7, 8] : [12, 1, 2])
        return { kind: 'range', ...seasonRange(months) }
      }
    }
  }, [south, s.customDay])

  // The sky actually used: the one asked for, or the best one loaded below it.
  const effectiveSky: SkyModel = s.skyModel === 'measured' && s.sky ? 'measured'
    : s.skyModel !== 'clear' && s.climate ? 'clearness' : 'clear'
  effectiveSkyRef.current = effectiveSky

  // Chance of sunshine per month from the daily normals: sunshine hours ÷ the
  // hours the sun is up mid-month. Only for the 'clearness' sky.
  const sunshineShare = useMemo(() => {
    if (!location || !s.climate) return null
    return s.climate.months.map((m) => {
      const len = sunAlmanac(2026, m.month, 15, location.lat, location.lon, timeZone).dayLengthMin / 60
      return len > 0 ? Math.min(1, m.sunshineHours / len) : 0
    })
  }, [location, timeZone, s.climate])

  const pathFor = useCallback((period: AnalysisPeriod, minAltitudeDeg = 0) => {
    if (!location) throw new Error('No location')
    const pr = PRECISION[useSolarAnalysisStore.getState().precision]
    const climate = s.climate
    const sky = s.sky
    return {
      lat: location.lat, lon: location.lon, yawDeg: location.yawDeg, timeZone,
      year: new Date().getUTCFullYear(),
      stepMinutes: period.kind === 'day' ? pr.dayStep : pr.longStep,
      binDeg: pr.binDeg,
      minAltitudeDeg,
      elevationM: sky?.elevationM ?? 0,
      measured: effectiveSky === 'measured' && sky ? (utc: number) => skyAt(sky, utc) : undefined,
      clearness: effectiveSky === 'clearness' && climate ? (m: number) => climate.months[m - 1]?.clearness ?? 1 : undefined,
      sunshineShare: sunshineShare ? (m: number) => sunshineShare[m - 1] ?? 1 : undefined,
    }
  }, [location, timeZone, s.climate, s.sky, effectiveSky, sunshineShare])

  // ── Running ──────────────────────────────────────────────────────────────
  const ensureSensors = useCallback(async (): Promise<SensorSet> => {
    const viewer = viewerApiRef.current
    if (!viewer) throw new Error('Viewer not ready')
    const sa = await viewer.getSolarAnalysis()
    const key = `${viewer.getLoadedModelIds().join('|')}#${JSON.stringify(viewer.getModelBounds() ?? null)}`
    if (!ref.sensors || ref.sensorsKey !== key) {
      s.setRun({ status: 'sensors', progress: 0, error: null })
      ref.sensors = await sa.buildSensors({ ground: true, surfaces: true }, (f) => s.setRun({ progress: f }))
      ref.sensorsKey = key
    }
    return ref.sensors
  }, [viewerApiRef, s])

  const runPeriod = useCallback(async (period: AnalysisPeriod, minAltitudeDeg = 0, only?: SensorSet): Promise<AnalysisRun> => {
    const viewer = viewerApiRef.current
    if (!viewer) throw new Error('Viewer not ready')
    const sa = await viewer.getSolarAnalysis()
    const sensors = only ?? await ensureSensors()
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    s.setRun({ status: 'running', progress: 0, error: null })
    return sa.run(sensors, period, pathFor(period, minAltitudeDeg), {
      onProgress: (f) => s.setRun({ progress: f }), signal: ctrl.signal, albedo: useSolarAnalysisStore.getState().albedo,
    })
  }, [viewerApiRef, ensureSensors, pathFor, s])

  const display = useCallback(async (run: AnalysisRun) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const sa = await viewer.getSolarAnalysis()
    const st = useSolarAnalysisStore.getState()
    const range = sa.show(run, st.metric, new Set(st.kinds))
    sa.onHover(setHover)
    ref.last = run
    ref.lastSky = effectiveSkyRef.current
    s.setRun({ status: 'done', progress: 1, range })
    s.bumpResult()
  }, [viewerApiRef, s])

  /** The 3D view as it is now, once the heatmap has been drawn. */
  const snapshot = useCallback(async (): Promise<string | null> => {
    const viewer = viewerApiRef.current
    if (!viewer || !location) return null
    try {
      const { framedShot } = await import('../../lib/report/framed-shot')
      return await framedShot(viewer, location.lat, location.yawDeg)
    } catch { return null }
  }, [viewerApiRef, location])

  /** Publish what the heatmap shows to the report. */
  const publishHeatmap = useCallback(async (run: AnalysisRun, periodLabel: string) => {
    ref.lastLabel = periodLabel
    const st = useSolarAnalysisStore.getState()
    const range = st.range ?? { min: 0, max: 1 }
    const value = statValue(st.metric)
    const averages = KINDS.map((k) => {
      let sum = 0, area = 0
      for (let i = 0; i < run.sensors.count; i++) {
        if (run.open[i] === 0 || KINDS[run.sensors.kind[i]] !== k) continue
        sum += metricValue(run.result, st.metric, i) * run.sensors.area[i]
        area += run.sensors.area[i]
      }
      return { kind: k, value: area > 0 ? sum / area : NaN }
    }).filter((a) => Number.isFinite(a.value))
    const windows = [...run.stats.filter((x) => x.element.kind === 'window')].sort((a, b) => value(a) - value(b))
    const label = (x: ElementStat) => `${x.element.category.replace(/^IFC/, '').toLowerCase()} #${x.element.localId}`
    const section: HeatmapSection = {
      image: await snapshot(), metric: st.metric, periodLabel, range, averages,
      least: windows.slice(0, 5).map((x) => ({ label: label(x), value: value(x) })),
      most: windows.slice(-5).reverse().map((x) => ({ label: label(x), value: value(x) })),
      instants: run.instants, rawInstants: run.rawInstants, sensors: run.open.reduce((a, b) => a + b, 0),
      sky: effectiveSkyRef.current, albedo: run.albedo,
    }
    useSolarReportStore.getState().set({ heatmap: section })
  }, [snapshot])

  const fail = useCallback((err: unknown) => {
    if (err instanceof DOMException && err.name === 'AbortError') {
      s.setRun({ status: ref.last ? 'done' : 'idle', progress: 0 })
      return
    }
    s.setRun({ status: 'error', error: err instanceof Error ? err.message : String(err) })
  }, [s])

  const run = useCallback(async () => {
    try {
      const r = await runPeriod(periodFor(s.period, s.climate))
      await display(r)
      await publishHeatmap(r, t(`analysis.period.${s.period}` as 'analysis.period.year'))
    } catch (err) { fail(err) }
  }, [display, runPeriod, periodFor, s.period, s.climate, fail, publishHeatmap, t])

  const runEn = useCallback(async () => {
    try {
      const r = await runPeriod({ kind: 'day', date: { month: 3, day: 21 } }, enMinAlt)
      ref.en = { run: r, findings: en17037Findings(r.stats, north) }
      await display(r)
      const sum = summarizeEn17037(ref.en.findings)
      useSolarReportStore.getState().set({
        en: {
          minAltitudeDeg: enMinAlt, windows: sum.windows, byLevel: sum.byLevel,
          failing: ref.en.findings.filter((f) => f.level === 'none').sort((a, b) => a.value - b.value).slice(0, 12)
            .map((f) => ({ label: `${f.category.replace(/^IFC/, '').toLowerCase()} #${f.localId}`, hours: f.value, orientation: f.orientation })),
        },
      })
      await publishHeatmap(r, t('analysis.period.enReference'))
    } catch (err) { fail(err) }
  }, [runPeriod, enMinAlt, north, display, fail, publishHeatmap, t])

  const runSeasons = useCallback(async () => {
    try {
      const winter = await runPeriod(periodFor('coldSeason', s.climate))
      const summer = await runPeriod(periodFor('hotSeason', s.climate))
      ref.seasons = {
        summer, winter,
        summerFindings: summerGainFindings(summer.stats, summer.result.days, north),
        winterFindings: winterGainFindings(winter.stats, winter.result.days, north),
        rooms: orientationTable(winter.stats, winter.result.days, summer.stats, summer.result.days, north),
      }
      useSolarAnalysisStore.getState().setMetric('irradiation')
      await display(summer)
      useSolarReportStore.getState().set({
        seasons: {
          summerRisk: ref.seasons.summerFindings.slice(0, 12).map((f) => ({
            label: `${f.category.replace(/^IFC/, '').toLowerCase()} #${f.localId}`, daily: f.value,
            level: t(`analysis.checks.gain.${f.level}` as 'analysis.checks.gain.high'), orientation: f.orientation,
          })),
          rooms: ref.seasons.rooms.map((r) => ({ orientation: r.orientation, winterHours: r.winterHours, summerDaily: r.summerDaily, advice: t(`analysis.checks.rooms.${r.advice}`) })),
        },
      })
      await publishHeatmap(summer, t('analysis.period.hotSeason'))
    } catch (err) { fail(err) }
  }, [runPeriod, periodFor, s.climate, north, display, fail, publishHeatmap, t])

  // Metric or kinds changed: recolour, no recompute.
  useEffect(() => {
    const viewer = viewerApiRef.current
    if (!viewer || !ref.last) return
    void viewer.getSolarAnalysis().then((sa) => {
      if (!ref.last) return
      const range = sa.show(ref.last, s.metric, new Set(s.kinds))
      s.setRun({ range })
    })
  }, [s.metric, s.kinds]) // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    ;(await viewer.getSolarAnalysis()).hide()
    ref.last = null
    s.setRun({ status: 'idle', range: null })
    s.bumpResult()
  }, [viewerApiRef, s])

  // A model change makes every result stale.
  useEffect(() => {
    ref.sensors = null
    ref.en = null
    ref.seasons = null
    useSolarReportStore.getState().clear()
    if (ref.last) void clear()
  }, [models.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Exports ──────────────────────────────────────────────────────────────
  const guids = useCallback(async (findings: SolarFinding[]): Promise<Map<string, { guid: string | null; name: string }>> => {
    const out = new Map<string, { guid: string | null; name: string }>()
    const viewer = viewerApiRef.current
    if (!viewer) return out
    const byModel = new Map<string, number[]>()
    for (const f of findings) byModel.set(f.modelId, [...(byModel.get(f.modelId) ?? []), f.localId])
    for (const [modelId, ids] of byModel) {
      const model = viewer.getFragmentsModel(modelId) as unknown as { getItemsData(ids: number[], o: unknown): Promise<Array<Record<string, { value?: unknown }>>> } | null
      if (!model) continue
      try {
        const data = await model.getItemsData(ids, { attributesDefault: false, attributes: ['GlobalId', 'Name'] })
        ids.forEach((id, i) => out.set(`${modelId}:${id}`, {
          guid: typeof data[i]?.GlobalId?.value === 'string' ? data[i].GlobalId.value as string : null,
          name: typeof data[i]?.Name?.value === 'string' ? data[i].Name.value as string : '',
        }))
      } catch { /* names are a nicety */ }
    }
    return out
  }, [viewerApiRef])

  const findingMessage = useCallback((f: SolarFinding): string => {
    if (f.rule === 'EN17037_SUNLIGHT') return `${t('analysis.checks.en.title')}: ${fmt(f.value)} h (${t(`analysis.checks.en.${f.level}` as 'analysis.checks.en.none')}) · ${f.orientation}`
    const which = f.rule === 'SUMMER_GAIN' ? t('analysis.checks.gain.summer') : t('analysis.checks.gain.winter')
    return `${which}: ${t('analysis.checks.gain.perDay', { v: fmt(f.value) })} (${t(`analysis.checks.gain.${f.level}` as 'analysis.checks.gain.high')}) · ${f.orientation}`
  }, [t])

  const exportBcf = useCallback(async () => {
    const findings = [
      ...(ref.en?.findings.filter((f) => f.severity === 'warning') ?? []),
      ...(ref.seasons?.summerFindings.filter((f) => f.severity === 'warning') ?? []),
    ]
    if (findings.length === 0) return
    const ids = await guids(findings)
    const issues: ValidationIssue[] = findings.map((f, i) => {
      const g = ids.get(`${f.modelId}:${f.localId}`)
      return {
        id: `solar-${i}`, ruleId: `SOLAR_${f.rule}`, severity: f.severity, expressId: f.localId,
        globalId: g?.guid ?? null, ifcClass: f.category, elementName: g?.name ?? '',
        message: findingMessage(f), path: [], autoFixable: false, modelId: f.modelId,
      }
    })
    downloadBcfBlob(issuesToBcfTopics(issues), 'solar-analysis.bcfzip', '2.1')
  }, [guids, findingMessage])

  const exportCsv = useCallback(async () => {
    const rows = new Map<string, { f: SolarFinding; en?: number; summer?: number; winter?: number }>()
    const add = (list: SolarFinding[] | undefined, key: 'en' | 'summer' | 'winter') => {
      for (const f of list ?? []) {
        const k = `${f.modelId}:${f.localId}`
        const row = rows.get(k) ?? { f }
        row[key] = f.value
        rows.set(k, row)
      }
    }
    add(ref.en?.findings, 'en')
    add(ref.seasons?.summerFindings, 'summer')
    add(ref.seasons?.winterFindings, 'winter')
    const ids = await guids([...rows.values()].map((r) => r.f))
    // The sky view of each window, from whichever run has it (same sensors).
    const skyOf = new Map<string, number>()
    for (const st of (ref.en?.run ?? ref.seasons?.summer)?.stats ?? []) skyOf.set(`${st.element.modelId}:${st.element.localId}`, st.skyView)
    const lines = ['model,globalId,name,class,orientation,en17037_sun_h,summer_kwh_m2_day,winter_kwh_m2_day,sky_view_pct']
    for (const [k, r] of rows) {
      const g = ids.get(k)
      const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
      lines.push([cell(r.f.modelId), cell(g?.guid ?? ''), cell(g?.name ?? ''), r.f.category, r.f.orientation, fmt(r.en ?? NaN, 2), fmt(r.summer ?? NaN, 2), fmt(r.winter ?? NaN, 2), fmt((skyOf.get(k) ?? NaN) * 100, 0)].join(','))
    }
    download(lines.join('\n'), 'solar-analysis.csv')
  }, [guids])

  /** Every sensor of the shown run: position, normal, and every metric — for a spreadsheet or Grasshopper. */
  const exportGrid = useCallback(() => {
    const r = ref.last
    if (!r) return
    const kinds = ['ground', 'facade', 'window', 'roof']
    const lines = ['x,y,z,nx,ny,nz,area_m2,kind,class,local_id,sun_h_day,probable_sun_h_day,kwh_m2,direct_kwh_m2,diffuse_kwh_m2,reflected_kwh_m2,sky_view_pct']
    const S = r.sensors, R = r.result
    for (let i = 0; i < S.count; i++) {
      if (r.open[i] === 0) continue
      const e = S.element[i] >= 0 ? S.elements[S.element[i]] : null
      lines.push([
        S.positions[i * 3].toFixed(2), S.positions[i * 3 + 1].toFixed(2), S.positions[i * 3 + 2].toFixed(2),
        S.normals[i * 3].toFixed(3), S.normals[i * 3 + 1].toFixed(3), S.normals[i * 3 + 2].toFixed(3),
        S.area[i].toFixed(3), kinds[S.kind[i]], e?.category ?? '', e?.localId ?? '',
        fmt(metricValue(R, 'sunHours', i), 2), fmt(metricValue(R, 'probableSun', i), 2), fmt(metricValue(R, 'irradiation', i), 3),
        fmt(R.directWh[i] / 1000, 3), fmt(R.diffuseWh[i] / 1000, 3), fmt(R.reflectedWh[i] / 1000, 3), fmt(R.skyCos[i] * 100, 1),
      ].join(','))
    }
    download(lines.join('\n'), 'solar-sensors.csv')
  }, [])

  const frame = useCallback((f: { modelId: string; localId: number }) => {
    viewerApiRef.current?.frameElements([f.localId], f.modelId)
  }, [viewerApiRef])

  // ── PDF report ───────────────────────────────────────────────────────────
  const [reportProgress, setReportProgress] = useState<number | null>(null)
  const report = useSolarReportStore()
  const hasReport = !!(report.daylight || report.compare || report.heatmap || report.en || report.seasons || report.probe || report.shading || report.pv)
  const exportPdf = useCallback(async () => {
    if (!location) return
    setReportProgress(0)
    try {
      const { composeSolarReport } = await import('../../lib/report/solar-report')
      const viewer = viewerApiRef.current
      const viewImage = viewer ? await snapshot() : null
      const sc = useSceneStore.getState()
      const active = sc.models.find((m) => m.id === sc.activeModelId) ?? sc.models[0]
      const r = useSolarReportStore.getState()
      const blob = await composeSolarReport({
        title: t('report.title'),
        modelName: active?.fileName ?? 'IFC',
        lat: location.lat, lon: location.lon, timeZone, yawDeg: location.yawDeg,
        northSource: t(location.northSource === 'ifc' ? 'badges.northIfc' : 'badges.northAssumed'),
        locale: i18n.language,
        viewImage,
        climate: s.climate,
        heatmap: r.heatmap, en: r.en, seasons: r.seasons, probe: r.probe, shading: r.shading, pv: r.pv, compare: r.compare, daylight: r.daylight,
        t: (k, v) => String((t as unknown as (k: string, v?: Record<string, unknown>) => string)(k, v)),
        onProgress: setReportProgress,
      })
      const base = (active?.fileName ?? 'model').replace(/\.ifc$/i, '')
      await shareOrDownload(blob, `${base}-solar-report.pdf`)
    } catch (err) {
      fail(err)
    } finally {
      setReportProgress(null)
    }
  }, [location, timeZone, viewerApiRef, s.climate, t, i18n.language, fail, snapshot])

  // ── Derived views ────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const r = ref.last
    if (!r) return null
    const avg = KINDS.map((k) => {
      let sum = 0, area = 0
      for (let i = 0; i < r.sensors.count; i++) {
        if (r.open[i] === 0 || KINDS[r.sensors.kind[i]] !== k) continue
        sum += metricValue(r.result, s.metric, i) * r.sensors.area[i]
        area += r.sensors.area[i]
      }
      return { kind: k, value: area > 0 ? sum / area : NaN }
    })
    const windows = r.stats.filter((x) => x.element.kind === 'window')
    const value = statValue(s.metric)
    const sorted = [...windows].sort((a, b) => value(a) - value(b))
    return { avg, least: sorted.slice(0, 4), most: sorted.slice(-4).reverse(), value }
  }, [s.resultVersion, s.metric]) // eslint-disable-line react-hooks/exhaustive-deps

  const enSummary = useMemo(() => (ref.en ? summarizeEn17037(ref.en.findings) : null), [s.resultVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ───────────────────────────────────────────────────────────────
  const busy = s.status === 'sensors' || s.status === 'running'
  const unit = metricUnit(s.metric)
  const seasonsKnown = !!s.climate

  return (
    <>
      <ViewportPanel
        id="solar-analysis"
        open={s.panelOpen}
        onClose={() => s.setPanelOpen(false)}
        label={t('analysis.title')}
        mobile="sheet"
        widthPx={340}
        anchor="top"
        maxHeight="calc(100vh - 140px)"
      >
        <div className="flex-1 min-h-0 overflow-y-auto text-[11.5px] text-[var(--text-dim)]">
          <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)] flex items-center justify-between">
            <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">{t('analysis.title')}</div>
            <button onClick={() => s.setPanelOpen(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]" title={t('analysis.close')}>✕</button>
          </div>

          {!location ? (
            <div className="p-3 flex flex-col gap-2">
              <p>{t('analysis.noLocation')}</p>
              <button className="px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]" onClick={() => { s.setPanelOpen(false); useSolarStore.getState().setPanelOpen(true) }}>{t('analysis.openStudy')}</button>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-3">
              <div className="text-[10px] font-mono text-[var(--text-faint)]">
                {t('analysis.locationLine', { lat: location.lat.toFixed(3), lon: location.lon.toFixed(3), tz: timeZone })}
              </div>

              {/* Climate */}
              <Section title={t('analysis.climate.title')}>
                {s.climateStatus === 'done' && s.climate ? (
                  <ClimateCard c={s.climate} monthName={monthName} t={t} />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10.5px] leading-snug">{t('analysis.climate.consent')}</p>
                    <button disabled={s.climateStatus === 'loading'} onClick={() => { void loadClimate() }} className="self-start px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                      {s.climateStatus === 'loading' ? t('analysis.climate.loading') : t('analysis.climate.load')}
                    </button>
                    {s.climateStatus === 'error' && <p className="text-[#F5A623] text-[10.5px]">{t('analysis.climate.error', { message: s.climateError ?? '' })}</p>}
                  </div>
                )}
              </Section>

              {/* Setup */}
              <Section title={t('analysis.period.title')}>
                <div className="flex flex-wrap gap-1">
                  {PERIODS.map((p) => {
                    const needs = (p === 'hotSeason' || p === 'coldSeason') && !seasonsKnown
                    return (
                      <Chip key={p} active={s.period === p} onClick={() => s.setPeriod(p)} title={needs ? t('analysis.period.needsClimate') : undefined}>
                        {t(`analysis.period.${p}` as 'analysis.period.year')}
                        {(p === 'hotSeason' || p === 'coldSeason') && s.climate && (
                          <span className="opacity-70"> · {(p === 'hotSeason' ? s.climate.hotMonths : s.climate.coldMonths).map(monthName).join('–').replace(/–.*–/, '–')}</span>
                        )}
                      </Chip>
                    )
                  })}
                </div>
                {s.period === 'customDay' && (
                  <input
                    type="date"
                    className="mt-1.5 px-2 py-1 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]"
                    value={`2026-${String(s.customDay.month).padStart(2, '0')}-${String(s.customDay.day).padStart(2, '0')}`}
                    onChange={(e) => {
                      const [, m, d] = e.target.value.split('-').map(Number)
                      if (m && d) s.setCustomDay({ month: m, day: d })
                    }}
                  />
                )}
              </Section>

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-1">
                  {SOLAR_METRICS.map((m) => (
                    <Chip key={m} active={s.metric === m} onClick={() => s.setMetric(m)} title={t(`analysis.metricHint.${m}`)}>{t(`analysis.metric.${m}`)}</Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {KINDS.map((k) => (
                    <Chip key={k} active={s.kinds.includes(k)} onClick={() => s.toggleKind(k)}>{t(`analysis.kinds.${k}`)}</Chip>
                  ))}
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[10.5px]">
                  <span>{t('analysis.sky.label')}</span>
                  <select value={s.skyModel} onChange={(e) => s.setSkyModel(e.target.value as SkyModel)} className="px-1 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
                    {SKY_MODELS.map((m) => <option key={m} value={m}>{t(`analysis.sky.${m}`)}</option>)}
                  </select>
                  <span>{t('analysis.albedo.label')}</span>
                  <select value={s.albedo} onChange={(e) => s.setAlbedo(Number(e.target.value))} className="px-1 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
                    {(Object.entries(ALBEDOS) as Array<[keyof typeof ALBEDOS, number]>).map(([k, v]) => <option key={k} value={v}>{t(`analysis.albedo.${k}`)} · {v.toFixed(2)}</option>)}
                  </select>
                  <span>{t('analysis.precision.label')}</span>
                  <div className="flex gap-1">
                    {PRECISIONS.map((p) => <Chip key={p} active={s.precision === p} onClick={() => s.setPrecision(p)}>{t(`analysis.precision.${p}`)}</Chip>)}
                  </div>
                </div>
                {s.skyModel !== effectiveSky && (
                  <p className="text-[9.5px] text-[#F5A623] leading-snug">{t('analysis.sky.fallback', { model: t(`analysis.sky.${effectiveSky}`) })}</p>
                )}
              </div>

              <div className="flex gap-1.5">
                <button disabled={busy || models.length === 0} onClick={() => { void run() }} className="flex-1 px-2.5 py-2 rounded-[8px] text-[12px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
                  {busy ? (s.status === 'sensors' ? t('analysis.sensors') : t('analysis.running', { pct: Math.round(s.progress * 100) })) : t('analysis.run')}
                </button>
                {ref.last && !busy && (
                  <>
                    <button onClick={exportGrid} title={t('analysis.exportGridHint')} className="px-2.5 py-2 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">CSV</button>
                    <button onClick={() => { void clear() }} className="px-2.5 py-2 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.clear')}</button>
                  </>
                )}
                {busy && (
                  <button onClick={() => abortRef.current?.abort()} className="px-2.5 py-2 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.cancel')}</button>
                )}
              </div>
              {s.status === 'error' && <p className="text-[#F5A623] text-[10.5px]">{t('analysis.error', { message: s.error ?? '' })}</p>}

              {/* Legend + results */}
              {ref.last && s.range && summary && (
                <Section title={t('analysis.results.title')}>
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] text-[var(--text-faint)]">{t(`analysis.legend.${s.metric}`)}</div>
                    <div className="h-2.5 rounded-full" style={{ background: rampCss() }} />
                    <div className="flex justify-between text-[10px] font-mono tabular-nums">
                      <span>{fmt(s.range.min, 0)}</span><span>{fmt((s.range.min + s.range.max) / 2, 1)}</span><span>{fmt(s.range.max, s.range.max < 10 ? 1 : 0)} {unit}</span>
                    </div>
                    <div className="text-[9.5px] text-[var(--text-faint)]">{t('analysis.results.meta', { instants: ref.last.instants, raw: ref.last.rawInstants, sensors: ref.last.open.reduce((a, b) => a + b, 0) })}</div>
                    <div className="text-[9.5px] text-[var(--text-faint)]">{t('analysis.results.sky', { model: t(`analysis.sky.${ref.lastSky}`), albedo: ref.last.albedo.toFixed(2) })}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5">
                    {summary.avg.map((a) => (
                      <div key={a.kind} className="flex justify-between"><span>{t(`analysis.kinds.${a.kind}`)}</span><span className="font-mono tabular-nums text-[var(--text)]">{fmt(a.value)} {unit}</span></div>
                    ))}
                  </div>
                  {summary.least.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <ElementList title={t('analysis.results.least')} items={summary.least} value={summary.value} unit={unit} onFrame={(x) => frame(x.element)} />
                      <ElementList title={t('analysis.results.most')} items={summary.most} value={summary.value} unit={unit} onFrame={(x) => frame(x.element)} />
                    </div>
                  )}
                </Section>
              )}

              {/* Checks */}
              <Section title={t('analysis.checks.title')}>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="font-medium text-[var(--text)]">{t('analysis.checks.en.title')}</div>
                    <div className="flex items-center gap-1.5 text-[10.5px]">
                      {t('analysis.checks.en.minAltitude')}
                      <select value={enMinAlt} onChange={(e) => setEnMinAlt(Number(e.target.value))} className="px-1 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
                        {[0, 5, 10, 11, 13, 15].map((a) => <option key={a} value={a}>{a}°</option>)}
                      </select>
                      <button disabled={busy} onClick={() => { void runEn() }} className="ml-auto px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40">{t('analysis.checks.en.run')}</button>
                    </div>
                    {enSummary && ref.en && (
                      <>
                        <div className="text-[var(--text)]">{t('analysis.checks.en.summary', { pass: enSummary.windows - enSummary.byLevel.none, total: enSummary.windows })}</div>
                        <LevelBar byLevel={enSummary.byLevel} t={t} />
                        <FindingList findings={ref.en.findings.filter((f) => f.level === 'none').slice(0, 6)} label={(f) => `${f.orientation} · ${fmt(f.value)} h`} onFrame={frame} />
                      </>
                    )}
                    <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('analysis.checks.en.note')}</p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center">
                      <div className="font-medium text-[var(--text)]">{t('analysis.checks.gain.title')}</div>
                      <button disabled={busy} onClick={() => { void runSeasons() }} className="ml-auto px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40">{t('analysis.checks.gain.run')}</button>
                    </div>
                    {ref.seasons && (
                      <>
                        <div className="text-[10.5px]">{t('analysis.checks.gain.summer')}</div>
                        {ref.seasons.summerFindings.length === 0
                          ? <div className="text-[10.5px] text-[var(--text-faint)]">{t('analysis.checks.gain.noRisk')}</div>
                          : <FindingList findings={ref.seasons.summerFindings.slice(0, 6)} label={(f) => `${f.orientation} · ${t('analysis.checks.gain.perDay', { v: fmt(f.value) })} · ${t(`analysis.checks.gain.${f.level}` as 'analysis.checks.gain.high')}`} onFrame={frame} />}
                        <RoomsTable rows={ref.seasons.rooms} t={t} />
                      </>
                    )}
                    <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('analysis.checks.gain.note')}</p>
                  </div>

                  {(ref.en || ref.seasons) && (
                    <div className="flex gap-1.5">
                      <button onClick={() => { void exportBcf() }} className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.checks.exportBcf')}</button>
                      <button onClick={() => { void exportCsv() }} className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.checks.exportCsv')}</button>
                    </div>
                  )}
                </div>
              </Section>

              {/* Daylight in the rooms */}
              <Section title={t('daylight.title')}>
                <React.Suspense fallback={null}>
                  <DaylightRooms
                    viewerApiRef={viewerApiRef}
                    north={north}
                    lat={location.lat}
                    yawDeg={location.yawDeg}
                    measuredSky={effectiveSky === 'measured'}
                    ensureSensors={ensureSensors}
                    runPeriod={runPeriod}
                    pathFor={(period) => pathFor(period)}
                    skyLabel={t(`analysis.sky.${effectiveSky}`)}
                    paint={async (run, override) => {
                      const viewer = viewerApiRef.current
                      if (!viewer) return
                      const sa = await viewer.getSolarAnalysis()
                      const range = sa.show(run, 'sunHours', new Set(['ground']), undefined, override)
                      sa.onHover(setHover)
                      ref.last = null
                      s.setRun({ range })
                    }}
                    busy={busy}
                    onDone={() => s.setRun({ status: ref.last ? 'done' : 'idle', progress: 1 })}
                    onError={fail}
                  />
                </React.Suspense>
              </Section>

              {/* Design variants, B − A on the model */}
              <Section title={t('compare.title')}>
                <React.Suspense fallback={null}>
                  <VariantCompare
                    current={() => (ref.last ? { run: ref.last, label: ref.lastLabel || t(`analysis.period.${s.period}` as 'analysis.period.year') } : null)}
                    resultVersion={s.resultVersion}
                    metric={s.metric}
                    snapshot={snapshot}
                    paint={async (override) => {
                      const viewer = viewerApiRef.current
                      if (!viewer || !ref.last) return
                      const sa = await viewer.getSolarAnalysis()
                      const st = useSolarAnalysisStore.getState()
                      const range = sa.show(ref.last, st.metric, new Set(st.kinds), undefined, override ?? undefined)
                      s.setRun({ range })
                    }}
                  />
                </React.Suspense>
              </Section>

              {/* Photovoltaics on the roofs */}
              <Section title={t('pv.title')}>
                <React.Suspense fallback={null}>
                  <PvDesigner
                    lat={location.lat}
                    yawDeg={location.yawDeg}
                    albedo={s.albedo}
                    measuredSky={effectiveSky === 'measured'}
                    snapshot={snapshot}
                    ensureSensors={ensureSensors}
                    runPeriod={runPeriod}
                    pathFor={(period) => pathFor(period)}
                    display={async (r) => { useSolarAnalysisStore.getState().setMetric('irradiation'); await display(r); ref.lastLabel = t('pv.title') }}
                    busy={busy}
                    onDone={() => undefined}
                    onError={fail}
                  />
                </React.Suspense>
              </Section>

              {/* Solar protections, designed by façade and measured */}
              <Section title={t('shading.title')}>
                <React.Suspense fallback={null}>
                  <ShadingDesigner
                    viewerApiRef={viewerApiRef}
                    lat={location.lat}
                    north={north}
                    enMinAltitudeDeg={enMinAlt}
                    ensureSensors={ensureSensors}
                    runPeriod={runPeriod}
                    periodFor={(c) => periodFor(c, s.climate)}
                    settingsKey={`${location.lat},${location.lon},${location.yawDeg}|${effectiveSky}|${s.precision}|${s.albedo}|${enMinAlt}|${s.climate?.years.to ?? ''}`}
                    busy={busy}
                    snapshot={snapshot}
                    onDone={() => s.setRun({ status: ref.last ? 'done' : 'idle', progress: 1 })}
                    onError={fail}
                  />
                </React.Suspense>
              </Section>

              {/* One point's shading diagram */}
              <Section title={t('probe.title')}>
                <React.Suspense fallback={null}>
                  <PointProbe viewerApiRef={viewerApiRef} lat={location.lat} lon={location.lon} yawDeg={location.yawDeg} timeZone={timeZone} enMinAltitudeDeg={enMinAlt} />
                </React.Suspense>
              </Section>

              {/* The whole study as a PDF */}
              <Section title={t('report.section')}>
                <button
                  disabled={!hasReport || reportProgress !== null || busy}
                  onClick={() => { void exportPdf() }}
                  className="px-2.5 py-2 rounded-[8px] text-[12px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40"
                >
                  {reportProgress !== null ? t('report.making', { pct: Math.round(reportProgress * 100) }) : t('report.download')}
                </button>
                <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">
                  {hasReport
                    ? t('report.contains', { list: [report.heatmap && t('report.parts.heatmap'), report.en && t('report.parts.en'), report.seasons && t('report.parts.seasons'), report.probe && t('report.parts.probe'), report.shading && t('report.parts.shading'), report.pv && t('report.parts.pv'), report.compare && t('report.parts.compare'), report.daylight && t('report.parts.daylight')].filter(Boolean).join(' · ') })
                    : t('report.empty')}
                </p>
              </Section>

              <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('analysis.disclaimer')}</p>
            </div>
          )}
        </div>
      </ViewportPanel>

      {hover && createPortal(
        <div
          className="fixed z-[60] pointer-events-none px-2 py-1 rounded-md text-[11px] bg-[rgba(10,10,14,0.88)] text-white border border-[var(--border-strong)] font-mono tabular-nums"
          style={{ left: hover.clientX + 14, top: hover.clientY + 14 }}
        >
          <div>{t(`analysis.kinds.${hover.kind}`)}{hover.element ? ` · ${hover.element.category.replace(/^IFC/, '')}` : ''}</div>
          {hover.da !== undefined && <div className="font-semibold">{t('analysis.hover.da', { v: fmt(hover.da, 0) })}</div>}
          {hover.df !== undefined && <div className="font-semibold">{t('analysis.hover.df', { v: fmt(hover.df, 2) })}</div>}
          {hover.dfSky !== undefined && hover.df !== undefined && <div className="text-white/70">{t('analysis.hover.dfParts', { sky: fmt(hover.dfSky, 2), refl: fmt(hover.df - hover.dfSky, 2) })}</div>}
          {hover.df === undefined && hover.da === undefined && hover.delta !== undefined && (
            <div className="font-semibold">{Number.isFinite(hover.delta) ? t('analysis.hover.delta', { d: `${hover.delta > 0 ? '+' : ''}${fmt(hover.delta, s.metric === 'irradiation' && Math.abs(hover.delta) < 10 ? 2 : 1)}`, unit }) : t('analysis.hover.unpaired')}</div>
          )}
          {hover.df === undefined && hover.da === undefined && <>
          <div>{t('analysis.hover.sun', { h: fmt(hover.sunHoursPerDay) })} · {t('analysis.hover.probable', { h: fmt(hover.probableSunPerDay) })}</div>
          <div>{t('analysis.hover.kwh', { kwh: fmt(hover.irradiationKwh, hover.irradiationKwh < 10 ? 2 : 0) })}</div>
          <div className="text-white/70">{t('analysis.hover.split', { d: Math.round(hover.split.direct * 100), f: Math.round(hover.split.diffuse * 100), r: Math.round(hover.split.reflected * 100) })}</div>
          <div className="text-white/70">{t('analysis.hover.sky', { pct: fmt(hover.skyViewPct, 0) })}</div>
          </>}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────────

/** Phones: the share sheet (Mail, Files, WhatsApp); desktop: a download. */
function download(text: string, name: string): void {
  void shareOrDownload(new Blob([text], { type: 'text/csv' }), name)
}

type T = ReturnType<typeof useTranslation<'solar'>>['t']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9.5px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)]">{title}</div>
      {children}
    </div>
  )
}

function Chip({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'px-2 py-1 rounded-[7px] text-[10.5px] font-medium transition-colors',
        active ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ClimateCard({ c, monthName, t }: { c: ClimateSummary; monthName: (m: number) => string; t: T }) {
  const tMin = Math.min(...c.months.map((m) => m.tMin))
  const tMax = Math.max(...c.months.map((m) => m.tMax))
  const span = Math.max(1, tMax - tMin)
  const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const windTop = c.windRose.indexOf(Math.max(...c.windRose))
  const rain = c.months.reduce((a, m) => a + m.precipitationMm, 0)
  const season = (months: number[]) => (months.length ? `${monthName(months[0])}–${monthName(months[months.length - 1])}` : t('analysis.climate.none'))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] text-[var(--text-faint)]">{t('analysis.climate.temp')}</div>
      <div className="flex items-end gap-[3px] h-[70px]">
        {c.months.map((m) => {
          const hot = c.hotMonths.includes(m.month), cold = c.coldMonths.includes(m.month)
          return (
            <div key={m.month} className="flex-1 h-full flex flex-col items-center gap-0.5" title={`${monthName(m.month)}: ${m.tMin.toFixed(0)} · ${m.tMean.toFixed(0)} · ${m.tMax.toFixed(0)} °C`}>
              <div className="relative w-full flex-1">
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-[7px] rounded-full"
                  style={{
                    bottom: `${((m.tMin - tMin) / span) * 100}%`,
                    height: `${Math.max(4, ((m.tMax - m.tMin) / span) * 100)}%`,
                    background: hot ? '#e8604c' : cold ? '#4a8fd6' : '#8a8fa3',
                  }}
                />
              </div>
              <div className="text-[8.5px] text-[var(--text-faint)]">{monthName(m.month).slice(0, 1)}</div>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px]">
        <Kv k={t('analysis.climate.hot')} v={season(c.hotMonths)} />
        <Kv k={t('analysis.climate.cold')} v={season(c.coldMonths)} />
        <Kv k={t('analysis.climate.hdd')} v={c.hdd.toFixed(0)} />
        <Kv k={t('analysis.climate.cdd')} v={c.cdd.toFixed(0)} />
        <Kv k={t('analysis.climate.sunshine')} v={`${Math.min(...c.months.map((m) => m.sunshineHours)).toFixed(1)}–${Math.max(...c.months.map((m) => m.sunshineHours)).toFixed(1)}`} />
        <Kv k={t('analysis.climate.wind')} v={`${sectors[windTop]} · ${Math.round(c.windRose[windTop] * 100)}%`} />
        <Kv k={t('analysis.climate.rain')} v={rain.toFixed(0)} />
        <Kv k={t('analysis.climate.clearness')} v={`${Math.round((c.months.reduce((a, m) => a + m.clearness, 0) / 12) * 100)}%`} />
      </div>
      <div className="text-[9.5px] text-[var(--text-faint)]">{t('analysis.climate.source', { from: c.years.from, to: c.years.to })}</div>
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="font-mono tabular-nums text-[var(--text)] shrink-0">{v}</span></div>
}

function ElementList({ title, items, value, unit, onFrame }: { title: string; items: ElementStat[]; value: (x: ElementStat) => number; unit: string; onFrame: (x: ElementStat) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] text-[var(--text-faint)]">{title}</div>
      {items.map((x) => (
        <button key={`${x.element.modelId}:${x.element.localId}`} onClick={() => onFrame(x)} className="flex justify-between text-left hover:text-[var(--text)]">
          <span className="truncate">{x.element.category.replace(/^IFC/, '').toLowerCase()} #{x.element.localId}</span>
          <span className="font-mono tabular-nums">{value(x).toFixed(1)} {unit}</span>
        </button>
      ))}
    </div>
  )
}

function FindingList({ findings, label, onFrame }: { findings: SolarFinding[]; label: (f: SolarFinding) => string; onFrame: (f: SolarFinding) => void }) {
  if (findings.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      {findings.map((f) => (
        <button key={`${f.rule}:${f.modelId}:${f.localId}`} onClick={() => onFrame(f)} className="flex justify-between text-left text-[10.5px] hover:text-[var(--text)]">
          <span className="truncate">{f.category.replace(/^IFC/, '').toLowerCase()} #{f.localId}</span>
          <span className="font-mono tabular-nums shrink-0 ml-2">{label(f)}</span>
        </button>
      ))}
    </div>
  )
}

function LevelBar({ byLevel, t }: { byLevel: Record<'none' | 'minimum' | 'medium' | 'high', number>; t: T }) {
  const total = Math.max(1, byLevel.none + byLevel.minimum + byLevel.medium + byLevel.high)
  const colors = { none: '#c0392b', minimum: '#e2a33a', medium: '#7cb85c', high: '#2f8f5b' } as const
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-2 rounded-full overflow-hidden">
        {(['none', 'minimum', 'medium', 'high'] as const).map((k) => (
          <div key={k} style={{ width: `${(byLevel[k] / total) * 100}%`, background: colors[k] }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 text-[10px]">
        {(['none', 'minimum', 'medium', 'high'] as const).map((k) => (
          <div key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: colors[k] }} />{t(`analysis.checks.en.${k}`)}: {byLevel[k]}</div>
        ))}
      </div>
    </div>
  )
}

function RoomsTable({ rows, t }: { rows: OrientationRow[]; t: T }) {
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5 mt-1">
      <div className="font-medium text-[var(--text)] text-[10.5px]">{t('analysis.checks.rooms.title')}</div>
      <div className="grid grid-cols-[2.2rem_1fr_1fr_1.6fr] gap-x-2 text-[9.5px] text-[var(--text-faint)]">
        <span>{t('analysis.checks.rooms.orientation')}</span><span>{t('analysis.checks.rooms.winter')}</span><span>{t('analysis.checks.rooms.summer')}</span><span>{t('analysis.checks.rooms.advice')}</span>
      </div>
      {rows.map((r) => (
        <div key={r.orientation} className="grid grid-cols-[2.2rem_1fr_1fr_1.6fr] gap-x-2 text-[10.5px]">
          <span className="font-mono text-[var(--text)]">{r.orientation}</span>
          <span className="font-mono tabular-nums">{r.winterHours.toFixed(1)} h</span>
          <span className="font-mono tabular-nums">{r.summerDaily.toFixed(1)}</span>
          <span>{t(`analysis.checks.rooms.${r.advice}`)}</span>
        </div>
      ))}
    </div>
  )
}
