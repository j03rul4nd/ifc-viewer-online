// ─── landmarks ────────────────────────────────────────────────────────────────
// Hand-modelled buildings that stand in for their mapped outline.
//
// The extruder turns a footprint and a height into a prism, which is right for
// a street of flats and wrong for a monument: the Cascada Monumental of the
// Ciutadella is a baroque fountain with a grotto, twin stairs and a gilded
// quadriga, and as a prism it is a sandstone box. Its OSM record says nothing
// the extruder could use to do better. So the few landmarks a view is actually
// read by are authored in Blender (scripts/blender/build-ciutadella-landmarks.py)
// ON THEIR REAL FOOTPRINT: each GLB is in metres east/north of the footprint's
// centroid, so it is placed at that centroid with no rotation and no scale —
// there is no orientation left to guess, exactly as with the Hotel Vela.
//
// A landmark REPLACES its building: the mapped outline is dropped from the
// extrusion when (and only when) the model has loaded. Showcase only — it is a
// download, like the rest of the authored kit — and a model standing on the
// landmark's plot suppresses it exactly as it would the prism.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { latLonToNormalized } from './geo-math'
import { createGroundFrame } from './ground-frame'
import type { OsmFeature, LatLonPoint } from './osm-features'

export interface Landmark {
  /** Feature id as the parser emits it: `w123` for a way, `n123` for a node. */
  featureId: string
  /** File under `models/landmarks/`. */
  asset: string
  /** The origin the model was authored about. */
  origin: LatLonPoint
  /** Drop the mapped building this replaces (false for a point monument). */
  replacesBuilding: boolean
  /** Other mapped buildings the model also stands in for. */
  covers?: readonly string[]
}

/**
 * Parc de la Ciutadella. Centroids are the vertex means of the mapped outlines
 * the models were built on (scripts/blender/ciutadella_landmarks_site.json).
 */
export const LANDMARKS: readonly Landmark[] = [
  // The Cascada model also carries the U-shaped terraces and stairs that
  // embrace its pond (way 135115884, "built for the Exposició of 1888").
  { featureId: 'w135115868', asset: 'cascada-ciutadella', origin: { lat: 41.3900835, lon: 2.1865333 }, replacesBuilding: true, covers: ['w135115884'] },
  { featureId: 'w33570471', asset: 'hivernacle', origin: { lat: 41.3876987, lon: 2.1839321 }, replacesBuilding: true },
  { featureId: 'w33570470', asset: 'umbracle', origin: { lat: 41.3868037, lon: 2.1850201 }, replacesBuilding: true },
  { featureId: 'w33570474', asset: 'castell-tres-dragons', origin: { lat: 41.3881077, lon: 2.1833155 }, replacesBuilding: true },
  { featureId: 'w574334618', asset: 'glorieta', origin: { lat: 41.3891449, lon: 2.1860813 }, replacesBuilding: true },
  { featureId: 'n1497569358', asset: 'mamut', origin: { lat: 41.3890463, lon: 2.18712 }, replacesBuilding: false },
]

const byId = new Map(LANDMARKS.map((l) => [l.featureId, l]))

/** Every mapped feature id a set of loaded landmarks stands in for. */
export function replacedFeatureIds(landmarks: ReadonlyArray<Landmark>): Set<string> {
  const out = new Set<string>()
  for (const l of landmarks) { out.add(l.featureId); for (const c of l.covers ?? []) out.add(c) }
  return out
}

/** The landmarks present in a scene. */
export function landmarksIn(features: ReadonlyArray<Pick<OsmFeature, 'id'>>): Landmark[] {
  const out: Landmark[] = []
  for (const f of features) { const l = byId.get(f.id); if (l) out.push(l) }
  return out
}

function url(asset: string): string {
  const base = (import.meta.env?.BASE_URL ?? '/') as string
  return `${base}models/landmarks/${asset}.glb`.replace('//', '/')
}

const cache = new Map<string, Promise<THREE.BufferGeometry | null>>()

/** One load per asset per session; a failure is `null` and keeps the prism. */
export function loadLandmark(asset: string): Promise<THREE.BufferGeometry | null> {
  let p = cache.get(asset)
  if (!p) {
    p = new GLTFLoader().loadAsync(url(asset)).then((gltf) => {
      let geo: THREE.BufferGeometry | null = null
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!geo && m.isMesh && m.geometry) { geo = m.geometry.clone(); geo.applyMatrix4(m.matrixWorld) }
      })
      return geo
    }).catch(() => null)
    cache.set(asset, p)
  }
  return p
}

export interface LandmarkOptions {
  anchorLat: number
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  anchorElevationM?: number
  exaggeration?: number
}

/**
 * Meshes for the loaded landmarks, each at its authored origin on the ground.
 * Materials are lit and use the baked vertex colours.
 */
export function buildLandmarkLayer(
  loaded: ReadonlyArray<{ landmark: Landmark; geometry: THREE.BufferGeometry }>,
  opts: LandmarkOptions,
): THREE.Group | null {
  if (loaded.length === 0) return null
  const frame = createGroundFrame(opts)
  const group = new THREE.Group()
  group.name = 'osm-landmarks'
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.02 })
  for (const { landmark, geometry } of loaded) {
    const at = latLonToNormalized(landmark.origin.lat, landmark.origin.lon)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `osm-landmark-${landmark.asset}`
    mesh.position.set(at.nx, at.ny, frame.groundZ(at.nx, at.ny))
    mesh.scale.setScalar(frame.mToN)
    mesh.renderOrder = 5
    group.add(mesh)
  }
  return group
}
