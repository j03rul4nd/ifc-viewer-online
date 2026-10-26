// ─── Saved connections in scenes ──────────────────────────────────────────────
// A connection marked "use in new scenes" is switched on in every scene the
// user creates. Each scene can still turn a source off, turn a non-default one
// on, or change how often it refreshes and which records it shows — without
// touching the saved connection. Resolution is one pure function, so the
// scene editor, the workspace and the embed all agree on what a scene loads.

import type { Schedule } from './schedule'

export interface SavedConnectionRef {
  id: string
  name: string
  defaultInNewScenes: boolean
  schedule?: Schedule
}

export interface SceneOverride {
  connectionId: string
  /** undefined = follow the saved default. */
  enabled?: boolean
  schedule?: Schedule
  /** Simple record filter, e.g. "floor = 3" or "status != ok". */
  filter?: string
}

export interface ResolvedSource {
  connectionId: string
  name: string
  enabled: boolean
  schedule?: Schedule
  filter?: string
  /** Where the effective setting comes from, for the "Inherited / Changed here" badge. */
  origin: 'default' | 'scene'
}

export function resolveSceneSources(saved: SavedConnectionRef[], overrides: SceneOverride[]): ResolvedSource[] {
  const byId = new Map(overrides.map((o) => [o.connectionId, o]))
  return saved.map((c) => {
    const o = byId.get(c.id)
    const changed = !!o && (o.enabled !== undefined || o.schedule !== undefined || !!o.filter)
    return {
      connectionId: c.id, name: c.name,
      enabled: o?.enabled ?? c.defaultInNewScenes,
      schedule: o?.schedule ?? c.schedule,
      filter: o?.filter,
      origin: changed ? 'scene' : 'default',
    }
  })
}

/** Overrides that only restate the default are dropped, so "Reset" is just removal. */
export function setOverride(overrides: SceneOverride[], next: SceneOverride, saved: SavedConnectionRef): SceneOverride[] {
  const clean: SceneOverride = { connectionId: next.connectionId }
  if (next.enabled !== undefined && next.enabled !== saved.defaultInNewScenes) clean.enabled = next.enabled
  if (next.schedule) clean.schedule = next.schedule
  if (next.filter?.trim()) clean.filter = next.filter.trim()
  const rest = overrides.filter((o) => o.connectionId !== next.connectionId)
  return Object.keys(clean).length > 1 ? [...rest, clean] : rest
}
