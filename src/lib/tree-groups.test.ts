import { describe, it, expect } from 'vitest'
import { orderTreesByGroups, withGroupRows, type TreeRow } from './tree-groups'
import type { FlatNode, ModelTreeSource } from './spatial-tree'

const tree = (modelId: string): ModelTreeSource => ({ modelId, tree: [] })
const header = (modelId: string): FlatNode => ({ kind: 'model-header', modelId, fileName: modelId, nodeCount: 1, isCollapsed: false })
const row = (modelId: string): FlatNode => ({
  kind: 'spatial', depth: 0, key: `${modelId}:1`, isExpanded: false, hasChildren: false, modelId,
  node: { expressId: 1, name: 'n', type: 'IfcSite', children: [], containedElements: [] } as never,
})
const kinds = (rows: TreeRow[]): string[] => rows.map((r) => (r.kind === 'group-header' ? `G:${r.groupId}` : r.kind === 'model-header' ? `M:${r.modelId}` : `r:${r.modelId}`))

describe('orderTreesByGroups', () => {
  it('puts members of a group next to each other', () => {
    const out = orderTreesByGroups([tree('a'), tree('x'), tree('b')], [
      { id: 'g1', label: 'G1', memberIds: ['a', 'b'] }, { id: 'g2', label: 'G2', memberIds: ['x'] },
    ])
    expect(out.map((t) => t.modelId)).toEqual(['a', 'b', 'x'])
  })
})

describe('withGroupRows', () => {
  const groups = [{ id: 'g1', label: 'Vela', memberIds: ['a', 'b'] }, { id: 'g2', label: 'x', memberIds: ['x'] }]
  const flat = [header('a'), row('a'), header('b'), header('x'), row('x')]

  it('adds a header over families only', () => {
    expect(kinds(withGroupRows(flat, groups, new Set()))).toEqual(['G:g1', 'M:a', 'r:a', 'M:b', 'M:x', 'r:x'])
  })

  it('folds a collapsed family behind its header', () => {
    expect(kinds(withGroupRows(flat, groups, new Set(['g1'])))).toEqual(['G:g1', 'M:x', 'r:x'])
  })

  it('a user group of one still gets a header', () => {
    const out = withGroupRows([header('x')], [{ id: 'u', label: 'Mine', memberIds: ['x'], user: true }], new Set())
    expect(kinds(out)).toEqual(['G:u', 'M:x'])
  })

  it('is a no-op without families', () => {
    expect(withGroupRows(flat, [], new Set())).toEqual(flat)
  })
})
