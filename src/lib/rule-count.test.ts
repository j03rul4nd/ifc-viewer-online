// ─── rule-count.test.ts ───────────────────────────────────────────────────────
// Guard against rule-count drift (Cost-of-Change fix T-FIX-01).
//
// The canonical rule count lives in ONE place — `RULE_COUNT` in src/types
// (derived from DEFAULT_RULES with the exact filter the signed certificate
// uses). Everything else is either a derived view (seo/config.ts,
// ValidationPanel) or content that quotes the number in prose (READMEs,
// index.html, static landings, blog posts, landing.json locales). This test:
//
//   1. Asserts the derivations agree: RULE_COUNT === the `+rN` suffix of
//      CERTIFY_VALIDATOR_VERSION === RULE_METADATA size.
//   2. Sweeps every content surface for "N <rule-word>" claims and FAILS,
//      listing file:line, when a mention disagrees with RULE_COUNT.
//
// Adding rule #45 therefore becomes: edit DEFAULT_RULES (+ metadata) → run
// tests → this guard prints every stale "44" left in content → sweep them.
//
// Heuristic: only numbers >= TOTAL_CLAIM_MIN are treated as claims about the
// TOTAL rule count. Smaller numbers next to a rule word are legitimate subset
// mentions ("classification & MEP — 9 rules", "Level 2 quality rules") and are
// ignored. If a subset ever grows past the threshold, this test will flag it —
// that is an acceptable over-alert: the failure message shows the context and
// a human adjusts.

import { describe, it, expect } from 'vitest'
import { RULE_COUNT, RULE_METADATA } from '../types'
import { CERTIFY_VALIDATOR_VERSION } from './certify/build-payload'

/** Numbers below this next to a rule word are subset mentions, not the total. */
const TOTAL_CLAIM_MIN = 25

// "<n> … rule-word" in every locale the product ships (latin + zh/ja/th).
// The window between the number and the keyword is capped at 15 non-digit,
// same-line chars so unrelated numbers earlier in a sentence don't bind.
const NUMBER_BEFORE_WORD =
  /(?<![\d.,])(\d{2,3})(?=[^\d\n]{0,15}(?:rules\b|reglas\b|règles\b|Regeln\b|regole\b|regras\b|regles\b|规则|条|ルール|กฎ))/giu
// Hyphenated compounds: "44-rule IFC validator" / "44-rule validation".
const HYPHEN_COMPOUND = /(?<![\d.,])(\d{2,3})-(?:rule|regla|règle|Regel|regola|regra)\b/giu
// Thai writes the counter before the number: "กฎ 44 ข้อ".
const WORD_BEFORE_NUMBER = /กฎ[^\d\n]{0,6}(\d{2,3})/gu
// Structured claims, where the number and the rule word sit in separate object
// fields: `{ value: 44, suffix: '', label: 'validation rules' }` (blog stat-rows).
// The prose windows above are far too narrow to bind across the intervening keys,
// which is exactly how seven stale "38"s survived the first sweep.
const STRUCTURED_CLAIM =
  /\bvalue:\s*(\d{2,3})\b[^\n]{0,80}?\blabel:\s*['"][^'"\n]*(?:rules|reglas|règles|Regeln|regole|regras|规则|ルール|กฎ)/giu

// "…orphan elements and 41 MORE rules" is arithmetic copy (named + N = total),
// not a total claim — every locale has its own marker. Skipped: the guard can't
// verify the sum without knowing how many rules the sentence names.
const MORE_MARKER =
  /\bmore\b|\bmás\b|\bmés\b|de plus|weitere|altre|e mais|另外|ほか|และอีก/iu

// Every content surface that quotes the rule count, loaded raw at test time
// (same import.meta.glob idiom as ids-testcases.test.ts — no node builtins,
// so the browser tsconfig stays clean). Surfaces that only exist in dist/
// (e.g. /fix/ pages) are generated FROM these sources, so sweeping the
// sources covers them.
const SURFACES = {
  ...import.meta.glob('/index.html', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/README*.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/src/seo/config.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/src/lib/blog-posts.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/src/locales/*/landing.json', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/public/**/index.html', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/cf-worker/worker.js', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

interface Offender {
  file: string
  line: number
  claim: number
  context: string
}

function sweep(file: string, text: string): Offender[] {
  const offenders: Offender[] = []
  for (const re of [NUMBER_BEFORE_WORD, HYPHEN_COMPOUND, WORD_BEFORE_NUMBER, STRUCTURED_CLAIM]) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) {
      const claim = Number(m[1])
      if (claim < TOTAL_CLAIM_MIN || claim === RULE_COUNT) continue
      const line = text.slice(0, m.index).split('\n').length
      const context = text.slice(Math.max(0, m.index! - 40), m.index! + 40).replace(/\s+/g, ' ')
      if (MORE_MARKER.test(context)) continue
      offenders.push({ file, line, claim, context })
    }
  }
  return offenders
}

describe('RULE_COUNT single source of truth', () => {
  it('matches the +rN suffix of the signed CERTIFY_VALIDATOR_VERSION', () => {
    const suffix = Number(CERTIFY_VALIDATOR_VERSION.split('+r')[1])
    expect(RULE_COUNT).toBe(suffix)
  })

  it('matches the RULE_METADATA catalogue size (panel derivation)', () => {
    expect(Object.keys(RULE_METADATA).length).toBe(RULE_COUNT)
  })

  it('is quoted consistently across every marketing/content surface', () => {
    const files = Object.keys(SURFACES)
    // If the glob set silently broke we would be guarding nothing.
    expect(files.length).toBeGreaterThan(10)

    const offenders = files.flatMap((f) => sweep(f, SURFACES[f]))
    const report = offenders
      .map((o) => `  ${o.file}:${o.line} says "${o.claim}" (expected ${RULE_COUNT}) — …${o.context}…`)
      .join('\n')
    expect(offenders, `Stale rule counts found:\n${report}\n`).toEqual([])
  })
})
