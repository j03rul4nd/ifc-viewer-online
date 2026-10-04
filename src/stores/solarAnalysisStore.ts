// ─── solarAnalysisStore ───────────────────────────────────────────────────────
// Product state of the solar analysis panel. The heavy results (per-sensor
// arrays, the sensor set) stay in a module-level ref in the panel — Zustand
// holds only what renders and what is small.

import { create } from 'zustand'
import type { ClimateSummary, TypicalSky } from '../lib/solar-analysis/climate'
import type { SolarMetric } from '../lib/solar-analysis/results'
import type { SensorKind } from '../lib/solar-analysis/sensors'

/** A period, as the panel offers them. */
export type PeriodChoice =
  | 'winterSolstice' | 'summerSolstice' | 'equinox' | 'enReference'
  | 'hotSeason' | 'coldSeason' | 'year' | 'customDay'

/**
 * Where the sky's energy comes from, most trusted first: the site's measured
 * hourly direct and diffuse radiation (ERA5), a clear sky split by each
 * month's measured clearness, or a clear sky.
 */
export type SkyModel = 'measured' | 'clearness' | 'clear'
/** Fast for a first look, fine for a deliverable: time step and sky patch size. */
export type Precision = 'fast' | 'standard' | 'fine'

export type RunStatus = 'idle' | 'sensors' | 'running' | 'done' | 'error'

export interface SolarAnalysisState {
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void

  climate: ClimateSummary | null
  climateStatus: 'idle' | 'loading' | 'done' | 'error'
  climateError: string | null
  setClimate: (c: ClimateSummary | null, status: SolarAnalysisState['climateStatus'], error?: string | null) => void
  /** The typical hourly sky (12 × 24), loaded with the climate. */
  sky: TypicalSky | null
  setSky: (sky: TypicalSky | null) => void

  period: PeriodChoice
  customDay: { month: number; day: number }
  metric: SolarMetric
  kinds: SensorKind[]
  skyModel: SkyModel
  /** Ground reflectance. */
  albedo: number
  precision: Precision
  setPeriod: (p: PeriodChoice) => void
  setCustomDay: (d: { month: number; day: number }) => void
  setMetric: (m: SolarMetric) => void
  toggleKind: (k: SensorKind) => void
  setSkyModel: (v: SkyModel) => void
  setAlbedo: (v: number) => void
  setPrecision: (v: Precision) => void

  status: RunStatus
  progress: number
  error: string | null
  /** Legend range of what is shown. */
  range: { min: number; max: number } | null
  setRun: (patch: Partial<Pick<SolarAnalysisState, 'status' | 'progress' | 'error' | 'range'>>) => void
  /** Bumped when a new result is in, so views re-read the module ref. */
  resultVersion: number
  bumpResult: () => void
}

export const useSolarAnalysisStore = create<SolarAnalysisState>((set) => ({
  panelOpen: false,
  setPanelOpen: (v) => set({ panelOpen: v }),

  climate: null,
  climateStatus: 'idle',
  climateError: null,
  setClimate: (c, status, error = null) => set({ climate: c, climateStatus: status, climateError: error }),
  sky: null,
  setSky: (sky) => set({ sky }),

  period: 'winterSolstice',
  customDay: { month: 3, day: 21 },
  metric: 'sunHours',
  kinds: ['ground', 'facade', 'window', 'roof'],
  skyModel: 'measured',
  albedo: 0.2,
  precision: 'standard',
  setPeriod: (p) => set({ period: p }),
  setCustomDay: (d) => set({ customDay: d }),
  setMetric: (m) => set({ metric: m }),
  toggleKind: (k) => set((s) => ({ kinds: s.kinds.includes(k) ? s.kinds.filter((x) => x !== k) : [...s.kinds, k] })),
  setSkyModel: (v) => set({ skyModel: v }),
  setAlbedo: (v) => set({ albedo: v }),
  setPrecision: (v) => set({ precision: v }),

  status: 'idle',
  progress: 0,
  error: null,
  range: null,
  setRun: (patch) => set(patch),
  resultVersion: 0,
  bumpResult: () => set((s) => ({ resultVersion: s.resultVersion + 1 })),
}))
