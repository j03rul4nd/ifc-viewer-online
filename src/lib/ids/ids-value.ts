// ─── IDS value matching ───────────────────────────────────────────────────────
// Evaluate an actual model value against an IDS value constraint (simpleValue or
// xs:restriction). Pure + unit-tested.
//
// P2-6 semantics (pinned by the bSI tolerance/restriction testcases):
// - Floating-point comparisons use a relative tolerance applied in BOTH
//   directions: |a − b| ≤ 1e-6 · (|a| + |b|). The official fixtures straddle
//   exactly this boundary (1 vs 1.000002 passes, 1 vs 0.9999979 fails).
//   Inclusive bounds widen by the tolerance; exclusive bounds narrow by it.
// - XSD regex dialect: \i/\I/\c/\C are translated to JS classes; character
//   class subtraction ([a-z-[aeiou]]) is untranslatable → the constraint is
//   reported as an unsupported pattern (conservative fail, never a throw).
// - Booleans are NOT case-normalized: the bSI testcase "booleans must be
//   specified as lowercase strings" expects "TRUE"/"FALSE" in an IDS to fail
//   (deviation from the original plan §3.4.3 — testcases win, Appendix A).

import type { IdsValue, IdsRestriction } from './ids-types'

const REL_TOL = 1e-6

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(String(v))
}

/** |a − b| ≤ 1e-6 · (|a| + |b|) — the bSI floating-point equality rule. */
export function numEquals(a: number, b: number): boolean {
  if (a === b) return true
  return Math.abs(a - b) <= REL_TOL * (Math.abs(a) + Math.abs(b))
}

const tol = (a: number, b: number): number => REL_TOL * (Math.abs(a) + Math.abs(b))

/**
 * Translate an XSD-dialect pattern to a JS-safe one. Returns null when the
 * pattern uses untranslatable syntax (character class subtraction).
 * Note: \i/\c are approximated with their ASCII ranges; multi-escape edge cases
 * inside character classes are out of scope (they virtually always co-occur
 * with subtraction, which is rejected anyway).
 */
export function translateXsdPattern(pattern: string): string | null {
  if (/\[[^\]]*-\[/.test(pattern)) return null // character class subtraction
  return pattern
    .replace(/\\i/g, '[A-Za-z_:]')
    .replace(/\\I/g, '[^A-Za-z_:]')
    .replace(/\\c/g, '[A-Za-z0-9._:\\-]')
    .replace(/\\C/g, '[^A-Za-z0-9._:\\-]')
}

export interface ValueMatchResult {
  matched: boolean
  /** Set when the constraint's pattern is not supported by this checker (XSD dialect). */
  unsupportedPattern?: string
}

function restrictionMatches(s: string, actual: string | number | boolean, r: IdsRestriction): ValueMatchResult {
  if (r.enumeration && !r.enumeration.includes(s)) return { matched: false }
  if (r.pattern) {
    const translated = translateXsdPattern(r.pattern)
    if (translated == null) return { matched: false, unsupportedPattern: r.pattern }
    try {
      if (!new RegExp(`^(?:${translated})$`).test(s)) return { matched: false }
    } catch {
      return { matched: false, unsupportedPattern: r.pattern }
    }
  }
  const hasBounds = r.minInclusive != null || r.maxInclusive != null || r.minExclusive != null || r.maxExclusive != null
  if (hasBounds) {
    const n = num(actual)
    if (Number.isNaN(n)) return { matched: false }
    // Inclusive bounds widen by the tolerance, exclusive bounds narrow by it.
    if (r.minInclusive != null && n < r.minInclusive - tol(n, r.minInclusive)) return { matched: false }
    if (r.maxInclusive != null && n > r.maxInclusive + tol(n, r.maxInclusive)) return { matched: false }
    if (r.minExclusive != null && n <= r.minExclusive + tol(n, r.minExclusive)) return { matched: false }
    if (r.maxExclusive != null && n >= r.maxExclusive - tol(n, r.maxExclusive)) return { matched: false }
  }
  if (r.length != null && s.length !== r.length) return { matched: false }
  if (r.minLength != null && s.length < r.minLength) return { matched: false }
  if (r.maxLength != null && s.length > r.maxLength) return { matched: false }
  return { matched: true }
}

/** Rich result: does `actual` satisfy the constraint, and if not — was the pattern unsupported? */
export function matchValue(actual: string | number | boolean | null | undefined, c: IdsValue): ValueMatchResult {
  if (actual == null || actual === '') return { matched: false }
  const s = String(actual)
  if ('simpleValue' in c) {
    // Exact compare; numbers are tolerance-aware (e.g. "1" vs 1.000002).
    if (s === c.simpleValue) return { matched: true }
    const a = num(actual), b = num(c.simpleValue)
    return { matched: !Number.isNaN(a) && !Number.isNaN(b) && numEquals(a, b) }
  }
  return restrictionMatches(s, actual, c.restriction)
}

/** Does `actual` satisfy the IDS value constraint? null/empty never matches. */
export function valueMatches(actual: string | number | boolean | null | undefined, c: IdsValue): boolean {
  return matchValue(actual, c).matched
}

/** Human description of a constraint, for failure messages. */
export function describeValue(c: IdsValue | undefined): string {
  if (!c) return ''
  if ('simpleValue' in c) return `"${c.simpleValue}"`
  const r = c.restriction
  if (r.enumeration) return `one of [${r.enumeration.join(', ')}]`
  if (r.pattern) return `matching /${r.pattern}/`
  const parts: string[] = []
  if (r.minInclusive != null) parts.push(`≥ ${r.minInclusive}`)
  if (r.maxInclusive != null) parts.push(`≤ ${r.maxInclusive}`)
  if (r.minExclusive != null) parts.push(`> ${r.minExclusive}`)
  if (r.maxExclusive != null) parts.push(`< ${r.maxExclusive}`)
  if (r.length != null) parts.push(`length ${r.length}`)
  if (r.minLength != null) parts.push(`min length ${r.minLength}`)
  if (r.maxLength != null) parts.push(`max length ${r.maxLength}`)
  return parts.length ? parts.join(' and ') : 'a value'
}
