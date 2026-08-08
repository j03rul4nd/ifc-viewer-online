// ─── props-assets ─────────────────────────────────────────────────────────────
// Loading the authored GLB props for showcase mode.
//
// THE WHOLE POINT OF THE THREE LEVELS:
//
//   simple    — flat extrusions, unlit. Context for orientation. Costs nothing.
//   detailed  — lit surfaces, storey-banded facades, procedural props.
//   showcase  — the above, plus authored geometry fetched from our own origin.
//
// Only the third one downloads anything, and only when the user asks for it. A
// coordinator validating an IFC never pays a byte for a car they did not want;
// somebody presenting to a client gets a street worth presenting. That choice
// belongs to them, which is why it is a level and not a heuristic.
//
// The assets are served from the site itself (public/models/props), not a CDN:
// same origin, no third party learning what our users look at, and they are in
// the repo so a self-hosted copy has them too.
//
// Everything returns GEOMETRY, not scenes. The placement code owns the instanced
// meshes — showcase mode swaps what is instanced, never how many draw calls.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createLogger } from '../logger'

const log = createLogger('PropsAssets')

/** Everything scripts/blender/build-props.py produces. */
export type PropAsset =
  | 'car' | 'van' | 'train-carriage'
  | 'tree-broadleaf' | 'tree-conifer'
  | 'street-lamp' | 'platform-canopy'

export const PROP_ASSETS: readonly PropAsset[] = [
  'car', 'van', 'train-carriage',
  'tree-broadleaf', 'tree-conifer', 'street-lamp', 'platform-canopy',
]

/**
 * Total download for the whole set, KB. Quoted in the UI so the choice is
 * informed rather than a leap — and asserted by a test IN BOTH DIRECTIONS, so
 * it can neither creep past what we promised nor sit comfortably above the
 * truth. The first version of this number was 116 against 93 KB of actual
 * files: an over-estimate passes a `<=` check forever and still misinforms the
 * person deciding whether to download.
 */
export const PROP_ASSETS_KB = 94

function assetUrl(name: PropAsset): string {
  const base = (import.meta.env.BASE_URL ?? '/') as string
  return `${base}models/props/${name}.glb`.replace('//', '/')
}

/** One in-flight or finished load per asset, for the life of the tab. */
const cache = new Map<PropAsset, Promise<THREE.BufferGeometry | null>>()

/**
 * The single mesh inside an authored prop, as bare geometry.
 *
 * The loader is created per call rather than held: it is stateless, and keeping
 * one alive pins its DRACO/KTX2 sub-loaders for a feature most sessions never
 * turn on.
 */
async function loadOne(name: PropAsset): Promise<THREE.BufferGeometry | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(assetUrl(name))
    let found: THREE.BufferGeometry | null = null
    gltf.scene.traverse((o) => {
      if (found) return
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && mesh.geometry) {
        // Bake the node transform down: the caller composes its own instance
        // matrix and knows nothing about how the asset was parented.
        const geo = mesh.geometry.clone()
        mesh.updateWorldMatrix(true, false)
        geo.applyMatrix4(mesh.matrixWorld)
        found = geo
      }
    })
    if (!found) log.warn(`${name}.glb contained no mesh`)
    return found
  } catch (e) {
    // A missing or corrupt asset must degrade to the procedural prop, never
    // take the map down with it.
    log.warn(`could not load ${name}.glb — falling back to procedural`, e)
    return null
  }
}

/** Load one asset, at most once per session. */
export function loadPropAsset(name: PropAsset): Promise<THREE.BufferGeometry | null> {
  let pending = cache.get(name)
  if (!pending) {
    pending = loadOne(name)
    cache.set(name, pending)
  }
  return pending
}

/**
 * Load the whole set. Resolves with whatever arrived: a failure is a missing
 * key, not a rejection, so showcase mode degrades asset by asset instead of
 * all-or-nothing.
 */
export async function loadPropAssets(): Promise<Map<PropAsset, THREE.BufferGeometry>> {
  const out = new Map<PropAsset, THREE.BufferGeometry>()
  const results = await Promise.all(
    PROP_ASSETS.map(async (name) => [name, await loadPropAsset(name)] as const),
  )
  for (const [name, geo] of results) if (geo) out.set(name, geo)
  return out
}

/** Drop the cache. Only for tests — a real session keeps them for the tab. */
export function __clearPropAssetCache(): void {
  cache.clear()
}
