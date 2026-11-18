import { describe, expect, it } from 'vitest'
import {
  applyStates, buildUnits, countByStatus, countByStorey, mergeCsv, normaliseStatus, parseCsv, spaceArea, statesOf, unitsCsv,
  zoneMemberIds, NO_STOREY, type SpaceRecord,
} from './units'
import { sanitizeStates } from './unit-store'
import { colorBatches, STATUS_COLORS } from './unit-colors'
import { UNITS_TEXTS } from './units-i18n'
import type { IFCQuantitySet } from '../ifc-item-data'

const qs = (name: string, q: Record<string, number | null>): IFCQuantitySet => ({
  expressId: 1, name, quantities: Object.entries(q).map(([n, value], i) => ({ expressId: i, name: n, value, quantityType: 'Area' as const })),
})
const sp = (id: number, name: string, storey: string | null, area?: number): SpaceRecord => ({
  expressId: id, globalId: `G${id}`, name, longName: null, storey,
  quantitySets: area === undefined ? [] : [qs('Qto_SpaceBaseQuantities', { NetFloorArea: area })],
})

describe('spaceArea fallback chain', () => {
  it('prefers NetFloorArea', () => {
    expect(spaceArea([qs('Qto_SpaceBaseQuantities', { GrossFloorArea: 90, NetFloorArea: 80 })])).toBe(80)
  })
  it('falls back to GrossFloorArea', () => {
    expect(spaceArea([qs('Qto_SpaceBaseQuantities', { GrossFloorArea: 90, NetFloorArea: null })])).toBe(90)
  })
  it('prefers Qto_SpaceBaseQuantities over other sets', () => {
    expect(spaceArea([qs('Custom', { NetFloorArea: 1 }), qs('Qto_SpaceBaseQuantities', { NetFloorArea: 70 })])).toBe(70)
  })
  it('uses other sets when the base set lacks it', () => {
    expect(spaceArea([qs('Custom', { NetFloorArea: 55 })])).toBe(55)
  })
  it('null when nothing usable', () => {
    expect(spaceArea([])).toBeNull()
    expect(spaceArea([qs('Qto_SpaceBaseQuantities', { Height: 3, NetFloorArea: 0 })])).toBeNull()
  })
})

describe('buildUnits', () => {
  it('one unit per space, zones group spaces and sum areas', () => {
    const spaces = [sp(1, '1A', 'P1', 50), sp(2, '1A-b', 'P1', 20), sp(3, '1B', 'P1')]
    const units = buildUnits('m', spaces, [{ expressId: 9, globalId: 'Z9', name: 'Vivienda 1A', longName: null, memberIds: [1, 2, 99] }])
    expect(units).toHaveLength(2)
    expect(units[0]).toMatchObject({ id: 'Z9', expressIds: [1, 2], area: 70, storey: 'P1', name: 'Vivienda 1A', status: 'available' })
    expect(units[1]).toMatchObject({ id: 'G3', expressIds: [3], area: null })
  })
  it('zone members found under any nested shape', () => {
    const raw = { IsGroupedBy: [{ RelatedObjects: [{ _localId: { value: 1 } }, { _localId: 2 }, { _localId: 7 }] }] }
    expect(zoneMemberIds(raw, new Set([1, 2]))).toEqual([1, 2])
  })
})

describe('CSV', () => {
  const base = buildUnits('m', [sp(1, '1A', 'P1', 50), sp(2, '1B', 'P1', 60), sp(3, '2A', 'P2', 70)])

  it('merges by GlobalId first, then name (case-insensitive), with ; separator and aliases', () => {
    const csv = 'GlobalId;Nombre;Estado;Comprador\nG1;zzz;Vendida;Ana\n;1b;reserved;\n;nope;sold;\nG3;;weird;\n'
    const r = mergeCsv(base, csv)
    expect(r.matched).toBe(2)
    expect(r.unmatched).toEqual(['nope'])
    expect(r.badStatus).toBe(1)
    expect(r.units.map((u) => u.status)).toEqual(['sold', 'reserved', 'available'])
    expect(r.units[0].buyer).toBe('Ana')
  })
  it('ignores a CSV without status column', () => {
    expect(mergeCsv(base, 'Name\n1A\n').matched).toBe(0)
  })
  it('export → import round-trips, with quoting and formula guarding', () => {
    const edited = base.map((u, i) => (i === 0 ? { ...u, status: 'delivered' as const, buyer: 'Pérez, "Juan"', notes: '=HYPERLINK()' } : u))
    const csv = unitsCsv(edited)
    expect(csv.split('\r\n')[0]).toBe('GlobalId,Name,Storey,Area_m2,Status,Buyer,Notes')
    expect(csv).toContain('"Pérez, ""Juan"""')
    expect(csv).toContain("'=HYPERLINK()")
    const back = mergeCsv(base, csv)
    expect(back.matched).toBe(3)
    expect(back.units[0]).toMatchObject({ status: 'delivered', buyer: 'Pérez, "Juan"' })
  })
  it('parses quoted newlines and BOM', () => {
    expect(parseCsv('﻿a,b\n"x\ny",z\n')).toEqual([['a', 'b'], ['x\ny', 'z']])
  })
  it('normalises statuses', () => {
    expect(normaliseStatus(' Postventa ')).toBe('post_sale')
    expect(normaliseStatus('En obra')).toBe('in_works')
    expect(normaliseStatus('foo')).toBeNull()
  })
})

describe('counts and persistence shape', () => {
  const units = applyStates(buildUnits('m', [sp(1, 'A', 'P1'), sp(2, 'B', 'P1'), sp(3, 'C', null)]), {
    'm:G1': { status: 'sold', buyer: 'X' }, 'm:G3': { status: 'reserved' },
  })
  it('counts by status', () => {
    expect(countByStatus(units)).toEqual({ available: 1, reserved: 1, sold: 1, in_works: 0, delivered: 0, post_sale: 0 })
  })
  it('counts by storey', () => {
    const m = countByStorey(units)
    expect([...m.keys()]).toEqual(['P1', NO_STOREY])
    expect(m.get('P1')).toMatchObject({ sold: 1, available: 1 })
  })
  it('statesOf keeps only non-default units; sanitize drops junk', () => {
    expect(Object.keys(statesOf(units))).toEqual(['G1', 'G3'])
    expect(sanitizeStates({ a: { status: 'sold' }, b: { status: 'nope' }, c: null })).toEqual({ a: { status: 'sold' } })
  })
  it('colour batches by model and status', () => {
    const b = colorBatches(units).get('m')!
    expect(b.get(STATUS_COLORS.sold)).toEqual([1])
    expect(b.get(STATUS_COLORS.available)).toEqual([2])
  })
  it('i18n has every key in all 10 languages', () => {
    const keys = Object.keys(UNITS_TEXTS.en)
    for (const l of ['es', 'ca', 'de', 'fr', 'it', 'pt', 'ja', 'zh', 'th']) expect(Object.keys(UNITS_TEXTS[l]).sort()).toEqual([...keys].sort())
  })
})
