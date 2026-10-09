// ─── alerts ───────────────────────────────────────────────────────────────────
// "Tell me when a Bicing station has been empty for 10 minutes", "when a street
// section goes into congestion". A rule is the same condition a style group
// uses, plus how long it must hold. Pure: the runner feeds it each new dataset
// and the clock; it answers which features are alerting and which just started.
//
// "How long" follows a feature by its IDENTITY across refreshes (live-feed's
// featureKey), not its index — feeds reorder. A feature that leaves the
// condition, or the feed, starts over.

import type { FlatProp } from '../twin/flatten-props'
import { testFilter, type Filter } from './style-groups'

export interface AlertRule {
  id: string
  name: string
  match: 'all' | 'any'
  filters: Filter[]
  /** Minutes the condition must hold before it alerts (0 = at once). */
  forMin: number
  enabled: boolean
}

/** Since when each feature (by key) has met each rule. */
export type AlertMemory = Map<string, Map<string, number>>

export interface AlertHit {
  ruleId: string
  /** Feature indices in the dataset that was evaluated. */
  indices: number[]
}

export interface AlertResult {
  active: AlertHit[]
  /** Features that crossed into alert in THIS evaluation (for a notification). */
  started: AlertHit[]
}

let seq = 0
export const newAlertId = (): string => `a${Date.now().toString(36)}${(seq++).toString(36)}`

export function ruleMatches(props: FlatProp[], r: AlertRule): boolean {
  if (r.filters.length === 0) return false
  return r.match === 'all' ? r.filters.every((f) => testFilter(props, f)) : r.filters.some((f) => testFilter(props, f))
}

/**
 * Evaluate rules on one dataset at time `now` (ms). `memory` is updated in
 * place; a feature that was already alerting at the previous evaluation is
 * active but not `started` again.
 */
export function evaluateAlerts(
  rows: FlatProp[][], keys: string[], rules: AlertRule[], now: number, memory: AlertMemory,
): AlertResult {
  const active: AlertHit[] = []
  const started: AlertHit[] = []
  const live = new Set(rules.map((r) => r.id))
  for (const id of [...memory.keys()]) if (!live.has(id)) memory.delete(id)
  for (const r of rules) {
    if (!r.enabled) { memory.delete(r.id); continue }
    const prev = memory.get(r.id) ?? new Map<string, number>()
    const next = new Map<string, number>()
    const hit: number[] = []
    const fresh: number[] = []
    const holdMs = Math.max(0, r.forMin) * 60_000
    for (let i = 0; i < rows.length; i++) {
      if (!ruleMatches(rows[i], r)) continue
      const k = keys[i]
      const since = prev.get(k) ?? now
      next.set(k, since)
      if (now - since >= holdMs) {
        hit.push(i)
        // Started now if, at the previous evaluation, it had not yet held long enough.
        const prevAt = memoryAt.get(memory) ?? -Infinity
        if (!prev.has(k) || prevAt - since < holdMs) fresh.push(i)
      }
    }
    memory.set(r.id, next)
    if (hit.length) active.push({ ruleId: r.id, indices: hit })
    if (fresh.length) started.push({ ruleId: r.id, indices: fresh })
  }
  memoryAt.set(memory, now)
  return { active, started }
}

/** When each memory was last evaluated. */
const memoryAt = new WeakMap<AlertMemory, number>()

// ── Surviving a reload ─────────────────────────────────────────────────────────

/** "Which features were alerting, since when" — small enough to keep per source. */
export interface MemorySnapshot {
  at: number
  rules: Record<string, Array<[string, number]>>
}

/** Cap per rule: the snapshot is for continuity, not an archive. */
const SNAPSHOT_MAX_KEYS = 5000

export function memorySnapshot(mem: AlertMemory): MemorySnapshot {
  const rules: MemorySnapshot['rules'] = {}
  for (const [ruleId, m] of mem) rules[ruleId] = [...m.entries()].slice(0, SNAPSHOT_MAX_KEYS)
  return { at: memoryAt.get(mem) ?? Date.now(), rules }
}

/**
 * A memory rebuilt from a snapshot, as if the previous evaluation had just run
 * at `snap.at`: what was already alerting then is not "started" again.
 */
export function memoryFromSnapshot(snap: MemorySnapshot): AlertMemory {
  const mem: AlertMemory = new Map()
  for (const [ruleId, entries] of Object.entries(snap.rules)) mem.set(ruleId, new Map(entries))
  memoryAt.set(mem, snap.at)
  return mem
}
