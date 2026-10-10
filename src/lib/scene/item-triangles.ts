// ─── item triangles ───────────────────────────────────────────────────────────
// An analysis' own copy of a model's geometry: every item's triangles, read
// from the IFC through fragments' getItemsGeometry, flattened to a plain
// triangle soup in the model's space (each part's transform applied).
//
// Why not draw the viewer's fragments meshes: their content follows the
// user's camera (tiles stream in and out, far items are simplified), hidden
// items still render in an off-screen pass, and clipping planes cut them. A
// shadow pass (solar) or a plan-view rasterisation (flood) must see every
// element at full detail wherever the user is looking — so they draw this.
//
// The soup is in MODEL space: a mesh built from it takes the model object's
// matrixWorld as its matrix (matrixAutoUpdate off), so a model moved with the
// gizmo is followed without rebuilding anything.

import * as THREE from 'three'

/** The slice of a fragments model this needs. */
export interface ItemGeometrySource {
  getItemsOfCategories(categories: RegExp[]): Promise<Record<string, number[]>>
  getItemsGeometry(localIds: number[]): Promise<Array<Array<{
    transform?: THREE.Matrix4
    positions?: Float32Array | Float64Array
    indices?: Uint8Array | Uint16Array | Uint32Array
  }>>>
}

export interface ItemTrianglesOptions {
  /** IFC classes (upper case, e.g. IFCSPACE) never read. */
  skip?: RegExp
  /** Which bucket an item goes to; null drops it. Default: one bucket, 'all'. */
  bucket?(category: string, localId: number): string | null
  /** Items per getItemsGeometry call. */
  batch?: number
  onWarn?(message: string, err: unknown): void
}

/** Triangle soups (xyz × 3 per triangle) per bucket, in the model's space. */
export async function collectItemTriangles(model: ItemGeometrySource, o: ItemTrianglesOptions = {}): Promise<Map<string, Float32Array[]>> {
  const out = new Map<string, Float32Array[]>()
  const batchSize = o.batch ?? 500
  let byCategory: Record<string, number[]> = {}
  try { byCategory = await model.getItemsOfCategories([/.*/]) } catch (err) { o.onWarn?.('categories unavailable', err) }
  const v = new THREE.Vector3()
  for (const [category, ids] of Object.entries(byCategory)) {
    if (o.skip?.test(category)) continue
    for (let b = 0; b < ids.length; b += batchSize) {
      const batch = ids.slice(b, b + batchSize)
      let geo: Awaited<ReturnType<ItemGeometrySource['getItemsGeometry']>>
      try { geo = await model.getItemsGeometry(batch) } catch { continue }
      geo.forEach((parts, j) => {
        const key = o.bucket ? o.bucket(category, batch[j]) : 'all'
        if (key === null) return
        let target = out.get(key)
        if (!target) { target = []; out.set(key, target) }
        for (const part of parts) {
          const src = part?.positions
          if (!src?.length) continue
          const m = part.transform ?? new THREE.Matrix4()
          const idx = part.indices
          const count = idx ? idx.length : src.length / 3
          const tri = new Float32Array(count * 3)
          for (let k = 0; k < count; k++) {
            const vi = idx ? idx[k] : k
            v.set(src[vi * 3], src[vi * 3 + 1], src[vi * 3 + 2]).applyMatrix4(m)
            tri[k * 3] = v.x
            tri[k * 3 + 1] = v.y
            tri[k * 3 + 2] = v.z
          }
          target.push(tri)
        }
      })
    }
  }
  return out
}

/** One non-indexed mesh from triangle soups; matrix set by the caller (model matrixWorld). */
export function trianglesMesh(chunks: Float32Array[], name: string, material: THREE.Material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })): THREE.Mesh {
  const n = chunks.reduce((a, c) => a + c.length, 0)
  const pos = new Float32Array(n)
  let o = 0
  for (const c of chunks) { pos.set(c, o); o += c.length }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mesh = new THREE.Mesh(g, material)
  mesh.name = name
  mesh.matrixAutoUpdate = false
  mesh.frustumCulled = false
  return mesh
}
