// ─── layer-anchor ─────────────────────────────────────────────────────────────
// Which lat/lon ↔ scene pairing data layers project through. Getting this
// wrong does not fail loudly: every layer is drawn, just beside the model.
//
// In order of authority:
//   1. an anchor that KNOWS where it is — a scan with a CRS, a manual pin;
//   2. the map's own alignment, while the map is on: the placement and the
//      scene point it lands on — the ANCHOR model's plan centre, which with
//      several federated models is not the active model's;
//   3. a loaded model's own georeference (IfcMapConversion / IfcSite), map
//      off: layers line up with a georeferenced IFC without any tiles;
//   4. the stand-in a layer made for itself when nothing else existed;
//   5. a bare placement (set by hand, or by that stand-in), on the active model.
//
// Before this order existed, (4) beat (2) and (3): a layer loaded before its
// IFC kept its own anchor for the rest of the session and sat beside the
// building — exactly the order a scene file or a `?layers=` link loads in.
//
// Pure.

import { anchorFromPlacement, type SceneAnchor } from '../geo/scene-anchor'
import type { GeoPlacement } from '../geo/geo-types'

export interface AnchorPairing {
  placement: GeoPlacement
  /** Scene point the placement's lat/lon lands on. */
  scene: { x: number; z: number }
  /** Floor of the model the pairing was taken from (scene Y). */
  floorY: number
}

export interface LayerAnchorInput {
  stored: SceneAnchor | null
  map: AnchorPairing | null
  georef: AnchorPairing | null
  placement: GeoPlacement | null
  activeBounds: { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
}

export function chooseLayerAnchor(i: LayerAnchorInput): SceneAnchor | null {
  if (i.stored && i.stored.source !== 'vector') return i.stored
  if (i.map) return anchorFromPlacement(i.map.placement, i.map.scene, i.map.floorY, 'map')
  if (i.georef) return { ...anchorFromPlacement(i.georef.placement, i.georef.scene, i.georef.floorY, 'ifc'), source: 'ifc' }
  if (i.stored) return i.stored
  if (!i.placement) return null
  const b = i.activeBounds
  return anchorFromPlacement(i.placement, b ? { x: b.center.x, z: b.center.z } : { x: 0, z: 0 }, b ? b.center.y - b.size.y / 2 : 0, 'map')
}
