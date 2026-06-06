// ─── Waiver store ───────────────────────────────────────────────────────────
// Lets the user "waive" (mute) specific validation issues they've reviewed and
// accepted — a core pro-grade control (Solibri calls these dispositions). Muted
// issues are hidden from the list AND excluded from the displayed score/counts,
// always with a visible "N muted · restore" affordance so nothing is hidden
// silently. Persisted in localStorage, keyed by a stable issue identity so a
// waiver survives reloads of the same model.

import { create } from 'zustand'
import type { ValidationIssue } from '../types'

const WAIVER_KEY = 'ifc-validator:waivers'

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(WAIVER_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function save(keys: string[]): void {
  try { localStorage.setItem(WAIVER_KEY, JSON.stringify(keys)) } catch { /* quota */ }
}

/**
 * Stable identity for muting a single issue. Uses the IFC GlobalId when present
 * (stable across reloads of the same model); falls back to the express id for
 * file-level issues that have no GlobalId.
 */
export function issueKey(issue: Pick<ValidationIssue, 'ruleId' | 'globalId' | 'expressId'>): string {
  return `${issue.ruleId}::${issue.globalId ?? `e${issue.expressId}`}`
}

interface WaiverStore {
  /** Muted issue keys (see issueKey). */
  muted: string[]
  toggleMute: (key: string) => void
  unmuteAll: () => void
}

export const useWaiverStore = create<WaiverStore>()((set) => ({
  muted: load(),
  toggleMute: (key) =>
    set((s) => {
      const next = s.muted.includes(key) ? s.muted.filter((k) => k !== key) : [...s.muted, key]
      save(next)
      return { muted: next }
    }),
  unmuteAll: () =>
    set(() => {
      save([])
      return { muted: [] }
    }),
}))
