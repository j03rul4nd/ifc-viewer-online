// ─── solarAnalysisStore ───────────────────────────────────────────────────────
// Product state of the solar analysis panel. The heavy results (per-sensor
// arrays, the sensor set) stay in a module-level ref in the panel — Zustand
// holds only what renders and what is small.

import { create } from 'zustand'
import type { ClimateSummary } from '../lib/solar-analysis/climate'
import type { SolarMetric } from '../lib/solar-analysis/results'
import type { SensorKind } from '../lib/solar-analysis/sensors'

/** A period, as the panel offers them. */
export type PeriodChoice =
  | 'winterSolstice' | 'summerSolstice' | 'equinox' | 'enReference'
  | 'hotSeason' | 'coldSeason' | 'year' | 'customDay'

export type RunStatus = 'idle' | 'sensors' | 'running' | 'done' | 'error'

export interface SolarAnalysisState {
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void

  climate: ClimateSummary | null
  climateStatus: 'idle' | 'loading' | 'done' | 'error'
  climateError: string | null
  setClimate: (c: ClimateSummary | null, status: SolarAnalysisState['climateStatus'], error?: string | null) => void

  period: PeriodChoice
  customDay: { month: number; day: number }
  metric: SolarMetric
  kinds: SensorKind[]
  /** Scale the clear sky by the site's measured clearness (needs the climate). */
  useClimate: boolean
  setPeriod: (p: PeriodChoice) => void
  setCustomDay: (d: { month: number; day: number }) => void
  setMetric: (m: SolarMetric) => void
  toggleKind: (k: SensorKind) => void
  setUseClimate: (v: boolean) => void

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

  period: 'winterSolstice',
  customDay: { month: 3, day: 21 },
  metric: 'sunHours',
  kinds: ['ground', 'facade', 'window', 'roof'],
  useClimate: true,
  setPeriod: (p) => set({ period: p }),
  setCustomDay: (d) => set({ customDay: d }),
  setMetric: (m) => set({ metric: m }),
  toggleKind: (k) => set((s) => ({ kinds: s.kinds.includes(k) ? s.kinds.filter((x) => x !== k) : [...s.kinds, k] })),
  setUseClimate: (v) => set({ useClimate: v }),

  status: 'idle',
  progress: 0,
  error: null,
  range: null,
  setRun: (patch) => set(patch),
  resultVersion: 0,
  bumpResult: () => set((s) => ({ resultVersion: s.resultVersion + 1 })),
}))
