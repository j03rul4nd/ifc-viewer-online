// ─── irradiance ───────────────────────────────────────────────────────────────
// PURE: how much solar power reaches a surface under a clear sky, and what a
// site's real climate does to it.
//
// The model is deliberately simple and says so in the UI: it ranks façades and
// windows against each other and gives a credible order of magnitude, it is not
// an energy simulation.
//   • Air mass: Kasten & Young (1989).
//   • Direct normal (DNI): Meinel (1976), 1353 · 0.7^(AM^0.678) W/m².
//   • Global horizontal (GHI): Haurwitz (1945), 1098 · sin h · e^(−0.057 / sin h).
//   • Diffuse horizontal: what is left, GHI − DNI · sin h, never negative.
// On a surface: beam DNI · cos θ (only when the point sees the sun — the GPU
// decides that) plus isotropic diffuse DHI · (1 + cos β) / 2, β the tilt. The
// diffuse term ignores obstructions; it is a sky estimate, not a sky view.

export interface Irradiance {
  /** Direct normal, W/m². */
  dni: number
  /** Diffuse horizontal, W/m². */
  dhi: number
  /** Global horizontal, W/m². */
  ghi: number
}

const DEG = Math.PI / 180

/** Relative optical air mass at a solar altitude (Kasten & Young). */
export function airMass(altitudeDeg: number): number {
  const h = Math.max(0, altitudeDeg)
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364))
}

export function clearSkyIrradiance(altitudeDeg: number): Irradiance {
  if (altitudeDeg <= 0) return { dni: 0, dhi: 0, ghi: 0 }
  const s = Math.sin(altitudeDeg * DEG)
  const am = airMass(altitudeDeg)
  const dni = 1353 * Math.pow(0.7, Math.pow(am, 0.678))
  const ghi = 1098 * s * Math.exp(-0.057 / Math.max(s, 1e-3))
  const dhi = Math.max(0, ghi - dni * s)
  return { dni, dhi, ghi }
}

/** Diffuse irradiance on a surface whose normal has vertical component `ny` (isotropic sky). */
export function diffuseOnSurface(dhi: number, ny: number): number {
  return dhi * (1 + Math.max(-1, Math.min(1, ny))) / 2
}

/**
 * Daily clear-sky global horizontal irradiation for a month at a latitude,
 * kWh/m² — the yardstick a climate's measured radiation is divided by to get
 * its clearness. Integrated at the 15th of the month, every 10 minutes.
 */
export function clearSkyDailyGhi(altitudeAt: (minuteOfDay: number) => number): number {
  let wh = 0
  for (let m = 5; m < 24 * 60; m += 10) wh += clearSkyIrradiance(altitudeAt(m)).ghi * (10 / 60)
  return wh / 1000
}
