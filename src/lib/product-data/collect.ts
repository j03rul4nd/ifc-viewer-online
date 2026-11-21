// ─── collect product data ─────────────────────────────────────────────────────
// Reads the physical elements of the loaded models through fragments in
// batches (a yield between each, so the viewer stays responsive on big
// models), parses each record and feeds ProductDataBuilder. Same reading path
// as the steel takeoff.

import { ITEM_DATA_CONFIG, parseItemData } from '../ifc-item-data'
import { raceAbort, unitsOf, type SteelCollectModel } from '../steel/collect'
import { FootprintAccumulator, type BoxLike } from './bbox'
import { ProductDataBuilder, type ProductData, type ProductDataOptions } from './extract'
import { RoomScheduleBuilder } from './rooms'
import { ClassificationBuilder } from './classification'

/** Spaces also need their storey (IfcRelAggregates), which elements read from ContainedInStructure. */
export const SPACE_DATA_CONFIG = {
  ...ITEM_DATA_CONFIG,
  relations: { ...ITEM_DATA_CONFIG.relations, Decomposes: { attributes: true, relations: false } },
}
export const ROOMS_MAX = 2000

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

/** A fragments model that can also give world boxes (FragmentsModel.getBoxes). */
export interface ProductCollectModel extends SteelCollectModel {
  fragments: SteelCollectModel['fragments'] & { getBoxes?(ids: number[]): Promise<Array<BoxLike | null>> }
}

export async function collectProductData(models: ProductCollectModel[], opts: CollectProductOptions = {}): Promise<ProductData> {
  const max = opts.maxElements && opts.maxElements > 0 ? opts.maxElements : PRODUCT_MAX_ELEMENTS
  const builder = new ProductDataBuilder(opts)
  const foot = new FootprintAccumulator()
  const classes = new ClassificationBuilder()
  const plan: Array<{ model: ProductCollectModel; ids: number[] }> = []
  const spaces: Array<{ model: ProductCollectModel; ids: number[] }> = []
  let spaceCount = 0
  let spacesCut = false
  let total = 0
  for (const model of models) {
    let byCat: Record<string, number[]> = {}
    try { byCat = await raceAbort(model.fragments.getItemsOfCategories([/^IFC/i]), opts.signal) } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      continue
    }
    const sp = [...new Set(Object.entries(byCat).filter(([cat]) => /^IFCSPACE$/i.test(cat)).flatMap(([, v]) => v))]
    if (sp.length > ROOMS_MAX - spaceCount) spacesCut = true
    const spTake = sp.slice(0, Math.max(0, ROOMS_MAX - spaceCount))
    if (spTake.length) { spaces.push({ model, ids: spTake }); spaceCount += spTake.length }
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
        if (!raw || typeof raw !== 'object') continue
        const item = parseItemData(raw as Record<string, unknown>, units)
        builder.add(item, units)
        classes.add(item)
      }
      // Boxes per batch, after load; only the corners' hull is kept, the Box3s are dropped.
      if (model.fragments.getBoxes) {
        try { foot.add(await raceAbort(model.fragments.getBoxes(batch), opts.signal)) } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') throw e
        }
      }
      done += batch.length
      opts.onProgress?.(done, total)
      await tick()
    }
  }
  builder.bbox = foot.dimensions()
  const out = builder.result()
  classes.truncated = classes.truncated || builder.truncated
  out.classifications = classes.result()
  out.rooms = spaces.length ? await collectRooms(spaces, spacesCut, opts.signal) : null
  return out
}

/** IfcSpace rows, in batches; a failed batch is skipped, never the whole read. */
async function collectRooms(spaces: Array<{ model: ProductCollectModel; ids: number[] }>, truncated: boolean, signal?: AbortSignal) {
  const rooms = new RoomScheduleBuilder()
  rooms.truncated = truncated
  for (const { model, ids } of spaces) {
    const units = await unitsOf(model.fragments)
    for (let b = 0; b < ids.length; b += PRODUCT_BATCH) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const batch = ids.slice(b, b + PRODUCT_BATCH)
      let data: unknown[] = []
      let boxes: Array<BoxLike | null> = []
      try { data = await raceAbort(model.fragments.getItemsData(batch, SPACE_DATA_CONFIG), signal) } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e
      }
      if (model.fragments.getBoxes) {
        try { boxes = await raceAbort(model.fragments.getBoxes(batch), signal) } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') throw e
        }
      }
      data.forEach((raw, i) => {
        if (!raw || typeof raw !== 'object') return
        const bx = boxes[i]
        const box = bx ? { w: bx.max.x - bx.min.x, d: bx.max.z - bx.min.z, h: bx.max.y - bx.min.y } : null
        rooms.add(parseItemData(raw as Record<string, unknown>, units), units, { modelId: model.id, expressId: batch[i] }, box)
      })
      await tick()
    }
  }
  return rooms.result()
}
