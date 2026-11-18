import { describe, expect, it } from 'vitest'
import type { IFCItemData } from '../ifc-item-data'
import {
  aggregateProgress, aggregateProgressChunked, compareSnapshots, extractQuantities, NO_GROUP, progressCsv, progressKey,
  progressTotals, recordFraction, setProgress, stateFromRecords, takeSnapshot, targetsByStatus, type ProgressElement,
} from './progress'
import { PROGRESS_COLORS, progressBatches } from './progress-colors'
import { PROGRESS_TEXTS } from './progress-i18n'

const el = (id: number, storey: string | null, cls = 'IFCWALL', volume?: number): ProgressElement =>
  ({ modelId: 'm1', expressId: id, globalId: `G${id}`, ifcClass: cls, name: `E${id}`, storey, volume })

const elements = [el(1, 'L0', 'IFCWALL', 10), el(2, 'L0', 'IFCSLAB', 30), el(3, 'L1', 'IFCWALL'), el(4, null, 'IFCCOLUMN')]

describe('setProgress', () => {
  it('bulk sets a selection without mutating the input', () => {
    const s0 = new Map()
    const s1 = setProgress(s0, elements.slice(0, 2), { status: 'done', date: '2026-11-01' })
    expect(s0.size).toBe(0)
    expect(s1.size).toBe(2)
    expect(s1.get(progressKey('m1', 'G1', 1))).toMatchObject({ status: 'done', percent: 100, date: '2026-11-01' })
  })
  it('clamps percent and forces 0 for not_started', () => {
    const s = setProgress(new Map(), [elements[0]], { status: 'in_progress', percent: 140 })
    expect(s.get(progressKey('m1', 'G1', 1))?.percent).toBe(100)
    const n = setProgress(s, [elements[0]], { status: 'not_started', percent: 50 })
    expect(recordFraction(n.get(progressKey('m1', 'G1', 1)))).toBe(0)
  })
  it('keys elements without GlobalId by expressId', () => {
    const s = setProgress(new Map(), [{ modelId: 'm', expressId: 9, globalId: null }], { status: 'done' })
    expect(s.has(progressKey('m', null, 9))).toBe(true)
  })
})

describe('aggregateProgress', () => {
  const state = setProgress(setProgress(new Map(), [elements[0]], { status: 'done' }), [elements[1]], { status: 'in_progress', percent: 50 })
  it('per storey by count and volume, no-storey last', () => {
    const rows = aggregateProgress(elements, state, 'storey')
    expect(rows.map((r) => r.key)).toEqual(['L0', 'L1', NO_GROUP])
    const l0 = rows[0]
    expect(l0).toMatchObject({ total: 2, done: 1, inProgress: 1, notStarted: 0 })
    expect(l0.percentCount).toBeCloseTo(75)
    expect(l0.percentVolume).toBeCloseTo(((10 + 15) / 40) * 100)
    expect(rows[1].percentVolume).toBeNull()
  })
  it('per class and totals', () => {
    const rows = aggregateProgress(elements, state, 'ifcClass')
    expect(rows.find((r) => r.key === 'IFCWALL')).toMatchObject({ total: 2, done: 1 })
    const tot = progressTotals(rows)
    expect(tot.total).toBe(4)
    expect(tot.percentCount).toBeCloseTo(37.5)
  })
  it('chunked gives the same result on 120k elements', async () => {
    const big: ProgressElement[] = []
    for (let i = 0; i < 120_000; i++) big.push(el(i, `L${i % 10}`))
    const s = setProgress(new Map(), big.filter((_, i) => i % 3 === 0), { status: 'done' })
    const t0 = performance.now()
    const sync = aggregateProgress(big, s, 'storey')
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(await aggregateProgressChunked(big, s, 'storey', { chunk: 10_000 })).toEqual(sync)
    expect(progressTotals(sync).done).toBe(40_000)
  })
  it('chunked aborts', async () => {
    const ac = new AbortController(); ac.abort()
    await expect(aggregateProgressChunked(elements, new Map(), 'storey', { signal: ac.signal })).rejects.toThrow()
  })
})

