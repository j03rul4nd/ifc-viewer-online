// ─── props-assets tests ───────────────────────────────────────────────────────
// The contract that matters here is failure: showcase mode downloads things, and
// a download that goes wrong must cost the user a nicer car, never the map.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import {
  PROP_ASSETS, loadPropAsset, loadPropAssets, __clearPropAssetCache, neededPropAssets,
} from './props-assets'

const loadAsync = vi.fn()
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { loadAsync = (url: string) => loadAsync(url) },
}))

/** A GLTF result shaped like the real loader's, with one mesh inside. */
function fakeGltf(): { scene: THREE.Object3D } {
  const scene = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  mesh.position.set(0, 0, 2)
  scene.add(mesh)
  return { scene }
}

beforeEach(() => {
  __clearPropAssetCache()
  loadAsync.mockReset()
})

describe('loadPropAsset', () => {
  it('returns bare geometry with the node transform baked in', async () => {
    const gltf = fakeGltf()
    gltf.scene.children[0].position.set(0.7, -0.4, 2)
    loadAsync.mockResolvedValue(gltf)
    const geo = (await loadPropAsset('car'))!
    expect(geo.getAttribute('position')).toBeTruthy()
    // The caller composes its own instance matrix and knows nothing about
    // parenting, so the node's plan offset has to be carried in the geometry.
    geo.computeBoundingBox()
    expect(geo.boundingBox!.min.x).toBeCloseTo(0.2, 5)
    expect(geo.boundingBox!.min.y).toBeCloseTo(-0.9, 5)
  })

  // The exporter leaves each node at the position of the first part it was
  // joined from, while the mesh itself is authored standing on z=0. Baking
  // that height back in is what stood the street lamp 3.5 m off the pavement.
  it('stands every asset on the ground, whatever height its node was left at', async () => {
    loadAsync.mockResolvedValue(fakeGltf())
    const geo = (await loadPropAsset('street-lamp'))!
    geo.computeBoundingBox()
    expect(geo.boundingBox!.min.z).toBeCloseTo(0, 6)
    expect(geo.boundingBox!.max.z).toBeCloseTo(1, 6)
  })

  // A boat's z = 0 is its waterline and the hull reaches below it. Re-grounding
  // it like a lamp would sit every hull on top of the water.
  it('keeps a boat at its authored waterline instead of re-grounding it', async () => {
    const gltf = fakeGltf()
    gltf.scene.children[0].position.set(0, 0, 0)      // bake_origin: identity node
    loadAsync.mockResolvedValue(gltf)
    const geo = (await loadPropAsset('boat-sail'))!
    geo.computeBoundingBox()
    expect(geo.boundingBox!.min.z).toBeCloseTo(-0.5, 6)
    expect(geo.boundingBox!.max.z).toBeCloseTo(0.5, 6)
  })

  it('fetches each asset at most once per session', async () => {
    loadAsync.mockResolvedValue(fakeGltf())
    await Promise.all([loadPropAsset('car'), loadPropAsset('car'), loadPropAsset('car')])
    expect(loadAsync).toHaveBeenCalledTimes(1)
  })

  it('degrades to null when the download fails', async () => {
    loadAsync.mockRejectedValue(new Error('offline'))
    await expect(loadPropAsset('van')).resolves.toBeNull()
  })

  it('degrades to null when the file holds no mesh', async () => {
    loadAsync.mockResolvedValue({ scene: new THREE.Group() })
    await expect(loadPropAsset('street-lamp')).resolves.toBeNull()
  })
})

describe('loadPropAssets', () => {
  it('keeps whatever arrived when only some fail', async () => {
    loadAsync.mockImplementation((url: string) =>
      url.includes('car') ? Promise.resolve(fakeGltf()) : Promise.reject(new Error('nope')))
    const got = await loadPropAssets()
    // Showcase degrades asset by asset, never all-or-nothing.
    expect(got.size).toBeGreaterThan(0)
    expect(got.size).toBeLessThan(PROP_ASSETS.length)
  })

  it('never rejects, whatever the network does', async () => {
    loadAsync.mockRejectedValue(new Error('everything is on fire'))
    await expect(loadPropAssets()).resolves.toBeInstanceOf(Map)
  })
})

