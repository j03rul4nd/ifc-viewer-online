// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildArGroup, exportForAr, partsFromFragments, partsFromObject, pickParts, type FragmentsLike } from './arExport'

function box(x: number, y: number, z: number, size: number, color: number, ifcType?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ color }))
  m.position.set(x, y, z)
  if (ifcType) m.userData.ifcType = ifcType
  return m
}

describe('pickParts', () => {
  it('keeps everything without a cap or under it', () => {
    expect(pickParts([{ triangles: 10, size: 1 }, { triangles: 5, size: 2 }])).toEqual([0, 1])
    expect(pickParts([{ triangles: 10, size: 1 }, { triangles: 5, size: 2 }], 100)).toEqual([0, 1])
  })
  it('drops the smallest parts first to fit the cap', () => {
    const parts = [{ triangles: 50, size: 1 }, { triangles: 60, size: 9 }, { triangles: 30, size: 5 }]
    expect(pickParts(parts, 95)).toEqual([1, 2])
  })
})

describe('AR scene', () => {
  it('drops hidden meshes and spaces, merges by material, base centre at origin', async () => {
    const root = new THREE.Group()
    root.add(box(10, 5, 10, 2, 0xff0000), box(14, 5, 10, 2, 0xff0000), box(12, 5, 12, 2, 0x00ff00))
    root.add(box(0, 0, 0, 50, 0x0000ff, 'IFCSPACE'))
    const hidden = box(100, 100, 100, 2, 0xff0000); hidden.visible = false; root.add(hidden)
    const parts = partsFromObject(THREE, root)
    expect(parts).toHaveLength(3)
    const { group, stats } = await buildArGroup(THREE, parts)
    expect(stats.meshes).toBe(2)
    expect(stats.triangles).toBe(36)
    const b = new THREE.Box3().setFromObject(group)
    expect(b.min.y).toBeCloseTo(0)
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0)
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0)
    expect(b.max.x - b.min.x).toBeCloseTo(6)
  })

  it('applies a unit scale and a triangle cap', async () => {
    const root = new THREE.Group()
    root.add(box(0, 0, 0, 1000, 0xff0000), box(3000, 0, 0, 10, 0xff0000))
    const { group, stats } = await buildArGroup(THREE, partsFromObject(THREE, root), { unitScale: 0.001, maxTriangles: 12 })
    expect(stats.droppedParts).toBe(1)
    const b = new THREE.Box3().setFromObject(group)
    expect(b.max.y - b.min.y).toBeCloseTo(1)
  })

  it('reads a fragments model: hidden and non-physical items left out, grouped by material', async () => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    const geo = { positions: g.getAttribute('position').array as Float32Array, indices: g.index!.array as Uint16Array, transform: new THREE.Matrix4() }
    const asked: number[] = []
    const model: FragmentsLike = {
      getLocalIds: async () => [1, 2, 3, 4],
      getItemsByVisibility: async (v) => (v ? [1, 2, 4] : [3]),
      getItemsOfCategories: async () => ({ IFCSPACE: [4] }),
      getItemsMaterialDefinition: async (ids) => [
        { definition: { color: new THREE.Color(1, 0, 0), opacity: 1, transparent: false }, localIds: ids.filter((i) => i !== 2) },
        { definition: { color: new THREE.Color(0, 1, 0), opacity: 1, transparent: false }, localIds: [2] },
      ],
      getItemsGeometry: async (ids) => { asked.push(...ids); return ids.map(() => [geo]) },
    }
    const parts = await partsFromFragments(THREE, model, null)
    expect(asked.sort()).toEqual([1, 2])
    expect(new Set(parts.map((p) => p.materialKey)).size).toBe(2)
  })

  it('exports GLB and USDZ blobs', async () => {
    const root = new THREE.Group()
    root.add(box(0, 0, 0, 1, 0xff0000))
    const glb = await exportForAr(root, null, 'glb')
    const head = new Uint8Array(await glb.blob.arrayBuffer()).slice(0, 4)
    expect(String.fromCharCode(...head)).toBe('glTF')
    const usdz = await exportForAr(root, null, 'usdz')
    expect(usdz.blob.type).toBe('model/vnd.usdz+zip')
    const zip = new Uint8Array(await usdz.blob.arrayBuffer()).slice(0, 2)
    expect(String.fromCharCode(...zip)).toBe('PK')
  })
})
