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
import type { AffectedReport, PrepareResult, ProbeResult } from './system'
import type { RoofRunoff } from './raster/rain-routing'
import { stormHyetograph } from './presets'
import type { Hydrograph } from './core/inflow'

export type FloodStatus = 'idle' | 'preparing' | 'ready' | 'running' | 'paused' | 'finished' | 'error'
export type PrepareStage = 'geometry' | 'raster' | 'terrain' | 'layers'
export type StormPreset = 'shower' | 'storm' | 'intense' | 'extreme'
export type ManningPreset = 'paved' | 'urban' | 'grass' | 'vegetation'
export type InfiltrationPreset = 'none' | 'compacted' | 'loam' | 'sandy'
export type ViewMode = 'now' | 'max' | 'speed'
/** Water from outside: none, a watercourse that enters the area, or a point picked on the scene. */
export type InflowMode = 'none' | 'channel' | 'point'
export type InflowPreset = 'stream' | 'riera' | 'river'

/** Starting points for a flood wave, by their own numbers (peak, duration). */
export const INFLOW_PRESETS: Record<InflowPreset, Hydrograph> = {
  stream: { peakM3s: 5, durationMin: 60, peakAt: 0.35 },
  riera: { peakM3s: 25, durationMin: 90, peakAt: 0.35 },
  river: { peakM3s: 100, durationMin: 180, peakAt: 0.35 },
}

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
  /** Stand the map's relief / a DEM on the model's ground floor when they disagree (system.ts GroundFit). */
  fitGround: boolean
  /** Read the neighbourhood from OpenStreetMap: streets, parks, watercourses (and old ones), walls (osm-surface). */
  useOsm: boolean
  /** The preset the rain started from; null once edited by hand. */
  storm: StormPreset | null
  hyetograph: Hyetograph
  /** Simulated time after the rain stops, min. */
  drainMin: number
  inflowMode: InflowMode
  /** The watercourse (OSM way id) when inflowMode is 'channel'. */
  inflowChannel: string | null
  /** The point picked (scene x, z) when inflowMode is 'point'. */
  inflowPoint: { x: number; z: number } | null
  /** The preset the flood wave started from; null once edited by hand. */
  inflowPreset: InflowPreset | null
  inflowHydrograph: Hydrograph
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
  /** Waiting for a click on the scene to place an inflow. */
  picking: boolean
  probe: ProbeResult | null
  probeBusy: boolean
  /** The elements the water reaches (shown in the validation panel); null = none analysed. */
  affected: AffectedReport | null
  affectedBusy: boolean
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
  fitGround: true,
  useOsm: true,
  storm: 'storm',
  hyetograph: stormHyetograph('storm'),
  drainMin: 30,
  inflowMode: 'none',
  inflowChannel: null,
  inflowPoint: null,
  inflowPreset: 'riera',
  inflowHydrograph: INFLOW_PRESETS.riera,
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
  picking: false,
  probe: null,
  probeBusy: false,
  affected: null,
  affectedBusy: false,
  setPanelOpen: (v) => set({ panelOpen: v }),
  set: (p) => set(p),
}))

// QA (dev only): scripts/og/capture-flood-shots.mjs sets the view through it.
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__floodStore = useFloodStore
