// ─── scene-presets ────────────────────────────────────────────────────────────
// Four ready-made answers to "what should the map look like?".
//
// The map has some twenty independent controls, and every one of them is there
// for a reason — but a first-time user does not want twenty decisions, they
// want "show me my building in its street". A preset is a bundle of the four
// settings that change the picture most (relief, surroundings, detail, scenery)
// named after the job it does, with an honest cost next to it.
//
// Presets never own state: applying one writes the ordinary preferences, and
// the active preset is DERIVED from those preferences. Touch any control by
// hand and the panel says "Custom" — there is no second source of truth that
// could disagree with what is on screen.

import type { BuildingDetail } from './building-mesh'

export type ScenePresetId = 'plan' | 'relief' | 'city' | 'showcase'

export interface ScenePreset {
  id: ScenePresetId
  terrain: boolean
  buildings: boolean
  detail: BuildingDetail
  /** Invented scenery (cars, lamps, boats). Only the presentation preset. */
  vehicles: boolean
  /** Relative weight on the device and the network, 1 (light) – 3 (heavy). */
  cost: 1 | 2 | 3
}

export const SCENE_PRESETS: readonly ScenePreset[] = [
  // The flat map under the model: nothing to fetch but tiles, nothing to build.
  { id: 'plan', terrain: false, buildings: false, detail: 'simple', vehicles: false, cost: 1 },
  // Real elevation, draped with the basemap. One DEM fetch, one mesh.
  { id: 'relief', terrain: true, buildings: false, detail: 'simple', vehicles: false, cost: 1 },
  // The working view: relief plus the surrounding masses, plain and fast.
  { id: 'city', terrain: true, buildings: true, detail: 'simple', vehicles: false, cost: 2 },
  // The one to bring to a client: lit facades and surfaces, authored props.
  { id: 'showcase', terrain: true, buildings: true, detail: 'showcase', vehicles: true, cost: 3 },
]

export interface PresetState {
  terrainEnabled: boolean
  buildingsEnabled: boolean
  contextDetail: BuildingDetail
  vehicles: boolean
}

/**
 * The preset the current preferences describe, or null for "Custom".
 *
 * Detail and scenery only matter when the surroundings are on — with no
 * buildings there is nothing for them to change, so a flat map with a leftover
 * Showcase preference is still, visibly, the flat map.
 */
export function matchPreset(state: PresetState): ScenePresetId | null {
  for (const p of SCENE_PRESETS) {
    if (p.terrain !== state.terrainEnabled || p.buildings !== state.buildingsEnabled) continue
    if (p.buildings && (p.detail !== state.contextDetail || p.vehicles !== state.vehicles)) continue
    return p.id
  }
  return null
}

export function presetById(id: ScenePresetId): ScenePreset {
  return SCENE_PRESETS.find((p) => p.id === id) ?? SCENE_PRESETS[0]
}
