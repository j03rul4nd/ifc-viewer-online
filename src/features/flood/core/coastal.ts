// ─── coastal water level ──────────────────────────────────────────────────────
// The sea is not one level. Where a site meets it, the water that matters for a
// flood is the STILL-WATER LEVEL of the moment — mean sea level, plus the tide,
// plus the storm surge a low and a wind push ashore, plus the wave set-up the
// breaking waves pile against the beach — and above that the RUN-UP, how far
// up the shore the waves themselves reach. A rainstorm on a high spring tide
// with a surge (the Mediterranean "DANA" on a sea already up) is a different
// flood from the same rain at low water: the drains and the river mouths have
// nowhere to empty into.
//
// What this module knows is honest about its scale: TYPICAL values per kind of
// coast, from tide tables and surge statistics, not a forecast and not a
// return period for one place. The Mediterranean barely has a tide (~0.3 m) but
// takes surges of half a metre and storm waves of 4 m; the Bay of Biscay has
// 4 m of tide; the Channel coast of Brittany 7 m; the North Sea surges of
// 2–3 m; the Yangtze estuary at Shanghai ~3 m of spring tide and typhoon surges
// of ~2 m. The user takes it from there.
//
// Pure: plain arrays, no three, no DOM.

import type { FloodGrid } from './grid'

export type CoastKind =
  | 'mediterranean' | 'adriatic' | 'atlantic' | 'macrotidal' | 'north-sea'
  | 'baltic' | 'black-sea' | 'estuary-east-asia' | 'ocean'

export interface CoastProfile {
  kind: CoastKind
  /** Mean spring tidal range, metres (high to low water). */
  springRangeM: number
  /** A severe storm surge for this coast, metres above the predicted tide. */
  surgeM: number
  /** Significant wave height of a severe storm offshore, metres. */
  stormHsM: number
  /** Typical beach slope (tan β) for run-up. */
  beachSlope: number
  /** The tide gauge whose range this is, when a known port is near (PORTS). */
  port?: string
}

const PROFILES: Record<CoastKind, Omit<CoastProfile, 'kind'>> = {
  mediterranean: { springRangeM: 0.3, surgeM: 0.6, stormHsM: 4, beachSlope: 0.05 },
  adriatic: { springRangeM: 1.0, surgeM: 1.4, stormHsM: 3.5, beachSlope: 0.03 },
  atlantic: { springRangeM: 3.8, surgeM: 0.8, stormHsM: 8, beachSlope: 0.03 },
  macrotidal: { springRangeM: 7.5, surgeM: 1.0, stormHsM: 6, beachSlope: 0.02 },
  'north-sea': { springRangeM: 3.0, surgeM: 2.5, stormHsM: 6, beachSlope: 0.02 },
  baltic: { springRangeM: 0.1, surgeM: 1.5, stormHsM: 3, beachSlope: 0.04 },
  'black-sea': { springRangeM: 0.1, surgeM: 0.5, stormHsM: 3.5, beachSlope: 0.05 },
  'estuary-east-asia': { springRangeM: 3.2, surgeM: 2.0, stormHsM: 4, beachSlope: 0.02 },
  ocean: { springRangeM: 2.0, surgeM: 1.0, stormHsM: 6, beachSlope: 0.04 },
}

type Box = [south: number, west: number, north: number, east: number]
/** First match wins: the specific seas before the oceans around them. */
const REGIONS: Array<[CoastKind, Box[]]> = [
  ['adriatic', [[40.0, 12.0, 45.9, 19.9]]],
  ['black-sea', [[40.5, 27.3, 47.3, 41.9]]],
  ['baltic', [[53.8, 10.0, 66.0, 30.5]]],
  // Two boxes, so Spain's Cantabrian coast (Bilbao, 43.3° N) stays Atlantic.
  ['mediterranean', [[30.0, -5.6, 42.2, 36.5], [42.2, 2.5, 46.5, 36.5]]],
  ['macrotidal', [[47.5, -5.5, 50.0, -1.0], [50.5, -5.5, 51.8, -2.5], [44.5, -68.0, 46.0, -63.5]]],
  ['north-sea', [[50.8, -2.0, 61.0, 10.5]]],
  ['estuary-east-asia', [[29.5, 119.5, 33.0, 123.5], [21.5, 113.0, 23.0, 114.5]]],
  ['atlantic', [[35.5, -12.0, 50.0, -1.0]]],
]

