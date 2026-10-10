// ─── flood store ──────────────────────────────────────────────────────────────
// Small, renderable state of the flood panel and timeline: settings, status,
// the last report, the live metrics and the probe. The grid, the solver, the
// snapshots and the DEM file live outside React (system.ts, the worker, a
// module ref in the panel). Imported by the panel rail, so it must stay free
// of anything heavy.

import { create } from 'zustand'
import type { FloodBackend, FloodStats, Infiltration } from './core/solver-api'
import type { Hyetograph } from './core/hyetograph'
import type { RunPerf } from './worker/protocol'
import type { PrepareResult, ProbeResult } from './system'
import type { RoofRunoff } from './raster/rain-routing'
import { stormHyetograph } from './presets'

export type FloodStatus = 'idle' | 'preparing' | 'ready' | 'running' | 'paused' | 'finished' | 'error'
export type PrepareStage = 'geometry' | 'raster' | 'terrain' | 'layers'
export type StormPreset = 'shower' | 'storm' | 'intense' | 'extreme'
export type ManningPreset = 'paved' | 'urban' | 'grass' | 'vegetation'
export type InfiltrationPreset = 'none' | 'compacted' | 'loam' | 'sandy'
export type ViewMode = 'now' | 'max' | 'speed'

export const MANNING: Record<ManningPreset, number> = { paved: 0.016, urban: 0.025, grass: 0.035, vegetation: 0.06 }

/** Textbook Horton parameters by soil (f0, fc in mm/h; k per hour). */
export const INFILTRATION: Record<Exclude<InfiltrationPreset, 'none'>, Infiltration> = {
  compacted: { initialMmH: 25, finalMmH: 3, decayPerHour: 3 },
  loam: { initialMmH: 75, finalMmH: 13, decayPerHour: 4 },
  sandy: { initialMmH: 125, finalMmH: 25, decayPerHour: 2 },
}

/** Replay speeds on offer, simulated seconds per wall second. */
export const REPLAY_SPEEDS = [60, 300, 1200] as const

export interface FloodSettings {
  cellM: number
  marginM: number
  roofRunoff: RoofRunoff
  manning: ManningPreset
  infiltration: InfiltrationPreset
  includeMapBuildings: boolean
  useMapTerrain: boolean
  /** The preset the rain started from; null once edited by hand. */
  storm: StormPreset | null
  hyetograph: Hyetograph
  /** Simulated time after the rain stops, min. */
  drainMin: number
  boundary: 'free' | 'closed'
  planeAuto: boolean
  planeY: number
  slopePct: number
  slopeTowardsDeg: number
}

export interface FloodState extends FloodSettings {
  panelOpen: boolean
  status: FloodStatus
  stage: PrepareStage | null
  error: string | null
  report: PrepareResult | null
  stats: FloodStats | null
  perf: RunPerf | null
  backend: { backend: FloodBackend; device: string; fallbackReason: string | null } | null
  demName: string | null
  viewMode: ViewMode
  threshold: number
  showGround: boolean
  particles: boolean
  replaySpeed: number
  probing: boolean
  probe: ProbeResult | null
  probeBusy: boolean
  setPanelOpen(v: boolean): void
  set(p: Partial<FloodState>): void
}

export const useFloodStore = create<FloodState>()((set) => ({
  cellM: 2,
  marginM: 60,
  roofRunoff: 'perimeter',
  manning: 'urban',
  infiltration: 'none',
  includeMapBuildings: true,
  useMapTerrain: true,
  storm: 'storm',
  hyetograph: stormHyetograph('storm'),
  drainMin: 30,
  boundary: 'free',
  planeAuto: true,
  planeY: 0,
  slopePct: 1,
  slopeTowardsDeg: 0,
  panelOpen: false,
  status: 'idle',
  stage: null,
  error: null,
  report: null,
  stats: null,
  perf: null,
  backend: null,
  demName: null,
  viewMode: 'now',
  threshold: 0.05,
  showGround: true,
  particles: true,
  replaySpeed: 300,
  probing: false,
  probe: null,
  probeBusy: false,
  setPanelOpen: (v) => set({ panelOpen: v }),
  set: (p) => set(p),
}))