describe('snapshots', () => {
  it('compares two dates per group', () => {
    const s1 = setProgress(new Map(), [elements[0]], { status: 'done' })
    const snapA = takeSnapshot(s1, '2026-10-31')
    const s2 = setProgress(s1, [elements[1], elements[2]], { status: 'done' })
    const snapB = takeSnapshot(s2, '2026-11-30', 'Nov')
    expect(snapB.label).toBe('Nov')
    const d = compareSnapshots(elements, snapA, snapB, 'storey')
    const l0 = d.find((x) => x.key === 'L0')!
    expect(l0.percentFrom).toBeCloseTo(50); expect(l0.percentTo).toBeCloseTo(100); expect(l0.changed).toBe(1)
    expect(l0.deltaVolume).toBeCloseTo(75)
    expect(d.find((x) => x.key === 'L1')!.delta).toBeCloseTo(100)
    expect(stateFromRecords(snapB.records).size).toBe(3)
  })
})

describe('progressCsv', () => {
  it('writes storey/class/name/status/date and escapes formulas', () => {
    const els = [el(1, 'L0'), { ...el(2, 'L1'), name: '=cmd' }]
    const s = setProgress(new Map(), [els[0]], { status: 'done', date: '2026-11-01', note: 'a, b' })
    const lines = progressCsv(els, s).trim().split('\r\n')
    expect(lines[0]).toBe('storey,class,name,globalId,model,status,percent,date,note,volume_m3,area_m2')
    expect(lines[1]).toBe('L0,IFCWALL,E1,G1,m1,done,100,2026-11-01,"a, b",,')
    expect(lines[2]).toContain("'=cmd")
    expect(lines[2]).toContain('not_started')
    expect(progressCsv(els, s, { onlyTracked: true }).trim().split('\r\n')).toHaveLength(2)
  })
})

describe('extractQuantities', () => {
  const item = (q: IFCItemData['quantitySets'], p: IFCItemData['propertySets'] = []): IFCItemData =>
    ({ quantitySets: q, propertySets: p, typeProperties: [] } as unknown as IFCItemData)
  it('prefers Qto_*BaseQuantities NetVolume', () => {
    const r = extractQuantities(item([
      { expressId: 1, name: 'Other', quantities: [{ expressId: 2, name: 'NetVolume', value: 9, quantityType: 'Volume' }] },
      { expressId: 3, name: 'Qto_WallBaseQuantities', quantities: [
        { expressId: 4, name: 'GrossVolume', value: 5, quantityType: 'Volume' },
        { expressId: 5, name: 'NetVolume', value: 4, quantityType: 'Volume' },
        { expressId: 6, name: 'NetSideArea', value: 12, quantityType: 'Area' },
      ] },
    ]))
    expect(r).toEqual({ volume: 4, area: 12 })
  })
  it('falls back to property sets, then null', () => {
    const r = extractQuantities(item([], [{ name: 'Tekla Quantity', properties: [{ name: 'Volume', value: '2,5 m3' }] }] as unknown as IFCItemData['propertySets']))
    expect(r.volume).toBe(2.5)
    expect(r.area).toBeNull()
  })
})

describe('colours and texts', () => {
  it('maps statuses to colour batches', () => {
    const s = stateFromRecords([
      { modelId: 'm', globalId: 'a', expressId: 1, status: 'done' },
      { modelId: 'm', globalId: 'b', expressId: 2, status: 'in_progress', percent: 20 },
      { modelId: 'm', globalId: 'c', expressId: 3, status: 'done' },
    ])
    const b = progressBatches(s).get('m')!
    expect(b.get(PROGRESS_COLORS.done)).toEqual([1, 3])
    expect(b.get(PROGRESS_COLORS.in_progress)).toEqual([2])
    expect(targetsByStatus(s).done).toEqual([{ modelId: 'm', expressId: 1 }, { modelId: 'm', expressId: 3 }])
  })
  it('has ten languages with the core keys', () => {
    expect(Object.keys(PROGRESS_TEXTS)).toHaveLength(10)
    for (const d of Object.values(PROGRESS_TEXTS)) expect(d.title).toBeTruthy()
  })
})
