// ─── Rule library ↔ workspace (local / cloud data mode) ──────────────────────
// Each rule set of the studio (its versions, review state and comments) is one
// entry of the workspace's rule library (`/rulesets`, kind validator_profile)
// whose content is `{ "studio": 1, "set": … }`. Saving sends the updated_at the
// screen loaded: if someone else saved in between, the server answers 409 with
// its copy and nothing is overwritten — the screen shows both and the person
// chooses. Who may save is the server's decision (standard.edit).

import { paidApi, type PaidError } from '../../../../lib/cloud/paid-client'
import type { RuleSet } from './rules-lib'

export interface Synced { serverId: string; updatedAt: string }
export type SyncMap = Record<string, Synced>

const pack = (set: RuleSet) => JSON.stringify({ studio: 1, set })

export function unpack(content: string): RuleSet | null {
  try {
    const p = JSON.parse(content) as { studio?: number; set?: RuleSet }
    return p.studio === 1 && p.set && Array.isArray(p.set.versions) ? p.set : null
  } catch { return null }
}

export async function loadLibrary(): Promise<{ ok: true; sets: RuleSet[]; sync: SyncMap } | { ok: false; error: PaidError }> {
  const list = await paidApi.rulesets('validator_profile')
  if (!list.ok) return { ok: false, error: list.error }
  const sets: RuleSet[] = []
  const sync: SyncMap = {}
  // In parallel, eight at a time: one by one, a library of 50 took seconds to appear.
  const rows = list.value.rulesets
  const fulls: Awaited<ReturnType<typeof paidApi.ruleset>>[] = []
  for (let i = 0; i < rows.length; i += 8) fulls.push(...await Promise.all(rows.slice(i, i + 8).map((r) => paidApi.ruleset(r.id))))
  for (const [i, row] of rows.entries()) {
    const full = fulls[i]
    if (!full.ok) return { ok: false, error: full.error }
    const set = unpack(full.value.content)
    if (!set) continue // a plain validator profile saved from the viewer, not a studio set
    sets.push(set)
    sync[set.id] = { serverId: row.id, updatedAt: full.value.updated_at }
  }
  return { ok: true, sets, sync }
}

export type SaveResult =
  | { ok: true; synced: Synced }
  | { ok: false; conflict: RuleSet; synced: Synced }
  | { ok: false; error: PaidError }

export async function saveSet(set: RuleSet, known?: Synced): Promise<SaveResult> {
  if (!known) {
    const c = await paidApi.createRuleset(set.name, 'validator_profile', pack(set))
    if (!c.ok) return { ok: false, error: c.error }
    const full = await paidApi.ruleset(c.value.id)
    return full.ok ? { ok: true, synced: { serverId: c.value.id, updatedAt: full.value.updated_at } } : { ok: false, error: full.error }
  }
  const u = await paidApi.updateRuleset(known.serverId, { name: set.name, content: pack(set), if_updated_at: known.updatedAt })
  if (u.ok) return { ok: true, synced: { serverId: known.serverId, updatedAt: u.value.updated_at ?? known.updatedAt } }
  if (u.error.code === 'conflict' && u.error.current) {
    const theirs = unpack(String(u.error.current.content ?? ''))
    if (theirs) return { ok: false, conflict: theirs, synced: { serverId: known.serverId, updatedAt: String(u.error.current.updated_at) } }
  }
  return { ok: false, error: u.error }
}