/**
 * Mean spring tidal range at tide gauges, metres, from the national tide
 * tables (SHOM, Puertos del Estado, UKHO, BSH, NOAA, CHS, JMA, the Hong Kong
 * Observatory…), rounded. A region's single figure is badly wrong inside it:
 * the Channel runs from 5 m at Cherbourg to 11 m at Saint-Malo, the Bristol
 * Channel to 12 m. Within PORT_RADIUS_KM of one of these, its range is used.
 */
const PORTS: Array<[name: string, lat: number, lon: number, rangeM: number]> = [
  ['Saint-Malo', 48.64, -2.03, 11.0], ['Granville', 48.83, -1.6, 11.4], ['Brest', 48.38, -4.49, 6.1],
  ['Cherbourg', 49.65, -1.62, 5.3], ['Le Havre', 49.48, 0.11, 6.8], ['Calais', 50.97, 1.85, 6.0],
  ['Bilbao', 43.35, -3.04, 3.9], ['Santander', 43.46, -3.79, 4.0], ['A Coruña', 43.36, -8.39, 3.6],
  ['Vigo', 42.24, -8.72, 3.3], ['Lisboa', 38.69, -9.14, 3.4], ['Cádiz', 36.53, -6.29, 3.0],
  ['Huelva', 37.13, -6.83, 3.0], ['Gibraltar', 36.14, -5.35, 0.9],
  ['Barcelona', 41.35, 2.17, 0.25], ['València', 39.45, -0.32, 0.25], ['Marseille', 43.3, 5.35, 0.25],
  ['Genova', 44.4, 8.93, 0.3], ['Venezia', 45.42, 12.43, 1.0], ['Trieste', 45.65, 13.76, 1.0],
  ['Hamburg', 53.54, 9.97, 3.7], ['Hoek van Holland', 51.98, 4.12, 2.0], ['IJmuiden', 52.46, 4.58, 1.9],
  ['London Bridge', 51.51, -0.09, 6.6], ['Liverpool', 53.4, -3.0, 8.4], ['Avonmouth', 51.51, -2.71, 12.3],
  ['Dublin', 53.35, -6.21, 3.7], ['New York', 40.7, -74.01, 1.6], ['Boston', 42.35, -71.05, 3.2],
  ['Halifax', 44.66, -63.57, 1.8], ['Saint John', 45.27, -66.06, 8.4], ['Shanghai Wusong', 31.39, 121.5, 3.4],
  ['Hong Kong', 22.3, 114.17, 2.0], ['Tokyo', 35.65, 139.77, 1.6], ['Singapore', 1.26, 103.82, 2.6],
  ['Sydney', -33.85, 151.23, 1.6],
]
export const PORT_RADIUS_KM = 60

/** The kind of coast at a place, by region (open ocean where none matches), with a near port's tide range. */
export function coastProfileAt(lat: number, lon: number): CoastProfile {
  let base: CoastProfile = { kind: 'ocean', ...PROFILES.ocean }
  for (const [kind, boxes] of REGIONS) {
    if (boxes.some(([s, w, n, e]) => lat >= s && lat <= n && lon >= w && lon <= e)) {
      base = { kind, ...PROFILES[kind] }
      break
    }
  }
  let best: (typeof PORTS)[number] | null = null
  let bestKm = PORT_RADIUS_KM
  for (const p of PORTS) {
    const k = Math.cos(((lat + p[1]) / 2) * Math.PI / 180)
    const km = Math.hypot((lat - p[1]) * 111.132, (lon - p[2]) * 111.32 * k)
    if (km < bestKm) { bestKm = km; best = p }
  }
  return best ? { ...base, springRangeM: best[3], port: best[0] } : base
}

export function coastProfile(kind: CoastKind): CoastProfile {
  return { kind, ...PROFILES[kind] }
}

