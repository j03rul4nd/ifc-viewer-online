// ─── solarReportStore ─────────────────────────────────────────────────────────
// What the solar report can tell: every part of the analysis publishes its
// latest finished result here as plain, small data (plus a picture of the 3D
// view when it showed one), and the PDF composer reads whatever is present.
// A model change clears it all — a report never mixes two buildings.

import { create } from 'zustand'
import type { SkyMask, PointSunReport } from '../lib/solar-analysis/sky-mask'
import type { ShadingRow, ShadingDesign, Orientation } from '../lib/solar-analysis/shading-devices'
import type { PvResult } from '../lib/solar-analysis/pv'
import type { SolarMetric } from '../lib/solar-analysis/results'
import type { SensorKind } from '../lib/solar-analysis/sensors'
import type { SkyModel } from './solarAnalysisStore'

export interface HeatmapSection {
  /** The 3D view with the heatmap, PNG/JPEG data URL. */
  image: string | null
  metric: SolarMetric
  periodLabel: string
  range: { min: number; max: number }
  averages: Array<{ kind: SensorKind; value: number }>
  least: Array<{ label: string; value: number }>
  most: Array<{ label: string; value: number }>
  instants: number
  rawInstants: number
  sensors: number
  sky: SkyModel
  albedo: number
}

export interface EnSection {
  minAltitudeDeg: number
  windows: number
  byLevel: Record<'none' | 'minimum' | 'medium' | 'high', number>
  failing: Array<{ label: string; hours: number; orientation: string }>
}

export interface SeasonsSection {
  summerRisk: Array<{ label: string; daily: number; level: string; orientation: string }>
  rooms: Array<{ orientation: string; winterHours: number; summerDaily: number; advice: string }>
}

export interface ProbeSection {
  mask: SkyMask
  report: PointSunReport
  point: { x: number; y: number; z: number }
  enMinAltitudeDeg: number
}

export interface ShadingSection {
  design: ShadingDesign
  orientations: Orientation[]
  rows: ShadingRow[]
  image: string | null
}

export interface PvSection {
  y: Omit<PvResult, 'usable'>
  months: number[]
  tiltDeg: number
  efficiency: number
  performanceRatio: number
  threshold: number
  coverage: number
  image: string | null
  measuredSky: boolean
}

export interface CompareSection {
  nameA: string
  nameB: string
  periodA: string
  periodB: string
  metric: SolarMetric
  higherIsBetter: boolean
  paired: number
  range: number
  kinds: Array<{ kind: SensorKind; a: number; b: number; better: number; worse: number }>
  movers: Array<{ label: string; a: number; b: number; delta: number }>
  image: string | null
}

export interface DaylightSection {
  targets: { medianLux: number; minimum: number; medium: number; high: number }
  transmittance: number
  reflectance: number
  sky: string
  summary: { rooms: number; lit: number; by: Record<'none' | 'minimum' | 'medium' | 'high', number>; deep: number }
  rooms: Array<{
    label: string; floorArea: number; windows: number; df: number; theta: number; level: 'none' | 'minimum' | 'medium' | 'high'; tooDeep: boolean
    /** Point by point, when the map was run. */
    grid?: { level: 'none' | 'minimum' | 'medium' | 'high'; share300: number; share100: number; median: number; onReflections: boolean }
  }>
  gridImage?: string | null
  gridSpacing?: number
  gridPoints?: number
}

interface State {
  daylight: DaylightSection | null
  compare: CompareSection | null
  heatmap: HeatmapSection | null
  en: EnSection | null
  seasons: SeasonsSection | null
  probe: ProbeSection | null
  shading: ShadingSection | null
  pv: PvSection | null
  set: (patch: Partial<Omit<State, 'set' | 'clear'>>) => void
  clear: () => void
}

export const useSolarReportStore = create<State>((set) => ({
  daylight: null, compare: null, heatmap: null, en: null, seasons: null, probe: null, shading: null, pv: null,
  set: (patch) => set(patch),
  clear: () => set({ daylight: null, compare: null, heatmap: null, en: null, seasons: null, probe: null, shading: null, pv: null }),
}))
