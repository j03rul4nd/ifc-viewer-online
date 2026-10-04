// ─── solar-position ───────────────────────────────────────────────────────────
// PURE: where the sun is, to ~0.01°. The NOAA solar calculator's algorithm
// (Meeus, "Astronomical Algorithms", ch. 25 and the equation of time), with the
// atmospheric refraction scaled by the site's pressure and temperature as in
// NREL's SPA. suncalc (what the study used before) drifts by up to ~0.3° and has
// no refraction: at a low winter sun that is metres of shadow on a long façade.
//
// Reference (NREL SPA, Reda & Andreas 2008, table A4.1): Golden, Colorado,
// 2003-10-17 19:30:30 UTC, 820 mbar, 11 °C → zenith 50.11162°, azimuth
// 194.34024°. This gives both within 0.02° (guarded in the tests).

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

export interface SolarPosition {
  /** Degrees clockwise from true north. */
  azimuthDeg: number
  /** Apparent altitude (with refraction), degrees. */
  altitudeDeg: number
  /** Geometric altitude, no refraction. */
  trueAltitudeDeg: number
  /** Declination, degrees. */
  declinationDeg: number
  /** Equation of time, minutes. */
  equationOfTimeMin: number
  /** Sun–earth distance, AU. */
  distanceAu: number
}

export interface Atmosphere {
  /** Mean surface pressure, hPa (mbar). Default 1010. */
  pressureHpa?: number
  /** Mean temperature, °C. Default 10. */
  temperatureC?: number
}

/** Julian day of a UTC instant. */
export function julianDay(utcMs: number): number {
  return utcMs / 86_400_000 + 2440587.5
}

/**
 * Atmospheric refraction for a TRUE (geometric) altitude, degrees (Bennett /
 * Sæmundsson form used by SPA), scaled by pressure and temperature. Zero below
 * −1° (the sun is gone; refraction tables stop being meaningful).
 */
export function refractionDeg(trueAltitudeDeg: number, a: Atmosphere = {}): number {
  const h = trueAltitudeDeg
  if (h < -1) return 0
  const p = a.pressureHpa ?? 1010
  const t = a.temperatureC ?? 10
  const r = 1.02 / (60 * Math.tan((h + 10.3 / (h + 5.11)) * DEG))
  return r * (p / 1010) * (283 / (273 + t))
}

export function solarPosition(utcMs: number, lat: number, lon: number, atm: Atmosphere = {}): SolarPosition {
  const jd = julianDay(utcMs)
  const T = (jd - 2451545) / 36525

  // Geometric mean longitude and anomaly of the sun, eccentricity of the orbit.
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const Mr = M * DEG
  // Equation of centre → true longitude and anomaly.
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * Mr) * 0.000289
  const trueLon = L0 + C
  const trueAnom = M + C
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(trueAnom * DEG))
  // Apparent longitude (nutation and aberration).
  const omega = 125.04 - 1934.136 * T
  const lambda = trueLon - 0.00569 - 0.00478 * Math.sin(omega * DEG)
  // Obliquity of the ecliptic, corrected.
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG)
  const decl = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG)) * RAD

  // Equation of time (minutes).
  const y = Math.tan((eps / 2) * DEG) ** 2
  const L0r = L0 * DEG
  const eot = 4 * RAD * (
    y * Math.sin(2 * L0r)
    - 2 * e * Math.sin(Mr)
    + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r)
    - 1.25 * e * e * Math.sin(2 * Mr)
  )

  // True solar time → hour angle.
  const minutesUtc = ((utcMs % 86_400_000) + 86_400_000) % 86_400_000 / 60_000
  const tst = (((minutesUtc + eot + 4 * lon) % 1440) + 1440) % 1440
  const ha = tst / 4 - 180

  const latR = lat * DEG
  const decR = decl * DEG
  const haR = ha * DEG
  const cosZ = Math.min(1, Math.max(-1,
    Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR)))
  const zenith = Math.acos(cosZ) * RAD
  const trueAlt = 90 - zenith

  // Azimuth from north, clockwise (atan2 form: stable at the poles and at noon).
  const az = (Math.atan2(
    Math.sin(haR),
    Math.cos(haR) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR),
  ) * RAD + 180 + 360) % 360

  return {
    azimuthDeg: az,
    altitudeDeg: trueAlt + refractionDeg(trueAlt, atm),
    trueAltitudeDeg: trueAlt,
    declinationDeg: decl,
    equationOfTimeMin: eot,
    distanceAu: R,
  }
}

/** Extraterrestrial normal irradiance on a day, W/m² (solar constant 1361, Spencer-free form via the true distance). */
export function extraterrestrialNormal(distanceAu: number): number {
  return 1361 / (distanceAu * distanceAu)
}

/** Standard pressure at an elevation, hPa (barometric formula). */
export function pressureAtElevation(elevationM: number): number {
  return 1013.25 * Math.pow(1 - 2.25577e-5 * Math.max(-400, elevationM), 5.25588)
}