export type TideStage = 'low' | 'mean' | 'high' | 'spring'
/** 'harbour' = behind breakwaters or in an estuary, 'open' = facing the waves. */
export type Exposure = 'harbour' | 'open'

export interface CoastScenario {
  tide: TideStage
  /** Storm surge on top of the tide, metres (0 = calm). */
  surgeM: number
  /** Offshore significant wave height, metres (0 = calm). */
  waveHsM: number
  exposure: Exposure
  /** Sea-level rise to add, metres (a climate horizon). */
  riseM: number
  /** The spring tidal range to use instead of the coast's, metres (a measured one). */
  rangeM?: number | null
}

export interface CoastLevels {
  /** Tide above mean sea level, metres. */
  tideM: number
  surgeM: number
  /** Wave set-up at the shore, metres. */
  setupM: number
  riseM: number
  /** Still-water level above mean sea level: tide + surge + set-up + rise. */
  stillM: number
  /** Wave run-up (2 % exceedance) above the still level, metres. */
  runupM: number
}

/** The tide range a scenario runs with: its own override, else the coast's. */
export function rangeOf(p: CoastProfile, s: CoastScenario): number {
  return s.rangeM !== undefined && s.rangeM !== null && s.rangeM >= 0 ? s.rangeM : p.springRangeM
}

const TIDE_FRACTION: Record<TideStage, number> = { low: -0.5, mean: 0, high: 0.4, spring: 0.5 }

/**
 * The levels of a scenario on a coast.
 *
 * Set-up is the rule of thumb for breaking waves (~0.2 Hs); run-up is
 * Stockbridge et al. (2006) with a Jonswap-like period T ≈ 3.5 √Hs. Behind a
 * breakwater or inside an estuary both are cut to a fifth: the wave that
 * reaches a harbour quay is not the one offshore.
 */
export function coastLevels(p: CoastProfile, s: CoastScenario): CoastLevels {
  const tideM = TIDE_FRACTION[s.tide] * rangeOf(p, s)
  const shelter = s.exposure === 'harbour' ? 0.2 : 1
  const hs = Math.max(0, s.waveHsM)
  const setupM = 0.2 * hs * shelter
  let runupM = 0
  if (hs > 0) {
    const T = 3.5 * Math.sqrt(hs)
    const L0 = (9.81 * T * T) / (2 * Math.PI)
    const b = p.beachSlope
    const HL = Math.sqrt(hs * L0)
    const setup = 0.35 * b * HL
    const swash = Math.sqrt(HL * HL * (0.563 * b * b + 0.004)) / 2
    runupM = 1.1 * (setup + swash) * shelter
  }
  const surgeM = Math.max(0, s.surgeM)
  const riseM = Math.max(0, s.riseM)
  return { tideM, surgeM, setupM, riseM, stillM: tideM + surgeM + setupM + riseM, runupM }
}

/** Semidiurnal lunar period (M2), the tide most coasts follow: 12 h 25 min. */
export const M2_PERIOD_S = 44_712

export interface TideCurveOptions {
  /** Length of the run, s. */
  durationS: number
  /**
   * When the worst moment falls, s from the start: high water and the top of
   * the surge both peak here. Default the middle of the run. Put it on the
   * rain's peak to ask "what if the storm hits at high tide".
   */
  peakAtS?: number
  /** Spacing of the series, s (default 5 min). */
  stepS?: number
  /** How long the surge lasts around its peak (half-width), s; default 6 h. */
  surgeHalfS?: number
}

/**
 * The sea's level over a run, metres above mean sea level, one value every
 * `stepS`.
 *
 * The tide is a cosine of the M2 period whose high water is the chosen tide
 * stage's level at `peakAtS`; the surge and the wave set-up rise and fall as
 * a bell around the same moment (a storm builds and passes in hours); the
 * sea-level rise is constant. 'low' and 'mean' stages put LOW or mean water at
 * the peak instead, so a run can also ask what the same storm does at low
 * tide. The amplitude is half the spring range — neap tides are smaller,
 * and that is what the stage choice is for.
 */
