// ─── eir-lint.ts ──────────────────────────────────────────────────────────────
// Static sanity checks for EIR rules: catch malformed or unreachable rules in the
// editor *before* a run (a complement to the live applicability preview, which
// catches "matches nothing"). Emits i18n-free codes — the editor renders them via
// the `eir.lint.*` namespace. Pure + unit-tested.

import type { EirProfile } from './eir-types'

export type LintCode =
  | 'entityNotIfc'   // entity doesn't look like an IFC class (likely a typo)
  | 'whitespace'     // a pset/property name has leading/trailing spaces
  | 'badRegex'       // a regex rule's pattern doesn't compile
  | 'numericNaN'     // a numeric rule's value isn't a finite number
  | 'emptyEquals'    // propertyEquals compares against an empty string
  | 'emptyAllowed'   // allowedValues has an empty/blank option

export interface LintIssue { ruleId: string; code: LintCode }

const hasWs = (s: string | undefined): boolean => s != null && s !== s.trim()

/** Lint every rule in a profile. Returns one issue per problem found. */
export function lintProfile(profile: Pick<EirProfile, 'rules'>): LintIssue[] {
  const out: LintIssue[] = []
  for (const r of profile.rules) {
    const add = (code: LintCode): void => { out.push({ ruleId: r.id, code }) }

    if (r.entity && !/^Ifc[A-Za-z0-9]+$/.test(r.entity)) add('entityNotIfc')
    if ('pset' in r && hasWs(r.pset)) add('whitespace')
    else if ('property' in r && hasWs(r.property)) add('whitespace')

    if (r.type === 'regex') {
      try { new RegExp(r.pattern) } catch { add('badRegex') }
    } else if (r.type === 'numeric') {
      if (!Number.isFinite(r.value)) add('numericNaN')
    } else if (r.type === 'propertyEquals') {
      if (r.value.trim() === '') add('emptyEquals')
    } else if (r.type === 'allowedValues') {
      if (r.values.length === 0 || r.values.some((v) => v.trim() === '')) add('emptyAllowed')
    }
  }
  return out
}

/** Group lint issues by ruleId for per-rule display. */
export function lintByRule(issues: LintIssue[]): Map<string, LintCode[]> {
  const m = new Map<string, LintCode[]>()
  for (const i of issues) {
    const arr = m.get(i.ruleId)
    if (arr) arr.push(i.code)
    else m.set(i.ruleId, [i.code])
  }
  return m
}
