// Persisted keys must survive a reload: the runtime model id changes on every
// load (`<file>-<timestamp>`), so nothing stored may depend on it.
import { describe, expect, it } from 'vitest'
import { applyStates, buildUnits, normalizeUnitId, statesOf, type SpaceRecord, type ZoneRecord } from './units'
import { createHandover, markItem, sanitizeHandover } from './handover'
import { migrateSnag } from './snag-store'
import { createSnag, unitLabels } from './snags'
import { progressKey, rebindState, setProgress, stateFromRecords } from './progress'
import { locateTarget } from './locate'

const spaces: SpaceRecord[] = [
  { expressId: 1, globalId: '2O2Fr$t4X7Zf8NOew3FLOH', name: 'Salon', longName: null, storey: 'P1', quantitySets: [] },
  { expressId: 2, globalId: '1hOSvn6df7F8_7GcBWlRGQ', name: 'Cocina', longName: null, storey: 'P1', quantitySets: [] },
  { expressId: 3, globalId: null, name: 'Trastero', longName: null, storey: 'S1', quantitySets: [] },
]
const zones: ZoneRecord[] = [{ expressId: 9, globalId: '0zoneGUID000000000000Z', name: '1A', longName: null, memberIds: [1, 2] }]
const LOAD1 = 'Ifc2x3_Duplex_Architecture.ifc-1795042037165'
const LOAD2 = 'Ifc2x3_Duplex_Architecture.ifc-1795099999999'

describe('stable unit ids', () => {
  it('are equal when the same file is loaded twice with different model ids', () => {
    const a = buildUnits(LOAD1, spaces, zones)
    const b = buildUnits(LOAD2, spaces, zones)
    expect(a.map((u) => u.id)).toEqual(b.map((u) => u.id))
    expect(a.map((u) => u.id)).toEqual(['0zoneGUID000000000000Z', '~S1/Trastero'])
    expect(a.every((u) => !u.id.includes(LOAD1))).toBe(true)
  })

  it('statuses saved in one load apply in the next', () => {
    const a = buildUnits(LOAD1, spaces, zones).map((u) => (u.name === '1A' ? { ...u, status: 'delivered' as const, buyer: 'Ana' } : u))
    const stored = JSON.parse(JSON.stringify(statesOf(a)))
    const b = applyStates(buildUnits(LOAD2, spaces, zones), stored)
    expect(b.find((u) => u.name === '1A')).toMatchObject({ status: 'delivered', buyer: 'Ana' })
  })

  it('reads records saved with the old `<modelId>:<GlobalId>` keys', () => {
    expect(normalizeUnitId(`${LOAD1}:0zoneGUID000000000000Z`)).toBe('0zoneGUID000000000000Z')
    expect(normalizeUnitId('0zoneGUID000000000000Z')).toBe('0zoneGUID000000000000Z')
    expect(normalizeUnitId('~P1/Hab: 2')).toBe('~P1/Hab: 2')
    const b = applyStates(buildUnits(LOAD2, spaces, zones), { [`${LOAD1}:0zoneGUID000000000000Z`]: { status: 'sold' } })
    expect(b[0].status).toBe('sold')
  })

  it('migrates handovers and snags stored with the old unit key', () => {
    const [u] = buildUnits(LOAD1, spaces, zones)
    const h = createHandover({ ...u, id: `${LOAD1}:${u.id}` }, new Date('2026-11-18T10:00:00Z'), 'h1')
    expect(sanitizeHandover(JSON.parse(JSON.stringify(h)))!.unitId).toBe(u.id)
    const s = createSnag({ title: 'x', unitId: `${LOAD1}:${u.id}` })
    expect(migrateSnag(s).unitId).toBe(u.id)
    expect(migrateSnag(createSnag({ title: 'y' })).unitId).toBeUndefined()
  })

  it('handover snags carry the unit name for display', () => {
    const [u] = buildUnits(LOAD1, spaces, zones)
    const h = createHandover(u, new Date('2026-11-18T10:00:00Z'), 'h1')
    const { snag } = markItem(h, h.checklist[0].id, 'defect')
    expect(snag).toMatchObject({ unitId: u.id, unitName: '1A' })
    expect(unitLabels([snag!, createSnag({ title: 'z', unitId: 'raw' })])).toEqual(new Map([[u.id, '1A'], ['raw', 'raw']]))
  })
})

describe('stable progress keys', () => {
  it('key by GlobalId, so records from an earlier load still match', () => {
    expect(progressKey(LOAD1, 'G1', 5)).toBe(progressKey(LOAD2, 'G1', 5))
    const saved = [...setProgress(new Map(), [{ modelId: LOAD1, expressId: 5, globalId: 'G1' }], { status: 'done' }).values()]
    const st = stateFromRecords(JSON.parse(JSON.stringify(saved)))
    expect(st.get(progressKey(LOAD2, 'G1', 5))?.status).toBe('done')
    // Old records were keyed `<modelId>\0<GlobalId>`; rebuilt from records, they use the new key.
    const rebound = rebindState(st, [{ modelId: LOAD2, expressId: 7, globalId: 'G1' }])
    expect(rebound.get('G1')).toMatchObject({ modelId: LOAD2, expressId: 7, status: 'done' })
    expect(rebindState(rebound, [{ modelId: LOAD2, expressId: 7, globalId: 'G1' }])).toBe(rebound)
  })
})

describe('snag locations across reloads', () => {
  it('resolves by GlobalId, and falls back from a stale model id', () => {
    const els = [{ modelId: LOAD2, expressId: 70, globalId: 'G7' }]
    expect(locateTarget({ modelId: LOAD1, expressId: 7, globalId: 'G7' }, els)).toEqual({ modelId: LOAD2, expressId: 70 })
    expect(locateTarget({ modelId: LOAD1, expressId: 7 }, els, LOAD2)).toEqual({ modelId: LOAD2, expressId: 7 })
  })
})
