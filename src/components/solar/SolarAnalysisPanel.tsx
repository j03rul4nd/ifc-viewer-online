// ─── SolarAnalysisPanel ───────────────────────────────────────────────────────
// Sun hours, irradiation and the site's climate, measured on the IFC itself.
// An architect's questions, in order: what is the climate here; where does the
// sun reach and for how long (site, façades, windows, roofs — with the city
// around it when the map is on); which windows fail EN 17037 sunlight
// exposure; which glazing will overheat and which earns winter heat; and where
// on the plan each kind of room belongs.
//
// The weather comes from ERA5 (one request, after a click) or from an EPW file
// read on the device. With the air's temperature known, the Sun pane also
// shows Mojtaba Samimi's SOLARCHVISION views: Active (the plain irradiation)
// and Passive (each hour's sun weighted by base − outdoor temperature).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from '../ViewportPanel'
import { ErrorBoundary } from '../ErrorBoundary'
import { useSolarStore } from '../../stores/solarStore'
import { useSceneStore } from '../../stores/sceneStore'
import {
  useSolarAnalysisStore, type PeriodChoice, type SkyModel, type Precision, type ClimateSource, type SolarAnalysisState,
} from '../../stores/solarAnalysisStore'
import type { ViewerAPI } from '../../lib/viewer'
import type { AnalysisRun, HoverInfo } from '../../lib/solar-analysis/analysis-system'
import type { SensorSet, SensorKind } from '../../lib/solar-analysis/sensors'
import type { AnalysisPeriod, SunPathOptions } from '../../lib/solar-analysis/sun-paths'
import { KEY_DATES } from '../../lib/solar-analysis/sun-paths'
import { fetchClimate, fetchEra5Weather, cachedTypicalSky, cachedEra5Hourly, skyAt, seasonRange, type ClimateSummary } from '../../lib/solar-analysis/climate'
import { metricValue, metricUnit, rampCss, SOLAR_METRICS, type ElementStat, type SolarMetric } from '../../lib/solar-analysis/results'
import { PASSIVE_BASE_PRESETS, passiveCss, passivePerDay, passiveScore } from '../../lib/solar-analysis/passive'
import { hourlyAt, typicalFromHourly, climateFromHourly, distanceKm, type HourlyWeather } from '../../lib/solar-analysis/weather'
import { readWeatherFile, WeatherFileError } from '../../lib/solar-analysis/epw'
import { applySolarLocation, ensureSolarLocation } from '../../lib/solar/resolve-location'
import { consentFromEventPage, parseAppUrlParams, type AnalysisDeepLink } from '../../lib/url-params'
import { trackSolarAnalysisCompleted, trackSolarWeatherFileLoaded } from '../../lib/analytics'
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
import { isAppleTouch } from '../../lib/platform'
import { useSolarReportStore, type HeatmapSection } from '../../stores/solarReportStore'
import { usePresentationStore } from '../../stores/presentationStore'

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
        : metric === 'passive' ? x.passive?.score ?? NaN
          : x.skyView * 100

/** Elements by a value, lowest first — the unknown ones (NaN) left out, not sorted anywhere. */
function rankBy(items: ElementStat[], value: (x: ElementStat) => number): ElementStat[] {
  return items.filter((x) => Number.isFinite(value(x))).sort((a, b) => value(a) - value(b))
}

/**
 * The `n` lowest and the `n` highest elements by a value. For a signed value
 * (the passive score) the lists keep to their sign — only harm (< 0) in the
 * low one, only benefit (> 0) in the high one — so a list titled "most
 * unwanted sun" never holds a window the map paints blue: in a cold climate
 * every window may be a benefit, and the low list is then empty.
 */
function extremes(items: ElementStat[], value: (x: ElementStat) => number, n: number, signed: boolean): { least: ElementStat[]; most: ElementStat[] } {
  const sorted = rankBy(items, value)
  if (!signed) return { least: sorted.slice(0, n), most: sorted.slice(-n).reverse() }
  return {
    least: sorted.filter((x) => value(x) < 0).slice(0, n),
    most: sorted.filter((x) => value(x) > 0).slice(-n).reverse(),
  }
}

/**
 * Area-weighted mean of a metric per kind of surface. The passive score is
 * NOT averaged: a kind's benefit and harm are summed by area and scored
 * once (a mean of scores would not be the score of the whole surface, and a
 * sensor without one would make the whole kind unknown).
 */
function kindAverages(r: AnalysisRun, metric: SolarMetric): Array<{ kind: SensorKind; value: number }> {
  const p = r.result.passive
  const days = r.result.days > 0 ? r.result.days : 1
  return KINDS.map((k) => {
    let sum = 0, area = 0, benefit = 0, harm = 0
    for (let i = 0; i < r.sensors.count; i++) {
      if (r.open[i] === 0 || KINDS[r.sensors.kind[i]] !== k) continue
      const a = r.sensors.area[i]
      if (metric === 'passive') { if (p) { benefit += p.benefitWh[i] * a; harm += p.harmWh[i] * a } }
      else sum += metricValue(r.result, metric, i) * a
      area += a
    }
    if (area <= 0) return { kind: k, value: NaN }
    // kWh·°C/m² per day, from the kind's Wh·°C (the score scales with its inputs).
    if (metric === 'passive') return { kind: k, value: p ? passiveScore(benefit, harm) / (area * 1000 * days) : NaN }
    return { kind: k, value: sum / area }
  })
}

/** Within this distance an ERA5 climate still describes the site (its grid cell is ~10 km). */
const ERA5_NEAR_KM = 10
/**
 * A weather station farther than this is another climate: its hours would
 * pair this site's sun with someone else's clouds and air.
 */
const EPW_NEAR_KM = 100

/** The sky actually used: the one asked for, or the best one loaded below it. */
function effectiveSkyOf(st: Pick<SolarAnalysisState, 'skyModel' | 'sky' | 'climate'>): SkyModel {
  return st.skyModel === 'measured' && st.sky ? 'measured'
    : st.skyModel !== 'clear' && st.climate ? 'clearness' : 'clear'
}

/** "2021–2025", "2021", or a dash for a file that does not say. */
const yearsText = (y: { from: number; to: number }): string => (y.from > 0 ? (y.from === y.to ? String(y.from) : `${y.from}–${y.to}`) : '—')

/** One lookup per weather object, so every path built from the same hours shares it. */
const hourlyFns = new WeakMap<HourlyWeather, ReturnType<typeof hourlyAt>>()
function hourlyFn(w: HourlyWeather): ReturnType<typeof hourlyAt> {
  let f = hourlyFns.get(w)
  if (!f) { f = hourlyAt(w); hourlyFns.set(w, f) }
  return f
}

/** What weather a run was given — said next to its result, in the report and to analytics. */
interface RunWeather {
  /** The sky model the radiation came from. */
  sky: SkyModel
  /** The hours that drove the radiation (null: typical hours, the clearness or a clear sky). */
  hourly: HourlyWeather | null
  /** Label of the radiation's source when measured ("ERA5 2021–2025", a station). */
  radiationLabel: string | null
  /** Where the passive weights' air temperature came from. */
  temperature: 'hourly' | 'typical' | null
  /** Its label, for people. */
  temperatureLabel: string | null
  source: ClimateSource | null
}

/** The weather each run was measured with (runs are dropped with their results). */
const runWeather = new WeakMap<AnalysisRun, RunWeather>()

/** The weather a run started now would get — what `pathFor` builds from, read at the same moment. */
function weatherNow(): RunWeather {
  const st = useSolarAnalysisStore.getState()
  const sky = effectiveSkyOf(st)
  const hourly = sky === 'measured' ? st.hourly : null
  return {
    sky,
    hourly,
    radiationLabel: hourly ? hourly.label : sky === 'measured' && st.sky ? `ERA5 ${yearsText(st.sky.years)}` : null,
    temperature: st.hourly ? 'hourly' : st.sky ? 'typical' : null,
    temperatureLabel: st.hourly ? st.hourly.label : st.sky ? `ERA5 ${yearsText(st.sky.years)}` : null,
    source: st.climateSource,
  }
}

/** The weather a run had, as analytics' categories. */
function weatherKind(w: RunWeather | null): 'era5_hourly' | 'era5_typical' | 'epw' | 'clearness' | 'clear' {
  if (!w) return 'clear'
  if (w.sky !== 'measured') return w.sky
  return w.source?.kind === 'epw' ? 'epw' : w.hourly ? 'era5_hourly' : 'era5_typical'
}

const CLIMATE_KEY = (lat: number, lon: number) => `ifc.climate.v1.${lat.toFixed(2)},${lon.toFixed(2)}`

