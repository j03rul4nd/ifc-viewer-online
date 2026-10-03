// ─── irradiance ───────────────────────────────────────────────────────────────
// PURE: how much solar power reaches a surface, from three sources in order of
// trust — what the site MEASURED (ERA5 hourly direct and diffuse, climate.ts),
// a clear sky split by the month's measured clearness, or a clear sky.
//
//   • Clear sky: Ineichen & Perez (2002) with a Linke turbidity (default 3, a
//     typical mid-latitude air) and the site's elevation — the model pvlib and
//     PVGIS use. It replaced Meinel + Haurwitz, which ignored both.
//   • Air mass: Kasten & Young (1989), corrected for pressure.
//   • All-sky split: global × the month's clearness, then Erbs et al. (1982)
//     to divide it into direct and diffuse — a cloudy sky takes far more beam
//     than diffuse, so scaling both by the same factor (as before) overstated
//     the sunny façades and understated the shaded ones.
//   • On a surface: Hay & Davies (1980). The diffuse sky is part CIRCUMSOLAR —
//     it comes from around the sun and is blocked with the sun — and part
//     isotropic, weighted by how much sky the point sees. Plus the light the
//     ground reflects (albedo), which a façade receives and a roof does not.

export interface Irradiance {
  /** Direct normal, W/m². */
  dni: number
  /** Diffuse horizontal, W/m². */
  dhi: number
  /** Global horizontal, W/m². */
  ghi: number
}

const DEG = Math.PI / 180
/** Solar constant, W/m² (Kopp & Lean 2011). */
export const SOLAR_CONSTANT = 1361

/** Relative optical air mass at an apparent solar altitude (Kasten & Young). */
export function airMass(altitudeDeg: number): number {
  const h = Math.max(0, altitudeDeg)
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364))
}

/** Extraterrestrial normal irradiance on a day of the year (1–366). */
export function extraterrestrial(dayOfYear: number): number {
  return SOLAR_CONSTANT * (1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365))
}

export interface ClearSkyOptions {
  /** Day of the year, for the sun–earth distance. Default 80 (an equinox). */
  dayOfYear?: number
  /** Site elevation above sea level, m. Default 0. */
  elevationM?: number
  /** Linke turbidity (2 very clean · 3 typical · 4–6 hazy, urban). Default 3. */
  linke?: number
}

/** Ineichen–Perez clear sky. Zero with the sun below the horizon. */
export function clearSkyIrradiance(altitudeDeg: number, o: ClearSkyOptions = {}): Irradiance {
  if (altitudeDeg <= 0) return { dni: 0, dhi: 0, ghi: 0 }
  const h = Math.max(-300, o.elevationM ?? 0)
  const tl = Math.min(8, Math.max(1.5, o.linke ?? 3))
  const i0 = extraterrestrial(o.dayOfYear ?? 80)
  const cosZ = Math.sin(altitudeDeg * DEG)
  const pressureRatio = Math.exp(-h / 8434.5)
  const am = airMass(altitudeDeg) * pressureRatio
  const fh1 = Math.exp(-h / 8000)
  const fh2 = Math.exp(-h / 1250)
  const cg1 = 5.09e-5 * h + 0.868
  const cg2 = 3.92e-5 * h + 0.0387
  const ghi = Math.max(0, cg1 * i0 * cosZ * Math.exp(-cg2 * am * (fh1 + fh2 * (tl - 1))))
  const b = 0.664 + 0.163 / fh1
  let dni = b * i0 * Math.exp(-0.09 * am * (tl - 1))
  // The beam can never carry more than the global allows.
  const cap = ghi * (1 - (0.1 - 0.2 * Math.exp(-tl)) / (0.1 + 0.882 / fh1)) / Math.max(cosZ, 1e-3)
  dni = Math.max(0, Math.min(dni, cap))
  return { dni, dhi: Math.max(0, ghi - dni * cosZ), ghi }
}