export function tideCurve(p: CoastProfile, s: CoastScenario, o: TideCurveOptions): number[] {
  const step = Math.max(1, o.stepS ?? 300)
  const peak = o.peakAtS ?? o.durationS / 2
  const half = Math.max(600, o.surgeHalfS ?? 6 * 3600)
  const lv = coastLevels(p, s)
  const amp = rangeOf(p, s) / 2
  // Where in the tidal cycle the peak sits: high water for high/spring, low
  // water for low, mid-tide rising for mean.
  const phase = s.tide === 'low' ? Math.PI : s.tide === 'mean' ? -Math.PI / 2 : 0
  // Spring high water reaches the full amplitude; an ordinary high, 80 %.
  const a = s.tide === 'high' ? amp * 0.8 : amp
  const n = Math.max(2, Math.ceil(o.durationS / step) + 1)
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    const t = k * step
    const tide = a * Math.cos((2 * Math.PI * (t - peak)) / M2_PERIOD_S + phase)
    const bell = Math.exp(-(((t - peak) / half) ** 2))
    out.push(tide + (lv.surgeM + lv.setupM) * bell + lv.riseM)
  }
  return out
}

export interface SeaFill {
  /** Initial depth per cell, metres (the sea standing at the still level). */
  h0: Float32Array
  /** 1 = reached by wave run-up above the still level (not filled: splashed). */
  runup: Uint8Array
  /** Cells under the still level and connected to the sea. */
  seaCells: number
  /** Of those, cells that were land (not mapped as sea): what the sea takes. */
  landTaken: number
  runupCells: number
}

/**
 * The sea at a level, on the grid — CONNECTED, not a bathtub.
 *
 * A bathtub fill drowns every hollow below the level, including a basement
 * car park a kilometre inland behind a sea wall. Here the sea spreads from the
 * cells mapped as sea (OSM's coastline) through open cells below the level,
 * four-connected, and stops at anything higher or blocked — a quay wall, a
 * dyke, a building. The run-up band beyond is spread the same way up to the
 * still level plus the run-up, and kept as a mask: waves wash it, they do not
 * stand on it.
 *
 * `levelAbsM` is absolute (the grid's z + zRef frame).
 */
export function seaFill(
  grid: Pick<FloodGrid, 'nx' | 'ny' | 'z' | 'zRef' | 'blocked'>,
  seaMask: Uint8Array, levelAbsM: number, runupM: number,
): SeaFill {
  const { nx, ny } = grid
  const n = nx * ny
  const h0 = new Float32Array(n)
  const runup = new Uint8Array(n)
  const seen = new Uint8Array(n)
  const level = levelAbsM - grid.zRef
  const stack: number[] = []
  let seaCells = 0, landTaken = 0, runupCells = 0

  for (let c = 0; c < n; c++) {
    if (seaMask[c] && !grid.blocked[c]) { seen[c] = 1; stack.push(c) }
  }
  const front: number[] = []
  while (stack.length > 0) {
    const c = stack.pop()!
    const z = grid.z[c]
    if (z < level) {
      h0[c] = level - z
      seaCells++
      if (!seaMask[c]) landTaken++
    } else if (!seaMask[c]) {
      // Above the level: the shore. A start for the run-up, not for the sea.
      front.push(c)
      continue
    }
    const i = c % nx, j = (c - i) / nx
    const push = (k: number) => {
      if (seen[k] || grid.blocked[k]) return
      seen[k] = 1
      stack.push(k)
    }
    if (i > 0) push(c - 1)
    if (i < nx - 1) push(c + 1)
    if (j > 0) push(c - nx)
    if (j < ny - 1) push(c + nx)
  }

  const reach = level + runupM
  while (front.length > 0) {
    const c = front.pop()!
    if (grid.z[c] >= reach) continue
    runup[c] = 1
    runupCells++
    const i = c % nx, j = (c - i) / nx
    const push = (k: number) => {
      if (seen[k] || grid.blocked[k]) return
      seen[k] = 1
      front.push(k)
    }
    if (i > 0) push(c - 1)
    if (i < nx - 1) push(c + 1)
    if (j > 0) push(c - nx)
    if (j < ny - 1) push(c + nx)
  }
  return { h0, runup, seaCells, landTaken, runupCells }
}