/**
 * What this device already holds of a place's ERA5 weather, into the store:
 * the daily climate and the typical sky (localStorage) at once, the real
 * hours (IndexedDB) when they come. No network. Nothing replaces a weather
 * file in use, and hours that arrive after the study moved elsewhere are
 * dropped.
 */
async function restoreCachedEra5(at: { lat: number; lon: number }): Promise<void> {
  const st = useSolarAnalysisStore.getState()
  if (st.climateSource?.kind === 'epw') return
  if (!st.climate) {
    try {
      const hit = localStorage.getItem(CLIMATE_KEY(at.lat, at.lon))
      if (hit) {
        st.setClimate(JSON.parse(hit) as ClimateSummary, 'done')
        if (!st.climateSource) st.setClimateSource({ kind: 'era5' })
      }
    } catch { /* no storage */ }
  }
  if (!st.sky) {
    const sky = cachedTypicalSky(at.lat, at.lon)
    if (sky) st.setSky(sky)
  }
  if (st.hourly) return
  const w = await cachedEra5Hourly(at.lat, at.lon)
  const now = useSolarAnalysisStore.getState()
  const here = useSolarStore.getState().location
  if (w && !now.hourly && now.climateSource?.kind !== 'epw' && here && distanceKm(here, w) <= ERA5_NEAR_KM) now.setHourly(w)
}

/** A signed figure: "+1.2", "−0.4", "0.0"; a dash when unknown. */
const signed = (v: number, d = 1): string => {
  if (!Number.isFinite(v)) return '—'
  const s = Math.abs(v).toFixed(d)
  return Number(s) === 0 ? s : `${v > 0 ? '+' : '−'}${s}`
}

/** Decimals that read a passive range: 0.35 needs two, 12 none. */
const passiveDecimals = (max: number): number => (Math.abs(max) < 1 ? 2 : Math.abs(max) < 10 ? 1 : 0)

const CREDIT_URL = 'https://github.com/archmoj/solarchvision_bim'

// The heavy state: sensors and the last runs, outside React.
const ref: {
  sensors: SensorSet | null
  sensorsKey: string
  last: AnalysisRun | null
  /** Sky model the last displayed run used. */
  lastSky: SkyModel
  /** The weather the last displayed run was measured with. */
  lastWeather: RunWeather | null
  /** What the last displayed run measured, for people. */
  lastLabel: string
  en: { run: AnalysisRun; findings: SolarFinding[] } | null
  seasons: { summer: AnalysisRun; winter: AnalysisRun; summerFindings: SolarFinding[]; winterFindings: SolarFinding[]; rooms: OrientationRow[] } | null
} = { sensors: null, sensorsKey: '', last: null, lastSky: 'clear', lastWeather: null, lastLabel: '', en: null, seasons: null }

const fmt = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '—')

