// ─── Element index for the progress panel ─────────────────────────────────────
// Every element with geometry of every loaded model, read through fragments in
// batches (getItemsData + parseItemData) with a yield between batches, exactly
// like the steel takeoff collector: the viewer stays responsive, progress is
// reported, and an AbortSignal stops it when the models change.

import { ITEM_DATA_CONFIG, parseItemData } from '../ifc-item-data'
import { raceAbort } from '../steel/collect'
import { toProgressElement, type ProgressElement } from './progress'

export const PROGRESS_BATCH = 500

export interface ProgressFragmentsLike {
  getItemsIdsWithGeometry(): Promise<number[]>
  getItemsData(ids: number[], config: unknown): Promise<unknown[]>
}

export interface ProgressCollectModel { id: string; fragments: ProgressFragmentsLike }

const abortError = (): DOMException => new DOMException('aborted', 'AbortError')
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function collectProgressElements(
  models: readonly ProgressCollectModel[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ProgressElement[]> {
  const plan: Array<{ model: ProgressCollectModel; ids: number[] }> = []
  let total = 0
  for (const model of models) {
    if (signal?.aborted) throw abortError()
    let ids: number[] = []
    try { ids = await raceAbort(model.fragments.getItemsIdsWithGeometry(), signal) } catch (e) {
      if (signal?.aborted) throw e
      continue
    }
    if (ids.length) { plan.push({ model, ids }); total += ids.length }
  }
  onProgress?.(0, total)
  const out: ProgressElement[] = []
  let done = 0
  for (const { model, ids } of plan) {
    for (let b = 0; b < ids.length; b += PROGRESS_BATCH) {
      if (signal?.aborted) throw abortError()
      const batch = ids.slice(b, b + PROGRESS_BATCH)
      let data: unknown[] = []
      try { data = await raceAbort(model.fragments.getItemsData(batch, ITEM_DATA_CONFIG), signal) } catch (e) {
        if (signal?.aborted) throw e
        data = []
      }
      for (let k = 0; k < batch.length; k++) {
        const raw = data[k]
        if (!raw || typeof raw !== 'object') continue
        out.push(toProgressElement(model.id, batch[k], parseItemData(raw as Record<string, unknown>)))
      }
      done += batch.length
      onProgress?.(done, total)
      await tick()
    }
  }
  return out
}
