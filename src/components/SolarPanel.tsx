// ─── SolarPanel ───────────────────────────────────────────────────────────────
// Sun & Moon study UI (docs/SUN_MOON_STUDY_PLAN.md D3-D5): enable flow with
// location provenance badges (a DEFAULT location is a blocking notice, never
// silent), date + fluid time scrubbing with sunrise/sunset markers, evergreen
// per-file presets, persistent time chip, moon toggle with phase.
//
// Loaded via React.lazy — this chunk pulls suncalc/tz-lookup and the geo
// runners. Product state in solarStore; light state in the viewer's
// SolarSystem (accessed through viewer.getSolar()).

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useSolarAnalysisStore } from '../stores/solarAnalysisStore'
import { useSolarStore, saveManualLocation, loadManualLocation, type SolarLocation, type SolarPreset } from '../stores/solarStore'
import { useGeoStore } from '../stores/geoStore'
import { useSceneStore } from '../stores/sceneStore'
import { modelRegistry } from '../lib/model-registry'
import { ensureGeorefExtracted } from '../lib/geo/geo-extract-runner'
import { resolvePlacement } from '../lib/geo/placement'
import {
  timezoneFor, zoneOffsetMinutes, wallTimeToUTC, utcToWallParts, dayTimes,
  moonPhaseIndex, type DayTimes,
} from '../lib/solar/sun-math'
import { parseAppUrlParams } from '../lib/url-params'
import { appBus } from '../lib/event-bus'
import { ViewportPanel } from './ViewportPanel'
import { useIsMobile } from '../hooks/useIsMobile'
import { loadCities, searchCities, type City } from '../lib/solar/city-search'
import {
  trackSolarEnabled, trackSolarDisabled, trackSolarPresetSaved,
  trackSolarPresetApplied, trackSolarMoonToggled, trackSolarError,
} from '../lib/analytics'
import type { ViewerAPI } from '../lib/viewer'
import type { SolarSystemAPI } from '../lib/solar/solar-system'
import type { SkyPosition, MoonState } from '../lib/solar/sun-math'

const AlmanacBlock = React.lazy(() => import('./solar/AlmanacBlock'))

interface SolarPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** 'client' hides numeric detail and leads with preset cards. */
  variant?: 'technical' | 'client'
}

const DEFAULT_LOCATION: SolarLocation = {
  lat: 40.4168, lon: -3.7038, yawDeg: 0, source: 'default', northSource: 'assumed',
}
const MOON_GLYPHS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'] as const

