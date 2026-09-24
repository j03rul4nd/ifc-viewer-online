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
import { mapLimited } from './render-scheduler'

const log = createLogger('PropsAssets')

/** Everything scripts/blender/build-props.py produces. */
export type PropAsset =
  | 'car' | 'van' | 'bus' | 'train-carriage' | 'train-cab'
  | 'traffic-signal' | 'catenary-mast'
  | 'tree-broadleaf' | 'tree-conifer'
  | 'street-lamp' | 'platform-canopy'
  // Round 2. Four more species, because two of them repeating across a
  // neighbourhood is visible at fifty trees; street furniture, because an empty
  // pavement reads as a game level; and the rooftop kit, because an empty roof
  // is the clearest sign a block was extruded rather than built.
  | 'tree-palm' | 'tree-columnar' | 'tree-blossom' | 'tree-olive'
  | 'bench' | 'litter-bin' | 'bollard' | 'bus-shelter'
  | 'roof-chimney' | 'roof-hvac' | 'roof-tank' | 'roof-stairbox'
  // Round 3. Barcelona street furniture, baked in its real paint rather than a
  // tintable neutral. Every one faces local +X (see build-props.py).
  | 'bench-bcn' | 'lamp-park-bcn' | 'lamp-street-bcn' | 'fountain-bcn'
  | 'ped-signal' | 'traffic-signal-bcn' | 'waste-basket-bcn'
  // Round 4. Moored boats for marinas, bow toward local +X. UNLIKE EVERY OTHER
  // ASSET their z = 0 is the WATERLINE, not the ground: the hull goes below it,
  // and loadOne() keeps it there instead of re-grounding (see isAfloat()).
  | 'boat-motor' | 'boat-sail' | 'boat-small'
  // Round 5. Parks: the mapped artworks (statue, bust, modern piece), play
  // equipment and pergolas, plus the lake's rowing boat. Real colours, front
  // +X. `boat-row` is a boat — waterline at z = 0, kept there by isAfloat().
  | 'statue-plinth' | 'bust-pedestal' | 'sculpture-modern'
  | 'playground-slide' | 'playground-springy' | 'playground-swing'
  | 'boat-row' | 'pergola-bcn'

export const PROP_ASSETS: readonly PropAsset[] = [
  'car', 'van', 'bus', 'train-carriage', 'train-cab', 'traffic-signal', 'catenary-mast',
  'tree-broadleaf', 'tree-conifer', 'street-lamp', 'platform-canopy',
  'tree-palm', 'tree-columnar', 'tree-blossom', 'tree-olive',
  'bench', 'litter-bin', 'bollard', 'bus-shelter',
  'roof-chimney', 'roof-hvac', 'roof-tank', 'roof-stairbox',
  'bench-bcn', 'lamp-park-bcn', 'lamp-street-bcn', 'fountain-bcn',
  'ped-signal', 'traffic-signal-bcn', 'waste-basket-bcn',
  'boat-motor', 'boat-sail', 'boat-small',
  'statue-plinth', 'bust-pedestal', 'sculpture-modern',
  'playground-slide', 'playground-springy', 'playground-swing',
  'boat-row', 'pergola-bcn',
]

/**
 * Total download for the whole set, KB. Quoted in the UI so the choice is
 * informed rather than a leap — and asserted by a test IN BOTH DIRECTIONS, so
 * it can neither creep past what we promised nor sit comfortably above the
 * truth. The first version of this number was 116 against 93 KB of actual
 * files: an over-estimate passes a `<=` check forever and still misinforms the
 * person deciding whether to download.
 */
export const PROP_ASSETS_KB = 1191

export const SHANGHAI_PARK_ASSETS = ['tree-camphor', 'tree-ginkgo', 'tree-metasequoia', 'tree-willow', 'shrub', 'reed', 'bench', 'lantern', 'pergola', 'fountain-jets'] as const
export const SHANGHAI_PARK_ASSETS_KB = 720
type LoadableAsset = PropAsset | `shanghai/${typeof SHANGHAI_PARK_ASSETS[number]}`