/** Erbs et al. diffuse fraction of the global, from the clearness index kt. */
export function erbsDiffuseFraction(kt: number): number {
  const k = Math.max(0, kt)
  if (k <= 0.22) return 1 - 0.09 * k
  if (k <= 0.8) return 0.9511 - 0.1604 * k + 4.388 * k ** 2 - 16.638 * k ** 3 + 12.336 * k ** 4
  return 0.165
}

/**
 * A global horizontal irradiance split into direct and diffuse (Erbs).
 * `i0` is the extraterrestrial normal irradiance of the day.
 */
export function splitGlobal(ghi: number, altitudeDeg: number, i0: number): Irradiance {
  if (altitudeDeg <= 0 || ghi <= 0) return { dni: 0, dhi: Math.max(0, ghi), ghi: Math.max(0, ghi) }
  const s = Math.sin(altitudeDeg * DEG)
  const kt = ghi / (i0 * s)
  const dhi = ghi * erbsDiffuseFraction(kt)
  // A very low sun turns a small beam into a huge normal irradiance: cap it at
  // the extraterrestrial value.
  const dni = Math.min(i0, Math.max(0, (ghi - dhi) / Math.max(s, 0.05)))
  return { dni, dhi: Math.max(0, ghi - dni * s), ghi }
}

/** Clear sky × the month's measured clearness, split by Erbs. */
export function allSkyFromClearness(altitudeDeg: number, clearness: number, o: ClearSkyOptions = {}): Irradiance {
  const clear = clearSkyIrradiance(altitudeDeg, o)
  return splitGlobal(clear.ghi * Math.max(0, Math.min(1.2, clearness)), altitudeDeg, extraterrestrial(o.dayOfYear ?? 80))
}

export interface SurfaceTerms {
  /**
   * Normal-incidence irradiance that travels WITH the sun — the beam plus the
   * circumsolar diffuse. The GPU multiplies it by cos θ and by whether the
   * point sees the sun.
   */
  beamNormal: number
  /** Isotropic sky diffuse on a horizontal plane with the whole dome visible. */
  diffuseIso: number
}

/**
 * Hay–Davies split of the diffuse. The anisotropy index Ai = DNI / I0 is the
 * share of the diffuse that comes from the sun's neighbourhood; on a tilted
 * surface it arrives like beam (cos θ / sin h). Folding it into a "beam
 * normal" lets the shadow test block it with the sun.
 */
export function hayDavies(irr: Irradiance, altitudeDeg: number, i0: number): SurfaceTerms {
  if (altitudeDeg <= 0) return { beamNormal: 0, diffuseIso: irr.dhi }
  const ai = Math.min(1, Math.max(0, irr.dni / i0))
  const s = Math.max(Math.sin(altitudeDeg * DEG), 0.05)
  return { beamNormal: irr.dni + (irr.dhi * ai) / s, diffuseIso: irr.dhi * (1 - ai) }
}

/** Diffuse irradiance on a surface whose normal has vertical component `ny` (isotropic, unobstructed). */
export function diffuseOnSurface(dhi: number, ny: number): number {
  return dhi * (1 + Math.max(-1, Math.min(1, ny))) / 2
}

/** Light reflected by the ground onto a surface: albedo · GHI · (1 − cos β) / 2. */
export function reflectedOnSurface(ghi: number, ny: number, albedo: number): number {
  return ghi * albedo * (1 - Math.max(-1, Math.min(1, ny))) / 2
}

/** Typical albedos, for the panel's picker. */
export const ALBEDOS = {
  urban: 0.18,
  grass: 0.23,
  concrete: 0.3,
  lightPaving: 0.4,
  snow: 0.75,
} as const

/**
 * Daily clear-sky global horizontal irradiation for a month at a latitude,
 * kWh/m² — the yardstick a climate's measured radiation is divided by to get
 * its clearness. Integrated every 10 minutes.
 */
export function clearSkyDailyGhi(altitudeAt: (minuteOfDay: number) => number, o: ClearSkyOptions = {}): number {
  let wh = 0
  for (let m = 5; m < 24 * 60; m += 10) wh += clearSkyIrradiance(altitudeAt(m), o).ghi * (10 / 60)
  return wh / 1000
}
