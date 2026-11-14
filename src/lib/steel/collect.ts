// ─── collect steel parts ──────────────────────────────────────────────────────
// Reads the steel classes of every loaded model through fragments
// (getItemsOfCategories + getItemsData in batches), parses each record with
// parseItemData and turns it into a SteelPart. Main thread; batches keep the
// viewer responsive (a yield between batches).

import {
  ITEM_DATA_CONFIG, PROJECT_UNITS_CONFIG, parseItemData, parseProjectUnits, type ProjectUnits,
} from '../ifc-item-data'
import { extractSteelPart, groupByProfile, type SteelPart, type SteelTakeoffRow } from './takeoff'

export const STEEL_CATEGORIES: RegExp[] = [
  /^IFCBEAM$/i, /^IFCCOLUMN$/i, /^IFCMEMBER$/i, /^IFCPLATE$/i, /^IFCMECHANICALFASTENER$/i, /^IFCELEMENTASSEMBLY$/i,
]
export const STEEL_BATCH = 500

export interface SteelFragmentsLike {
  getItemsOfCategories(categories: RegExp[]): Promise<Record<string, number[]>>
  getItemsData(ids: number[], config: unknown): Promise<unknown[]>
}

export interface SteelCollectModel { id: string; fragments: SteelFragmentsLike }

export interface CollectedPart extends SteelPart { modelId: string; localId: number }

/** A part's handle in the scene: what T-105 isolates and exports. */
export interface SteelPartRef { modelId: string; expressId: number }

export interface SteelRow extends SteelTakeoffRow { refs: SteelPartRef[] }

async function unitsOf(f: SteelFragmentsLike): Promise<ProjectUnits> {
  try {
    const ids = Object.values(await f.getItemsOfCategories([/^IFCPROJECT$/])).flat()
    if (!ids.length) return {}
    const [project] = await f.getItemsData([ids[0]], PROJECT_UNITS_CONFIG)
    return parseProjectUnits(project)
  } catch { return {} }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function collectSteelParts(
  models: SteelCollectModel[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  /** expressId → IfcProfileDef.ProfileName, read off the main thread; null when unavailable. */
  geometryProfiles?: (modelId: string) => Promise<Map<number, string> | null>,
): Promise<CollectedPart[]> {
  const plan: Array<{ model: SteelCollectModel; ids: number[] }> = []
  let total = 0
  for (const model of models) {
    let byCat: Record<string, number[]> = {}
    try { byCat = await model.fragments.getItemsOfCategories(STEEL_CATEGORIES) } catch { continue }
    const ids = [...new Set(Object.values(byCat).flat())]
    if (ids.length) { plan.push({ model, ids }); total += ids.length }
  }
  onProgress?.(0, total)
  const out: CollectedPart[] = []
  let done = 0
  // Start every geometry read now: it runs in a worker while batches are read.
  const geo = plan.map(({ model }) => (geometryProfiles ? geometryProfiles(model.id).catch(() => null) : Promise.resolve(null)))
  for (const [pi, { model, ids }] of plan.entries()) {
    const units = await unitsOf(model.fragments)
    const fromGeometry = await geo[pi]
    for (let b = 0; b < ids.length; b += STEEL_BATCH) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const batch = ids.slice(b, b + STEEL_BATCH)
      let data: unknown[] = []
      try { data = await model.fragments.getItemsData(batch, ITEM_DATA_CONFIG) } catch { data = [] }
      batch.forEach((localId, k) => {
        const raw = data[k]
        if (!raw || typeof raw !== 'object') return
        const part = extractSteelPart(parseItemData(raw as Record<string, unknown>, units), units, { geometryProfile: fromGeometry?.get(localId) ?? null })
        out.push({ ...part, expressId: localId, modelId: model.id, localId })
      })
      done += batch.length
      onProgress?.(done, total)
      await tick()
    }
  }
  return out
}

/** groupByProfile, keeping modelId + expressId of every part of each row. */
export function steelRows(parts: CollectedPart[]): SteelRow[] {
  const refs = new Map<string, SteelPartRef[]>()
  for (const p of parts) {
    const key = `${p.profile}\u0000${p.ifcClass ?? ''}`
    const list = refs.get(key) ?? []
    list.push({ modelId: p.modelId, expressId: p.localId })
    refs.set(key, list)
  }
  return groupByProfile(parts).map((r) => ({ ...r, refs: refs.get(`${r.profile}\u0000${r.ifcClass ?? ''}`) ?? [] }))
}

export interface SteelTotals { count: number; totalLength: number; totalWeight: number; missingWeight: number }

export function steelTotals(rows: SteelTakeoffRow[]): SteelTotals {
  return rows.reduce<SteelTotals>((t, r) => ({
    count: t.count + r.count, totalLength: t.totalLength + r.totalLength,
    totalWeight: t.totalWeight + r.totalWeight, missingWeight: t.missingWeight + r.missingWeight,
  }), { count: 0, totalLength: 0, totalWeight: 0, missingWeight: 0 })
}
