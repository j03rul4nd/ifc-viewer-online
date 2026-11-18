// ─── build-input ──────────────────────────────────────────────────────────────
// Adapts viewer data into an AsBuiltPipelineInput without blocking the main
// thread: IFC element triangles (collectItemTriangles: non-indexed world-space
// triangles per localId) → indexed ElementGeometry; a world-space cloud sample
// → transferable chunks. Design: docs/AS_BUILT_PHASE3_DESIGN.md §2, §4.

import type { ElementGeometry } from './surface-sampling'

/** Cap for the cloud sample handed to the worker (pass to samplePoints). */
export const MAX_CLOUD_POINTS = 3_000_000

export interface TrianglesToElementsOptions {
  /** Model the localIds belong to (informational; ids stay localIds). */
  modelId?: string
  /** Yield to the event loop every N elements. Default 200. */
  yieldEvery?: number
  /** IFC class lookup per localId. Default 'IfcBuildingElement'. */
  classOf?: (localId: number) => string | undefined
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export async function trianglesToElements(map: Map<string | number, Float32Array[]>,
                                          o: TrianglesToElementsOptions = {}): Promise<ElementGeometry[]> {
  const every = Math.max(1, o.yieldEvery ?? 200)
  const out: ElementGeometry[] = []
  let n = 0
  for (const [key, chunks] of map) {
    if (++n % every === 0) await tick()
    let len = 0
    for (const c of chunks) len += c.length - (c.length % 9)
    if (len === 0) continue
    const positions = new Float32Array(len)
    let off = 0
    for (const c of chunks) {
      const usable = c.length - (c.length % 9)
      positions.set(usable === c.length ? c : c.subarray(0, usable), off)
      off += usable
    }
    const vertCount = len / 3
    const indices = new Uint32Array(vertCount)
    for (let i = 0; i < vertCount; i++) indices[i] = i
    const id = Number(key)
    out.push({ id, ifcClass: o.classOf?.(id) ?? 'IfcBuildingElement', positions, indices })
  }
  return out
}

/** Splits a flat xyz cloud into independently transferable copies. */
export function chunkCloud(positions: Float32Array, chunk = 262_144): Float32Array[] {
  const step = Math.max(1, Math.floor(chunk)) * 3
  const out: Float32Array[] = []
  const total = positions.length - (positions.length % 3)
  for (let i = 0; i < total; i += step) out.push(positions.slice(i, Math.min(total, i + step)))
  return out
}
