// ─── props-assets tests ───────────────────────────────────────────────────────
// The contract that matters here is failure: showcase mode downloads things, and
// a download that goes wrong must cost the user a nicer car, never the map.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import {
  PROP_ASSETS, loadPropAsset, loadPropAssets, __clearPropAssetCache,
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
    loadAsync.mockResolvedValue(fakeGltf())
    const geo = (await loadPropAsset('car'))!
    expect(geo.getAttribute('position')).toBeTruthy()
    // The mesh sat at z = 2; the geometry must carry that, since the caller
    // composes its own instance matrix and knows nothing about parenting.
    geo.computeBoundingBox()
    expect(geo.boundingBox!.min.z).toBeCloseTo(1.5, 5)
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
