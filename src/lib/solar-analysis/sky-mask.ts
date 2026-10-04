// ─── sky-mask ─────────────────────────────────────────────────────────────────
// PURE: what one point sees of the sky, and what that means for its sun.
//
// The mask is the classic shading diagram of a point (Ecotect, Ladybug,
// the "masque solaire" of French practice): a grid over the upper hemisphere,
// 2° of azimuth by 2° of altitude, marking every direction where something —
// the model, the city around it, the terrain — stands between the point and
// the sky. The GPU fills it (analysis-system renders the scene as seen from
// the point); everything below is arithmetic on it: the sun's hours there,
// month by month and hour by hour, and the outline to draw over a sun path.

import { solarPosition } from '../solar/solar-position'
import { wallTimeToUTC, zoneOffsetMinutes } from '../solar/sun-math'

export const MASK_AZ = 180
export const MASK_ALT = 45
export const MASK_STEP = 2

export interface SkyMask {
  /** 1 = obstructed. Row-major [alt][az], alt 0 at the horizon, az 0 = north, clockwise. */
  cells: Uint8Array
  /** Share of the visible hemisphere, cosine-weighted (what diffuse light sees), 0–1. */
  skyView: number
}

export function maskIndex(azDeg: number, altDeg: number): number {
  const a = Math.min(MASK_ALT - 1, Math.max(0, Math.floor(altDeg / MASK_STEP)))
  const z = Math.floor((((azDeg % 360) + 360) % 360) / MASK_STEP) % MASK_AZ
  return a * MASK_AZ + z
}

/** Direction at the centre of a cell. */
export function cellCentre(index: number): { azDeg: number; altDeg: number } {
  const a = Math.floor(index / MASK_AZ)
  const z = index % MASK_AZ
  return { azDeg: (z + 0.5) * MASK_STEP, altDeg: (a + 0.5) * MASK_STEP }
}

export function isBlocked(mask: SkyMask, azDeg: number, altDeg: number): boolean {
  if (altDeg <= 0) return true
  return mask.cells[maskIndex(azDeg, altDeg)] === 1
}

/** Cosine-weighted visible sky of a horizontal receiver, from the cells. */
export function maskSkyView(cells: Uint8Array): number {
  let open = 0, total = 0
  for (let a = 0; a < MASK_ALT; a++) {
    const alt = ((a + 0.5) * MASK_STEP * Math.PI) / 180
    // Solid angle of a ring cell ∝ cos(alt); cosine weight on a horizontal plane = sin(alt).
    const w = Math.cos(alt) * Math.sin(alt)
    for (let z = 0; z < MASK_AZ; z++) {
      total += w
      if (cells[a * MASK_AZ + z] === 0) open += w
    }
  }
  return total > 0 ? open / total : 0
}

/**
 * The obstruction outline per azimuth: the altitude up to which the sky is
 * blocked CONTIGUOUSLY from the horizon (a skyline), plus the cells blocked
 * above an open band (an overhang, a bridge, a balcony above).
 */
export function maskOutline(mask: SkyMask): { skyline: number[]; overhangs: number[] } {
  const skyline: number[] = []
  const overhangs: number[] = []
  for (let z = 0; z < MASK_AZ; z++) {
    let a = 0
    while (a < MASK_ALT && mask.cells[a * MASK_AZ + z] === 1) a++
    skyline.push(a * MASK_STEP)
    for (let k = a + 1; k < MASK_ALT; k++) if (mask.cells[k * MASK_AZ + z] === 1) overhangs.push(k * MASK_AZ + z)
  }
  return { skyline, overhangs }
}

export interface PointSunReport {
  /** [month 0–11][hour 0–23]: share of that hour, on the 21st, the point is in sun (−1: sun down). */
  table: number[][]
  /** Hours of direct sun on the 21st of each month, and what an open sky would give. */
  monthHours: number[]
  monthPossible: number[]
  /** Average hours of sun per day over the year, and with an open sky. */
  yearHoursPerDay: number
  yearPossiblePerDay: number
  /** Hours on 21 March above `minAltitudeDeg` — EN 17037's sunlight exposure, at this point. */
  en17037Hours: number
}

/**
 * Sun at the point, from the mask. Days every `stepDays` for the year, every
 * `stepMin` within a day; the table uses the 21st of each month.
 */
export function pointSunReport(
  mask: SkyMask,
  o: { lat: number; lon: number; timeZone: string; year: number; stepMin?: number; stepDays?: number; minAltitudeDeg?: number },
): PointSunReport {
  const step = o.stepMin ?? 5
  const sub = step / 60
  const dayStart = (month: number, day: number): number => {
    const noon = wallTimeToUTC(o.year, month, day, 12, 0, o.timeZone).getTime()
    return Date.UTC(o.year, month - 1, day) - zoneOffsetMinutes(new Date(noon), o.timeZone) * 60_000
  }
  const walk = (month: number, day: number, cb: (minute: number, alt: number, sunny: boolean) => void): void => {
    const start = dayStart(month, day)
    for (let m = step / 2; m < 1440; m += step) {
      const p = solarPosition(start + m * 60_000, o.lat, o.lon)
      cb(m, p.altitudeDeg, p.altitudeDeg > 0 && !isBlocked(mask, p.azimuthDeg, p.altitudeDeg))
    }
  }

  const table: number[][] = []
  const monthHours: number[] = []
  const monthPossible: number[] = []
  for (let mo = 1; mo <= 12; mo++) {
    const sun = new Array(24).fill(0)
    const up = new Array(24).fill(0)
    let h = 0, ph = 0
    walk(mo, 21, (m, alt, sunny) => {
      const hr = Math.floor(m / 60)
      if (alt > 0) { up[hr] += sub; ph += sub }
      if (sunny) { sun[hr] += sub; h += sub }
    })
    table.push(sun.map((s, i) => (up[i] > 0 ? s / up[i] : -1)))
    monthHours.push(h)
    monthPossible.push(ph)
  }

  const stepDays = o.stepDays ?? 7
  let yh = 0, yp = 0, days = 0
  for (let d = 0; d < 365; d += stepDays) {
    const date = new Date(Date.UTC(o.year, 0, 1 + d))
    walk(date.getUTCMonth() + 1, date.getUTCDate(), (_m, alt, sunny) => {
      if (alt > 0) yp += sub
      if (sunny) yh += sub
    })
    days++
  }

  let en = 0
  walk(3, 21, (_m, alt, sunny) => { if (sunny && alt >= (o.minAltitudeDeg ?? 10)) en += sub })

  return {
    table, monthHours, monthPossible,
    yearHoursPerDay: days > 0 ? yh / days : 0,
    yearPossiblePerDay: days > 0 ? yp / days : 0,
    en17037Hours: en,
  }
}
