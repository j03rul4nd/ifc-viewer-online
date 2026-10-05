// ─── daylight-annual ──────────────────────────────────────────────────────────
// PURE: climate-based daylight — every typical hour of the year, not one
// overcast sky. The daylight-coefficient method (Tregenza):
//
//   • The sky is cut into the 145 Tregenza patches. For each point the GPU
//     measures, once, how much of every patch it sees through the glass on a
//     horizontal plane: c[p] = Σ visible · cos θ · dω over the patch (sr).
//   • For each typical hour the sky is a luminance per patch: the diffuse
//     (measured horizontal diffuse × 120 lm/W) spread with the CIE overcast
//     shape, and the sun put into the patch it stands in (direct normal ×
//     100 lm/W). Illuminance at a point = T · Σ L[p] · c[p] (+ the sun's
//     share of its patch), plus an internally reflected share OF THE DIFFUSE
//     (BRE's split-flux is a fraction of the sky's illuminance; reflected
//     sunlight is left out — conservative, said in the UI).
//   • The sun is a point: whether a point sees it, hour by hour, comes from a
//     second GPU pass over the hours' actual sun positions (as Daysim does),
//     not from the share of a 12° patch — that smeared the sun over every
//     point that saw a sliver of its patch and inflated the direct-sun hours.
//   • Metrics, per point and per room:
//       EN 17037 (method 2, hourly): the illuminance target over ≥ 50 % of
//         the plane for ≥ 50 % of the daylight hours; the minimum over ≥ 95 %.
//       sDA300/50 % (IES LM-83, LEED v4): share of the plane at ≥ 300 lx for
//         ≥ 50 % of the occupied hours (08–18 h). Blinds are not modelled.
//       ASE1000,250 h: share of the plane getting > 1000 lx of DIRECT sun for
//         more than 250 occupied hours a year (glare and overheating risk).
//       DA300: per point, the share of daylight hours at ≥ 300 lx — the map.

import { solarPosition } from '../solar/solar-position'
import { zoneOffsetMinutes } from '../solar/sun-math'
import { skyTerms, type SunPathOptions } from './sun-paths'

export interface Patch {
  /** Centre, degrees. */
  az: number
  alt: number
  /** Solid angle, sr. */
  omega: number
  /** Directions sampled inside the patch (az, alt in degrees). */
  samples: Array<{ az: number; alt: number }>
}

/** Tregenza rings: 12° bands, cells per ring (30, 30, 24, 24, 18, 12, 6) and the zenith cap. */
const RINGS = [30, 30, 24, 24, 18, 12, 6]

export function tregenzaPatches(subdiv = 2): Patch[] {
  const D = Math.PI / 180
  const out: Patch[] = []
  RINGS.forEach((n, r) => {
    const a0 = r * 12, a1 = a0 + 12
    const omega = ((2 * Math.PI) / n) * (Math.sin(a1 * D) - Math.sin(a0 * D))
    for (let k = 0; k < n; k++) {
      const z0 = (k * 360) / n, z1 = ((k + 1) * 360) / n
      const samples: Array<{ az: number; alt: number }> = []
      for (let i = 0; i < subdiv; i++) for (let j = 0; j < subdiv; j++) {
        samples.push({ az: z0 + ((i + 0.5) * (z1 - z0)) / subdiv, alt: a0 + ((j + 0.5) * 12) / subdiv })
      }
      out.push({ az: (z0 + z1) / 2, alt: (a0 + a1) / 2, omega, samples })
    }
  })
  // Zenith cap, 84°–90°.
  const capOmega = 2 * Math.PI * (1 - Math.sin(84 * D))
  const cap: Array<{ az: number; alt: number }> = [{ az: 0, alt: 89 }]
  for (let i = 0; i < 4 * subdiv; i++) cap.push({ az: (i * 360) / (4 * subdiv), alt: 86 })
  out.push({ az: 0, alt: 87, omega: capOmega, samples: cap })
  return out
}

/** The patch a direction falls in (altitude > 0). */
export function patchOf(azDeg: number, altDeg: number): number {
  if (altDeg >= 84) return 144
  const r = Math.max(0, Math.min(6, Math.floor(Math.max(0, altDeg) / 12)))
  const n = RINGS[r]
  let base = 0
  for (let i = 0; i < r; i++) base += RINGS[i]
  const a = ((azDeg % 360) + 360) % 360
  return base + Math.min(n - 1, Math.floor((a / 360) * n))
}

