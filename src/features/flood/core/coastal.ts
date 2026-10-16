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

/** The kind of coast at a place, by region; open ocean where none matches. */
export function coastProfileAt(lat: number, lon: number): CoastProfile {
  for (const [kind, boxes] of REGIONS) {
    if (boxes.some(([s, w, n, e]) => lat >= s && lat <= n && lon >= w && lon <= e)) {
      return { kind, ...PROFILES[kind] }
    }
  }
  return { kind: 'ocean', ...PROFILES.ocean }
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
  const tideM = TIDE_FRACTION[s.tide] * p.springRangeM
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
