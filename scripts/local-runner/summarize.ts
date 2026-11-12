// Turns the viewer's own validation (and IDS) result into the body that
// ifc-cloud-api expects at POST /internal/jobs/:id/result. Pure, so it is
// tested without a backend.

import type { ValidationResult } from '../../src/types'

export interface RunnerResult {
  outcome: 'validated'
  score: number
  failed_specs: number
  issues: number
  errors: number
  engine: string
  failed_rules: { rule_id: string; count: number; severity: 'error' | 'warning' | 'info'; guids: string[] }[]
}

const RULE_ID = /^[A-Z0-9_]{3,64}$/
const SEVERITY_RANK = { error: 3, warning: 2, info: 1 } as const

/** Rule ids the API accepts: upper snake case. `missing-name` → `MISSING_NAME`. */
export function apiRuleId(ruleId: string): string | null {
  const id = ruleId.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase().slice(0, 64)
  return RULE_ID.test(id) ? id : null
}

export function summarize(result: ValidationResult, healthScore: number, failedSpecs: number, engine: string): RunnerResult {
  const byRule = new Map<string, { count: number; severity: 'error' | 'warning' | 'info'; guids: Set<string> }>()
  for (const issue of result.issues) {
    const id = apiRuleId(issue.ruleId)
    if (!id) continue
    const r = byRule.get(id) ?? { count: 0, severity: issue.severity, guids: new Set<string>() }
    r.count++
    if (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[r.severity]) r.severity = issue.severity
    if (issue.globalId && r.guids.size < 200 && issue.globalId.length <= 32) r.guids.add(issue.globalId)
    byRule.set(id, r)
  }
  const failed_rules = [...byRule.entries()]
    .sort((a, b) => SEVERITY_RANK[b[1].severity] - SEVERITY_RANK[a[1].severity] || b[1].count - a[1].count)
    .slice(0, 100)
    .map(([rule_id, r]) => ({ rule_id, count: r.count, severity: r.severity, guids: [...r.guids] }))
  return {
    outcome: 'validated',
    score: Math.max(0, Math.min(100, Math.round(healthScore))),
    failed_specs: Math.max(0, failedSpecs),
    issues: result.stats.total,
    errors: result.stats.errors,
    engine: engine.slice(0, 40),
    failed_rules,
  }
}

/** Cheap check before spending minutes on it: STEP header + an IFC schema. */
export function looksLikeIfc(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  if (!head.startsWith('ISO-10303-21')) return 'not an IFC (STEP) file'
  if (!/FILE_SCHEMA\s*\(\s*\(\s*'IFC/i.test(head)) return 'no IFC schema in the header'
  return null
}
