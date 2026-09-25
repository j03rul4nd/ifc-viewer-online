// ─── Scene group store ────────────────────────────────────────────────────────
// How the USER arranged the scene: named groups, their order, and which file
// or cloud sits in which. Automatic grouping needs none of this — it is only
// the overrides, composed with the inferred groups by `lib/scene-tree`.
//
// Keyed by stable file keys so an arrangement survives a reload of the same
// files. Persisted per device in localStorage (no network, like the rest of
// the scene preferences).

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { LOOSE, moveGroup, nextOrder, type UserGroup } from '../lib/scene-tree'

const LS_KEY = 'ifcv.sceneGroups.v1'

interface Persisted {
  userGroups: UserGroup[]
  modelAssign: Record<string, string>
  cloudAssign: Record<string, string>
}

function read(): Persisted {
  const empty: Persisted = { userGroups: [], modelAssign: {}, cloudAssign: {} }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return empty
    const p = JSON.parse(raw) as Partial<Persisted>
    return {
      userGroups: Array.isArray(p.userGroups)
        ? p.userGroups.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string' && Number.isFinite(g.order))
        : [],
      modelAssign: p.modelAssign && typeof p.modelAssign === 'object' ? p.modelAssign : {},
      cloudAssign: p.cloudAssign && typeof p.cloudAssign === 'object' ? p.cloudAssign : {},
    }
  } catch { return empty }
}

function write(s: Persisted): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ userGroups: s.userGroups, modelAssign: s.modelAssign, cloudAssign: s.cloudAssign }))
  } catch { /* quota / private mode */ }
}

/** Where a file goes: a user group id, LOOSE, or null for "let the file decide". */
export type Assignment = string | typeof LOOSE | null

interface SceneGroupStore extends Persisted {
  /** Create a group, optionally filling it; returns its id. */
  createGroup:   (name: string, modelKeys?: string[], cloudKeys?: string[]) => string
  renameGroup:   (id: string, name: string) => void
  /** Delete a group. Its files go back to automatic grouping, its clouds to their default. */
  deleteGroup:   (id: string) => void
  moveGroup:     (id: string, dir: -1 | 1) => void
  assignModel:   (fileKey: string, to: Assignment) => void
  assignCloud:   (fileKey: string, to: Assignment) => void
  /** Forget every override. */
  resetGroups:   () => void
}

let seq = 0
const newId = (): string => `ug-${Date.now().toString(36)}-${(seq++).toString(36)}`

function setAssign(map: Record<string, string>, key: string, to: Assignment): Record<string, string> {
  const next = { ...map }
  if (to === null) delete next[key]
  else next[key] = to
  return next
}

export const useSceneGroupStore = create<SceneGroupStore>()(
  devtools(
    (set, get) => {
      const commit = (patch: Partial<Persisted>, action: string): void => {
        set(patch, false, action)
        write(get())
      }
      return {
        ...read(),

        createGroup: (name, modelKeys = [], cloudKeys = []) => {
          const id = newId()
          const s = get()
          let modelAssign = s.modelAssign
          for (const k of modelKeys) modelAssign = setAssign(modelAssign, k, id)
          let cloudAssign = s.cloudAssign
          for (const k of cloudKeys) cloudAssign = setAssign(cloudAssign, k, id)
          commit({
            userGroups: [...s.userGroups, { id, name: name.trim() || 'Group', order: nextOrder(s.userGroups) }],
            modelAssign, cloudAssign,
          }, 'createGroup')
          return id
        },

        renameGroup: (id, name) => {
          const trimmed = name.trim()
          if (!trimmed) return
          commit({ userGroups: get().userGroups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)) }, 'renameGroup')
        },

        deleteGroup: (id) => {
          const s = get()
          const drop = (map: Record<string, string>): Record<string, string> =>
            Object.fromEntries(Object.entries(map).filter(([, v]) => v !== id))
          commit({
            userGroups: s.userGroups.filter((g) => g.id !== id),
            modelAssign: drop(s.modelAssign),
            cloudAssign: drop(s.cloudAssign),
          }, 'deleteGroup')
        },

        moveGroup: (id, dir) => commit({ userGroups: moveGroup(get().userGroups, id, dir) }, 'moveGroup'),

        assignModel: (fileKey, to) => commit({ modelAssign: setAssign(get().modelAssign, fileKey, to) }, 'assignModel'),
        assignCloud: (fileKey, to) => commit({ cloudAssign: setAssign(get().cloudAssign, fileKey, to) }, 'assignCloud'),

        resetGroups: () => commit({ userGroups: [], modelAssign: {}, cloudAssign: {} }, 'resetGroups'),
      }
    },
    { name: 'SceneGroupStore', enabled: import.meta.env.DEV },
  ),
)
