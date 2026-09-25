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
  /**
   * Feature id as the parser emits it: `w123` for a way, `n123` for a node,
   * `r123-0` for the first ring of a relation.
   */
  featureId: string
  /** File under `models/landmarks/`. Two landmarks may share one (twin towers). */
  asset: string
  /** The origin the model was authored about. */
  origin: LatLonPoint
  /**
   * Other mapped features the model also stands in for. Also how the landmark
   * is FOUND: an outline with `building:part`s never reaches the scene (the
   * parser stands it down for its parts), so the parts are what is there.
   */
  covers?: readonly string[]
  /**
   * `featureId` only says the landmark is in view and is kept: a point
   * monument standing in a park is keyed on the park.
   */
  anchorOnly?: boolean
  /**
   * Nothing mapped stands for it in the scene (the Calatrava tower is a
   * `man_made=tower` no classifier claims): present whenever its origin is
   * inside the loaded area.
   */
  inArea?: boolean
}

/** The loaded area, for `inArea` landmarks. */
export interface LandmarkArea { south: number; west: number; north: number; east: number }

/**
 * Parc de la Ciutadella. Centroids are the vertex means of the mapped outlines
 * the models were built on (scripts/blender/ciutadella_landmarks_site.json).
 */
export const LANDMARKS: readonly Landmark[] = [
  // The Cascada model also carries the U-shaped terraces and stairs that
  // embrace its pond (way 135115884, "built for the Exposició of 1888").
  { featureId: 'w135115868', asset: 'cascada-ciutadella', origin: { lat: 41.3900835, lon: 2.1865333 }, covers: ['w135115884'] },
  { featureId: 'w33570471', asset: 'hivernacle', origin: { lat: 41.3876987, lon: 2.1839321 } },
  { featureId: 'w33570470', asset: 'umbracle', origin: { lat: 41.3868037, lon: 2.1850201 } },
  { featureId: 'w33570474', asset: 'castell-tres-dragons', origin: { lat: 41.3881077, lon: 2.1833155 } },
  { featureId: 'w574334618', asset: 'glorieta', origin: { lat: 41.3891449, lon: 2.1860813 } },
  { featureId: 'n1497569358', asset: 'mamut', origin: { lat: 41.3890463, lon: 2.18712 } },
  // Parc Güell (scripts/blender/build-parc-guell-landmarks.py). The Casa del
  // Guarda's and the Casa Museu's outlines never reach the scene — the parser
  // stands them down for their building:parts — so the parts find them.
  { featureId: 'r14718227-0', asset: 'sala-hipostila', origin: { lat: 41.4139012, lon: 2.1525799 }, covers: ['w1105836977', 'r14718228-0', 'r14718230-0', 'r14718231-0'] },
  // El Drac is an artwork way no classifier draws; its basin wall finds it.
  { featureId: 'w295826465', asset: 'escalinata-drac', origin: { lat: 41.4137107, lon: 2.1528224 }, covers: ['w1206198499'] },
  { featureId: 'w672895475', asset: 'casa-del-guarda', origin: { lat: 41.4135581, lon: 2.1531938 }, covers: ['w672896035', 'w672895572'] },
  // The smaller oval SW of the gate, with the checkered tower (the city's
  // mosaic inventory); w672895744 beside it is a school building.
  { featureId: 'w672895651', asset: 'pavello-consergeria', origin: { lat: 41.4134236, lon: 2.152973 } },
  { featureId: 'w126856515', asset: 'casa-museu-gaudi', origin: { lat: 41.4144351, lon: 2.1535895 }, covers: ['w672895612', 'w672895827', 'w672895916'] },
  // Points in the park, keyed on the park itself (w66713401), which stays.
  { featureId: 'w66713401', asset: 'turo-tres-creus', origin: { lat: 41.41241, lon: 2.15114 }, anchorOnly: true },
  { featureId: 'w66713401', asset: 'portic-bugadera', origin: { lat: 41.41389, lon: 2.1522 }, anchorOnly: true },

  // Montjuïc (build-montjuic-landmarks.py, build-anella-olimpica-landmarks.py,
  // build-castell-montjuic-landmark.py).
  { featureId: 'w43995751', asset: 'palau-nacional', origin: { lat: 41.3683185, lon: 2.1536005 },
    covers: ['w214445439', 'w214445442', 'w214445445', 'w214445446', 'w214445447', 'w214445448',
      'w666599310', 'w666599312', 'w666599313', 'w666599314', 'w666599319', 'w666599320', 'w666599321',
      'w666599332', 'w666599335'] },
  { featureId: 'w35816134', asset: 'font-magica', origin: { lat: 41.3711711, lon: 2.1517468 } },
  // The twin campaniles share one model, each placed at its own centroid.
  { featureId: 'w305825434', asset: 'torre-veneciana', origin: { lat: 41.3739688, lon: 2.1496243 },
    covers: ['w35816010', 'w305825427', 'w305825429', 'w305825431'] },
  { featureId: 'w305825435', asset: 'torre-veneciana', origin: { lat: 41.3741033, lon: 2.149972 },
    covers: ['w305825428', 'w305825430', 'w305825432', 'w305825433'] },
  { featureId: 'w67917935', asset: 'pavello-mies', origin: { lat: 41.3705319, lon: 2.1499482 },
    covers: ['w1104411431', 'w1104411435', 'w1104411432', 'w1104411433', 'w1104411436', 'w1104411440',
      'w1104411434', 'w1104411454', 'n10106337168'] },
  // `leisure=stadium` is no building: the grandstand and the pitch find it.
  { featureId: 'w35764760', asset: 'estadi-olimpic', origin: { lat: 41.364873, lon: 2.1558075 },
    covers: ['r155422-0', 'r155422-1', 'w126784791', 'w35743735', 'w268525891', 'w1279970871', 'n11971795971'] },
  { featureId: 'w35793637', asset: 'palau-sant-jordi', origin: { lat: 41.3634446, lon: 2.1525205 },
    covers: ['w146825150', 'w146825159'] },
  { featureId: 'w163393541', asset: 'torre-calatrava', origin: { lat: 41.3642837, lon: 2.1506075 }, inArea: true },
  { featureId: 'r1574427-0', asset: 'castell-montjuic', origin: { lat: 41.3633906, lon: 2.1662499 },
    covers: ['r5739196-0', 'w646482521', 'w666192268', 'w996701694', 'w111986236',
      'w385708588', 'w385708590', 'w391984231', 'w466476916', 'w1307905428'] },
]

