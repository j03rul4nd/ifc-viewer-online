import { describe, expect, it } from 'vitest'
import { buildModelNameIndex } from './name-scope-index'
import type { SpatialElement, SpatialNode } from '../../types'

const el = (expressId: number, name: string, ifcClass = 'IfcWall', parts?: SpatialElement[]): SpatialElement =>
  ({ expressId, globalId: `g${expressId}`, ifcClass, name, ...(parts ? { parts } : {}) })

const node = (
  expressId: number, ifcClass: string, name: string,
  children: SpatialNode[] = [], containedElements: SpatialElement[] = [],
): SpatialNode => ({ expressId, globalId: `g${expressId}`, ifcClass, name, children, containedElements })

// Site 1 › Building 2 › Level 1 (#3) › Space 4 (contains a desk #20)
//                      › Level 1 contains wall #10 and stair #11 with flight #12
//                      › Level 2 (#5, unnamed) contains #13 (unnamed element)
const TREE: SpatialNode[] = [
  node(1, 'IfcSite', 'Site', [
    node(2, 'IfcBuilding', 'Building', [
      node(3, 'IfcBuildingStorey', 'Level 1', [
        node(4, 'IfcSpace', 'Office 101', [], [el(20, 'Desk', 'IfcFurnishingElement')]),
      ], [
        el(10, 'Wall A'),
        el(11, 'Stair', 'IfcStair', [el(12, 'Flight', 'IfcStairFlight')]),
      ]),
      node(5, 'IfcBuildingStorey', '(unnamed)', [], [el(13, '#13')]),
    ]),
  ]),
]

describe('buildModelNameIndex', () => {
  const idx = buildModelNameIndex(TREE, new Map())

  it('maps everything below a storey to it: space nodes, contained elements, parts', () => {
    expect(idx.storeyOf.get(4)).toBe(3)
    expect(idx.storeyOf.get(10)).toBe(3)
    expect(idx.storeyOf.get(11)).toBe(3)
    expect(idx.storeyOf.get(13)).toBe(5)
  })

  it('an element contained in a space, and a stair flight, resolve to the storey', () => {
    expect(idx.storeyOf.get(20)).toBe(3)
    expect(idx.storeyOf.get(12)).toBe(3)
  })

  it('the storey itself and everything above it have no storey', () => {
    expect(idx.storeyOf.has(3)).toBe(false)
    expect(idx.storeyOf.has(2)).toBe(false)
    expect(idx.storeyOf.has(1)).toBe(false)
  })

  it('reads the tree fallbacks as no name, and leaves them out of taken', () => {
    expect(idx.nameOf.get(5)).toBe('')
    expect(idx.nameOf.get(13)).toBe('')
    expect(idx.taken.has('(unnamed)')).toBe(false)
    expect(idx.taken.has('#13')).toBe(false)
    expect(idx.nameOf.get(10)).toBe('Wall A')
  })

  it('normalises taken (trim + lower case)', () => {
    const withSpaces = buildModelNameIndex([node(3, 'IfcBuildingStorey', 'L1', [], [el(10, '  Wall A ')])], new Map())
    expect(withSpaces.taken.has('wall a')).toBe(true)
    expect(withSpaces.nameOf.get(10)).toBe('  Wall A ')
  })

  it('pending names override the current name; the old one stays taken', () => {
    const withPending = buildModelNameIndex(TREE, new Map([[10, 'Renamed Wall'], [13, 'Was Empty']]))
    expect(withPending.nameOf.get(10)).toBe('Renamed Wall')
    expect(withPending.nameOf.get(13)).toBe('Was Empty')
    expect(withPending.taken.has('renamed wall')).toBe(true)
    expect(withPending.taken.has('was empty')).toBe(true)
    expect(withPending.taken.has('wall a')).toBe(true)
  })
})
