// ─── tree-groups ──────────────────────────────────────────────────────────────
// The spatial tree sidebar, arranged by scene group.
//
// The sidebar used to list files in load order, so the three files of one
// building could be split by a file of another. This orders the per-model
// trees by the scene groups (see scene-tree) and puts a group row above each
// family, which can fold the whole family away.
//
// Kept apart from `spatial-tree` so the flat list the virtualiser and the
// reveal-scroll both index stays one function: both call `withGroupRows`, and
// an index computed by one is valid in the other.

import type { FlatNode, ModelTreeSource } from './spatial-tree'

export interface TreeGroupInfo {
  id: string
  label: string
  memberIds: string[]
  /** User-made groups get a header even with one member. */
  user?: boolean
}

export type GroupHeaderRow = {
  kind: 'group-header'
  groupId: string
  label: string
  count: number
  isCollapsed: boolean
}

export type TreeRow = FlatNode | GroupHeaderRow

const isFamily = (g: TreeGroupInfo, present: ReadonlySet<string>): boolean =>
  g.memberIds.filter((id) => present.has(id)).length > (g.user ? 0 : 1)

/** Trees in group order; models in no group keep their place after the grouped ones. */
export function orderTreesByGroups(
  trees: readonly ModelTreeSource[], groups: readonly TreeGroupInfo[],
): ModelTreeSource[] {
  const rank = new Map<string, number>()
  let i = 0
  for (const g of groups) for (const id of g.memberIds) rank.set(id, i++)
  return trees
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => (rank.get(a.t.modelId) ?? 1e9 + a.idx) - (rank.get(b.t.modelId) ?? 1e9 + b.idx))
    .map(({ t }) => t)
}

/**
 * Insert a group row before the first file of each family and drop the rows of
 * collapsed groups. `flat` must come from trees ordered by `orderTreesByGroups`.
 */
export function withGroupRows(
  flat: readonly FlatNode[], groups: readonly TreeGroupInfo[], collapsedGroups: ReadonlySet<string>,
): TreeRow[] {
  const present = new Set(flat.filter((f) => f.kind === 'model-header').map((f) => f.modelId))
  const groupOf = new Map<string, TreeGroupInfo>()
  for (const g of groups) if (isFamily(g, present)) for (const id of g.memberIds) groupOf.set(id, g)
  if (groupOf.size === 0) return [...flat]

  const out: TreeRow[] = []
  let current: TreeGroupInfo | null = null
  for (const f of flat) {
    const g = groupOf.get(f.modelId) ?? null
    if (f.kind === 'model-header' && g !== current) {
      current = g
      if (g) {
        out.push({
          kind: 'group-header',
          groupId: g.id,
          label: g.label,
          count: g.memberIds.filter((id) => present.has(id)).length,
          isCollapsed: collapsedGroups.has(g.id),
        })
      }
    }
    if (g && collapsedGroups.has(g.id)) continue
    out.push(f)
  }
  return out
}
