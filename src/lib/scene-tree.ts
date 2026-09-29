// ─── scene-tree ───────────────────────────────────────────────────────────────
// THE SCENE AS THE USER ORGANISED IT.
//
// `model-grouping` guesses which files are one building. It is right most of
// the time and cannot be right always, and a scene that mixes two deliveries
// plus a scan of each needs a person to say what belongs where. This module
// composes the two:
//
//   USER GROUPS  — named, ordered, created by hand. A file or cloud assigned to
//                  one stays there whatever its IFC says. May be empty (a drop
//                  target the user just created).
//   AUTO GROUPS  — what model-grouping infers for every file NOT assigned by
//                  hand. Recomputed as spatial trees arrive.
//   LOOSE        — a file the user explicitly pulled out of every group
//                  (`LOOSE`): its own group of one, never re-absorbed.
//
// Assignments are keyed by a STABLE file key (file name for IFC, `fileKey` for
// clouds), not by the viewer's model id, which carries a load timestamp — so
// an arrangement survives a reload of the same files.
//
// Point clouds do not group themselves: a scan has no IfcProject to read. A
// cloud sits in the group it was assigned to, else in the group of the model it
// was aligned against, else in the "unassigned clouds" tray.
//
// PURE: plain data in, plain data out.

import { groupModels, type ModelDescriptor, type ModelGroup } from './model-grouping'

/** Assignment value meaning "in no group, on its own". */
export const LOOSE = '__loose__'

export interface UserGroup {
  id: string
  name: string
  /** Sort key; user groups list before automatic ones, in this order. */
  order: number
}

export interface SceneModelDesc extends ModelDescriptor {
  /** Stable key assignments are stored under. */
  fileKey: string
}

export interface SceneCloudDesc {
  id: string
  fileKey: string
  /** Model the cloud was aligned against, when there was one. */
  alignedToModelId: string | null
}

export interface SceneTreeGroup extends ModelGroup {
  /** True for a group the user created (renamable, deletable). */
  user: boolean
  cloudIds: string[]
}

export interface SceneTree {
  groups: SceneTreeGroup[]
  /** Clouds in no group. */
  looseCloudIds: string[]
  /** Group id per model id AND per cloud id. */
  groupIdOf: Record<string, string>
}

export interface SceneTreeInput {
  models: ReadonlyArray<SceneModelDesc>
  clouds?: ReadonlyArray<SceneCloudDesc>
  userGroups?: ReadonlyArray<UserGroup>
  /** fileKey → user group id | LOOSE. */
  modelAssign?: Readonly<Record<string, string>>
  /** cloud fileKey → user group id | LOOSE. */
  cloudAssign?: Readonly<Record<string, string>>
}

export function buildSceneTree({
  models, clouds = [], userGroups = [], modelAssign = {}, cloudAssign = {},
}: SceneTreeInput): SceneTree {
  const known = new Map(userGroups.map((g) => [g.id, g]))
  const byUser = new Map<string, string[]>()
  const auto: ModelDescriptor[] = []
  const loose: SceneModelDesc[] = []

  for (const m of models) {
    const a = modelAssign[m.fileKey]
    if (a === LOOSE) loose.push(m)
    // An assignment to a group that no longer exists falls back to automatic
    // grouping rather than stranding the file in a group nobody can see.
    else if (a && known.has(a)) byUser.set(a, [...(byUser.get(a) ?? []), m.id])
    else auto.push({ ...m, userGroupId: null })
  }

  const groups: SceneTreeGroup[] = [...userGroups]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      id: g.id,
      label: g.name,
      memberIds: byUser.get(g.id) ?? [],
      basis: 'user' as const,
      user: true,
      cloudIds: [],
    }))

  // Auto and loose files keep input order among themselves.
  const autoGroups = groupModels(auto).map((g) => ({ ...g, user: false, cloudIds: [] as string[] }))
  const looseGroups = loose.map((m) => ({
    id: `g-${m.id}`, label: m.fileName, memberIds: [m.id], basis: 'single' as const, user: false, cloudIds: [] as string[],
  }))
  const rank = new Map(models.map((m, i) => [m.id, i]))
  groups.push(...[...autoGroups, ...looseGroups].sort(
    (a, b) => (rank.get(a.memberIds[0]) ?? 0) - (rank.get(b.memberIds[0]) ?? 0),
  ))

  const groupIdOf: Record<string, string> = {}
  for (const g of groups) for (const id of g.memberIds) groupIdOf[id] = g.id

  const byId = new Map(groups.map((g) => [g.id, g]))
  const looseCloudIds: string[] = []
  for (const c of clouds) {
    const a = cloudAssign[c.fileKey]
    const target = a === LOOSE
      ? null
      : (a && known.has(a) ? a : null) ?? (c.alignedToModelId ? groupIdOf[c.alignedToModelId] ?? null : null)
    const g = target ? byId.get(target) : undefined
    if (g) { g.cloudIds.push(c.id); groupIdOf[c.id] = g.id } else looseCloudIds.push(c.id)
  }

  return { groups, looseCloudIds, groupIdOf }
}

/** Next free order value, so a new group lands at the bottom of the user groups. */
export function nextOrder(groups: ReadonlyArray<UserGroup>): number {
  return groups.reduce((m, g) => Math.max(m, g.order), -1) + 1
}

/**
 * Swap a user group with its neighbour. Returns the new order map; unknown id
 * or a move off either end returns the input unchanged.
 */
export function moveGroup(groups: ReadonlyArray<UserGroup>, id: string, dir: -1 | 1): UserGroup[] {
  const sorted = [...groups].sort((a, b) => a.order - b.order)
  const i = sorted.findIndex((g) => g.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sorted.length) return [...groups]
  const oi = sorted[i].order
  sorted[i] = { ...sorted[i], order: sorted[j].order }
  sorted[j] = { ...sorted[j], order: oi }
  return sorted
}
