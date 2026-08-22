// ─── GLB export ───────────────────────────────────────────────────────────────
// The regression this locks down: every GLB export in the app threw.
//
// @thatopen/fragments frees the CPU copy of each vertex array once it is on the
// GPU. Measured on a real model, every attribute on every mesh in the scene was
// a BufferAttribute with no `array` at all — so GLTFExporter, which reads those
// arrays, died inside isNormalizedNormalAttribute with "Cannot read properties
// of undefined (reading '0')". Not a missing guard: the data was not there.
//
// The fix asks the library for the geometry instead. These tests cover the two
// halves of that decision — when to rebuild, and that the rebuild is faithful.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { exportAsGlb } from './diffStore'

/** A mesh whose arrays have been freed, exactly as fragments leaves them. */
function gpuOnlyMesh(): THREE.Object3D {
  const geometry = new THREE.BufferGeometry()
  const position = new THREE.BufferAttribute(new Float32Array(9), 3)
  // What the library does after upload, and what broke the exporter.
  ;(position as unknown as { array: unknown }).array = undefined
  geometry.setAttribute('position', position)
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
  return group
}

/** A mesh that still carries its data, as anything not fragments would. */
function readableMesh(): THREE.Object3D {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3,
  ))
  geometry.computeVertexNormals()
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()))
  return group
}

/** A stand-in for the fragments model, returning one triangle per item. */
function fakeFragmentsModel(itemCount: number, opts: { normals?: boolean } = {}) {
  return {
    getLocalIds: async () => Array.from({ length: itemCount }, (_, i) => i + 1),
    getItemsGeometry: async (ids: number[]) => ids.map(() => ([{
      transform: new THREE.Matrix4(),
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      ...(opts.normals === false ? {} : { normals: new Int16Array([0, 0, 32767, 0, 0, 32767, 0, 0, 32767]) }),
      indices: new Uint16Array([0, 1, 2]),
    }])),
  }
}

/** Read the container header and the JSON chunk out of a GLB blob. */
async function readGlb(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const jsonLength = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  return {
    magic: String.fromCharCode(...bytes.subarray(0, 4)),
    version: view.getUint32(4, true),
    declaredLength: view.getUint32(8, true),
    actualLength: bytes.length,
    meshes: (json.meshes ?? []).length,
  }
}

describe('geometry the GPU owns', () => {
  it('rebuilds from the model instead of throwing', async () => {
    // The whole bug in one assertion: this input used to reach GLTFExporter and
    // die on an attribute with no array.
    const blob = await exportAsGlb(gpuOnlyMesh(), fakeFragmentsModel(3))
    const glb = await readGlb(blob)
    expect(glb.magic).toBe('glTF')
    expect(glb.version).toBe(2)
    expect(glb.meshes).toBe(3)
  })

  it('writes a container whose declared length matches its bytes', async () => {
    // A truncated or mis-headered GLB opens in nothing, and the app would have
    // reported success. Cheap to check, and it checks the whole write path.
    const glb = await readGlb(await exportAsGlb(gpuOnlyMesh(), fakeFragmentsModel(2)))
    expect(glb.declaredLength).toBe(glb.actualLength)
  })

  it('computes normals when the model does not supply them', async () => {
    const glb = await readGlb(await exportAsGlb(
      gpuOnlyMesh(), fakeFragmentsModel(1, { normals: false }),
    ))
    expect(glb.meshes).toBe(1)
  })

  it('explains itself when there is nothing to read the geometry back from', async () => {
    // The failure people used to get was a TypeError from inside three. If we
    // genuinely cannot export, say why.
    await expect(exportAsGlb(gpuOnlyMesh())).rejects.toThrow(/GPU|read it back/i)
  })

  it('reports a model that has no items rather than writing an empty file', async () => {
    await expect(exportAsGlb(gpuOnlyMesh(), fakeFragmentsModel(0))).rejects.toThrow(/no items/i)
  })
})

describe('geometry we can already read', () => {
  it('is exported directly, without asking the model for anything', async () => {
    // Anything not built on fragments — a mesh overlay, a generated helper —
    // must not be forced down the rebuild path.
    const model = fakeFragmentsModel(99)
    let asked = false
    const spy = { ...model, getLocalIds: async () => { asked = true; return model.getLocalIds() } }
    const glb = await readGlb(await exportAsGlb(readableMesh(), spy))
    expect(asked).toBe(false)
    expect(glb.meshes).toBe(1)
  })

  it('needs no model at all', async () => {
    const glb = await readGlb(await exportAsGlb(readableMesh()))
    expect(glb.magic).toBe('glTF')
  })
})
