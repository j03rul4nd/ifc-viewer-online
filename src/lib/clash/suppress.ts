// ─── suppression rules ────────────────────────────────────────────────────────
// "Ignore insulation against wall": a rule names two sides (classes and/or a
// word in the element name); a clash whose two elements match the sides, in
// either order, is hidden and counted as suppressed — never deleted, so
// turning the rule off brings it back without running again.

import type { ClashElement, ClashResult } from './model'

export interface SuppressSide {
  /** IFC classes, upper case. Empty = any class. */
  classes: string[]
  /** Case-insensitive words; the element name must contain one. Empty = any name. */
  names: string[]
}

export interface SuppressRule {
  id: string
  /** Built-in rules carry a text key; custom ones a free name. */
  preset?: SuppressPresetId
  name: string
  a: SuppressSide
  b: SuppressSide
  /** Only within one model (mullions vs their own curtain wall), or any. */
  sameModelOnly: boolean
  /** Hide only touching/near hits up to this overlap (m); 0 = any depth. */
  maxDepth: number
  enabled: boolean
}

export type SuppressPresetId = 'insulation_wall' | 'facade_frame' | 'covering_slab' | 'same_class' | 'small_overlap' | 'furniture'

const side = (classes: string[] = [], names: string[] = []): SuppressSide => ({ classes, names })

/** Rules coordinators switch on first. Off by default except the facade one. */
export const SUPPRESS_PRESETS: SuppressRule[] = [
  { id: 'p-ins', preset: 'insulation_wall', name: 'insulation_wall', a: side(['IFCCOVERING'], ['insul', 'aislam', 'dämm', 'isola']), b: side(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCROOF']), sameModelOnly: false, maxDepth: 0, enabled: true },
  { id: 'p-fac', preset: 'facade_frame', name: 'facade_frame', a: side(['IFCCURTAINWALL', 'IFCPLATE']), b: side(['IFCMEMBER']), sameModelOnly: true, maxDepth: 0, enabled: true },
  { id: 'p-cov', preset: 'covering_slab', name: 'covering_slab', a: side(['IFCCOVERING']), b: side(['IFCSLAB', 'IFCROOF', 'IFCCOVERING']), sameModelOnly: false, maxDepth: 0.05, enabled: false },
  { id: 'p-same', preset: 'same_class', name: 'same_class', a: side(), b: side(), sameModelOnly: true, maxDepth: 0, enabled: false },
  { id: 'p-small', preset: 'small_overlap', name: 'small_overlap', a: side(), b: side(), sameModelOnly: false, maxDepth: 0.02, enabled: false },
  { id: 'p-furn', preset: 'furniture', name: 'furniture', a: side(['IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCSYSTEMFURNITUREELEMENT']), b: side(), sameModelOnly: false, maxDepth: 0, enabled: false },
]

function sideMatches(s: SuppressSide, e: ClashElement): boolean {
  if (s.classes.length && !s.classes.includes(e.category)) return false
  if (s.names.length) {
    const n = (e.name ?? '').toLowerCase()
    if (!s.names.some((w) => n.includes(w.toLowerCase()))) return false
  }
  return true
}

export function ruleMatches(rule: SuppressRule, r: ClashResult): boolean {
  if (!rule.enabled) return false
  if (rule.sameModelOnly && r.a.modelId !== r.b.modelId) return false
  if (rule.maxDepth > 0 && (r.kind === 'hard' ? r.depth : 0) > rule.maxDepth) return false
  if (rule.preset === 'same_class' && r.a.category !== r.b.category) return false
  return (sideMatches(rule.a, r.a) && sideMatches(rule.b, r.b)) || (sideMatches(rule.a, r.b) && sideMatches(rule.b, r.a))
}

/** Split results into shown and suppressed (with the rule that hid each). */
export function applySuppression(results: ClashResult[], rules: SuppressRule[]): { shown: ClashResult[]; suppressed: number; byRule: Record<string, number> } {
  const active = rules.filter((r) => r.enabled)
  const shown: ClashResult[] = []
  const byRule: Record<string, number> = {}
  let suppressed = 0
  for (const r of results) {
    const hit = active.find((rule) => ruleMatches(rule, r))
    if (hit) { suppressed++; byRule[hit.id] = (byRule[hit.id] ?? 0) + 1 } else shown.push(r)
  }
  return { shown, suppressed, byRule }
}

export function parseRuleList(text: string): string[] {
  return text.split(',').map((x) => x.trim()).filter(Boolean)
}
