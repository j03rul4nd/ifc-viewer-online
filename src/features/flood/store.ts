// ─── flood store ──────────────────────────────────────────────────────────────
// Small, renderable state of the flood panel: settings, status, the last
// report and the live metrics. The grid, the solver and the DEM file live
// outside React (system.ts, the worker, a module ref in the panel). Imported
// by the panel rail, so it must stay free of anything heavy.

import { create } from 'zustand'
import type { FloodBackend, FloodStats } from './core/solver-api'
import type { RunPerf } from './worker/protocol'
import type { PrepareResult } from './system'
import type { RoofRunoff } from './raster/rain-routing'

export type FloodStatus = 'idle' | 'preparing' | 'ready' | 'running' | 'paused' | 'finished' | 'error'
export type PrepareStage = 'geometry' | 'raster' | 'terrain' | 'layers'
export type StormPreset = 'shower' | 'storm' | 'intense' | 'extreme'
export type ManningPreset = 'paved' | 'urban' | 'grass' | 'vegetation'
export type Speed = 60 | 300 | 1200 | 'max'

export const MANNING: Record<ManningPreset, number> = { paved: 0.016, urban: 0.025, grass: 0.035, vegetation: 0.06 }

export interface FloodSettings {
  cellM: number
  marginM: number
  roofRunoff: RoofRunoff
  manning: ManningPreset
  includeMapBuildings: boolean
  useMapTerrain: boolean
  storm: StormPreset
  /** Simulated time after the rain stops, min. */
  drainMin: number
  boundary: 'free' | 'closed'
  speed: Speed
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
  viewMode: 'now' | 'max'
  threshold: number
  showGround: boolean
  setPanelOpen(v: boolean): void
  set(p: Partial<FloodState>): void
}

export const useFloodStore = create<FloodState>()((set) => ({
  cellM: 2,
  marginM: 60,
  roofRunoff: 'perimeter',
  manning: 'urban',
  includeMapBuildings: true,
  useMapTerrain: true,
  storm: 'storm',
  drainMin: 30,
  boundary: 'free',
  speed: 300,
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
  setPanelOpen: (v) => set({ panelOpen: v }),
  set: (p) => set(p),
}))