export default function SolarAnalysisPanel({ viewerApiRef }: Props) {
  const { t, i18n } = useTranslation('solar')
  const s = useSolarAnalysisStore()
  const location = useSolarStore((x) => x.location)
  const timeZone = useSolarStore((x) => x.timeZone)
  const models = useSceneStore((x) => x.models)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  // A tap's card has no mouse leaving to clear it: it goes by itself, so it
  // never sits over the next tour stop or a view the finger has moved on from.
  useEffect(() => {
    if (!hover?.touch) return
    const id = window.setTimeout(() => setHover(null), 5000)
    return () => window.clearTimeout(id)
  }, [hover])
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
  /**
   * The hours' request on its own: on its way while the daily climate stays
   * on screen, or failed (and why) — the daily climate has its own status.
   */
  const [hoursLoad, setHoursLoad] = useState<{ status: 'loading' } | { status: 'error'; message: string; at: { lat: number; lon: number } } | null>(null)

  /**
   * Fetch this place's ERA5 climate — only ever from a click. Says why each
   * half did not come (null when it did, or was not needed).
   */
  const loadClimate = useCallback(async (): Promise<{ climateError: string | null; hoursError: string | null }> => {
    const none = { climateError: null, hoursError: null }
    if (!location) return none
    const st0 = useSolarAnalysisStore.getState()
    // A weather file IS the climate: nothing to fetch over it, and nothing of
    // it to blank out while a request runs.
    if (st0.climateSource?.kind === 'epw') return none
    const at = { lat: location.lat, lon: location.lon }
    // A daily climate already on screen stays while the hours come ("Load
    // the real hours"), and is not asked for again; only a missing one shows
    // the loading state.
    const had = st0.climate && st0.climateStatus === 'done' ? st0.climate : null
    if (had) setHoursLoad({ status: 'loading' })
    else { st0.setClimate(null, 'loading'); setHoursLoad(null) }
    // The daily normals and the hours are two requests to the same service
    // under the same consent. The hours are ONE request, kept two ways: the
    // typical 12 × 24 sky the daylight and PV tools read, and the real years
    // the analysis pairs hour by hour. They are a bonus — without them the
    // analysis falls back to the monthly clearness.
    const [c, era5] = await Promise.allSettled([had ? Promise.resolve(had) : fetchClimate(at.lat, at.lon), fetchEra5Weather(at.lat, at.lon)])
    const st = useSolarAnalysisStore.getState()
    const here = useSolarStore.getState().location
    const why = (r: unknown) => (r instanceof Error ? r.message : String(r))
    // A weather file read meanwhile wins; a study that moved meanwhile does
    // not want this place's climate.
    if (st.climateSource?.kind === 'epw' || !here || distanceKm(here, at) > ERA5_NEAR_KM) {
      if (st.climateStatus === 'loading') st.setClimate(st.climate, st.climate ? 'done' : 'idle')
      setHoursLoad(null)
      return none
    }
    let hoursError: string | null = null
    if (era5.status === 'fulfilled') {
      st.setSky(era5.value.sky)
      st.setHourly(era5.value.hourly)
      setHoursLoad(null)
    } else {
      // Said under "Load the real hours" (and on a link's card): without it
      // every further click would fail the same way in silence.
      hoursError = why(era5.reason)
      setHoursLoad({ status: 'error', message: hoursError, at })
    }
    let climateError: string | null = null
    if (c.status === 'fulfilled') st.setClimate(c.value, 'done')
    else { climateError = why(c.reason); st.setClimate(null, 'error', climateError) }
    if (c.status === 'fulfilled' || era5.status === 'fulfilled') st.setClimateSource({ kind: 'era5' })
    return { climateError, hoursError }
  }, [location])

  // The climate belongs to a place. When the study moves (another model, a
  // manual location, a link's site), whatever was loaded for somewhere else
  // is dropped — an ERA5 cell more than ~10 km away, a weather station more
  // than 100 km away — and what this device holds for the new place comes
  // back without asking (no network: the cache only).
  useEffect(() => {
    if (!location) return
    const st = useSolarAnalysisStore.getState()
    const far = (x: { lat: number; lon: number } | null, km: number) => !!x && distanceKm(location, x) > km
    if (st.climateSource?.kind === 'epw') {
      if (!far(st.hourly, EPW_NEAR_KM)) return
      st.setHourly(null)
      st.setSky(null)
      st.setClimate(null, 'idle')
      st.setClimateSource(null)
    } else {
      if (far(st.climate, ERA5_NEAR_KM)) { st.setClimate(null, 'idle'); st.setClimateSource(null) }
      if (far(st.sky, ERA5_NEAR_KM)) st.setSky(null)
      if (far(st.hourly, ERA5_NEAR_KM)) st.setHourly(null)
    }
    void restoreCachedEra5(location)
  }, [location?.lat, location?.lon, s.climateSource?.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Weather files ────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [weatherBusy, setWeatherBusy] = useState(false)
  /** A file that needs a decision (its station is far from the site, or the model is nowhere), or one that failed. */
  const [weatherNote, setWeatherNote] = useState<
    | { kind: 'far'; w: HourlyWeather; fileName: string; km: number | null }
    | { kind: 'error'; message: string }
    | null
  >(null)

  /** An EPW's hours become the climate: the sky, the seasons and the air, hour by hour. */
  const applyWeather = useCallback((w: HourlyWeather, fileName: string) => {
    const st = useSolarAnalysisStore.getState()
    st.setHourly(w)
    // The daylight and PV tools read the typical 12 × 24 sky; the climate
    // card and the seasons read daily normals. Both come from the same hours.
    st.setSky(typicalFromHourly(w))
    st.setClimate(climateFromHourly(w), 'done')
    st.setClimateSource({ kind: 'epw', fileName, station: w.label })
  }, [])

  const weatherErrorText = useCallback((err: unknown): string => {
    if (err instanceof WeatherFileError) {
      if (err.code === 'notFullYear') return t('analysis.weather.errors.notFullYear', { hours: (err.hours ?? 0).toLocaleString(i18n.language) })
      return t(`analysis.weather.errors.${err.code}`)
    }
    return t('analysis.weather.errors.other', { message: err instanceof Error ? err.message : String(err) })
  }, [t, i18n.language])

  /** Read a picked or dropped weather file. Nothing leaves the device. */
  const readWeather = useCallback(async (file: File) => {
    setWeatherNote(null)
    setWeatherBusy(true)
    try {
      const w = await readWeatherFile(file)
      const here = useSolarStore.getState().location
      const km = here ? distanceKm(here, w) : null
      // A station far away keeps its own clock and clouds: its noon would
      // land on this site's afternoon. Ask before anything changes.
      const far = km === null || km > EPW_NEAR_KM
      trackSolarWeatherFileLoaded({ format: /\.zip$/i.test(file.name) ? 'zip' : 'epw', far_from_site: far })
      if (far) setWeatherNote({ kind: 'far', w, fileName: file.name, km })
      else applyWeather(w, file.name)
    } catch (err) {
      setWeatherNote({ kind: 'error', message: weatherErrorText(err) })
    } finally {
      setWeatherBusy(false)
    }
  }, [applyWeather, weatherErrorText])

  /** "This building, in that climate": the study moves to the station, the model keeps its north. */
  const studyAtStation = useCallback(() => {
    if (weatherNote?.kind !== 'far') return
    const { w, fileName } = weatherNote
    const cur = useSolarStore.getState().location
    // The location first: the climate effect then finds the file's station
    // at the site, not 100 km off.
    applySolarLocation({ lat: w.lat, lon: w.lon, yawDeg: cur?.yawDeg ?? 0, source: 'manual', northSource: cur?.northSource ?? 'assumed' })
    applyWeather(w, fileName)
    setWeatherNote(null)
  }, [weatherNote, applyWeather])

  /** Drop the weather file: the place's ERA5 comes back from the device if it was loaded once. */
  const backToEra5 = useCallback(() => {
    const st = useSolarAnalysisStore.getState()
    st.setHourly(null)
    st.setSky(null)
    st.setClimate(null, 'idle')
    st.setClimateSource(null)
  }, [])

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
  const effectiveSky: SkyModel = effectiveSkyOf(s)
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
  const sunshineRef = useRef(sunshineShare)
  sunshineRef.current = sunshineShare

  /**
   * The sun path of a run. It reads the stores when it is CALLED, not when it
   * was rendered: a deep link sets the place and the weather and runs at
   * once, before React has drawn the panel again.
   */
  const pathFor = useCallback((period: AnalysisPeriod, minAltitudeDeg = 0): SunPathOptions => {
    const { location: loc, timeZone: tz } = useSolarStore.getState()
    if (!loc) throw new Error('No location')
    const st = useSolarAnalysisStore.getState()
    const pr = PRECISION[st.precision]
    const { climate, sky, hourly } = st
    const eff = effectiveSkyOf(st)
    const share = sunshineRef.current
    const hours = hourly ? hourlyFn(hourly) : null
    return {
      lat: loc.lat, lon: loc.lon, yawDeg: loc.yawDeg, timeZone: tz,
      year: new Date().getUTCFullYear(),
      stepMinutes: period.kind === 'day' ? pr.dayStep : pr.longStep,
      binDeg: pr.binDeg,
      minAltitudeDeg,
      elevationM: sky?.elevationM ?? hourly?.elevationM ?? 0,
      // The typical 12 × 24 sky, as before: the daylight and PV tools read it.
      measured: eff === 'measured' && sky ? (utc: number) => skyAt(sky, utc) : undefined,
      // The real hours, when loaded: they win over the typical sky, and each
      // layer's sun is paired with that layer's own air.
      hourly: eff === 'measured' && hours ? hours : undefined,
      // The air for the passive weights when the radiation is not hourly: the
      // real hours if any, else the typical hour's mean.
      temperatures: hours ? (utc: number) => hours(utc).map((h) => h.temp)
        : sky ? (utc: number) => [skyAt(sky, utc).temp] : undefined,
      passiveBaseC: st.passiveBaseC,
      clearness: eff === 'clearness' && climate ? (m: number) => climate.months[m - 1]?.clearness ?? 1 : undefined,
      sunshineShare: share ? (m: number) => share[m - 1] ?? 1 : undefined,
    }
  }, [])

  /**
   * The same path on the typical sky only, for the tools that read it (the
   * daylight's typical year, the panels' monthly shape): they average a
   * month, which the real hours of one day would not.
   */
  const typicalPathFor = useCallback((period: AnalysisPeriod): SunPathOptions => {
    const { hourly: _h, temperatures: _t, passiveBaseC: _b, ...rest } = pathFor(period)
    return rest
  }, [pathFor])

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
    // The weather and the path are read at the same moment, so what the run
    // says it used is what it used.
    const weather = weatherNow()
    const r = await sa.run(sensors, period, pathFor(period, minAltitudeDeg), {
      onProgress: (f) => s.setRun({ progress: f }), signal: ctrl.signal, albedo: useSolarAnalysisStore.getState().albedo,
    })
    runWeather.set(r, weather)
    return r
  }, [viewerApiRef, ensureSensors, pathFor, s])

  // "The map is ready, and how to read it" — said only where the panel is
  // closed (its own results say it otherwise), for a few seconds.
  const [runNote, setRunNote] = useState<SolarMetric | null>(null)
  useEffect(() => {
    if (!runNote) return
    const id = window.setTimeout(() => setRunNote(null), 6000)
    return () => window.clearTimeout(id)
  }, [runNote])

  const display = useCallback(async (run: AnalysisRun, fromLink = false) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const sa = await viewer.getSolarAnalysis()
    const st = useSolarAnalysisStore.getState()
    const range = sa.show(run, st.metric, new Set(st.kinds))
    sa.onHover(setHover)
    ref.last = run
    ref.lastWeather = runWeather.get(run) ?? null
    ref.lastSky = ref.lastWeather?.sky ?? effectiveSkyRef.current
    s.setRun({ status: 'done', progress: 1, range })
    s.bumpResult()
    if (!useSolarAnalysisStore.getState().panelOpen) setRunNote(st.metric)
    trackSolarAnalysisCompleted({ metric: st.metric, period: run.period.kind, weather: weatherKind(ref.lastWeather), from_link: fromLink })
  }, [viewerApiRef, s])

  /** The sky line of a run, for people: which model, and which hours when it was measured. */
  const skyLabel = useCallback((w: RunWeather | null, fallback: SkyModel): string => {
    if (w?.sky === 'measured' && w.radiationLabel) {
      return w.hourly
        ? t('analysis.sky.measuredHourly', { source: w.radiationLabel })
        : t('analysis.sky.measuredTypical', { source: w.radiationLabel })
    }
    return t(`analysis.sky.${w?.sky ?? fallback}`)
  }, [t])

  /** Where a run's air temperature came from, for people (the report's passive paragraph). */
  const temperatureLabel = useCallback((w: RunWeather | null): string => {
    if (!w?.temperatureLabel) return '—'
    return w.temperature === 'typical' ? t('analysis.passive.typicalSource', { label: w.temperatureLabel }) : w.temperatureLabel
  }, [t])

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
    const averages = kindAverages(run, st.metric).filter((a) => Number.isFinite(a.value))
    const windows = extremes(run.stats.filter((x) => x.element.kind === 'window'), value, 5, st.metric === 'passive')
    const label = (x: ElementStat) => `${x.element.category.replace(/^IFC/, '').toLowerCase()} #${x.element.localId}`
    const w = runWeather.get(run) ?? null
    const p = run.result.passive
    const section: HeatmapSection = {
      image: await snapshot(), metric: st.metric, periodLabel, range, averages,
      least: windows.least.map((x) => ({ label: label(x), value: value(x) })),
      most: windows.most.map((x) => ({ label: label(x), value: value(x) })),
      instants: run.instants, rawInstants: run.rawInstants, sensors: run.open.reduce((a, b) => a + b, 0),
      sky: w?.sky ?? effectiveSkyRef.current, albedo: run.albedo,
      skyLabel: skyLabel(w, effectiveSkyRef.current),
      ...(st.metric === 'passive' && p ? {
        passive: { baseC: p.baseC, temperature: w?.temperature ?? p.temperature, source: temperatureLabel(w) },
      } : {}),
    }
    useSolarReportStore.getState().set({ heatmap: section })
  }, [snapshot, skyLabel, temperatureLabel])

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
    // The passive columns per day, kWh·°C/m² (score, benefit, harm, net
    // received effect) and the base they were weighed against; blank when
    // the run had no air temperature.
    const lines = ['x,y,z,nx,ny,nz,area_m2,kind,class,local_id,sun_h_day,probable_sun_h_day,kwh_m2,direct_kwh_m2,diffuse_kwh_m2,reflected_kwh_m2,sky_view_pct,passive_kwhC_m2_day,passive_benefit,passive_harm,passive_net,passive_base_c']
    const S = r.sensors, R = r.result, P = R.passive
    for (let i = 0; i < S.count; i++) {
      if (r.open[i] === 0) continue
      const e = S.element[i] >= 0 ? S.elements[S.element[i]] : null
      const pp = P ? passivePerDay(P, R.days, i) : null
      lines.push([
        S.positions[i * 3].toFixed(2), S.positions[i * 3 + 1].toFixed(2), S.positions[i * 3 + 2].toFixed(2),
        S.normals[i * 3].toFixed(3), S.normals[i * 3 + 1].toFixed(3), S.normals[i * 3 + 2].toFixed(3),
        S.area[i].toFixed(3), kinds[S.kind[i]], e?.category ?? '', e?.localId ?? '',
        fmt(metricValue(R, 'sunHours', i), 2), fmt(metricValue(R, 'probableSun', i), 2), fmt(metricValue(R, 'irradiation', i), 3),
        fmt(R.directWh[i] / 1000, 3), fmt(R.diffuseWh[i] / 1000, 3), fmt(R.reflectedWh[i] / 1000, 3), fmt(R.skyCos[i] * 100, 1),
        pp ? fmt(pp.score, 3) : '', pp ? fmt(pp.benefit, 3) : '', pp ? fmt(pp.harm, 3) : '', pp ? fmt(pp.net, 3) : '', P && Number.isFinite(P.baseC) ? String(P.baseC) : '',
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
      // Which climate the report's card shows: the ERA5 years, or the file
      // (and what a file may not record: rain, wind).
      const st = useSolarAnalysisStore.getState()
      const src = st.climateSource
      const climateSource = st.climate ? {
        label: src?.kind === 'epw'
          ? t('analysis.climate.sourceEpw', { file: src.fileName, station: src.station, years: yearsText(st.climate.years) })
          : t('analysis.climate.source', { from: st.climate.years.from, to: st.climate.years.to }),
        rain: src?.kind !== 'epw' || !!st.hourly?.precipMm,
        wind: Math.max(...st.climate.windRose) > 0,
        epw: src?.kind === 'epw',
      } : undefined
      const blob = await composeSolarReport({
        title: t('report.title'),
        modelName: active?.fileName ?? 'IFC',
        lat: location.lat, lon: location.lon, timeZone, yawDeg: location.yawDeg,
        northSource: t(location.northSource === 'ifc' ? 'badges.northIfc' : 'badges.northAssumed'),
        locale: i18n.language,
        viewImage,
        climate: s.climate,
        climateSource,
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
    const avg = kindAverages(r, s.metric)
    const value = statValue(s.metric)
    const { least, most } = extremes(r.stats.filter((x) => x.element.kind === 'window'), value, 4, s.metric === 'passive')
    return { avg, least, most, value }
  }, [s.resultVersion, s.metric]) // eslint-disable-line react-hooks/exhaustive-deps

  const enSummary = useMemo(() => (ref.en ? summarizeEn17037(ref.en.findings) : null), [s.resultVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Workspace: one tab per task, all kept mounted so nothing is lost ─────
  const [tab, setTabState] = useState<WorkTab>(() => {
    try { const v = localStorage.getItem(TAB_KEY); return (TABS as readonly string[]).includes(v ?? '') ? v as WorkTab : 'sun' } catch { return 'sun' }
  })
  const setTab = useCallback((v: WorkTab) => { setTabState(v); try { localStorage.setItem(TAB_KEY, v) } catch { /* private mode */ } }, [])

  // A weather file dropped on the viewer (App routes it here, and the panel
  // may mount after it): read it like a picked one. The study's place is
  // resolved first when nothing set it yet, so the station can be measured
  // against the site.
  const pendingWeatherFile = s.pendingWeatherFile
  const takenFile = useRef<File | null>(null)
  useEffect(() => {
    // Once per file, even when the effect runs twice for the same drop.
    if (!pendingWeatherFile || takenFile.current === pendingWeatherFile) return
    takenFile.current = pendingWeatherFile
    useSolarAnalysisStore.getState().setPendingWeatherFile(null)
    setTab('sun')
    void (async () => {
      if (!useSolarStore.getState().location) {
        try { await ensureSolarLocation(viewerApiRef.current) } catch { /* nowhere: the file can place it */ }
      }
      await readWeather(pendingWeatherFile)
    })()
  }, [pendingWeatherFile, readWeather, setTab, viewerApiRef])

  // ── ?analysis= deep link ─────────────────────────────────────────────────
  // Once every model the URL names is in: the place, then the link's period,
  // metric, base and precision; the panel opens on the Sun tab (not in an
  // embed — the host owns the frame — nor over a tour that is playing) and
  // the run starts at once when this device already holds the weather the
  // metric needs. When it does not, a card asks first: the climate is a
  // third-party request and is never made without a click. The card sits in
  // the panel, or floats over the view when the panel stays closed. Once per
  // page, like `?flood=`.
  const latest = useRef({ runPeriod, periodFor, display, publishHeatmap, loadClimate, fail, t })
  latest.current = { runPeriod, periodFor, display, publishHeatmap, loadClimate, fail, t }
  const linkDone = useRef(false)
  const [linkAsk, setLinkAsk] = useState<AnalysisDeepLink | null>(null)
  /** Why the card's last click did not run anything (the climate's or the hours' own error). */
  const [linkError, setLinkError] = useState<string | null>(null)

  /** Run what a link asks for. Not `run()`: that one closes over the period of its render. */
  const runLink = useCallback(async (link: AnalysisDeepLink) => {
    // One tick: the panel draws what the link just set, so the callbacks
    // below (and the season months) are this render's.
    await new Promise((r) => setTimeout(r, 0))
    const L = latest.current
    try {
      const r = await L.runPeriod(L.periodFor(link.period, useSolarAnalysisStore.getState().climate))
      await L.display(r, true)
      await L.publishHeatmap(r, L.t(`analysis.period.${link.period}` as 'analysis.period.year'))
    } catch (err) { L.fail(err) }
  }, [])

  /**
   * Whether a run now has what the metric on screen needs: sun hours and the
   * sky view are geometry and need nothing; the passive impact needs the
   * air's temperature (real or typical hours); the rest want a climate.
   */
  const linkReady = useCallback((): boolean => {
    const st = useSolarAnalysisStore.getState()
    switch (st.metric) {
      case 'sunHours':
      case 'skyView': return true
      case 'passive': return !!(st.hourly || st.sky)
      default: return !!(st.climate || st.sky || st.hourly)
    }
  }, [])

  /** The card's link leaves the card and runs — once, whatever brought its weather. */
  const firedLink = useRef<AnalysisDeepLink | null>(null)
  const fireLink = useCallback((link: AnalysisDeepLink) => {
    if (firedLink.current === link) return
    firedLink.current = link
    setLinkAsk((cur) => (cur === link ? null : cur))
    setLinkError(null)
    void runLink(link)
  }, [runLink])

  useEffect(() => {
    if (linkDone.current || models.length === 0 || !viewerApiRef.current) return
    const p = parseAppUrlParams()
    if (!p.analysis || models.length < p.modelUrls.length) return
    linkDone.current = true
    const link = p.analysis
    void (async () => {
      let loc = useSolarStore.getState().location
      if (!loc) {
        try { loc = await ensureSolarLocation(viewerApiRef.current) } catch { loc = null }
      }
      const st = useSolarAnalysisStore.getState()
      // A tour playing over the link owns the stage: its stop keeps the
      // metric it names (the link only sets one the stop leaves open), and
      // the panel stays closed — on a phone its sheet would cover the tour's
      // narration and buttons. The heatmap still runs underneath.
      const pres = usePresentationStore.getState()
      const touring = pres.mode === 'playing'
      const stopMetric = touring ? pres.tour?.steps[pres.stepIndex]?.analysisMetric : undefined
      st.setPeriod(link.period)
      if (link.metric && !stopMetric) st.setMetric(link.metric)
      if (link.baseC !== undefined) st.setPassiveBaseC(link.baseC)
      if (link.precision) st.setPrecision(link.precision)
      if (!p.embed && !touring) st.setPanelOpen(true)
      setTab('sun')
      // Nowhere to stand: the panel says so (and how to place it).
      if (!loc) return
      await restoreCachedEra5(loc)
      if (linkReady()) await runLink(link)
      else setLinkAsk(link)
    })()
  }, [models.length, viewerApiRef, setTab, runLink, linkReady])

  // The weather a waiting link needs came another way — a dropped weather
  // file, the climate's own button: the card has nothing left to ask. (Its
  // weather only: a metric picked meanwhile does not start the run.)
  useEffect(() => {
    if (linkAsk && linkReady()) fireLink(linkAsk)
  }, [linkAsk, s.hourly, s.sky, s.climate, linkReady, fireLink])

  /** The link card's button: the click is the consent. */
  const acceptLink = useCallback(async () => {
    const link = linkAsk
    if (!link) return
    if (linkReady()) { fireLink(link); return }
    setLinkError(null)
    const r = await latest.current.loadClimate()
    // The weather that came runs the link (the effect above). When what the
    // metric needs did not come, the card stays and says why, instead of
    // vanishing with nothing run — the passive map needs the hours or the
    // typical sky, not only the daily climate.
    if (!linkReady()) {
      const tt = latest.current.t
      setLinkError(r.hoursError ? tt('analysis.climate.hoursError', { message: r.hoursError })
        : r.climateError ? tt('analysis.climate.error', { message: r.climateError }) : null)
    }
  }, [linkAsk, linkReady, fireLink])

  // On the event page the visitor already chose to see this run: fetch the
  // climate and run without the card (see consentFromEventPage).
  useEffect(() => {
    if (linkAsk && consentFromEventPage()) void acceptLink()
  }, [linkAsk, acceptLink])

  // The GPU can go away (driver reset, tab in the background on a phone): stop
  // whatever pass is running instead of waiting forever on a dead context.
  useEffect(() => {
    const lost = () => {
      abortRef.current?.abort()
      quickRef.current.cancelled = true
      useSolarAnalysisStore.getState().setRun({ status: 'error', error: t('workspace.gpuLost') })
    }
    document.addEventListener('webglcontextlost', lost, true)
    return () => document.removeEventListener('webglcontextlost', lost, true)
  }, [t])

  /** The essential study in one click: sun over the year, EN 17037, seasons. */
  const quickRef = useRef<{ cancelled: boolean }>({ cancelled: false })
  const [quick, setQuick] = useState<{ step: number; failed: number[] } | null>(null)
  const runQuick = useCallback(async () => {
    quickRef.current = { cancelled: false }
    const steps: Array<{ go: () => Promise<void>; tab: WorkTab }> = [
      { go: run, tab: 'sun' }, { go: runEn, tab: 'windows' }, { go: runSeasons, tab: 'windows' },
    ]
    const failed: number[] = []
    for (let i = 0; i < steps.length; i++) {
      if (quickRef.current.cancelled) break
      setQuick({ step: i, failed: [...failed] })
      setTab(steps[i].tab)
      try { await steps[i].go() } catch { /* each step reports its own error */ }
      const st = useSolarAnalysisStore.getState()
      if (st.status === 'error') failed.push(i)
      if (quickRef.current.cancelled) break
      // Let the browser breathe between GPU passes (and the UI repaint).
      await new Promise((r) => setTimeout(r, 30))
    }
    setQuick(quickRef.current.cancelled ? null : { step: steps.length, failed })
  }, [run, runEn, runSeasons, setTab])
  const cancelAll = useCallback(() => { quickRef.current.cancelled = true; abortRef.current?.abort() }, [])

  // ── Render ───────────────────────────────────────────────────────────────
  const busy = s.status === 'sensors' || s.status === 'running'
  const unit = metricUnit(s.metric)
  const seasonsKnown = !!s.climate

  // Where the climate came from, for the chip.
  const epw = s.climateSource?.kind === 'epw' ? s.climateSource : null
  const chip = !s.climate
    ? { text: t('workspace.climateMissing'), hint: t('workspace.climateMissingHint') }
    : epw
      ? { text: t('workspace.climateEpw', { station: s.hourly?.station?.name ?? epw.station }), hint: t('workspace.climateEpwHint', { file: epw.fileName, years: yearsText(s.climate.years) }) }
      : {
        text: t('workspace.climateOk', { from: s.climate.years.from, to: s.climate.years.to }),
        hint: s.hourly ? t('workspace.climateOkHourlyHint', { years: yearsText(s.hourly.years) }) : t('workspace.climateOkHint'),
      }

  // The passive view: what the run on screen was weighed with, and where the air comes from now.
  const passiveShown = s.metric === 'passive'
  const shownPassive = ref.last?.result.passive
  const passiveStale = !!(ref.last && shownPassive && Number.isFinite(shownPassive.baseC) && Math.abs(shownPassive.baseC - s.passiveBaseC) > 1e-9)
  const passiveMissing = !!(ref.last && !shownPassive)
  const temperatureLine = s.hourly
    ? (epw ? t('analysis.passive.tempEpw', { station: epw.station }) : t('analysis.passive.tempEra5', { years: yearsText(s.hourly.years) }))
    : s.sky ? t('analysis.passive.tempTypical', { years: yearsText(s.sky.years) }) : t('analysis.passive.tempNone')
  const valueText = (v: number) => (passiveShown ? signed(v, 2) : v.toFixed(1))

  // A weather file waiting for a decision, or one that could not be read.
  const weatherCard = weatherNote && (weatherNote.kind === 'error' ? (
    <div role="alert" className="rounded-[8px] border border-[#F5A623]/50 bg-[#F5A623]/10 px-2 py-1.5 text-[10.5px] text-[#F5A623] flex gap-2 items-start">
      <span className="flex-1">{weatherNote.message}</span>
      <button onClick={() => setWeatherNote(null)} className="hover:text-[var(--text)]" title={t('analysis.close')}>✕</button>
    </div>
  ) : (
    <div role="alert" className="rounded-[10px] border border-[#F5A623]/60 bg-[#F5A623]/10 p-2.5 flex flex-col gap-1.5 text-[10.5px]">
      <p className="text-[var(--text)] leading-snug">
        {weatherNote.km === null
          ? t('analysis.weather.noSite', { label: weatherNote.w.label })
          : t('analysis.weather.far', { label: weatherNote.w.label, km: Math.round(weatherNote.km).toLocaleString(i18n.language) })}
      </p>
      {weatherNote.km !== null && <p className="text-[9.5px] leading-snug text-[var(--text-faint)]">{t('analysis.weather.farHint')}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={studyAtStation} className="px-2.5 py-1.5 rounded-[8px] font-semibold bg-[var(--accent)] text-white">{t('analysis.weather.studyAtStation')}</button>
        <button onClick={() => setWeatherNote(null)} className="px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.weather.cancel')}</button>
      </div>
    </div>
  ))

  // A shared link that wants an analysis: what it will run, and the one click
  // it needs. In the panel — or over the view when the panel stays closed (an
  // embed, a tour playing), where it would otherwise wait unseen.
  const linkBusy = busy || s.climateStatus === 'loading' || hoursLoad?.status === 'loading'
  const linkCard = linkAsk && location && (
    <div role="region" aria-label={t('analysis.link.title')} className="rounded-[10px] border border-[var(--accent)]/60 bg-[var(--accent)]/10 p-2.5 flex flex-col gap-1.5 text-[11.5px] text-[var(--text-dim)]">
      <div className="text-[12px] font-semibold text-[var(--text)]">{t('analysis.link.title')}</div>
      <div className="text-[10.5px] text-[var(--text)]">
        {t('analysis.link.what', {
          metric: s.metric === 'passive'
            ? `${t('analysis.metric.passive')} (${t('analysis.passive.baseShort', { v: s.passiveBaseC })})`
            : t(`analysis.metric.${s.metric}`),
          period: t(`analysis.period.${linkAsk.period}` as 'analysis.period.year'),
          place: `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)} · ${timeZone}`,
        })}
      </div>
      <p className="text-[10px] leading-snug">{t('analysis.link.needs')}</p>
      {linkError && <p role="alert" className="text-[10px] leading-snug text-[#F5A623]">{linkError}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button disabled={linkBusy} onClick={() => { void acceptLink() }} className="px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
          {linkBusy && !busy ? t('analysis.climate.loading') : t('analysis.link.run')}
        </button>
        <button onClick={() => { setLinkAsk(null); setLinkError(null) }} className="px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.link.later')}</button>
      </div>
    </div>
  )

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
      >
        <div className="flex-1 min-h-0 overflow-y-auto text-[11.5px] text-[var(--text-dim)]">
          <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)] flex items-center justify-between">
            <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">{t('analysis.title')}</div>
            <button onClick={() => s.setPanelOpen(false)} className="text-[var(--text-faint)] hover:text-[var(--text)]" title={t('analysis.close')}>✕</button>
          </div>

          {/* One file input for every "load a weather file" button: it outlives the disclosures. */}
          <input
            ref={fileRef}
            type="file"
            accept={WEATHER_ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              // Cleared so the same file can be picked again after a Cancel.
              e.target.value = ''
              if (f) void readWeather(f)
            }}
          />

          {!location ? (
            <div className="p-3 flex flex-col gap-2">
              <p>{t('analysis.noLocation')}</p>
              <button className="px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]" onClick={() => { s.setPanelOpen(false); useSolarStore.getState().setPanelOpen(true) }}>{t('analysis.openStudy')}</button>
              {weatherCard}
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-[var(--text-faint)] mr-auto">
                  {t('analysis.locationLine', { lat: location.lat.toFixed(3), lon: location.lon.toFixed(3), tz: timeZone })}
                </span>
                <StatusChip tone={s.climate ? 'ok' : 'warn'} title={chip.hint} className="max-w-[60%] truncate">
                  {chip.text}
                </StatusChip>
              </div>

              {/* A shared link that wants an analysis: what it will run, and the one click it needs. */}
              {linkCard}

              {/* Quick path: the essential study, then the report */}
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]/40 p-2.5 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold text-[var(--text)]">{t('workspace.quick.title')}</div>
                    <div className="text-[10px] leading-snug text-[var(--text-faint)]">{t('workspace.quick.hint')}</div>
                  </div>
                  {busy || (quick && quick.step < QUICK_STEPS) ? (
                    <button onClick={cancelAll} className="px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.cancel')}</button>
                  ) : (
                    <button disabled={models.length === 0} onClick={() => { void runQuick() }} className="px-3 py-1.5 rounded-[8px] text-[11.5px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">{t('workspace.quick.run')}</button>
                  )}
                </div>
                {quick && (
                  <ol className="flex flex-col gap-0.5 text-[10.5px]">
                    {(['sun', 'en', 'seasons'] as const).map((k, i) => {
                      const state = quick.failed.includes(i) ? 'fail' : i < quick.step ? 'done' : i === quick.step ? 'now' : 'todo'
                      return (
                        <li key={k} className={`flex items-center gap-1.5 ${state === 'todo' ? 'opacity-50' : ''}`}>
                          <span className="w-3.5 text-center">{state === 'done' ? '✓' : state === 'fail' ? '!' : state === 'now' ? '…' : '·'}</span>
                          <span className={state === 'fail' ? 'text-[#F5A623]' : state === 'done' ? 'text-[var(--text)]' : ''}>{t(`workspace.quick.steps.${k}`)}</span>
                        </li>
                      )
                    })}
                  </ol>
                )}
                {quick && quick.step >= QUICK_STEPS && hasReport && (
                  <button disabled={reportProgress !== null || busy} onClick={() => { void exportPdf() }} className="self-start px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40">
                    {reportProgress !== null ? t('report.making', { pct: Math.round(reportProgress * 100) }) : t('report.download')}
                  </button>
                )}
              </div>

              {/* Task tabs */}
              <div role="tablist" className="grid grid-cols-3 gap-1 p-1 rounded-[10px] bg-[var(--surface-2)]/60 sticky top-0 z-10 backdrop-blur">
                {TABS.map((k) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    title={t(`workspace.tabs.${k}.hint`)}
                    className={`px-1.5 py-1.5 rounded-[7px] text-[10.5px] font-medium flex flex-col items-center gap-0.5 transition-colors ${tab === k ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'hover:text-[var(--text)]'}`}
                  >
                    <span aria-hidden className="text-[13px] leading-none">{TAB_ICON[k]}</span>
                    {t(`workspace.tabs.${k}.label`)}
                  </button>
                ))}
              </div>

              {/* What the GPU is doing right now */}
              {busy && (
                <div className="flex items-center gap-2 text-[10.5px]" aria-live="polite">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                  </div>
                  <span className="font-mono tabular-nums">{s.status === 'sensors' ? t('analysis.sensors') : `${Math.round(s.progress * 100)}%`}</span>
                  <button onClick={cancelAll} className="text-[var(--text-faint)] hover:text-[var(--text)]" title={t('analysis.cancel')}>✕</button>
                </div>
              )}
              {s.status === 'error' && (
                <div className="rounded-[8px] border border-[#F5A623]/50 bg-[#F5A623]/10 px-2 py-1.5 text-[10.5px] text-[#F5A623] flex gap-2 items-start">
                  <span className="flex-1">{t('analysis.error', { message: s.error ?? '' })}</span>
                  <button onClick={() => s.setRun({ status: ref.last ? 'done' : 'idle', error: null })} className="hover:text-[var(--text)]">✕</button>
                </div>
              )}

              <Pane id="sun" tab={tab} t={t}>
              {weatherCard}
              {/* Climate */}
              <Disclosure title={t('analysis.climate.title')} defaultOpen={!s.climate}>
                {s.climateStatus === 'done' && s.climate ? (
                  <ClimateCard c={s.climate} monthName={monthName} t={t} source={s.climateSource} hourly={s.hourly} />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10.5px] leading-snug">{t('analysis.climate.consent')}</p>
                    <button disabled={s.climateStatus === 'loading'} onClick={() => { void loadClimate() }} className="self-start px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                      {s.climateStatus === 'loading' ? t('analysis.climate.loading') : t('analysis.climate.load')}
                    </button>
                    {s.climateStatus === 'error' && <p className="text-[#F5A623] text-[10.5px]">{t('analysis.climate.error', { message: s.climateError ?? '' })}</p>}
                  </div>
                )}
                {/* An ERA5 climate cached before the hours were kept: one more click pairs them. */}
                {!epw && s.climateStatus === 'done' && s.climate && !s.hourly && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-[9.5px] leading-snug text-[var(--text-faint)]">{t('analysis.climate.loadHoursHint')}</p>
                      <button disabled={hoursLoad?.status === 'loading'} onClick={() => { void loadClimate() }} className="shrink-0 px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                        {hoursLoad?.status === 'loading' ? t('analysis.climate.loading') : t('analysis.climate.loadHours')}
                      </button>
                    </div>
                    {/* The hours' own failure: the daily climate above came, the hours did not. */}
                    {hoursLoad?.status === 'error' && distanceKm(location, hoursLoad.at) <= ERA5_NEAR_KM && (
                      <p role="alert" className="text-[#F5A623] text-[10px] leading-snug">{t('analysis.climate.hoursError', { message: hoursLoad.message })}</p>
                    )}
                  </div>
                )}
                {/* Or the user's own weather: an EPW year, read here. */}
                <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-1.5">
                  {epw ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] leading-snug mr-auto">{t('analysis.climate.epwActive', { station: epw.station, file: epw.fileName })}</span>
                      <button onClick={backToEra5} className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('analysis.climate.backToEra5')}</button>
                      <button disabled={weatherBusy} onClick={() => fileRef.current?.click()} className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                        {weatherBusy ? t('analysis.climate.reading') : t('analysis.climate.anotherFile')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button disabled={weatherBusy} onClick={() => fileRef.current?.click()} className="self-start px-2.5 py-1.5 rounded-[8px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                        {weatherBusy ? t('analysis.climate.reading') : t('analysis.climate.loadFile')}
                      </button>
                      <p className="text-[9.5px] leading-snug text-[var(--text-faint)]">{t('analysis.climate.fileHint')}</p>
                    </>
                  )}
                </div>
              </Disclosure>

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
                  {/* The passive impact has its own block, right below, with what it needs. */}
                  {SOLAR_METRICS.filter((m) => m !== 'passive').map((m) => (
                    <Chip key={m} active={s.metric === m} onClick={() => s.setMetric(m)} title={t(`analysis.metricHint.${m}`)}>{t(`analysis.metric.${m}`)}</Chip>
                  ))}
                </div>

                {/* SOLARCHVISION's two views of the same sun: Active (energy to
                    collect) and Passive (sun weighed by the air's temperature). */}
                <div className="rounded-[8px] border border-[var(--border)] p-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="mr-auto text-[9.5px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)]">{t('analysis.passive.title')}</span>
                    <div role="radiogroup" aria-label={t('analysis.passive.title')} className="flex gap-0.5 p-0.5 rounded-[7px] bg-[var(--surface-2)]/60">
                      {(['irradiation', 'passive'] as const).map((m) => (
                        <button
                          key={m}
                          role="radio"
                          aria-checked={s.metric === m}
                          onClick={() => s.setMetric(m)}
                          title={m === 'passive' ? t('analysis.metricHint.passive') : t('analysis.passive.activeHint')}
                          className={`px-2 py-0.5 rounded-[6px] text-[10.5px] font-medium transition-colors ${s.metric === m ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'hover:text-[var(--text)]'}`}
                        >
                          {m === 'passive' ? t('analysis.passive.passive') : t('analysis.passive.active')}
                        </button>
                      ))}
                    </div>
                  </div>
                  {passiveShown && (
                    <>
                      <div className="flex items-center gap-1 flex-wrap text-[10.5px]">
                        <span className="mr-0.5">{t('analysis.passive.base')}</span>
                        {PASSIVE_BASE_PRESETS.map((b) => (
                          <Chip key={b} active={s.passiveBaseC === b} onClick={() => s.setPassiveBaseC(b)} title={t(`analysis.passive.preset${b}`)}>{b} °C</Chip>
                        ))}
                        <BaseInput value={s.passiveBaseC} onChange={s.setPassiveBaseC} label={t('analysis.passive.custom')} />
                      </div>
                      <p className={`text-[10px] leading-snug ${s.hourly || s.sky ? '' : 'text-[#F5A623]'}`}>{temperatureLine}</p>
                      {passiveStale && (
                        <div className="flex items-center gap-2 text-[10.5px] text-[#F5A623]">
                          <span className="flex-1">{t('analysis.passive.stale')}</span>
                          <button disabled={busy || models.length === 0} onClick={() => { void run() }} className="px-2 py-1 rounded-[7px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">{t('analysis.run')}</button>
                        </div>
                      )}
                      {passiveMissing && <p className="text-[10px] leading-snug text-[#F5A623]">{t('analysis.passive.noTemps')}</p>}
                      <p className="text-[9.5px] leading-snug">{t('analysis.passive.explain')}</p>
                      <p className="text-[9.5px] leading-snug text-[var(--text-faint)]">
                        {t('analysis.passive.credit')}{' '}
                        <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text)]">{t('analysis.passive.creditLink')}</a>
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {KINDS.map((k) => (
                    <Chip key={k} active={s.kinds.includes(k)} onClick={() => s.toggleKind(k)}>{t(`analysis.kinds.${k}`)}</Chip>
                  ))}
                </div>
                <Disclosure title={t('workspace.advanced')} summary={`${t(`analysis.sky.${effectiveSky}`)} · ${s.albedo.toFixed(2)} · ${t(`analysis.precision.${s.precision}`)}`}>
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
                </Disclosure>
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

              {/* Legend + results */}
              {ref.last && s.range && summary && (
                <Section title={t('analysis.results.title')}>
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] text-[var(--text-faint)]">{t(`analysis.legend.${s.metric}`)}</div>
                    <div className="h-2.5 rounded-full" style={{ background: passiveShown ? passiveCss() : rampCss() }} />
                    {passiveShown ? (
                      // Signed and centred: harm on the left, benefit on the right.
                      <div className="flex justify-between text-[10px] font-mono tabular-nums">
                        <span>{signed(s.range.min, passiveDecimals(s.range.max))}</span><span>0</span><span>{signed(s.range.max, passiveDecimals(s.range.max))} {unit}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-[10px] font-mono tabular-nums">
                        <span>{fmt(s.range.min, 0)}</span><span>{fmt((s.range.min + s.range.max) / 2, 1)}</span><span>{fmt(s.range.max, s.range.max < 10 ? 1 : 0)} {unit}</span>
                      </div>
                    )}
                    {passiveShown && <div className="text-[9.5px] leading-snug">{t('analysis.passive.legendCaption')}</div>}
                    <div className="text-[9.5px] text-[var(--text-faint)]">{t('analysis.results.meta', { instants: ref.last.instants, raw: ref.last.rawInstants, sensors: ref.last.open.reduce((a, b) => a + b, 0) })}</div>
                    <div className="text-[9.5px] text-[var(--text-faint)]">{t('analysis.results.sky', { model: skyLabel(ref.lastWeather, ref.lastSky), albedo: ref.last.albedo.toFixed(2) })}</div>
                    {passiveShown && shownPassive && (
                      <div className="text-[9.5px] text-[var(--text-faint)]">{t('analysis.passive.baseShort', { v: shownPassive.baseC })} · {temperatureLabel(ref.lastWeather)}</div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5">
                    {summary.avg.map((a) => (
                      <div key={a.kind} className="flex justify-between"><span>{t(`analysis.kinds.${a.kind}`)}</span><span className="font-mono tabular-nums text-[var(--text)]">{passiveShown ? signed(a.value, 2) : fmt(a.value)} {unit}</span></div>
                    ))}
                  </div>
                  {(summary.least.length > 0 || summary.most.length > 0) && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {summary.least.length > 0 && <ElementList title={passiveShown ? t('analysis.passive.unwanted') : t('analysis.results.least')} items={summary.least} value={summary.value} format={valueText} unit={unit} onFrame={(x) => frame(x.element)} />}
                      {summary.most.length > 0 && <ElementList title={passiveShown ? t('analysis.passive.welcome') : t('analysis.results.most')} items={summary.most} value={summary.value} format={valueText} unit={unit} onFrame={(x) => frame(x.element)} />}
                    </div>
                  )}
                </Section>
              )}

              </Pane>

              <Pane id="windows" tab={tab} t={t}>
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

              </Pane>

              <Pane id="daylight" tab={tab} t={t}>
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
                    pathFor={typicalPathFor}
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

              </Pane>

              <Pane id="design" tab={tab} t={t}>
              {/* Design variants, B − A on the model */}
              <Section title={t('compare.title')}>
                <React.Suspense fallback={null}>
                  <VariantCompare
                    // The passive base travels with the variant itself (see
                    // `Variant.passiveBaseC`), not in this label: it matters to
                    // the passive impact only, never to the sun hours.
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

              </Pane>

              <Pane id="energy" tab={tab} t={t}>
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
                    pathFor={typicalPathFor}
                    display={async (r) => { useSolarAnalysisStore.getState().setMetric('irradiation'); await display(r); ref.lastLabel = t('pv.title') }}
                    busy={busy}
                    onDone={() => undefined}
                    onError={fail}
                  />
                </React.Suspense>
              </Section>

              </Pane>

              <Pane id="design" tab={tab} t={t}>
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

              </Pane>

              <Pane id="point" tab={tab} t={t}>
              {/* One point's shading diagram */}
              <Section title={t('probe.title')}>
                <React.Suspense fallback={null}>
                  <PointProbe viewerApiRef={viewerApiRef} lat={location.lat} lon={location.lon} yawDeg={location.yawDeg} timeZone={timeZone} enMinAltitudeDeg={enMinAlt} />
                </React.Suspense>
              </Section>

              </Pane>

              {/* The whole study as a PDF — whatever tab produced it */}
              <div className="border-t border-[var(--border)] pt-2.5">
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
              </div>

              <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('analysis.disclaimer')}</p>
            </div>
          )}
        </div>
      </ViewportPanel>

      {linkCard && !s.panelOpen && createPortal(
        <div
          className="fixed z-[60] left-1/2 -translate-x-1/2 w-[min(340px,calc(100%-24px))] rounded-[10px] bg-[var(--surface)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          {linkCard}
        </div>,
        document.body,
      )}

      {/* The run, seen from a closed panel (a tour playing, an embed, a phone
          where the sheet stays down): the view freezes while the GPU works, so
          without this a visitor sees a still model and nothing else. */}
      {!s.panelOpen && !linkCard && (busy || runNote || s.status === 'error') && createPortal(
        <div
          role="status"
          aria-live="polite"
          className="fixed z-[59] left-1/2 -translate-x-1/2 w-[min(340px,calc(100%-24px))] rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_12px_32px_rgba(0,0,0,0.45)] px-3 py-2 flex items-start gap-2 text-[11.5px] text-[var(--text-dim)]"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <span aria-hidden className="text-[14px] leading-none mt-0.5">☀</span>
          <div className="flex-1 min-w-0">
            {busy ? (
              <>
                <div className="text-[var(--text)] font-medium">
                  {s.status === 'sensors' ? t('analysis.overlay.sensors') : t('analysis.overlay.running', { pct: Math.round(s.progress * 100) })}
                </div>
                <div className="mt-1 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                </div>
                <div className="mt-1 text-[10px] leading-snug text-[var(--text-faint)]">{t('analysis.overlay.paused')}</div>
              </>
            ) : s.status === 'error' ? (
              <>
                <div className="text-[#F5A623]">{t('analysis.overlay.failed', { message: s.error ?? '' })}</div>
                <button onClick={() => s.setPanelOpen(true)} className="mt-1 text-[var(--accent)] font-medium">{t('analysis.overlay.open')}</button>
              </>
            ) : runNote ? (
              <>
                <div className="text-[var(--text)] font-medium">{t('analysis.overlay.done', { metric: t(`analysis.metric.${runNote}`) })}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-[var(--text-faint)]">{t('analysis.overlay.inspect')}</div>
              </>
            ) : null}
          </div>
          {busy
            ? <button onClick={cancelAll} aria-label={t('analysis.cancel')} title={t('analysis.cancel')} className="w-7 h-7 -mr-1 -mt-0.5 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)]">✕</button>
            : <button onClick={() => { setRunNote(null); if (s.status === 'error') s.setRun({ status: ref.last ? 'done' : 'idle', error: null }) }} aria-label={t('analysis.close')} title={t('analysis.close')} className="w-7 h-7 -mr-1 -mt-0.5 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)]">✕</button>}
        </div>,
        document.body,
      )}

      {hover && createPortal(
        <div
          className="fixed z-[60] pointer-events-none px-2 py-1 rounded-md text-[11px] bg-[rgba(10,10,14,0.88)] text-white border border-[var(--border-strong)] font-mono tabular-nums"
          style={hoverCardStyle(hover)}
        >
          <div>{t(`analysis.kinds.${hover.kind}`)}{hover.element ? ` · ${hover.element.category.replace(/^IFC/, '')}` : ''}</div>
          {hover.da !== undefined && <div className="font-semibold">{t('analysis.hover.da', { v: fmt(hover.da, 0) })}</div>}
          {hover.df !== undefined && <div className="font-semibold">{t('analysis.hover.df', { v: fmt(hover.df, 2) })}</div>}
          {hover.dfSky !== undefined && hover.df !== undefined && <div className="text-white/70">{t('analysis.hover.dfParts', { sky: fmt(hover.dfSky, 2), refl: fmt(hover.df - hover.dfSky, 2) })}</div>}
          {hover.df === undefined && hover.da === undefined && hover.delta !== undefined && (
            <div className="font-semibold">{Number.isFinite(hover.delta) ? t('analysis.hover.delta', { d: `${hover.delta > 0 ? '+' : ''}${fmt(hover.delta, passiveShown || (s.metric === 'irradiation' && Math.abs(hover.delta) < 10) ? 2 : 1)}`, unit }) : t('analysis.hover.unpaired')}</div>
          )}
          {hover.df === undefined && hover.da === undefined && hover.delta === undefined && passiveShown && hover.passive && <>
          <div className="font-semibold">{t('analysis.passive.hoverScore', { v: signed(hover.passive.score, 2) })}</div>
          <div className="text-white/70">{t('analysis.passive.hoverParts', { b: fmt(hover.passive.benefit, 2), h: fmt(hover.passive.harm, 2), n: signed(hover.passive.net, 2) })}</div>
          </>}
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

/**
 * What the weather picker offers. iOS greys out every file whose extension it
 * has no type for — an .epw — so there the picker takes any file and the
 * reader says when it is not a weather file.
 */
const WEATHER_ACCEPT = isAppleTouch() ? undefined : '.epw,.zip'

/**
 * Where the figures card goes: beside a mouse cursor; above the finger for a
 * tap (the finger hides what is under it), or below it near the top. Never
 * past the screen's edge — on a phone the cursor's right is often off it.
 */
function hoverCardStyle(h: HoverInfo): React.CSSProperties {
  const w = Math.min(300, window.innerWidth - 16)
  const left = Math.max(8, Math.min(h.clientX + (h.touch ? -w / 2 : 14), window.innerWidth - w - 8))
  if (!h.touch) return { left, top: h.clientY + 14 }
  return h.clientY > 180
    ? { left, top: h.clientY - 28, transform: 'translateY(-100%)' }
    : { left, top: h.clientY + 36 }
}

/** Phones: the share sheet (Mail, Files, WhatsApp); desktop: a download. */
function download(text: string, name: string): void {
  void shareOrDownload(new Blob([text], { type: 'text/csv' }), name)
}

type T = ReturnType<typeof useTranslation<'solar'>>['t']

const TABS = ['sun', 'windows', 'daylight', 'design', 'energy', 'point'] as const
type WorkTab = typeof TABS[number]
const TAB_KEY = 'solar.workspace.tab'
const TAB_ICON: Record<WorkTab, string> = { sun: '☀', windows: '▦', daylight: '◐', design: '⌂', energy: 'ϟ', point: '⌖' }
const QUICK_STEPS = 3

/**
 * One task's tools. Hidden rather than unmounted, so switching tabs keeps
 * every result and setting; each pane has its own error boundary, so a bug in
 * one tool leaves the others (and the viewer) running.
 */
function Pane({ id, tab, t, order, children }: { id: WorkTab; tab: WorkTab; t: T; order?: number; children: React.ReactNode }) {
  return (
    <div hidden={tab !== id} className="flex flex-col gap-3" style={order !== undefined ? { order } : undefined} role="tabpanel">
      <ErrorBoundary
        fallback={(error, reset) => (
          <div className="rounded-[8px] border border-[#F5A623]/50 bg-[#F5A623]/10 p-2.5 flex flex-col gap-1.5 text-[10.5px]">
            <div className="font-semibold text-[#F5A623]">{t('workspace.crashed')}</div>
            <div className="font-mono text-[9.5px] break-words opacity-80">{error.message}</div>
            <button onClick={reset} className="self-start px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('workspace.retry')}</button>
          </div>
        )}
      >
        <div className="flex flex-col gap-3">{children}</div>
      </ErrorBoundary>
    </div>
  )
}

function Disclosure({ title, summary, defaultOpen = false, children }: { title: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-[8px] border border-[var(--border)]">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--surface-2)] rounded-[8px]">
        <span className={`text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-[9.5px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)]">{title}</span>
        {summary && !open && <span className="ml-auto text-[10px] truncate text-[var(--text-faint)]">{summary}</span>}
      </button>
      {open && <div className="px-2.5 pb-2.5 pt-1 flex flex-col gap-1.5">{children}</div>}
    </div>
  )
}

function StatusChip({ tone, title, className = '', children }: { tone: 'ok' | 'warn'; title?: string; className?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`px-1.5 py-0.5 rounded-full text-[9.5px] font-medium border ${tone === 'ok' ? 'border-[#4caf7a]/50 text-[#4caf7a]' : 'border-[#F5A623]/50 text-[#F5A623]'} ${className}`}>
      {children}
    </span>
  )
}

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

function ClimateCard({ c, monthName, t, source, hourly }: { c: ClimateSummary; monthName: (m: number) => string; t: T; source: ClimateSource | null; hourly: HourlyWeather | null }) {
  const tMin = Math.min(...c.months.map((m) => m.tMin))
  const tMax = Math.max(...c.months.map((m) => m.tMax))
  const span = Math.max(1, tMax - tMin)
  const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const windTop = c.windRose.indexOf(Math.max(...c.windRose))
  const rain = c.months.reduce((a, m) => a + m.precipitationMm, 0)
  // A weather file may not record rain or wind: a row of zeros would read as
  // a desert without a breeze, so the row goes instead.
  const epw = source?.kind === 'epw' ? source : null
  const rainKnown = !epw || !!hourly?.precipMm
  const windKnown = Math.max(...c.windRose) > 0
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
        {windKnown && <Kv k={t('analysis.climate.wind')} v={`${sectors[windTop]} · ${Math.round(c.windRose[windTop] * 100)}%`} />}
        {rainKnown && <Kv k={t('analysis.climate.rain')} v={rain.toFixed(0)} />}
        <Kv k={t('analysis.climate.clearness')} v={`${Math.round((c.months.reduce((a, m) => a + m.clearness, 0) / 12) * 100)}%`} />
      </div>
      <div className="text-[9.5px] text-[var(--text-faint)]">
        {epw
          ? t('analysis.climate.sourceEpw', { file: epw.fileName, station: epw.station, years: yearsText(c.years) })
          : t('analysis.climate.source', { from: c.years.from, to: c.years.to })}
      </div>
      {!epw && hourly && <div className="text-[9.5px] text-[var(--text-faint)]">{t('analysis.climate.hourlyEra5', { years: yearsText(hourly.years) })}</div>}
    </div>
  )
}

/**
 * The passive base temperature, typed. A draft while typing ("-", "1" on the
 * way to "18" are not values yet); the store gets a number once it is one, in
 * range. Leaving the field shows the stored value again.
 */
function BaseInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        type="number"
        inputMode="decimal"
        step={0.5}
        min={-10}
        max={40}
        aria-label={label}
        title={label}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = Number(e.target.value.replace(',', '.'))
          if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= -10 && v <= 40) onChange(v)
        }}
        onBlur={() => setDraft(null)}
        className="w-14 px-1 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] font-mono tabular-nums"
      />
      <span>°C</span>
    </span>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="font-mono tabular-nums text-[var(--text)] shrink-0">{v}</span></div>
}

function ElementList({ title, items, value, format = (v) => v.toFixed(1), unit, onFrame }: { title: string; items: ElementStat[]; value: (x: ElementStat) => number; format?: (v: number) => string; unit: string; onFrame: (x: ElementStat) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] text-[var(--text-faint)]">{title}</div>
      {items.map((x) => (
        <button key={`${x.element.modelId}:${x.element.localId}`} onClick={() => onFrame(x)} className="flex justify-between text-left hover:text-[var(--text)]">
          <span className="truncate">{x.element.category.replace(/^IFC/, '').toLowerCase()} #{x.element.localId}</span>
          <span className="font-mono tabular-nums">{format(value(x))} {unit}</span>
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