export default function SolarPanel({ viewerApiRef, variant = 'technical' }: SolarPanelProps) {
  const { t } = useTranslation('solar')
  const store = useSolarStore()
  const activeModelId = useSceneStore((s) => s.activeModelId)

  const [showDefaultNotice, setShowDefaultNotice] = useState(false)
  const [locationFormOpen, setLocationFormOpen] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLon, setManualLon] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState<City[]>([])
  const [presetName, setPresetName] = useState('')
  const [sunInfo, setSunInfo] = useState<SkyPosition | null>(null)
  const [moonInfo, setMoonInfo] = useState<MoonState | null>(null)
  const [times, setTimes] = useState<DayTimes | null>(null)
  const isMobile = useIsMobile()
  // Phone: "play the day" — the time runs dawn to dusk so the shadows move on
  // their own while the user watches. Stops on any manual scrub.
  const [playing, setPlaying] = useState(false)
  const enabledAtRef = useRef(0)

  const getSolar = useCallback((): Promise<SolarSystemAPI> | null => {
    const viewer = viewerApiRef.current
    return viewer ? viewer.getSolar() : null
  }, [viewerApiRef])

  const cacheKey = activeModelId ? modelRegistry.get(activeModelId)?.opfsCacheKey ?? null : null

  // Presets follow the active file.
  useEffect(() => {
    useSolarStore.getState().loadPresetsFor(cacheKey)
  }, [cacheKey])

  // ── Location resolution (plan D3 ladder — reuses the GIS stack) ─────────────
  const resolveLocation = useCallback(async (): Promise<SolarLocation | null> => {
    const geoPlacement = useGeoStore.getState().placement
    if (geoPlacement) {
      const fromIfc = geoPlacement.source === 'ifc'
      return {
        lat: geoPlacement.lat, lon: geoPlacement.lon, yawDeg: geoPlacement.rotationDeg,
        source: fromIfc ? 'ifc' : 'map',
        northSource: fromIfc ? 'ifc' : 'assumed',
      }
    }
    if (activeModelId && viewerApiRef.current) {
      const g = await ensureGeorefExtracted(activeModelId)
      const bounds = viewerApiRef.current.getModelBounds(activeModelId)
      const r = resolvePlacement(cacheKey, g, bounds)
      if (r.ok) {
        const fromIfc = r.value.source === 'ifc'
        return {
          lat: r.value.lat, lon: r.value.lon, yawDeg: r.value.rotationDeg,
          source: fromIfc ? 'ifc' : 'map',
          northSource: fromIfc ? 'ifc' : 'assumed',
        }
      }
    }
    if (cacheKey) {
      const m = loadManualLocation(cacheKey)
      if (m) return { lat: m.lat, lon: m.lon, yawDeg: 0, source: 'manual', northSource: 'assumed' }
    }
    return null
  }, [activeModelId, cacheKey, viewerApiRef])

  // ── Day timelapse ───────────────────────────────────────────────────────────
  const [timelapse, setTimelapse] = useState<number | null>(null)
  const [timelapseError, setTimelapseError] = useState<string | null>(null)
  const exportTimelapse = useCallback(async (): Promise<void> => {
    const viewer = viewerApiRef.current
    const st = useSolarStore.getState()
    if (!viewer || !st.active || !st.location) return
    setTimelapseError(null)
    setTimelapse(0)
    const savedTime = st.timeUTC
    let skyWasOn = true
    try {
      const [{ renderShot }, solar] = await Promise.all([import('../lib/capture/media-codec'), getSolar()])
      if (!solar) throw new Error('viewer not ready')
      const loc = st.location
      const day = dayTimes(new Date(st.timeUTC), loc.lat, loc.lon)
      // Twenty minutes either side of the sun: the light comes and goes.
      const noon = day.solarNoon.getTime()
      const start = day.sunrise ? day.sunrise.getTime() - 20 * 60_000 : noon - 8 * 3_600_000
      const end = day.sunset ? day.sunset.getTime() + 20 * 60_000 : noon + 8 * 3_600_000
      const b = viewer.getModelBounds()
      const cam = viewer.getCameraViewpoint()
      if (!b || !cam) throw new Error('nothing to film')
      const dx = cam.position.x - b.center.x, dy = cam.position.y - b.center.y, dz = cam.position.z - b.center.z
      const duration = 12
      // The sky on while filming: shadows are dark, and on the dark studio
      // backdrop the one thing the video is about could not be seen.
      skyWasOn = useSolarStore.getState().skyOn
      if (!skyWasOn) solar.setSky(true)
      const blob = await renderShot(viewer, {
        type: 'orbit', durationSec: duration, bounds: b, aspect: 16 / 9, fovDeg: cam.fovDeg || 45,
        headingDeg: (Math.atan2(dx, dz) * 180) / Math.PI, sweepDeg: 25,
        elevationDeg: Math.max(15, (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI),
        padding: 1.15, easing: 'linear',
      }, {
        width: 1920, height: 1080, fps: 30, warmupFrames: 4,
        onProgress: (f) => setTimelapse(f),
        beforeFrame: (tSec) => {
          const utc = start + (end - start) * (tSec / duration)
          solar.setState({ timeUTC: utc, lat: loc.lat, lon: loc.lon, yawDeg: loc.yawDeg, moonOn: false })
        },
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `sun-day.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      setTimelapse(1)
    } catch (err) {
      setTimelapse(null)
      setTimelapseError(err instanceof Error && /WebCodecs|encode/i.test(err.message) ? t('timelapse.unsupported') : String(err instanceof Error ? err.message : err))
    } finally {
      if (!skyWasOn) void getSolar()?.then((sol) => sol.setSky(false))
      // Back to the instant the reader was looking at.
      useSolarStore.getState().setTimeUTC(savedTime)
      void pushState()
    }
  }, [viewerApiRef, getSolar, t]) // eslint-disable-line react-hooks/exhaustive-deps

  // The analysis panel works from the study's location: resolve it (the IFC's
  // georeference, the map, a saved manual one) before opening, so the reader
  // does not have to start the study first.
  const openAnalysis = useCallback(async (): Promise<void> => {
    const s = useSolarStore.getState()
    if (!s.location) {
      const loc = await resolveLocation()
      if (loc) {
        s.setLocation(loc)
        if (!s.tzOverridden) s.setTimeZone(timezoneFor(loc.lat, loc.lon), false)
      }
    }
    useSolarAnalysisStore.getState().setPanelOpen(true)
  }, [resolveLocation])

  // ── Push the study state into the 3D system ─────────────────────────────────
  const pushState = useCallback(async (): Promise<void> => {
    const s = useSolarStore.getState()
    if (!s.active || !s.location) return
    const solar = await getSolar()
    if (!solar) return
    solar.setState({
      timeUTC: s.timeUTC,
      lat: s.location.lat, lon: s.location.lon, yawDeg: s.location.yawDeg,
      moonOn: s.moonOn,
    })
    setSunInfo(solar.getSunInfo())
    setMoonInfo(solar.getMoonInfo())
    setTimes(dayTimes(new Date(s.timeUTC), s.location.lat, s.location.lon))
  }, [getSolar])

  const startWith = useCallback(async (loc: SolarLocation): Promise<void> => {
    try {
      const s = useSolarStore.getState()
      s.setLocation(loc)
      if (!s.tzOverridden) s.setTimeZone(timezoneFor(loc.lat, loc.lon), false)
      // First run: land on today 12:00 site time (a readable starting shadow).
      if (!s.active) {
        const tz = useSolarStore.getState().timeZone
        const parts = utcToWallParts(new Date(), tz)
        s.setTimeUTC(wallTimeToUTC(parts.year, parts.month, parts.day, 12, 0, tz).getTime())
      }
      const solar = await getSolar()
      if (!solar) throw new Error('viewer not ready')
      solar.setQuality(useSolarStore.getState().quality)
      solar.enable()
      solar.setSky(useSolarStore.getState().skyOn)
      useSolarStore.getState().setActive(true)
      enabledAtRef.current = Date.now()
      trackSolarEnabled({ location_source: loc.source, north_source: loc.northSource })
      await pushState()
    } catch {
      trackSolarError({ stage: 'enable' })
    }
  }, [getSolar, pushState])

  const handleStart = useCallback(async (): Promise<void> => {
    if (!activeModelId) return
    const loc = await resolveLocation()
    if (!loc) {
      setShowDefaultNotice(true) // requirement #1: never a silent default
      return
    }
    await startWith(loc)
  }, [activeModelId, resolveLocation, startWith])

  const handleStop = useCallback(async (): Promise<void> => {
    const solar = await getSolar()
    solar?.disable()
    useSolarStore.getState().setActive(false)
    setSunInfo(null)
    setMoonInfo(null)
    if (enabledAtRef.current > 0) {
      trackSolarDisabled({ duration_s: Math.round((Date.now() - enabledAtRef.current) / 1000) })
      enabledAtRef.current = 0
    }
  }, [getSolar])

  // Re-push on any study-state change while active.
  const { active, timeUTC, moonOn, skyOn, location, quality, timeZone } = store
  useEffect(() => {
    if (active) void pushState()
  }, [active, timeUTC, moonOn, location, pushState])

  useEffect(() => {
    if (!active) return
    void getSolar()?.then((s) => s.setQuality(quality))
  }, [active, quality, getSolar])

  useEffect(() => {
    if (!active) return
    void getSolar()?.then((s) => s.setSky(skyOn))
  }, [active, skyOn, getSolar])

  // ?solar= deep link: auto-start once, ONLY when a location resolves — a
  // deep link must never pop the blocking default-location notice.
  const deepLinkRef = useRef(false)
  useEffect(() => {
    if (deepLinkRef.current || !activeModelId) return
    const params = parseAppUrlParams()
    if (!params.solar) return
    deepLinkRef.current = true
    const target = params.solar
    void (async () => {
      const loc = await resolveLocation()
      if (!loc) return
      if (params.solarMoon) useSolarStore.getState().setMoonOn(true)
      await startWith(loc)
      const s = useSolarStore.getState()
      if (!s.active) return
      const nowWall = utcToWallParts(new Date(s.timeUTC), s.timeZone)
      s.setFollow('manual')
      s.setTimeUTC(wallTimeToUTC(
        target.year ?? nowWall.year, target.month, target.day,
        Math.floor(target.minutes / 60), target.minutes % 60, s.timeZone,
      ).getTime())
    })()
  }, [activeModelId, resolveLocation, startWith])

  // ── SDK bridge: `sdk:solar` from the embed postMessage handler ─────────────
  // Same ladder as the button and the deep link — the IFC's georeference, then
  // the map placement, then a saved manual location — plus one rung only a
  // host can offer: an explicit `location`. What it never does is fall back to
  // the default city: a host asking for a sun study at a place nobody named
  // gets an error it can act on, not shadows for Madrid.
  useEffect(() => appBus.on('sdk:solar', (cmd) => {
    void (async () => {
      try {
        if (cmd.active === false) {
          await handleStop()
          cmd.done?.(true)
          return
        }
        const s0 = useSolarStore.getState()
        if (cmd.moon !== undefined) s0.setMoonOn(cmd.moon)
        if (cmd.sky !== undefined) s0.setSkyOn(cmd.sky)
        if (cmd.quality) s0.setQuality(cmd.quality)

        if (!s0.active || cmd.location) {
          const loc: SolarLocation | null = cmd.location
            ? { lat: cmd.location.lat, lon: cmd.location.lon, yawDeg: 0, source: 'manual', northSource: 'assumed' }
            : await resolveLocation()
          if (!loc) throw new Error('The model carries no location — pass location: { lat, lon }')
          await startWith(loc)
          if (!useSolarStore.getState().active) throw new Error('The sun study could not start')
        }

        if (cmd.date || cmd.time) {
          const s = useSolarStore.getState()
          const now = utcToWallParts(new Date(s.timeUTC), s.timeZone)
          let { year, month, day, hour, minute } = now
          if (cmd.date) {
            const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(cmd.date.trim())
            if (!m) throw new Error(`Bad date "${cmd.date}" — use YYYY-MM-DD or MM-DD`)
            if (m[1]) year = +m[1]
            month = +m[2]; day = +m[3]
          }
          if (cmd.time) {
            const m = /^(\d{1,2}):(\d{2})$/.exec(cmd.time.trim())
            if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`Bad time "${cmd.time}" — use HH:MM`)
            hour = +m[1]; minute = +m[2]
          }
          if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error(`Bad date "${cmd.date}"`)
          s.setFollow('manual')
          s.setTimeUTC(wallTimeToUTC(year, month, day, hour, minute, s.timeZone).getTime())
        }
        cmd.done?.(true)
      } catch (err) {
        cmd.done?.(false, err instanceof Error ? err.message : String(err))
      }
    })()
  }), [handleStop, resolveLocation, startWith])

  // Realtime follow.
  useEffect(() => {
    if (!active || store.follow !== 'realtime') return
    const tick = (): void => useSolarStore.getState().setTimeUTC(Date.now())
    tick()
    const iv = setInterval(tick, 60_000)
    return () => clearInterval(iv)
  }, [active, store.follow])

  useEffect(() => { if (!active || !store.panelOpen) setPlaying(false) }, [active, store.panelOpen])
  useEffect(() => {
    if (!playing) return
    const iv = setInterval(() => {
      const s = useSolarStore.getState()
      const p = utcToWallParts(new Date(s.timeUTC), s.timeZone)
      // ~16 s for a whole day; wraps at midnight back to dawn's side of it.
      const next = (p.minutesOfDay + 6) % 1440
      s.setFollow('manual')
      s.setTimeUTC(wallTimeToUTC(p.year, p.month, p.day, Math.floor(next / 60), next % 60, s.timeZone).getTime())
    }, 66)
    return () => clearInterval(iv)
  }, [playing])

  // ── Time helpers ─────────────────────────────────────────────────────────────
  const wall = utcToWallParts(new Date(timeUTC), timeZone)

  const setWallMinutes = useCallback((minutes: number): void => {
    const s = useSolarStore.getState()
    const p = utcToWallParts(new Date(s.timeUTC), s.timeZone)
    s.setFollow('manual')
    s.setTimeUTC(wallTimeToUTC(p.year, p.month, p.day, Math.floor(minutes / 60), minutes % 60, s.timeZone).getTime())
  }, [])

  const setWallDate = useCallback((iso: string): void => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    if (!m) return
    const s = useSolarStore.getState()
    const p = utcToWallParts(new Date(s.timeUTC), s.timeZone)
    s.setFollow('manual')
    s.setTimeUTC(wallTimeToUTC(+m[1], +m[2], +m[3], p.hour, p.minute, s.timeZone).getTime())
  }, [])

  const jumpToSeason = useCallback((month: number, day: number): void => {
    const s = useSolarStore.getState()
    const p = utcToWallParts(new Date(s.timeUTC), s.timeZone)
    s.setFollow('manual')
    s.setTimeUTC(wallTimeToUTC(p.year, month, day, p.hour, p.minute, s.timeZone).getTime())
  }, [])

  const fmtWall = (d: Date): string => {
    const p = utcToWallParts(d, timeZone)
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }

  const markerPct = (d: Date | null): number | null => {
    if (!d) return null
    return (utcToWallParts(d, timeZone).minutesOfDay / 1439) * 100
  }

  // ── Presets (evergreen: time only — re-resolve against current location) ────
  const handleSavePreset = useCallback((): void => {
    const s = useSolarStore.getState()
    const p = utcToWallParts(new Date(s.timeUTC), s.timeZone)
    const name = presetName.trim() || `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} · ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    s.addPreset({
      id: crypto.randomUUID(), name,
      month: p.month, day: p.day, minutes: p.minutesOfDay, moonOn: s.moonOn,
    })
    setPresetName('')
    trackSolarPresetSaved()
  }, [presetName])

  const handleApplyPreset = useCallback(async (p: SolarPreset): Promise<void> => {
    const s = useSolarStore.getState()
    if (!s.active) await handleStart()
    const st = useSolarStore.getState()
    if (!st.active) return
    const now = utcToWallParts(new Date(st.timeUTC), st.timeZone)
    st.setFollow('manual')
    st.setMoonOn(p.moonOn)
    st.setTimeUTC(
      wallTimeToUTC(now.year, p.month, p.day, Math.floor(p.minutes / 60), p.minutes % 60, st.timeZone).getTime(),
    )
    trackSolarPresetApplied()
  }, [handleStart])

  // ── Offline city search (bundled GeoNames — zero network, plan §3 note) ─────
  useEffect(() => {
    if (!locationFormOpen || cityQuery.trim().length < 2) {
      setCityResults([])
      return
    }
    let alive = true
    void loadCities().then((cities) => {
      if (alive) setCityResults(searchCities(cityQuery, cities))
    })
    return () => { alive = false }
  }, [cityQuery, locationFormOpen])

  const handlePickCity = useCallback((c: City): void => {
    setManualLat(String(c.lat))
    setManualLon(String(c.lon))
    setCityQuery(`${c.name} (${c.country})`)
    setCityResults([])
  }, [])

  // ── Manual location form ─────────────────────────────────────────────────────
  const handleManualLocation = useCallback(async (): Promise<void> => {
    const lat = parseFloat(manualLat)
    const lon = parseFloat(manualLon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return
    if (cacheKey) saveManualLocation(cacheKey, lat, lon)
    setLocationFormOpen(false)
    setShowDefaultNotice(false)
    await startWith({ lat, lon, yawDeg: 0, source: 'manual', northSource: 'assumed' })
  }, [manualLat, manualLon, cacheKey, startWith])

  // ── Render ───────────────────────────────────────────────────────────────────
  const client = variant === 'client'
  const tzOffsetMin = zoneOffsetMinutes(new Date(timeUTC), timeZone)
  const tzLabel = `UTC${tzOffsetMin >= 0 ? '+' : '−'}${Math.abs(tzOffsetMin / 60)}`

  return (
    <>
      {/* Persistent time chip — requirement #3: always visible while active */}
      {active && (
        <button
          onClick={() => store.setPanelOpen(true)}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-auto px-2.5 py-1 rounded-full text-[10.5px] font-mono tabular-nums bg-[rgba(10,10,14,0.78)] border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
          data-testid="solar-chip"
        >
          ☀ {String(wall.day).padStart(2, '0')}/{String(wall.month).padStart(2, '0')} · {String(wall.hour).padStart(2, '0')}:{String(wall.minute).padStart(2, '0')} ({tzLabel})
          {sunInfo && (sunInfo.altitudeDeg > 0
            ? ` · ${Math.round(sunInfo.altitudeDeg)}°`
            : ` · ${t('chip.belowHorizon')}`)}
          {location && location.source !== 'ifc' && <span className="ml-1 text-[#F5A623]">⚠</span>}
        </button>
      )}

      <ViewportPanel
      id="solar"
        open={store.panelOpen}
        onClose={() => store.setPanelOpen(false)}
        label={t('panel.title')}
        mobile="sheet"
        peek
        collapseKey={active ? 'on' : null}
        widthPx={280}
        anchor="top"
        maxHeight="calc(100vh - 140px)"
      >
        {/* The scroller lives here rather than on the card, so the SAME element
            does the job in both shells: it flexes inside the desktop card's
            max-height and inside the sheet's full height. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
              {/* ── Phone: the live control first ──────────────────────────────
                  A sun study is watched, not read. On a phone the sheet rests at
                  its peek detent with the shadows in full view above it, so the
                  top of the sheet is the one thing you drive while watching: a
                  thumb-sized time scrubber with the day's events on it, and a
                  play button that runs the day. Date and seasons sit just below;
                  everything else is a drag up. */}
              {isMobile && (
                <div className="shrink-0 px-3.5 pb-2">
                  <div className="flex items-center gap-2 pb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[var(--text)] leading-tight">{t('panel.title')}</div>
                      <div className="text-[11px] text-[var(--text-faint)] font-mono tabular-nums truncate">
                        {String(wall.day).padStart(2, '0')}/{String(wall.month).padStart(2, '0')}/{wall.year} · {tzLabel}
                        {active && sunInfo && (sunInfo.altitudeDeg > 0 ? ` · ☀ ${Math.round(sunInfo.altitudeDeg)}°` : ` · ${t('chip.belowHorizon')}`)}
                      </div>
                    </div>
                    {active && (
                      <span className="text-[22px] font-semibold font-mono tabular-nums text-[var(--text)]">
                        {String(wall.hour).padStart(2, '0')}:{String(wall.minute).padStart(2, '0')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => store.setPanelOpen(false)}
                      aria-label={t('panel.close')}
                      className="w-10 h-10 shrink-0 rounded-[11px] bg-white/[0.05] text-[var(--text-dim)] flex items-center justify-center"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
                    </button>
                  </div>

                  {!active ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { void handleStart() }}
                        disabled={!activeModelId}
                        className="w-full h-12 rounded-[12px] text-[14px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40 active:scale-[0.98] transition-transform"
                      >
                        {t('enable.start')}
                      </button>
                      {!activeModelId && <div className="mt-1.5 text-[11.5px] text-[var(--text-faint)]">{t('enable.noModel')}</div>}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setPlaying((v) => !v)}
                          aria-label={playing ? t('time.pause') : t('time.play')}
                          aria-pressed={playing}
                          className={[
                            'w-11 h-11 shrink-0 rounded-full flex items-center justify-center active:scale-[0.93] transition-transform',
                            playing ? 'bg-[var(--accent)] text-white' : 'bg-white/[0.08] text-[var(--text)]',
                          ].join(' ')}
                        >
                          {playing
                            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3" height="10" rx="1" /><rect x="8" y="2" width="3" height="10" rx="1" /></svg>
                            : <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M4 2.2v9.6a.6.6 0 00.9.5l7.4-4.8a.6.6 0 000-1L4.9 1.7a.6.6 0 00-.9.5z" /></svg>}
                        </button>
                        <div className="relative flex-1 min-w-0">
                          {/* The day's events, as ticks above the track */}
                          <div className="absolute left-[13px] right-[13px] top-[6px] h-[6px] pointer-events-none">
                            {times && !times.alwaysUp && !times.alwaysDown && (
                              <>
                                <Marker pct={markerPct(times.sunrise)} title={t('time.sunrise')} color="#F5A623" />
                                <Marker pct={markerPct(times.solarNoon)} title={t('time.solarNoon')} color="#FFD966" />
                                <Marker pct={markerPct(times.sunset)} title={t('time.sunset')} color="#E5484D" />
                              </>
                            )}
                          </div>
                          <input
                            type="range" min={0} max={1439} step={1}
                            value={wall.minutesOfDay}
                            onChange={(e) => { setPlaying(false); setWallMinutes(parseInt(e.target.value, 10)) }}
                            className="m-range"
                            style={{ '--m-range-c': '#F5A623', '--m-range-p': `${(wall.minutesOfDay / 1439) * 100}%` } as React.CSSProperties}
                            aria-label={t('time.date')}
                            data-testid="solar-time-slider"
                          />
                          <div className="flex justify-between -mt-1.5 text-[10.5px] font-mono tabular-nums text-[var(--text-faint)]">
                            <span>{times?.sunrise ? `↑ ${fmtWall(times.sunrise)}` : '00:00'}</span>
                            <span>{times?.sunset ? `${fmtWall(times.sunset)} ↓` : '24:00'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                        <input
                          type="date"
                          value={`${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`}
                          onChange={(e) => setWallDate(e.target.value)}
                          aria-label={t('time.date')}
                          className="geo-input shrink-0 !w-auto"
                        />
                        {!client && ([
                          [t('seasons.summer'), 6, 21], [t('seasons.equinox'), 3, 20], [t('seasons.winter'), 12, 21],
                        ] as const).map(([label, m, d]) => (
                          <button key={label} type="button" onClick={() => jumpToSeason(m, d)}
                            className={[
                              'shrink-0 h-10 px-3 rounded-full text-[12px] font-medium whitespace-nowrap border',
                              wall.month === m && wall.day === d ? 'border-[var(--accent)] bg-[rgba(94,106,210,0.18)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)]',
                            ].join(' ')}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Header */}
              {!isMobile && <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)] flex items-center justify-between">
                <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">
                  {t('panel.title')}
                </div>
                <button
                  onClick={() => store.setPanelOpen(false)}
                  className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                  title={t('panel.close')}
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l10 10M12 2L2 12"/>
                  </svg>
                </button>
              </div>}

              {/* Start/stop + badges (on a phone the start lives in the top block) */}
              <div className={['flex flex-col gap-1.5', isMobile ? (active ? 'px-3.5 py-2' : 'hidden') : 'p-2'].join(' ')}>
                {!active ? (
                  <button
                    onClick={() => { void handleStart() }}
                    disabled={!activeModelId}
                    className="w-full px-2.5 py-2 rounded-[8px] text-[12px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40"
                  >
                    {t('enable.start')}
                  </button>
                ) : (
                  <button
                    onClick={() => { void handleStop() }}
                    className="w-full px-2.5 py-2 rounded-[8px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
                  >
                    {t('enable.stop')}
                  </button>
                )}
                {!activeModelId && !isMobile && (
                  <div className="text-[10.5px] text-[var(--text-faint)]">{t('enable.noModel')}</div>
                )}
                {/* The analysis: where the study shows ONE instant, this measures
                    the whole day or season. It needs the same location. */}
                {!client && activeModelId && (
                  <button
                    onClick={() => { void openAnalysis() }}
                    className="w-full px-2.5 py-2 rounded-[8px] text-left border border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                  >
                    <div className="text-[12px] font-semibold text-[var(--text)]">{t('analysis.open')} →</div>
                    <div className="text-[10px] text-[var(--text-faint)]">{t('analysis.openHint')}</div>
                  </button>
                )}
                {location && !client && (
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      warn={location.source === 'default'}
                      label={t(`badges.location${cap(location.source)}` as 'badges.locationIfc')}
                    />
                    <Badge
                      warn={location.northSource === 'assumed'}
                      label={location.northSource === 'ifc' ? t('badges.northIfc') : t('badges.northAssumed')}
                    />
                  </div>
                )}
                {location && client && location.source !== 'ifc' && (
                  <Badge warn label={t(`badges.location${cap(location.source)}` as 'badges.locationIfc')} />
                )}
              </div>

              {/* Presets first in client mode (requirement #2) */}
              {client && <PresetsBlock presets={store.presets} onApply={handleApplyPreset} onDelete={(id) => store.removePreset(id)} t={t} client />}

              {/* Date + time (a phone has these in the top block) */}
              <div className={['border-t border-[var(--border)] px-3 py-2 flex-col gap-1.5', isMobile ? 'hidden' : 'flex'].join(' ')}>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-[var(--text-faint)]">{t('time.date')}</label>
                  <input
                    type="date"
                    value={`${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`}
                    onChange={(e) => setWallDate(e.target.value)}
                    className="geo-input flex-1"
                  />
                </div>

                {!client && (
                  <div className="grid grid-cols-3 gap-1">
                    <SeasonBtn label={t('seasons.summer')} onClick={() => jumpToSeason(6, 21)} />
                    <SeasonBtn label={t('seasons.equinox')} onClick={() => jumpToSeason(3, 20)} />
                    <SeasonBtn label={t('seasons.winter')} onClick={() => jumpToSeason(12, 21)} />
                  </div>
                )}

                {/* Time slider with day-event markers */}
                <div className="relative pt-1.5">
                  <div className="relative h-1">
                    {times && !times.alwaysUp && !times.alwaysDown && (
                      <>
                        <Marker pct={markerPct(times.sunrise)} title={t('time.sunrise')} color="#F5A623" />
                        <Marker pct={markerPct(times.solarNoon)} title={t('time.solarNoon')} color="#FFD966" />
                        <Marker pct={markerPct(times.goldenHour)} title={t('time.goldenHour')} color="#F59E0B" />
                        <Marker pct={markerPct(times.sunset)} title={t('time.sunset')} color="#E5484D" />
                      </>
                    )}
                  </div>
                  <input
                    type="range" min={0} max={1439} step={1}
                    value={wall.minutesOfDay}
                    onChange={(e) => setWallMinutes(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--accent)]"
                    data-testid="solar-time-slider"
                  />
                  <div className="flex justify-between text-[9.5px] font-mono text-[var(--text-faint)]">
                    <span>00:00</span>
                    <span className="text-[var(--text)] tabular-nums">
                      {String(wall.hour).padStart(2, '0')}:{String(wall.minute).padStart(2, '0')}
                    </span>
                    <span>24:00</span>
                  </div>
                  {times?.alwaysUp && <div className="text-[10px] text-[var(--text-faint)]">{t('time.polarDay')}</div>}
                  {times?.alwaysDown && <div className="text-[10px] text-[var(--text-faint)]">{t('time.polarNight')}</div>}
                </div>

                <label className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={store.follow === 'realtime'}
                    onChange={(e) => store.setFollow(e.target.checked ? 'realtime' : 'manual')}
                    className="accent-[var(--accent)]"
                  />
                  {t('time.realtime')}
                </label>
              </div>

              {isMobile && active && (
                <div className="border-t border-[var(--border)] px-3.5 py-1">
                  <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={store.follow === 'realtime'}
                      onChange={(e) => { setPlaying(false); store.setFollow(e.target.checked ? 'realtime' : 'manual') }}
                      className="accent-[var(--accent)]"
                    />
                    {t('time.realtime')}
                  </label>
                </div>
              )}

              {/* Sky dome */}
              <div className="border-t border-[var(--border)] px-3 py-2">
                <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skyOn}
                    onChange={(e) => store.setSkyOn(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  {t('sky.toggle')}
                </label>
              </div>

              {/* Moon */}
              <div className="border-t border-[var(--border)] px-3 py-2 flex items-center gap-2">
                <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)] cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={moonOn}
                    onChange={(e) => {
                      store.setMoonOn(e.target.checked)
                      trackSolarMoonToggled({ enabled: e.target.checked })
                    }}
                    className="accent-[var(--accent)]"
                  />
                  {t('moon.toggle')}
                </label>
                {moonOn && moonInfo && (
                  <span className="text-[11px] text-[var(--text-dim)]" title={t(`moon.phase${moonPhaseIndex(moonInfo.phase)}` as 'moon.phase0')}>
                    {MOON_GLYPHS[moonPhaseIndex(moonInfo.phase)]}{' '}
                    <span className="text-[9.5px] font-mono">{t('moon.fraction', { pct: Math.round(moonInfo.fraction * 100) })}</span>
                  </span>
                )}
              </div>

              {/* Almanac: the day's sky in numbers and a sun-path diagram */}
              {!client && location && (
                <details className="border-t border-[var(--border)] px-3 py-2 group">
                  <summary className="cursor-pointer list-none flex items-center justify-between text-[10px] font-mono text-[var(--text-faint)] tracking-[0.08em] uppercase">
                    {t('almanac.title')}
                    <span className="transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="mt-2">
                    <React.Suspense fallback={null}>
                      <AlmanacBlock lat={location.lat} lon={location.lon} timeZone={timeZone} timeUTC={timeUTC} />
                    </React.Suspense>
                  </div>
                </details>
              )}

              {/* Presets (technical position) */}
              {!client && (
                <div className="border-t border-[var(--border)] px-3 py-2 flex flex-col gap-1.5">
                  <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.08em] uppercase">
                    {t('presets.title')}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder={t('presets.namePlaceholder')}
                      className="geo-input flex-1"
                    />
                    <button
                      onClick={handleSavePreset}
                      disabled={!active}
                      className="px-2 py-1.5 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40 whitespace-nowrap"
                    >
                      {t('presets.save')}
                    </button>
                  </div>
                  <PresetsBlock presets={store.presets} onApply={handleApplyPreset} onDelete={(id) => store.removePreset(id)} t={t} />
                </div>
              )}

              {/* Location + quality (technical only) */}
              {!client && (
                <div className="border-t border-[var(--border)] px-3 py-2 flex flex-col gap-1.5">
                  <button
                    onClick={() => setLocationFormOpen((v) => !v)}
                    className="text-left text-[11px] text-[var(--accent)] hover:underline"
                  >
                    {t('location.title')}
                  </button>
                  {locationFormOpen && (
                    <div className="flex flex-col gap-1.5">
                      {/* City search — offline (bundled GeoNames, CC BY) */}
                      <div className="relative">
                        <input
                          value={cityQuery}
                          onChange={(e) => setCityQuery(e.target.value)}
                          placeholder={t('location.searchCity')}
                          className="geo-input"
                          data-testid="solar-city-search"
                        />
                        {cityResults.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-10 glass-md border border-[var(--border-strong)] rounded-[8px] overflow-hidden shadow-xl">
                            {cityResults.map((c, i) => (
                              <button
                                key={`${c.name}-${c.country}-${i}`}
                                onClick={() => handlePickCity(c)}
                                className="w-full text-left px-2.5 py-1.5 text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                              >
                                {c.name} <span className="text-[9.5px] font-mono text-[var(--text-faint)]">{c.country}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex-1">
                          <label className="text-[10px] text-[var(--text-faint)]">{t('location.lat')}</label>
                          <input value={manualLat} onChange={(e) => setManualLat(e.target.value)} placeholder="40.4168" className="geo-input" inputMode="decimal" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-[var(--text-faint)]">{t('location.lon')}</label>
                          <input value={manualLon} onChange={(e) => setManualLon(e.target.value)} placeholder="-3.7038" className="geo-input" inputMode="decimal" />
                        </div>
                      </div>
                      <button
                        onClick={() => { void handleManualLocation() }}
                        className="px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white"
                      >
                        {t('location.apply')}
                      </button>
                      <button
                        onClick={() => useGeoStore.getState().setPanelOpen(true)}
                        className="text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text)] text-left"
                      >
                        {t('location.pickOnMap')}
                      </button>
                      {/* CC BY 4.0 attribution for the bundled gazetteer */}
                      <div className="text-[9px] text-[var(--text-faint)]">
                        {t('location.citiesAttribution')}
                      </div>
                    </div>
                  )}
                  {/* The day as a video: the sun crosses the sky while the camera
                      drifts a quarter-turn — the shot a client actually watches. */}
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] text-[var(--text-faint)]">{t('timelapse.title')}</div>
                    <button
                      disabled={timelapse !== null && timelapse < 1}
                      onClick={() => { void exportTimelapse() }}
                      className="w-full px-2.5 py-1.5 rounded-[8px] text-[11px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                    >
                      {timelapse !== null && timelapse < 1 ? t('timelapse.rendering', { pct: Math.round(timelapse * 100) }) : t('timelapse.export')}
                    </button>
                    {timelapseError && <div className="text-[10px] text-[#F5A623]">{timelapseError}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-faint)]">{t('quality.label')}</span>
                    {(['standard', 'high'] as const).map((q) => (
                      <button
                        key={q}
                        onClick={() => store.setQuality(q)}
                        className={[
                          'px-2 py-1 rounded-[7px] text-[10.5px] font-medium transition-colors',
                          quality === q ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]',
                        ].join(' ')}
                      >
                        {t(`quality.${q}`)}
                      </button>
                    ))}
                  </div>
                  <div className="text-[9.5px] font-mono text-[var(--text-faint)]">
                    {t('time.timezone')}: {timeZone} ({tzLabel})
                  </div>
                </div>
              )}
        </div>
      </ViewportPanel>

      {/* Blocking default-location notice — requirement #1 */}
      <AnimatePresence>
        {showDefaultNotice && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(0,0,0,0.5)] pointer-events-auto"
          >
            <div className="glass-md border border-[var(--border-strong)] rounded-[12px] p-4 max-w-[360px] mx-3">
              <div className="text-[13px] font-semibold mb-1.5 text-[#F5A623]">⚠ {t('defaultNotice.title')}</div>
              <div className="text-[11.5px] text-[var(--text-dim)] leading-relaxed mb-3">{t('defaultNotice.body')}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowDefaultNotice(false)
                    useSolarStore.getState().setPanelOpen(true)
                    setLocationFormOpen(true)
                  }}
                  className="flex-1 px-3 py-2 rounded-[8px] text-[12px] font-semibold bg-[var(--accent)] text-white"
                >
                  {t('defaultNotice.setLocation')}
                </button>
                <button
                  onClick={() => {
                    setShowDefaultNotice(false)
                    void startWith(DEFAULT_LOCATION)
                  }}
                  className="flex-1 px-3 py-2 rounded-[8px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)]"
                >
                  {t('defaultNotice.continue')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Bits ────────────────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Badge({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-medium border"
      style={warn
        ? { color: '#F5A623', borderColor: 'rgba(245,166,35,0.4)', background: 'rgba(245,166,35,0.08)' }
        : { color: 'var(--text-faint)', borderColor: 'var(--border)' }}
    >
      {label}
    </span>
  )
}

function Marker({ pct, title, color }: { pct: number | null; title: string; color: string }) {
  if (pct === null) return null
  return (
    <span
      className="absolute top-0 w-[3px] h-full rounded-full"
      style={{ left: `${pct}%`, background: color }}
      title={title}
    />
  )
}

function SeasonBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-1 py-1.5 rounded-[7px] text-[10px] font-medium text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
    >
      {label}
    </button>
  )
}

function PresetsBlock({ presets, onApply, onDelete, t, client }: {
  presets: SolarPreset[]
  onApply: (p: SolarPreset) => void | Promise<void>
  onDelete: (id: string) => void
  t: (key: 'presets.empty' | 'presets.apply' | 'presets.delete') => string
  client?: boolean
}) {
  if (presets.length === 0) {
    return <div className="text-[10px] text-[var(--text-faint)] px-3 py-1.5">{t('presets.empty')}</div>
  }
  return (
    <div className={client ? 'px-3 py-2 grid grid-cols-2 gap-1.5' : 'flex flex-col gap-1'}>
      {presets.map((p) => (
        <div
          key={p.id}
          className={[
            'flex items-center gap-1.5 rounded-[8px] border border-[var(--border)]',
            client ? 'flex-col items-stretch p-2' : 'px-2 py-1.5',
          ].join(' ')}
        >
          <button
            onClick={() => { void onApply(p) }}
            className="flex-1 text-left text-[11px] text-[var(--text)] hover:text-[var(--accent)] transition-colors"
            title={t('presets.apply')}
          >
            {p.moonOn ? '🌙 ' : '☀ '}{p.name}
          </button>
          {!client && (
            <button
              onClick={() => onDelete(p.id)}
              className="text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
              title={t('presets.delete')}
            >
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12"/>
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
