// ─── collect elements for a clash run ─────────────────────────────────────────
// Reads every testable element of the loaded models: its triangles in SCENE
// space (part transform × model matrixWorld, so a model moved with the gizmo
// is tested where it is drawn), its class, storey, GlobalId, name and system.
// Main thread (fragments lives here); the heavy math happens in the worker.

import * as THREE from 'three'
import type { SpatialNode } from '../../types'
import { NEVER_TESTED, classFamily, matches, type ClashElement, type ClashSelector } from './model'

interface FragmentsLike {
  getItemsOfCategories(categories: RegExp[]): Promise<Record<string, number[]>>
  getItemsGeometry(localIds: number[]): Promise<Array<Array<{
    transform?: THREE.Matrix4
    positions?: Float32Array | Float64Array
    indices?: Uint8Array | Uint16Array | Uint32Array
  }>>>
  getItemsData?(ids: number[], o: unknown): Promise<unknown[]>
}

export interface CollectModel {
  id: string
  fileName: string
  discipline: string
  fragments: FragmentsLike
  matrixWorld: THREE.Matrix4 | null
  tree: SpatialNode[]
}

export interface Collected {
  elements: ClashElement[]
  positions: Float32Array
  offsets: Uint32Array
  modelIndex: Uint16Array
}

/** localId → { storey, guid, name } from the model's spatial tree. */
export function indexTree(tree: SpatialNode[]): Map<number, { storey: string; guid: string; name: string; assembly?: number }> {
  const out = new Map<number, { storey: string; guid: string; name: string; assembly?: number }>()
  const walk = (n: SpatialNode, storey: string) => {
    const s = /STOREY/i.test(n.ifcClass) ? (n.name || n.longName || storey) : storey
    for (const e of n.containedElements) {
      out.set(e.expressId, { storey: s, guid: e.globalId, name: e.name })
      for (const p of e.parts ?? []) out.set(p.expressId, { storey: s, guid: p.globalId, name: p.name || e.name, assembly: e.expressId })
    }
    for (const c of n.children) walk(c, s)
  }
  for (const n of tree) walk(n, '')
  return out
}

/** Element localIds collected below a node of getItemsData output. */
function idsBelow(v: unknown, out: Set<number>, depth = 0): void {
  if (depth > 6 || v == null || typeof v !== 'object') return
  if (Array.isArray(v)) { for (const x of v) idsBelow(x, out, depth + 1); return }
  const o = v as Record<string, unknown>
  const lid = (o._localId as { value?: unknown } | undefined)?.value ?? o._localId
  if (depth > 0 && typeof lid === 'number') out.add(lid)
  for (const [k, x] of Object.entries(o)) if (k !== '_localId' && typeof x === 'object') idsBelow(x, out, depth + 1)
}

/** localId → IfcSystem name, best effort (empty map when the file has none). */
async function readSystems(model: FragmentsLike): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (!model.getItemsData) return out
  try {
    const byCat = await model.getItemsOfCategories([/^IFC(DISTRIBUTION|BUILDING)?SYSTEM$|^IFCDISTRIBUTIONCIRCUIT$/])
    const ids = Object.values(byCat).flat()
    if (!ids.length) return out
    const data = await model.getItemsData(ids, {
      attributesDefault: false, attributes: ['Name'],
      relations: { IsGroupedBy: { attributes: true, relations: true } },
      relationsDefault: { attributes: false, relations: false },
    }) as Array<Record<string, unknown>>
    data.forEach((d, i) => {
      const name = String((d?.Name as { value?: unknown } | undefined)?.value ?? `System ${ids[i]}`)
      const members = new Set<number>()
      idsBelow(d?.IsGroupedBy, members)
      members.delete(ids[i])
      for (const m of members) if (!out.has(m)) out.set(m, name)
    })
  } catch { /* no systems readable: grouping falls back to class families */ }
  return out
}

/**
 * Collect the elements any of the selectors can take. Elements no test can
 * use are not read at all (their geometry is the expensive part).
 */
export async function collectElements(
  models: CollectModel[],
  selectors: ClashSelector[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Collected> {
  const elements: ClashElement[] = []
  const chunks: Float32Array[] = []
  const v = new THREE.Vector3()
  const m = new THREE.Matrix4()
  // Plan first so progress has a total.
  const plan: Array<{ model: CollectModel; mi: number; tree: ReturnType<typeof indexTree>; systems: Map<number, string>; cats: Array<[string, number[]]> }> = []
  let total = 0
  for (const [mi, model] of models.entries()) {
    let byCat: Record<string, number[]> = {}
    try { byCat = await model.fragments.getItemsOfCategories([/.*/]) } catch { continue }
    const tree = indexTree(model.tree)
    const systems = await readSystems(model.fragments)
    const cats: Array<[string, number[]]> = []
    for (const [cat, ids] of Object.entries(byCat)) {
      const category = cat.toUpperCase()
      if (NEVER_TESTED.test(category)) continue
      const probe: ClashElement = { index: -1, modelId: model.id, fileName: model.fileName, discipline: model.discipline, localId: 0, category, storey: '', system: '' }
      const keep = ids.filter((id) => {
        probe.system = systems.get(id) ?? classFamily(category)
        return selectors.some((s) => matches(s, probe))
      })
      if (keep.length) { cats.push([category, keep]); total += keep.length }
    }
    plan.push({ model, mi, tree, systems, cats })
  }
  let done = 0
  let floats = 0
  const offsets: number[] = [0]
  const modelIndex: number[] = []
  for (const { model, mi, tree, systems, cats } of plan) {
    for (const [category, ids] of cats) {
      for (let b = 0; b < ids.length; b += 150) {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
        const batch = ids.slice(b, b + 150)
        let geo: Awaited<ReturnType<FragmentsLike['getItemsGeometry']>> = []
        try { geo = await model.fragments.getItemsGeometry(batch) } catch { /* skip batch */ }
        batch.forEach((localId, j) => {
          const parts = geo[j] ?? []
          let n = 0
          for (const p of parts) if (p?.positions?.length) n += p.indices ? p.indices.length * 3 : p.positions.length
          if (!n) return
          const tri = new Float32Array(n)
          let o = 0
          for (const p of parts) {
            const src = p?.positions
            if (!src?.length) continue
            m.copy(p.transform ?? new THREE.Matrix4())
            if (model.matrixWorld) m.premultiply(model.matrixWorld)
            const idx = p.indices
            const count = idx ? idx.length : src.length / 3
            for (let k = 0; k < count; k++) {
              const vi = idx ? idx[k] : k
              v.set(src[vi * 3], src[vi * 3 + 1], src[vi * 3 + 2]).applyMatrix4(m)
              tri[o++] = v.x; tri[o++] = v.y; tri[o++] = v.z
            }
          }
          const info = tree.get(localId)
          elements.push({
            index: elements.length, modelId: model.id, fileName: model.fileName, discipline: model.discipline,
            localId, category, storey: info?.storey ?? '', system: systems.get(localId) ?? classFamily(category),
            name: info?.name, guid: info?.guid, assembly: info?.assembly,
          })
          chunks.push(tri)
          floats += tri.length
          offsets.push(floats)
          modelIndex.push(mi)
        })
        done += batch.length
        onProgress?.(done, total)
        // Let the page breathe between batches (big curtain walls are heavy).
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  }
  const positions = new Float32Array(floats)
  let o = 0
  for (const c of chunks) { positions.set(c, o); o += c.length }
  return { elements, positions, offsets: Uint32Array.from(offsets), modelIndex: Uint16Array.from(modelIndex) }
}
