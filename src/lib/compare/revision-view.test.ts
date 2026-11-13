import { describe, it, expect } from 'vitest'
import type { RevisionChange } from './revision-types'
import {
  EMPTY_FILTER, facets, filterChanges, parseMarks, readableClass, reviewCounts, reviewKey, reviewPrefix,
  sortByImpact, tableRows, kindColour, GROUP_COLOUR,
} from './revision-view'
import { planRevisionOverlay, locateRevision } from './overlay'

function ch(p: Partial<RevisionChange> & Pick<RevisionChange, 'globalId' | 'kind'>): RevisionChange {
  return {
    status: p.kind === 'added' ? 'added' : p.kind === 'removed' ? 'removed' : 'modified',
    ifcClass: 'IFCCOLUMN', name: null, storey: 'L1', changes: [], kinds: [p.kind],
    match: { method: 'guid', confidence: 1, baseGlobalIds: [p.globalId], headGlobalIds: [p.globalId] },
    summary: { key: p.kind, params: {} },
    ...p,
  } as RevisionChange
}

const MOVED = ch({ globalId: 'm', kind: 'moved', baseFile: 'a.ifc', headFile: 'a.ifc', baseExpressId: 1, headExpressId: 11, delta: { move: [-0.12, 0, 0], moveDistance: 0.12, direction: 'W' } })
const MOVED_BIG = ch({ globalId: 'm2', kind: 'moved', baseFile: 'a.ifc', headFile: 'a.ifc', baseExpressId: 2, headExpressId: 12, delta: { move: [1, 0, 0], moveDistance: 1, direction: 'E' } })
const ADDED = ch({ globalId: 'n', kind: 'added', headFile: 'a.ifc', headExpressId: 13, storey: 'L2' })
const REMOVED = ch({ globalId: 'r', kind: 'removed', baseFile: 's.ifc', baseExpressId: 4, ifcClass: 'IFCBEAM' })
const RESHAPED = ch({ globalId: 'g', kind: 'reshaped', baseFile: 's.ifc', headFile: 's.ifc', baseExpressId: 5, headExpressId: 15, delta: { sizeBefore: [0.3, 0.3, 3], sizeAfter: [0.3, 0.3, 3.2] } })
const PROPS = ch({ globalId: 'p', kind: 'properties_changed', headFile: 'm.ifc', baseFile: 'm.ifc', headExpressId: 16, baseExpressId: 6, changes: [{ category: 'property', key: 'Pset.FireRating', before: 'EI60', after: 'EI90' }] })
const SAME = ch({ globalId: 'u', kind: 'unchanged' })
const ALL = [PROPS, SAME, MOVED, ADDED, RESHAPED, REMOVED, MOVED_BIG]

describe('revision view', () => {
  it('orders by impact and drops unchanged', () => {
    expect(sortByImpact(ALL).map((c) => c.globalId)).toEqual(['r', 'n', 'g', 'm2', 'm', 'p'])
  })
  it('filters by kind, storey, file, class, review and marks', () => {
    const sorted = sortByImpact(ALL)
    const none = new Map()
    expect(filterChanges(sorted, { ...EMPTY_FILTER, kinds: ['moved'] }, none, none).map((c) => c.globalId)).toEqual(['m2', 'm'])
    expect(filterChanges(sorted, { ...EMPTY_FILTER, storey: 'L2' }, none, none).map((c) => c.globalId)).toEqual(['n'])
    expect(filterChanges(sorted, { ...EMPTY_FILTER, file: 's.ifc' }, none, none).map((c) => c.globalId)).toEqual(['r', 'g'])
    expect(filterChanges(sorted, { ...EMPTY_FILTER, cls: 'IFCBEAM' }, none, none).map((c) => c.globalId)).toEqual(['r'])
    const reviews = new Map([['g', 'reviewed' as const]])
    expect(filterChanges(sorted, { ...EMPTY_FILTER, review: 'reviewed' }, none, reviews).map((c) => c.globalId)).toEqual(['g'])
    const marks = new Map([['m', 'C-12'], ['p', 'D-3']])
    expect(filterChanges(sorted, { ...EMPTY_FILTER, marks: 'c-12, d-3' }, marks, none).map((c) => c.globalId)).toEqual(['m', 'p'])
  })
  it('facets and counters', () => {
    const f = facets(sortByImpact(ALL))
    expect(f.files).toEqual(['a.ifc', 'm.ifc', 's.ifc'])
    expect(f.kinds.moved).toBe(2)
    const c = reviewCounts(sortByImpact(ALL), new Map([['m', 'reviewed'], ['g', 'affects_site']]))
    expect(c).toEqual({ total: 6, reviewed: 2, affects: 1 })
  })
  it('keys, marks and classes', () => {
    expect(reviewKey('aa', 'bb', 'G')).toBe('aa:bb:G')
    expect(reviewKey('aa', 'bb', 'G').startsWith(reviewPrefix('aa', 'bb'))).toBe(true)
    expect(parseMarks('C-1\nC-2;  C-3')).toEqual(['c-1', 'c-2', 'c-3'])
    expect(readableClass('IfcWallStandardCase')).toBe('Wall')
    expect(readableClass('IfcBuildingElementProxy')).toBe('Building Element Proxy')
    expect(readableClass('IFCBEAM')).toBe('Beam')
    expect(readableClass('IFCWALLSTANDARDCASE')).toBe('Wall')
    expect(kindColour('type_changed')).toBe(GROUP_COLOUR.reshaped)
  })
  it('before / after rows', () => {
    expect(tableRows(RESHAPED)).toEqual([{ field: 'height', before: '3 000 mm', after: '3 200 mm', delta: '+200 mm' }])
    const m = tableRows(MOVED)
    expect(m[0]).toMatchObject({ field: 'positionX', delta: '−120 mm' })
    expect(m.at(-1)).toMatchObject({ field: 'distance', delta: '120 mm' })
    expect(tableRows(PROPS)).toEqual([{ field: 'raw', label: 'Pset.FireRating', before: 'EI60', after: 'EI90', delta: '' }])
  })
})

describe('planRevisionOverlay', () => {
  const B = { 'a.ifc': 'B-a', 's.ifc': 'B-s', 'm.ifc': 'B-m' }
  const A = { 'a.ifc': 'A-a', 's.ifc': 'A-s', 'm.ifc': 'A-m' }
  const plan = planRevisionOverlay(ALL, B, A)
  it('paints the new element in its colour and the removed one on A', () => {
    expect(plan.paint['B-a']).toEqual({ moved: [11, 12], added: [13] })
    expect(plan.paint['A-s']).toEqual({ removed: [4] })
    expect(plan.paint['B-s']).toEqual({ reshaped: [15] })
    expect(plan.paint['B-m']).toEqual({ properties: [16] })
  })
  it('keeps visible on A only removed and old positions of moved', () => {
    expect(plan.keepVisibleA).toEqual({ 'A-a': [1, 2], 'A-s': [4], 'A-m': [] })
    expect(plan.arrows.map((a) => [a.from.expressId, a.to.expressId])).toEqual([[1, 11], [2, 12]])
  })
  it('locates removed on A and the rest on B', () => {
    expect(locateRevision(REMOVED, B, A)).toEqual({ modelId: 'A-s', expressId: 4 })
    expect(locateRevision(MOVED, B, A)).toEqual({ modelId: 'B-a', expressId: 11 })
  })
})
