import { describe, expect, it, vi } from 'vitest'
import { collectProgressElements, PROGRESS_BATCH, type ProgressFragmentsLike } from './progress-collect'

const v = (value: unknown) => ({ value })
const raw = (id: number) => ({ _category: v('IFCWALL'), _localId: v(id), _guid: v(`g${id}`), Name: v(`W${id}`) })

function fake(n: number): ProgressFragmentsLike & { getItemsData: ReturnType<typeof vi.fn> } {
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  return {
    getItemsIdsWithGeometry: async () => ids,
    getItemsData: vi.fn(async (batch: number[]) => batch.map(raw)),
  }
}

describe('collectProgressElements', () => {
  it('reads every element in batches and reports progress', async () => {
    const f = fake(PROGRESS_BATCH + 3)
    const seen: Array<[number, number]> = []
    const out = await collectProgressElements([{ id: 'm', fragments: f }], (d, t) => seen.push([d, t]))
    expect(out).toHaveLength(PROGRESS_BATCH + 3)
    expect(out[0]).toMatchObject({ modelId: 'm', expressId: 1, ifcClass: 'IFCWALL' })
    expect(f.getItemsData).toHaveBeenCalledTimes(2)
    expect(seen[seen.length - 1]).toEqual([PROGRESS_BATCH + 3, PROGRESS_BATCH + 3])
  })

  it('stops when aborted', async () => {
    const f = fake(PROGRESS_BATCH * 3)
    const ac = new AbortController()
    const p = collectProgressElements([{ id: 'm', fragments: f }], (d) => { if (d >= PROGRESS_BATCH) ac.abort() }, ac.signal)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.getItemsData.mock.calls.length).toBeLessThan(3)
  })
})