/** Every id that says a landmark is in the scene, to the landmarks it finds. */
const byId = new Map<string, Landmark[]>()
for (const l of LANDMARKS) {
  for (const id of [l.featureId, ...(l.covers ?? [])]) {
    const list = byId.get(id)
    if (list) { if (!list.includes(l)) list.push(l) } else byId.set(id, [l])
  }
}

/** Every mapped feature id a set of loaded landmarks stands in for. */
export function replacedFeatureIds(landmarks: ReadonlyArray<Landmark>): Set<string> {
  const out = new Set<string>()
  for (const l of landmarks) {
    if (!l.anchorOnly) out.add(l.featureId)
    for (const c of l.covers ?? []) out.add(c)
  }
  return out
}

/** The landmarks present in a scene, each once. */
export function landmarksIn(
  features: ReadonlyArray<Pick<OsmFeature, 'id'>>,
  area?: LandmarkArea | null,
): Landmark[] {
  const found = new Set<Landmark>()
  for (const f of features) for (const l of byId.get(f.id) ?? []) found.add(l)
  if (area) for (const l of LANDMARKS) {
    const { lat, lon } = l.origin
    if (l.inArea && lat >= area.south && lat <= area.north && lon >= area.west && lon <= area.east) found.add(l)
  }
  return LANDMARKS.filter((l) => found.has(l))
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
