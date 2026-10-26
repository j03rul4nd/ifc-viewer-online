// ─── slope-hazard store ──────────────────────────────────────────────────────
// Settings and the small, renderable state of the hazard section. The KMZ's
// placemarks are kept here (plain data); frames and layers live in system.ts.

import { create } from 'zustand'
import type { KmlPlacemark } from './io/kml'
import type { LandCover, Moisture, SoilGroup } from './core/scs-cn'
import type { HazardReport } from './system'
import type { CriticalRow } from './exposure/report'
import type { HazardLayerKind } from './view/hazard-layer'

export type HazardStatus = 'idle' | 'running' | 'done' | 'error'

export interface HazardState {
  kmzName: string | null
  placemarks: KmlPlacemark[] | null
  /** Scene points the flood grid must cover (the KMZ); null = the models'. */
  extentPoints: Array<{ x: number; z: number }> | null
  /** The KMZ placed the scene (no model): the map opens on it. */
  anchored: boolean
  soilGroup: SoilGroup
  moisture: Moisture
  fallbackCover: LandCover
  cohesionKPa: number
  frictionDeg: number
  unitWeightKNm3: number
  depthM: number
  travelAngleDeg: number
  failThreshold: number
  runoffThresholdMm: number
  maxRainMm: number
  samples: number
  status: HazardStatus
  progress: { done: number; of: number } | null
  error: string | null
  report: HazardReport | null
  rows: CriticalRow[]
  /** Rain steps of the last run (cumulative mm) and where its storm ends. */
  steps: number[]
  minutes: Array<number | null>
  stormSteps: number
  step: number
  layer: HazardLayerKind
  block: boolean
  labels: boolean
  set(p: Partial<HazardState>): void
}

export const useHazardStore = create<HazardState>()((set) => ({
  kmzName: null,
  placemarks: null,
  extentPoints: null,
  anchored: false,
  soilGroup: 'C',
  moisture: 'II',
  fallbackCover: 'shrub',
  cohesionKPa: 5,
  frictionDeg: 32,
  unitWeightKNm3: 18,
  depthM: 1.5,
  travelAngleDeg: 12,
  failThreshold: 0.5,
  runoffThresholdMm: 60,
  maxRainMm: 250,
  samples: 200,
  status: 'idle',
  progress: null,
  error: null,
  report: null,
  rows: [],
  steps: [],
  minutes: [],
  stormSteps: 0,
  step: 0,
  layer: 'susceptibility',
  block: true,
  labels: true,
  set: (p) => set(p),
}))