function assetUrl(name: LoadableAsset): string {
  const base = (import.meta.env.BASE_URL ?? '/') as string
  return `${base}models/props/${name}.glb${name.startsWith('train-') ? '?v=20260923-r1' : name.startsWith('shanghai/') ? '?v=20260907-r1' : ''}`.replace('//', '/')
}

/**
 * A boat is authored with z = 0 at its WATERLINE and its hull below it
 * (build-props.py, "Round 4: moored boats"), so it must not be re-grounded.
 */
function isAfloat(name: LoadableAsset): boolean {
  return name.startsWith('boat-')
}

/** One in-flight or finished load per asset, for the life of the tab. */
const cache = new Map<LoadableAsset, Promise<THREE.BufferGeometry | null>>()

/**
 * The single mesh inside an authored prop, as bare geometry.
 *
 * The loader is created per call rather than held: it is stateless, and keeping
 * one alive pins its DRACO/KTX2 sub-loaders for a feature most sessions never
 * turn on.
 */
async function loadOne(name: LoadableAsset): Promise<THREE.BufferGeometry | null> {
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
        // STAND IT ON THE GROUND. The build drops each LOCAL mesh to z=0, but the
        // exported node keeps the position of the first part it was joined from,
        // and the bake above adds that back. Measured through this loader: the
        // street lamp's base at +3.50 m, the signal at +1.67 m, the bench at
        // +0.21 m, every car at +0.52 m — lamps hovering over the pavement
        // while every numeric check on the GLB itself passed. Every asset is
        // authored standing on z=0, so re-grounding here is exact for all.
        //
        // EXCEPT BOATS. Their z = 0 is the waterline and the hull goes ~0.4–0.65 m
        // below it; re-grounding would sit every boat ON the water. They are left
        // exactly as authored, which is exact only because they are built with
        // bake_origin=True: the node carries no transform, so the bake above is
        // the identity (scripts/blender/props-assets.test.ts asserts it).
        geo.computeBoundingBox()
        const floor = geo.boundingBox?.min.z ?? 0
        if (!isAfloat(name) && Math.abs(floor) > 1e-4) geo.translate(0, 0, -floor)
        // The legacy bench was authored along X, seat facing +Y; every placement
        // turns +X toward what the bench faces (the convention the rest of the
        // kit follows), so it is turned once here rather than at every caller.
        if (name === 'bench') geo.rotateZ(-Math.PI / 2)
        geo.computeBoundingBox()
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
export function loadPropAsset(name: LoadableAsset): Promise<THREE.BufferGeometry | null> {
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
/**
 * Which assets THIS scene can use, most visible first.
 *
 * Showcase used to download the whole kit — 36 files, ~800 KB — for any site:
 * boats for a street with no water, carriages where there is no track, both
 * Barcelona's furniture and the generic set everywhere. Asking the scene first
 * means a Poblenou block downloads its trees, roof kit and signals, and a
 * marina adds its boats only when the scenery switch is on.
 *
 * Order is download order: what the data draws (roofs, trees, signals,
 * furniture) before what is invented (cars, boats, trains).
 */
export function neededPropAssets(
  features: ReadonlyArray<{ kind: string; style?: {
    pierKind?: string; railKind?: string; furniture?: string; artwork?: string; play?: string; waterKind?: string
  } }>,
  ctx: { scenery: boolean; barcelona: boolean; signals: boolean },
): PropAsset[] {
  const has = (k: string) => features.some((f) => f.kind === k)
  const out: PropAsset[] = []
  const add = (...names: PropAsset[]) => { for (const n of names) if (!out.includes(n)) out.push(n) }
  if (has('building')) add('roof-hvac', 'roof-stairbox', 'roof-tank', 'roof-chimney')
  if (has('tree') || has('green')) add('tree-broadleaf', 'tree-olive', 'tree-palm', 'tree-columnar', 'tree-blossom', 'tree-conifer')
  if (ctx.signals && has('signal')) add(ctx.barcelona ? 'traffic-signal-bcn' : 'traffic-signal', 'ped-signal')
  if (has('furniture')) {
    add(ctx.barcelona ? 'bench-bcn' : 'bench', ctx.barcelona ? 'waste-basket-bcn' : 'litter-bin',
      'bollard', 'lamp-park-bcn', ctx.barcelona ? 'lamp-street-bcn' : 'street-lamp', 'fountain-bcn')
  }
  // Park furniture, by what was mapped. An artwork or a piece of play kit
  // whose kind is known asks for its own silhouette; one whose kind is not
  // stated asks for the whole family, since the placement code will still
  // choose one of them for it.
  const furniture = (k: string) => features.filter((f) => f.kind === 'furniture' && f.style?.furniture === k)
  const ARTWORK: Record<string, PropAsset> = { statue: 'statue-plinth', bust: 'bust-pedestal', sculpture: 'sculpture-modern' }
  const PLAY: Record<string, PropAsset> = { slide: 'playground-slide', springy: 'playground-springy', swing: 'playground-swing' }
  for (const f of furniture('artwork')) {
    const one = f.style?.artwork ? ARTWORK[f.style.artwork] : undefined
    if (one) add(one)
    else add('statue-plinth', 'bust-pedestal', 'sculpture-modern')
  }
  for (const f of furniture('playground')) {
    const one = f.style?.play ? PLAY[f.style.play] : undefined
    if (one) add(one)
    else add('playground-slide', 'playground-springy', 'playground-swing')
  }
  if (furniture('shelter').length) add('pergola-bcn')
  const rail = features.some((f) => f.kind === 'rail' && f.style?.railKind !== 'platform')
  if (rail) add('catenary-mast')
  if (ctx.scenery && has('road')) {
    add('car', 'van', 'bus', ctx.barcelona ? 'lamp-street-bcn' : 'street-lamp',
      ctx.barcelona ? 'bench-bcn' : 'bench', 'bench', 'litter-bin', 'bollard', 'bus-shelter')
  }
  if (ctx.scenery && rail) add('train-carriage', 'train-cab', 'platform-canopy')
  if (ctx.scenery && features.some((f) => f.kind === 'pier' && f.style?.pierKind === 'deck')) {
    add('boat-motor', 'boat-sail', 'boat-small')
  }
  // A boating lake or pond gets the rental rowing boats — invented scenery,
  // so only with the scenery switch on, like the marina's.
  // Same test as planLakeBoats: a lake or a pond. The Ciutadella's estany is
  // `water=lake`; the Cascada's pond beside it is a `basin`, and nobody rows
  // across a fountain basin.
  if (ctx.scenery && features.some((f) => f.kind === 'water' && !(f as { isSea?: boolean }).isSea
    && (f.style?.waterKind === 'lake' || f.style?.waterKind === 'pond'))) {
    add('boat-row')
  }
  return out
}

/**
 * Load a list of assets, at most `concurrency` downloads in flight, in order.
 * A failed asset is a missing key, as with `loadPropAssets`.
 */
export async function loadPropAssetList(
  names: ReadonlyArray<PropAsset>, concurrency = 4,
): Promise<Map<PropAsset, THREE.BufferGeometry>> {
  const out = new Map<PropAsset, THREE.BufferGeometry>()
  const geos = await mapLimited(names, concurrency, (n) => loadPropAsset(n))
  names.forEach((n, i) => { const g = geos[i]; if (g) out.set(n, g) })
  return out
}

export async function loadPropAssets(): Promise<Map<PropAsset, THREE.BufferGeometry>> {
  const out = new Map<PropAsset, THREE.BufferGeometry>()
  const results = await Promise.all(
    PROP_ASSETS.map(async (name) => [name, await loadPropAsset(name)] as const),
  )
  for (const [name, geo] of results) if (geo) out.set(name, geo)
  return out
}

/** Optional regional pack; never fetched for Barcelona or a working/simple view. */
export async function loadShanghaiParkAssets(): Promise<Map<string, THREE.BufferGeometry>> {
  const result = new Map<string, THREE.BufferGeometry>()
  await Promise.all(SHANGHAI_PARK_ASSETS.map(async name => {
    const geometry = await loadPropAsset(`shanghai/${name}`)
    if (geometry) result.set(`shanghai/${name}`, geometry)
  }))
  return result
}

/** Drop the cache. Only for tests — a real session keeps them for the tab. */
export function __clearPropAssetCache(): void {
  cache.clear()
}