/** One typical hour: the sun, the sky and how many hours of the year it stands for. */
export interface SkyHour {
  sunAz: number
  sunAlt: number
  /** W/m². */
  dni: number
  dhi: number
  /** Hours of the year this stands for. */
  weight: number
  /**
   * Chance the sun is out in this hour (measured sunshine share). A typical
   * hour is a mean: its direct radiation all arrives in the sunny share, so
   * the hour is split — sun out (probability p, beam DNI / p) or covered —
   * instead of a weak sun every day, which counted cloudy hours as sunny.
   * Default 1 (clear sky).
   */
  sunProb?: number
  /** Inside the occupied window (08–18 h local). */
  occupied: boolean
}

export const DIFFUSE_EFFICACY = 120
export const BEAM_EFFICACY = 100

/** Diffuse luminance per patch (cd/m²) with the CIE overcast shape, scaled to a horizontal diffuse illuminance (lx). */
export function diffuseLuminance(patches: Patch[], horizontalLux: number): Float32Array {
  const D = Math.PI / 180
  let norm = 0
  const shape = patches.map((p) => (1 + 2 * Math.sin(p.alt * D)) / 3)
  patches.forEach((p, i) => { norm += shape[i] * p.omega * Math.sin(p.alt * D) })
  const out = new Float32Array(patches.length)
  patches.forEach((_, i) => { out[i] = norm > 0 ? (horizontalLux * shape[i]) / norm : 0 })
  return out
}

export interface AnnualOptions {
  transmittance: number
  /**
   * Sun visibility per point and hour, 0–1, row-major points × `sunHours`
   * (from the sun-position pass). `sunIndex[h]` is hour h's column, −1 at night.
   * Without it the sun's patch share stands in.
   */
  sunVis?: Float32Array
  sunIndex?: Int32Array
  sunHours?: number
  /** Internally reflected share of the outdoor global horizontal illuminance, per room, % (BRE split-flux IRC). */
  irc: Float32Array
  /** Room index per point. */
  roomOf: Int32Array
  /** Unobstructed horizontal cos-weighted solid angle of each patch, for the sun's visibility. */
  patches: Patch[]
}

export interface AnnualPoint {
  /** Share of daylight hours ≥ 100 / 300 / 500 / 750 lx. */
  da100: Float32Array
  da300: Float32Array
  da500: Float32Array
  da750: Float32Array
  /** Share of occupied hours ≥ 300 lx. */
  occ300: Float32Array
  /** Occupied hours with > 1000 lx of direct sun. */
  sunHours1000: Float32Array
}

/**
 * Hour by hour. `coef` is points × patches, row-major: c[i·P + p] = Σ vis·cos·dω.
 */
export function annualIlluminance(coef: Float32Array, points: number, hours: SkyHour[], o: AnnualOptions): AnnualPoint {
  const P = o.patches.length
  const D = Math.PI / 180
  const out: AnnualPoint = {
    da100: new Float32Array(points), da300: new Float32Array(points), da500: new Float32Array(points), da750: new Float32Array(points),
    occ300: new Float32Array(points), sunHours1000: new Float32Array(points),
  }
  // The cos-weighted solid angle an open horizontal plane gets from each patch.
  const open = o.patches.map((p) => p.omega * Math.sin(p.alt * D))
  let dayH = 0, occH = 0
  const E = new Float32Array(points)
  for (let hi = 0; hi < hours.length; hi++) {
    const h = hours[hi]
    if (h.sunAlt <= 0 && h.dhi <= 0) continue
    dayH += h.weight
    if (h.occupied) occH += h.weight
    const Edh = h.dhi * DIFFUSE_EFFICACY
    const p = Math.max(0, Math.min(1, h.sunProb ?? 1))
    // Beam of the sunny share: the hour's mean direct, concentrated where the sun is out.
    const Ebh = h.sunAlt > 0 && p > 0.02 ? Math.min(1361, h.dni / p) * BEAM_EFFICACY * Math.sin(h.sunAlt * D) : 0
    const L = diffuseLuminance(o.patches, Edh)
    const sp = h.sunAlt > 0 ? patchOf(h.sunAz, h.sunAlt) : -1
    for (let i = 0; i < points; i++) {
      let e = 0
      const row = i * P
      for (let p = 0; p < P; p++) e += L[p] * coef[row + p]
      e *= o.transmittance
      // The sun: seen or not, from the sun pass (or its patch's share without one).
      let vis = 0
      const col = o.sunIndex ? o.sunIndex[hi] : -1
      if (o.sunVis && o.sunHours && col >= 0) vis = Math.min(1, Math.max(0, o.sunVis[i * o.sunHours + col]))
      else if (sp >= 0 && open[sp] > 0) vis = Math.min(1, coef[row + sp] / open[sp])
      const sun = o.transmittance * Ebh * vis
      const covered = e + (o.irc[o.roomOf[i]] / 100) * Edh
      const sunny = covered + sun
      E[i] = covered + p * sun
      // Two states of the hour: sun out (p) or covered (1 − p).
      const ws = h.weight * (Ebh > 0 ? p : 0), wc = h.weight - ws
      const over = (x: number) => (sunny >= x ? ws : 0) + (covered >= x ? wc : 0)
      out.da100[i] += over(100)
      out.da300[i] += over(300)
      out.da500[i] += over(500)
      out.da750[i] += over(750)
      if (h.occupied) {
        out.occ300[i] += over(300)
        if (sun > 1000) out.sunHours1000[i] += ws
      }
    }
  }
  for (let i = 0; i < points; i++) {
    if (dayH > 0) { out.da100[i] /= dayH; out.da300[i] /= dayH; out.da500[i] /= dayH; out.da750[i] /= dayH }
    if (occH > 0) out.occ300[i] /= occH
  }
  return out
}

