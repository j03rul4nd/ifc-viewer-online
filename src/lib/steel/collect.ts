// ─── collect steel parts ──────────────────────────────────────────────────────
// Reads the steel classes of every loaded model through fragments
// (getItemsOfCategories + getItemsData in batches), parses each record with
// parseItemData and turns it into a SteelPart. Main thread; batches keep the
// viewer responsive (a yield between batches).

import {
  ITEM_DATA_CONFIG, PROJECT_UNITS_CONFIG, parseItemData, parseProjectUnits, type ProjectUnits,
} from '../ifc-item-data'
import type { GeometryInfo } from './profiles'
import { extractSteelPart, groupByProfile, type SteelPart, type SteelTakeoffRow } from './takeoff'

export const STEEL_CATEGORIES: RegExp[] = [
  /^IFCBEAM(STANDARDCASE)?$/i, /^IFCCOLUMN(STANDARDCASE)?$/i, /^IFCMEMBER(STANDARDCASE)?$/i, /^IFCPLATE(STANDARDCASE)?$/i,
  /^IFCMECHANICALFASTENER$/i, /^IFCELEMENTASSEMBLY$/i,
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

function geometryOptions(g: GeometryInfo | undefined) {
  return { geometryProfile: g?.profile ?? null, geometryLength: g?.length ?? null, geometryArea: g?.area ?? null }
}

const abortError = (): DOMException => new DOMException('aborted', 'AbortError')

/** `p`, or an AbortError as soon as `signal` fires (the listener is removed either way). */
export function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function collectSteelParts(
  models: SteelCollectModel[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  /** expressId → profile name, length and area of the body, read off the main thread; null when unavailable. */
  geometryProfiles?: (modelId: string, signal?: AbortSignal) => Promise<Map<number, GeometryInfo> | null>,
  /** A model whose IFC geometry could not be read (e.g. loaded from .frag). */
  onGeometryMissing?: (modelId: string) => void,
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
  // One model at a time: one worker and one copy of one IFC text alive at once.
  for (const { model, ids } of plan) {
    if (signal?.aborted) throw abortError()
    const geo = geometryProfiles ? geometryProfiles(model.id, signal).catch(() => null) : Promise.resolve(null)
    const units = await unitsOf(model.fragments)
    const fromGeometry = await raceAbort(geo, signal)
    if (geometryProfiles && !fromGeometry) onGeometryMissing?.(model.id)
    for (let b = 0; b < ids.length; b += STEEL_BATCH) {
      if (signal?.aborted) throw abortError()
      const batch = ids.slice(b, b + STEEL_BATCH)
      let data: unknown[] = []
      try { data = await model.fragments.getItemsData(batch, ITEM_DATA_CONFIG) } catch { data = [] }
      batch.forEach((localId, k) => {
        const raw = data[k]
        if (!raw || typeof raw !== 'object') return
        const part = extractSteelPart(parseItemData(raw as Record<string, unknown>, units), units, geometryOptions(fromGeometry?.get(localId)))
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
