// ─── AlmanacBlock ─────────────────────────────────────────────────────────────
// The site's sky for the studied day, in numbers and in one drawing: where the
// sun is now (to a tenth of a degree) and how long a shadow it casts; sunrise,
// sunset and the three twilights with where on the horizon to look; day length
// and how fast it changes; the moon's rise, set and next phases; and a sun-path
// diagram — the year's envelope (solstices, equinox), today's arc with its
// hours, and the sun and moon right now — drawn to the site's TRUE north.

import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { sunAlmanac, moonAlmanac, nextMoonPhases, type PhaseName } from '../../lib/solar/astronomy'
import { solarPosition } from '../../lib/solar/solar-position'
import { moonAt, utcToWallParts, wallTimeToUTC, zoneOffsetMinutes } from '../../lib/solar/sun-math'

interface Props {
  lat: number
  lon: number
  timeZone: string
  timeUTC: number
}

const PHASE_GLYPH: Record<PhaseName, string> = { new: '🌑', firstQuarter: '🌓', full: '🌕', lastQuarter: '🌗' }

export default function AlmanacBlock({ lat, lon, timeZone, timeUTC }: Props) {
  const { t, i18n } = useTranslation('solar')
  const wall = utcToWallParts(new Date(timeUTC), timeZone)
  const dayKey = `${wall.year}-${wall.month}-${wall.day}|${lat.toFixed(4)},${lon.toFixed(4)}|${timeZone}`

  // Everything that depends on the day only: recomputed when the date moves, not the time.
  const day = useMemo(() => {
    const sun = sunAlmanac(wall.year, wall.month, wall.day, lat, lon, timeZone)
    const moon = moonAlmanac(wall.year, wall.month, wall.day, lat, lon, timeZone)
    const phases = nextMoonPhases(wallTimeToUTC(wall.year, wall.month, wall.day, 0, 0, timeZone).getTime(), 4)
    return { sun, moon, phases }
  }, [dayKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = solarPosition(timeUTC, lat, lon)
  const moonNow = moonAt(new Date(timeUTC), lat, lon)
  const shadowPerM = now.altitudeDeg > 0.5 ? 1 / Math.tan((now.altitudeDeg * Math.PI) / 180) : null

  const clock = (ms: number | null): string => {
    if (ms === null) return '—'
    const p = utcToWallParts(new Date(ms), timeZone)
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }
  const dur = (min: number): string => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone })
  const s = day.sun
  const delta = s.dayLengthDeltaMin
  const deltaStr = `${delta >= 0 ? '+' : '−'}${Math.floor(Math.abs(delta))}:${String(Math.round((Math.abs(delta) % 1) * 60)).padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-2 text-[11px] text-[var(--text-dim)]">
      <SunPathDiagram lat={lat} lon={lon} timeZone={timeZone} year={wall.year} month={wall.month} dayOfMonth={wall.day}
        sun={{ az: now.azimuthDeg, alt: now.altitudeDeg }} moon={{ az: moonNow.azimuthDeg, alt: moonNow.altitudeDeg }} t={t} />

      <div className="flex flex-col gap-y-0.5">
        <Kv k={t('almanac.azimuth')} v={`${now.azimuthDeg.toFixed(1)}°`} />
        <Kv k={t('almanac.altitude')} v={`${now.altitudeDeg.toFixed(1)}°`} />
        <Kv k={t('almanac.shadow')} v={shadowPerM !== null && shadowPerM < 100 ? `${(shadowPerM * 10).toFixed(1)} m` : '—'} title={t('almanac.shadowHint')} />
        <Kv k={t('almanac.noonAltitude')} v={`${s.noonAltitudeDeg.toFixed(1)}° · ${clock(s.noon)}`} />
      </div>

      <div className="flex flex-col gap-y-0.5">
        <Kv k={t('time.sunrise')} v={`${clock(s.sunrise)}${s.sunriseAzimuthDeg !== null ? ` · ${s.sunriseAzimuthDeg.toFixed(0)}°` : ''}`} />
        <Kv k={t('time.sunset')} v={`${clock(s.sunset)}${s.sunsetAzimuthDeg !== null ? ` · ${s.sunsetAzimuthDeg.toFixed(0)}°` : ''}`} />
        <Kv k={t('almanac.dayLength')} v={dur(s.dayLengthMin)} />
        <Kv k={t('almanac.dayDelta')} v={deltaStr} />
        <Kv k={t('almanac.civil')} v={`${clock(s.civilDawn)}–${clock(s.civilDusk)}`} />
        <Kv k={t('almanac.nautical')} v={`${clock(s.nauticalDawn)}–${clock(s.nauticalDusk)}`} />
        <Kv k={t('almanac.astronomical')} v={`${clock(s.astroDawn)}–${clock(s.astroDusk)}`} />
        <Kv k={t('almanac.declination')} v={`${now.declinationDeg.toFixed(2)}°`} />
      </div>

      <div className="border-t border-[var(--border)] pt-1.5 flex flex-col gap-y-0.5">
        <Kv k={t('almanac.moonrise')} v={day.moon.alwaysUp ? t('almanac.allDay') : day.moon.alwaysDown ? t('almanac.notUp') : clock(day.moon.rise)} />
        <Kv k={t('almanac.moonset')} v={day.moon.alwaysUp || day.moon.alwaysDown ? '—' : clock(day.moon.set)} />
        <Kv k={t('almanac.moonPos')} v={`${moonNow.azimuthDeg.toFixed(0)}° · ${moonNow.altitudeDeg.toFixed(0)}°`} />
        <Kv k={t('almanac.distance')} v={`${Math.round(day.moon.distanceKm).toLocaleString(i18n.language)} km`} />
      </div>
      <div className="flex flex-col gap-0.5">
        {day.phases.map((p) => (
          <div key={p.utc} className="flex justify-between">
            <span>{PHASE_GLYPH[p.phase]} {t(`almanac.phases.${p.phase}`)}</span>
            <span className="font-mono tabular-nums text-[var(--text)]">{dateFmt.format(new Date(p.utc))}</span>
          </div>
        ))}
      </div>
      <div className="text-[9.5px] text-[var(--text-faint)] leading-snug">
        {t('almanac.source', { offset: formatOffset(zoneOffsetMinutes(new Date(timeUTC), timeZone)) })}
      </div>
    </div>
  )
}

function formatOffset(min: number): string {
  const sign = min >= 0 ? '+' : '−'
  const a = Math.abs(min)
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}

function Kv({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <div className="flex justify-between gap-2" title={title}>
      <span className="truncate">{k}</span>
      <span className="font-mono tabular-nums text-[var(--text)] shrink-0">{v}</span>
    </div>
  )
}

// ── Sun-path diagram ────────────────────────────────────────────────────────────

type T = ReturnType<typeof useTranslation<'solar'>>['t']

/** Equidistant polar projection: zenith at the centre, horizon on the rim, north up. */
function project(az: number, alt: number, r: number, c: number): [number, number] {
  const rho = ((90 - Math.max(-2, alt)) / 90) * r
  const a = (az * Math.PI) / 180
  return [c + rho * Math.sin(a), c - rho * Math.cos(a)]
}

function dayArc(lat: number, lon: number, year: number, month: number, day: number, timeZone: string): Array<{ az: number; alt: number; hour: number | null }> {
  const noon = wallTimeToUTC(year, month, day, 12, 0, timeZone).getTime()
  const offset = zoneOffsetMinutes(new Date(noon), timeZone)
  const midnight = Date.UTC(year, month - 1, day) - offset * 60_000
  const out: Array<{ az: number; alt: number; hour: number | null }> = []
  for (let m = 0; m <= 24 * 60; m += 10) {
    const p = solarPosition(midnight + m * 60_000, lat, lon)
    out.push({ az: p.azimuthDeg, alt: p.altitudeDeg, hour: m % 60 === 0 ? m / 60 : null })
  }
  return out
}

function SunPathDiagram({ lat, lon, timeZone, year, month, dayOfMonth, sun, moon, t }: {
  lat: number; lon: number; timeZone: string; year: number; month: number; dayOfMonth: number
  sun: { az: number; alt: number }; moon: { az: number; alt: number }; t: T
}) {
  const size = 220, c = size / 2, r = c - 16
  const arcs = useMemo(() => {
    const south = lat < 0
    return {
      summer: dayArc(lat, lon, year, south ? 12 : 6, 21, timeZone),
      equinox: dayArc(lat, lon, year, 3, 20, timeZone),
      winter: dayArc(lat, lon, year, south ? 6 : 12, 21, timeZone),
      today: dayArc(lat, lon, year, month, dayOfMonth, timeZone),
    }
  }, [lat, lon, year, month, dayOfMonth, timeZone])

  // A path only above the horizon, split where the sun sets.
  const path = (pts: Array<{ az: number; alt: number }>): string => {
    let d = ''
    let pen = false
    for (const p of pts) {
      if (p.alt < 0) { pen = false; continue }
      const [x, y] = project(p.az, p.alt, r, c)
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
      pen = true
    }
    return d
  }
  const [sx, sy] = project(sun.az, sun.alt, r, c)
  const [mx, my] = project(moon.az, moon.alt, r, c)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[240px] self-center" role="img" aria-label={t('almanac.diagram')}>
      <circle cx={c} cy={c} r={r} fill="var(--surface-2)" stroke="var(--border-strong)" />
      {[30, 60].map((a) => (
        <circle key={a} cx={c} cy={c} r={((90 - a) / 90) * r} fill="none" stroke="var(--border)" strokeDasharray="2 3" />
      ))}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const [x, y] = project(a, 0, r, c)
        return <line key={a} x1={c} y1={c} x2={x} y2={y} stroke="var(--border)" strokeWidth={a % 90 === 0 ? 0.8 : 0.4} />
      })}
      {(['N', 'E', 'S', 'W'] as const).map((l, i) => {
        const [x, y] = project(i * 90, -12, r, c)
        return <text key={l} x={x} y={y + 3} textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="monospace">{t(`almanac.compass.${l}`)}</text>
      })}
      <text x={c + 3} y={c - ((90 - 30) / 90) * r - 2} fontSize="7" fill="var(--text-faint)">30°</text>
      <text x={c + 3} y={c - ((90 - 60) / 90) * r - 2} fontSize="7" fill="var(--text-faint)">60°</text>

      <path d={path(arcs.summer)} fill="none" stroke="#e8604c" strokeWidth={1.2} opacity={0.8} />
      <path d={path(arcs.equinox)} fill="none" stroke="#8a8fa3" strokeWidth={1} strokeDasharray="3 2" />
      <path d={path(arcs.winter)} fill="none" stroke="#4a8fd6" strokeWidth={1.2} opacity={0.8} />
      <path d={path(arcs.today)} fill="none" stroke="#F5A623" strokeWidth={2} />
      {arcs.today.filter((p) => p.hour !== null && p.alt > 0).map((p) => {
        const [x, y] = project(p.az, p.alt, r, c)
        return (
          <g key={p.hour}>
            <circle cx={x} cy={y} r={1.6} fill="#F5A623" />
            <text x={x} y={y - 3.5} textAnchor="middle" fontSize="6.5" fill="var(--text-dim)" fontFamily="monospace">{p.hour}</text>
          </g>
        )
      })}
      {moon.alt > 0 && <circle cx={mx} cy={my} r={4} fill="#d9dde8" stroke="#8a8fa3" />}
      {sun.alt > 0 && <circle cx={sx} cy={sy} r={5.5} fill="#FFD966" stroke="#F5A623" strokeWidth={1.5} />}
      <g fontSize="7" fontFamily="monospace">
        <text x={4} y={size - 22} fill="#e8604c">— {t('almanac.legend.summer')}</text>
        <text x={4} y={size - 13} fill="#8a8fa3">-- {t('almanac.legend.equinox')}</text>
        <text x={4} y={size - 4} fill="#4a8fd6">— {t('almanac.legend.winter')}</text>
        <text x={size - 4} y={size - 4} textAnchor="end" fill="#F5A623">— {t('almanac.legend.today')}</text>
      </g>
    </svg>
  )
}
