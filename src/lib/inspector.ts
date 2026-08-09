// ─── inspector ────────────────────────────────────────────────────────────────
// What the properties panel is currently describing, when that is not an IFC
// element.
//
// THE PROBLEM THIS SOLVES. A scene in this app is up to three different kinds
// of thing at once: federated IFC models, a survey scan, and the real
// neighbourhood pulled from OpenStreetMap. Clicking each of them used to land
// somewhere different — an IFC element in the properties panel, a scanned point
// in a readout inside the point cloud panel, and an OSM building in a hover
// tooltip that vanished when you moved the mouse. Three answers to "what is
// this?", in three places, two of which you had to already know were there.
//
// So there is one inspector, and this is what the non-IFC sources publish into
// it. IFC selection deliberately does NOT come through here: it already flows
// as `selected` from the viewer through App, and rerouting it would mean
// touching the SDK relay, the embed events and the edit pipeline for no gain.
// The panel shows whichever was picked last.
//
// Pure state. No React beyond the store, no three.js, no stores of other
// features — a source publishes, the panel renders, and neither knows about the
// other.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/** A point read off a loaded scan. */
export interface PointTarget {
  kind: 'point'
  /** Which cloud it came from — a scene can hold several. */
  cloudId: string
  cloudName: string
  /**
   * Position in the SCAN's own coordinates, which is what its file says and
   * what a surveyor can check against. Not the scene position: that has the
   * alignment transform baked in and matches nothing anybody has on paper.
   */
  position: { x: number; y: number; z: number }
  /** The scan's declared unit, when it declared one. */
  unit?: 'm' | 'ft' | 'usft' | null
  /** 0-255, as decoded. Absent when the file carries no intensity. */
  intensity?: number
  /** LAS classification code, absent when the file carries none. */
  classification?: number
  /** 0-255 per channel, absent when the file has no colour. */
  color?: { r: number; g: number; b: number }
}

/** A feature from the OpenStreetMap surroundings. */
export interface MapFeatureTarget {
  kind: 'map-feature'
  /** OSM element id, e.g. `way/12345`. */
  id: string
  /** `name` as mapped. Never invented — most buildings have none. */
  name?: string
  /** What it is, in one phrase: 'School', 'Train station'. */
  label?: string
  /** Which layer it belongs to: building, water, green, bridge, tree. */
  featureKind: string
  /** Metres. Surveyed when the tags said so, estimated otherwise. */
  heightM?: number
  heightEstimated?: boolean
  storeys?: number
}

export type InspectorTarget = PointTarget | MapFeatureTarget

interface InspectorStore {
  /** What is being inspected, when it is not an IFC element. */
  target: InspectorTarget | null
  setTarget: (target: InspectorTarget | null) => void
  clear: () => void
}

export const useInspectorStore = create<InspectorStore>()(
  devtools(
    (set) => ({
      target: null,
      setTarget: (target) => set({ target }, false, 'setTarget'),
      clear: () => set({ target: null }, false, 'clear'),
    }),
    { name: 'inspector' },
  ),
)

/**
 * Publish a pick. Sugar over the store so a source does not have to import the
 * hook to write one value from an event handler.
 */
export function publishInspectorTarget(target: InspectorTarget): void {
  useInspectorStore.getState().setTarget(target)
}

/**
 * Drop whatever non-IFC thing was being inspected.
 *
 * Called when an IFC element is selected, because the panel shows one thing and
 * the last click is what the user means. Cheap enough to call unconditionally —
 * it no-ops when there is nothing to clear, so it never causes a render.
 */
export function clearInspectorTarget(): void {
  if (useInspectorStore.getState().target !== null) useInspectorStore.getState().clear()
}

/** LAS classification codes worth naming. Anything else shows as its number. */
export const LAS_CLASSES: Record<number, string> = {
  0: 'created',
  1: 'unclassified',
  2: 'ground',
  3: 'lowVegetation',
  4: 'mediumVegetation',
  5: 'highVegetation',
  6: 'building',
  7: 'lowPoint',
  9: 'water',
  10: 'rail',
  11: 'roadSurface',
  13: 'wireGuard',
  14: 'wireConductor',
  15: 'transmissionTower',
  17: 'bridgeDeck',
  18: 'highNoise',
}