export type AnnualLevel = 'none' | 'minimum' | 'medium' | 'high'

export interface RoomAnnual {
  /** EN 17037 by hourly illuminance. */
  level: AnnualLevel
  /** Share of the plane meeting 300 lx / 100 lx for half the daylight hours. */
  share300: number
  share100: number
  /** sDA300/50 % and ASE1000,250 h, shares of the plane. */
  sDA: number
  ASE: number
  /** Mean DA300 over the plane. */
  meanDA: number
}

export function roomAnnual(idx: number[], a: AnnualPoint): RoomAnnual {
  const n = Math.max(1, idx.length)
  const share = (arr: Float32Array) => idx.filter((i) => arr[i] >= 0.5).length / n
  const s100 = share(a.da100), s300 = share(a.da300), s500 = share(a.da500), s750 = share(a.da750)
  const level: AnnualLevel = s750 >= 0.5 && s500 >= 0.95 ? 'high' : s500 >= 0.5 && s300 >= 0.95 ? 'medium' : s300 >= 0.5 && s100 >= 0.95 ? 'minimum' : 'none'
  return {
    level, share300: s300, share100: s100,
    sDA: share(a.occ300),
    ASE: idx.filter((i) => a.sunHours1000[i] > 250).length / n,
    meanDA: idx.reduce((acc, i) => acc + a.da300[i], 0) / n,
  }
}

/**
 * The typical year as 12 × 24 hours: the 15th of each month at every UTC
 * half-hour, each standing for that hour on every day of the month. Sun from
 * the solar position, sky (direct normal, diffuse) from the analysis' own sky
 * — measured ERA5 when loaded. Occupied: 08–18 h site time.
 */
export function typicalSkyHours(o: SunPathOptions): SkyHour[] {
  const out: SkyHour[] = []
  for (let m = 1; m <= 12; m++) {
    const days = new Date(Date.UTC(o.year, m, 0)).getUTCDate()
    const doy = Math.round((Date.UTC(o.year, m - 1, 15) - Date.UTC(o.year, 0, 1)) / 86_400_000) + 1
    for (let h = 0; h < 24; h++) {
      const utc = Date.UTC(o.year, m - 1, 15, h, 30)
      const pos = solarPosition(utc, o.lat, o.lon)
      const local = ((h + 0.5 + zoneOffsetMinutes(new Date(utc), o.timeZone) / 60) % 24 + 24) % 24
      const sky = pos.altitudeDeg > 0 ? skyTerms(utc, pos.altitudeDeg, doy, m, o).irradiance : { dni: 0, dhi: 0, ghi: 0 }
      const terms = pos.altitudeDeg > 0 ? skyTerms(utc, pos.altitudeDeg, doy, m, o) : null
      out.push({ sunAz: pos.azimuthDeg, sunAlt: pos.altitudeDeg, dni: sky.dni, dhi: sky.dhi, weight: days, occupied: local >= 8 && local < 18, sunProb: terms?.sunProb ?? 1 })
    }
  }
  return out
}
