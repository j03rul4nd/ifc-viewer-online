// ─── a KMZ as the scene's anchor ─────────────────────────────────────────────
// A study area is usually all there is: a DEM, a KMZ, no IFC. Then nothing has
// told the map where the scene is, so the KMZ does, the way a georeferenced
// scan does (pc-runner.claimSceneAnchor): its centre at the scene origin,
// north up, and the map's placement from it — only when nothing else holds
// the anchor or the placement.

import { useSceneAnchorStore } from '../../stores/sceneAnchorStore'
import { useGeoStore } from '../../stores/geoStore'
import { anchorToPlacement, type SceneAnchor } from '../../lib/geo/scene-anchor'
import type { KmlPlacemark } from './io/kml'

/** Centre of the placemarks' bounding box, WGS84; null when there are none. */
export function placemarksCentre(placemarks: KmlPlacemark[]): { lat: number; lon: number } | null {
  let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity
  for (const p of placemarks) {
    for (const g of p.geometries) {
      for (const q of g.type === 'point' ? [g.point] : g.type === 'line' ? g.line : g.outer) {
        lat0 = Math.min(lat0, q.lat); lat1 = Math.max(lat1, q.lat)
        lon0 = Math.min(lon0, q.lon); lon1 = Math.max(lon1, q.lon)
      }
    }
  }
  return Number.isFinite(lat0) ? { lat: (lat0 + lat1) / 2, lon: (lon0 + lon1) / 2 } : null
}

/** Anchors the scene on the KMZ when no model, scan or placement already does. True when it did. */
export function anchorOnKmz(placemarks: KmlPlacemark[], label: string, hasModels: boolean): boolean {
  if (hasModels) return false
  const geo = useGeoStore.getState()
  const store = useSceneAnchorStore.getState()
  if (store.anchor || geo.placement) return false
  const c = placemarksCentre(placemarks)
  if (!c) return false
  const anchor: SceneAnchor = {
    lat: c.lat, lon: c.lon, elevationM: null,
    scene: { x: 0, y: 0, z: 0 }, rotationDeg: 0, grid: null, source: 'vector', label,
  }
  geo.setPlacement(anchorToPlacement(store.claim(anchor)))
  return true
}
