// ─── collect product data ─────────────────────────────────────────────────────
// Reads the physical elements of the loaded models through fragments in
// batches (a yield between each, so the viewer stays responsive on big
// models), parses each record and feeds ProductDataBuilder. Same reading path
// as the steel takeoff.

import { ITEM_DATA_CONFIG, parseItemData } from '../ifc-item-data'
import { raceAbort, unitsOf, type SteelCollectModel } from '../steel/collect'
import { ProductDataBuilder, type ProductData, type ProductDataOptions } from './extract'

export const PRODUCT_BATCH = 500
export const PRODUCT_MAX_ELEMENTS = 20000

/** Categories that are not physical elements of a product. */
export const NOT_PRODUCT = /^IFC(PROPERTY|QUANTITY|ELEMENTQUANTITY|MATERIAL|REL|OWNERHISTORY|PERSON|ORGANIZATION|APPLICATION|PROJECT$|SITE$|BUILDING$|BUILDINGSTOREY$|SPACE$|FACILITY|BRIDGE$|ROAD$|RAILWAY$|ANNOTATION|GRID|OPENINGELEMENT|VIRTUALELEMENT|COMPLEXPROPERTY|CLASSIFICATION|GROUP|SYSTEM|ZONE|.*TYPE$|.*STYLE$|.*PROFILE|.*CONTEXT|.*REPRESENTATION|.*UNIT|.*VALUE|.*PLACEMENT|.*POINT|.*DIRECTION)/i

export interface CollectProductOptions extends ProductDataOptions {
  maxElements?: number
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function collectProductData(models: SteelCollectModel[], opts: CollectProductOptions = {}): Promise<ProductData> {
  const max = opts.maxElements && opts.maxElements > 0 ? opts.maxElements : PRODUCT_MAX_ELEMENTS
  const builder = new ProductDataBuilder(opts)
  const plan: Array<{ model: SteelCollectModel; ids: number[] }> = []
  let total = 0
  for (const model of models) {
    let byCat: Record<string, number[]> = {}
    try { byCat = await raceAbort(model.fragments.getItemsOfCategories([/^IFC/i]), opts.signal) } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      continue
    }
    const ids = [...new Set(Object.entries(byCat).filter(([cat]) => !NOT_PRODUCT.test(cat)).flatMap(([, v]) => v))]
    const room = max - total
    if (ids.length > room) builder.truncated = true
    const take = ids.slice(0, Math.max(0, room))
    if (take.length) { plan.push({ model, ids: take }); total += take.length }
  }
  opts.onProgress?.(0, total)
  let done = 0
  for (const { model, ids } of plan) {
    const units = await unitsOf(model.fragments)
    for (let b = 0; b < ids.length; b += PRODUCT_BATCH) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const batch = ids.slice(b, b + PRODUCT_BATCH)
      let data: unknown[] = []
      try { data = await raceAbort(model.fragments.getItemsData(batch, ITEM_DATA_CONFIG), opts.signal) } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e
        data = []
      }
      for (const raw of data) {
        if (raw && typeof raw === 'object') builder.add(parseItemData(raw as Record<string, unknown>, units), units)
      }
      done += batch.length
      opts.onProgress?.(done, total)
      await tick()
    }
  }
  return builder.result()
}
