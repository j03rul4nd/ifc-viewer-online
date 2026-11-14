import { describe, it, expect } from 'vitest'
import { collectSteelParts, steelRows, steelTotals, STEEL_BATCH, type SteelFragmentsLike } from './collect'

const v = (value: unknown, type?: string) => ({ value, ...(type ? { type } : {}) })
const item = (cat: string, id: number, attrs: Record<string, unknown> = {}) => ({ _category: v(cat), _localId: v(id), _guid: v(`g${id}`), ...attrs })
const sv = (id: number, name: string, value: unknown, type: string) =>
  item('IFCPROPERTYSINGLEVALUE', id, { Name: v(name, 'IFCIDENTIFIER'), NominalValue: v(value, type) })
const tekla = (id: number, profile: string, weight?: number) => item('IFCPROPERTYSET', id + 100000, {
  Name: v('Tekla Quantity', 'IFCLABEL'),
  HasProperties: [sv(id + 200000, 'Profile', profile, 'IFCLABEL'), ...(weight !== undefined ? [sv(id + 300000, 'Weight', weight, 'IFCMASSMEASURE')] : [])],
})

function fakeModel(byCat: Record<string, number[]>, records: Map<number, unknown>): SteelFragmentsLike & { calls: number[][] } {
  const calls: number[][] = []
  return {
    calls,
    async getItemsOfCategories(cats: RegExp[]) {
      const out: Record<string, number[]> = {}
      for (const [c, ids] of Object.entries(byCat)) if (cats.some((r) => r.test(c))) out[c] = ids
      return out
    },
    async getItemsData(ids: number[]) { calls.push(ids); return ids.map((i) => records.get(i)) },
  }
}

describe('collectSteelParts', () => {
  it('reads steel classes of every model in batches, with modelId + expressId', async () => {
    const recA = new Map<number, unknown>()
    const beams = Array.from({ length: 1200 }, (_, i) => i + 1)
    for (const id of beams) recA.set(id, item('IFCBEAM', id, { Name: v('B'), IsDefinedBy: [tekla(id, 'HEA200', 10)] }))
    recA.set(5000, item('IFCWALL', 5000))
    const a = fakeModel({ IFCBEAM: beams, IFCWALL: [5000] }, recA)
    const recB = new Map<number, unknown>([
      [7, item('IFCPLATE', 7, { IsDefinedBy: [tekla(7, 'PL10')] })],
      [8, item('IFCCOLUMN', 8, { IsDefinedBy: [tekla(8, 'HEA200', 20)] })],
    ])
    const b = fakeModel({ IFCPLATE: [7], IFCCOLUMN: [8] }, recB)
    const progress: Array<[number, number]> = []
    const parts = await collectSteelParts([{ id: 'A', fragments: a }, { id: 'B', fragments: b }], (d, t) => progress.push([d, t]))
    expect(parts).toHaveLength(1202)
    expect(a.calls.filter((c) => c.length > 1).every((c) => c.length <= STEEL_BATCH)).toBe(true)
    expect(a.calls.some((c) => c.includes(5000))).toBe(false)
    expect(parts.find((p) => p.modelId === 'B' && p.localId === 7)).toMatchObject({ profile: 'PL10', weight: null, ifcClass: 'IFCPLATE' })
    expect(progress[progress.length - 1]).toEqual([1202, 1202])

    const rows = steelRows(parts)
    expect(rows[0]).toMatchObject({ profile: 'HEA200', ifcClass: 'IFCBEAM', count: 1200, totalWeight: 12000 })
    expect(rows[0].refs[0]).toEqual({ modelId: 'A', expressId: 1 })
    const plate = rows.find((r) => r.profile === 'PL10')!
    expect(plate.refs).toEqual([{ modelId: 'B', expressId: 7 }])
    expect(steelTotals(rows)).toMatchObject({ count: 1202, totalWeight: 12020, missingWeight: 1 })
  })

  it('geometry profiles fill parts with no other profile, per model', async () => {
    const rec = new Map<number, unknown>([[3, item('IFCCOLUMN', 3)], [4, item('IFCPLATE', 4, { ObjectType: v('PL20') })]])
    const m = fakeModel({ IFCCOLUMN: [3], IFCPLATE: [4] }, rec)
    const asked: string[] = []
    const parts = await collectSteelParts([{ id: 'A', fragments: m }], undefined, undefined, async (id) => { asked.push(id); return new Map([[3, 'HEA200'], [4, 'PL10']]) })
    expect(asked).toEqual(['A'])
    expect(parts.find((p) => p.localId === 3)).toMatchObject({ profile: 'HEA200', profileSource: 'geometry' })
    expect(parts.find((p) => p.localId === 4)).toMatchObject({ profile: 'PL20', profileSource: 'objectType' })
  })

  it('a failing geometry read is skipped', async () => {
    const m = fakeModel({ IFCCOLUMN: [3] }, new Map([[3, item('IFCCOLUMN', 3)]]))
    const parts = await collectSteelParts([{ id: 'A', fragments: m }], undefined, undefined, async () => { throw new Error('no buffer') })
    expect(parts).toHaveLength(1)
  })

  it('empty when no model has steel', async () => {
    expect(await collectSteelParts([{ id: 'A', fragments: fakeModel({ IFCWALL: [1] }, new Map()) }])).toEqual([])
  })

  it('honours abort', async () => {
    const ac = new AbortController(); ac.abort()
    const m = fakeModel({ IFCBEAM: [1] }, new Map([[1, item('IFCBEAM', 1)]]))
    await expect(collectSteelParts([{ id: 'A', fragments: m }], undefined, ac.signal)).rejects.toThrow()
  })
})