describe('neededPropAssets', () => {
  const f = (kind: string, style: Record<string, string> = {}) => ({ kind, style })

  it('asks for nothing a scene cannot draw', () => {
    const street = [f('building'), f('road'), f('tree')]
    const out = neededPropAssets(street, { scenery: false, barcelona: false, signals: false })
    expect(out).toContain('tree-broadleaf')
    expect(out).toContain('roof-hvac')
    for (const n of ['boat-motor', 'train-carriage', 'car', 'bench-bcn', 'traffic-signal'] as const) {
      expect(out).not.toContain(n)
    }
  })

  it('adds the marina boats only with scenery on and a pontoon in the data', () => {
    const port = [f('pier', { pierKind: 'deck' }), f('road')]
    expect(neededPropAssets(port, { scenery: false, barcelona: true, signals: false })).not.toContain('boat-sail')
    expect(neededPropAssets(port, { scenery: true, barcelona: true, signals: false })).toContain('boat-sail')
  })

  it('downloads what the data draws before what is invented', () => {
    const all = [f('building'), f('tree'), f('road'), f('signal'), f('furniture'), f('rail'), f('pier', { pierKind: 'deck' })]
    const out = neededPropAssets(all, { scenery: true, barcelona: true, signals: true })
    expect(out.indexOf('roof-hvac')).toBeLessThan(out.indexOf('car'))
    expect(out.indexOf('bench-bcn')).toBeLessThan(out.indexOf('boat-motor'))
    expect(new Set(out).size).toBe(out.length)
  })

  it('asks for the park set only when the park furniture is mapped', () => {
    const all = { scenery: true, barcelona: true, signals: true }
    const bare = neededPropAssets([f('furniture', { furniture: 'bench' }), f('green')], all)
    for (const n of ['statue-plinth', 'bust-pedestal', 'sculpture-modern', 'playground-slide',
      'playground-springy', 'playground-swing', 'pergola-bcn', 'boat-row'] as const) {
      expect(bare).not.toContain(n)
    }
    expect(neededPropAssets([f('furniture', { furniture: 'shelter' })], all)).toContain('pergola-bcn')
  })

  it('fetches the artwork and play kit a node names, or the whole family when it names none', () => {
    const ctx = { scenery: false, barcelona: true, signals: false }
    const bust = neededPropAssets([f('furniture', { furniture: 'artwork', artwork: 'bust' })], ctx)
    expect(bust).toContain('bust-pedestal')
    expect(bust).not.toContain('statue-plinth')
    expect(bust).not.toContain('sculpture-modern')
    const art = neededPropAssets([f('furniture', { furniture: 'artwork' })], ctx)
    expect(art).toEqual(expect.arrayContaining(['statue-plinth', 'bust-pedestal', 'sculpture-modern']))
    const swing = neededPropAssets([f('furniture', { furniture: 'playground', play: 'swing' })], ctx)
    expect(swing).toContain('playground-swing')
    expect(swing).not.toContain('playground-slide')
    const play = neededPropAssets([f('furniture', { furniture: 'playground' })], ctx)
    expect(play).toEqual(expect.arrayContaining(['playground-slide', 'playground-springy', 'playground-swing']))
  })

  it('puts rowing boats on a lake or pond only with scenery on — never on a river, fountain or basin', () => {
    const on = { scenery: true, barcelona: true, signals: false }
    for (const waterKind of ['pond', 'lake']) {
      const lake = [f('water', { waterKind })]
      expect(neededPropAssets(lake, on)).toContain('boat-row')
      expect(neededPropAssets(lake, { ...on, scenery: false })).not.toContain('boat-row')
    }
    for (const waterKind of ['river', 'fountain', 'other']) {
      expect(neededPropAssets([f('water', { waterKind })], on)).not.toContain('boat-row')
    }
  })

  it('picks the regional set by place', () => {
    const park = [f('furniture'), f('signal')]
    expect(neededPropAssets(park, { scenery: false, barcelona: true, signals: true })).toContain('bench-bcn')
    expect(neededPropAssets(park, { scenery: false, barcelona: false, signals: true })).toContain('bench')
  })
})
