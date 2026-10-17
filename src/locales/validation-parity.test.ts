// ─── validation locale key-parity test ───────────────────────────────────────
// Scoped to the blocks every visitor sees: the post-score upsell and the
// in-browser batch fix. The rest of the validation namespace still falls back
// to EN in places, but `upsell.*` and `batchFix.*` must carry exactly the EN
// keys, the same {{params}} and the same naming-pattern tokens ({class},
// {storey}, {n:4}…). Those tokens are syntax the user types, so a translated
// token would teach a pattern the parser rejects.

import { describe, it, expect } from 'vitest'
import enValidation from './en/validation.json'
import esValidation from './es/validation.json'
import deValidation from './de/validation.json'
import frValidation from './fr/validation.json'
import ptValidation from './pt/validation.json'
import itValidation from './it/validation.json'
import caValidation from './ca/validation.json'
import zhValidation from './zh/validation.json'
import jaValidation from './ja/validation.json'
import thValidation from './th/validation.json'

type Json = Record<string, unknown>

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Json, key))
    else out[key] = String(v)
  }
  return out
}

const CHECKED_PREFIXES = ['upsell.', 'batchFix.']

function checkedOnly(dict: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(dict).filter(([k]) => CHECKED_PREFIXES.some((p) => k.startsWith(p))))
}

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

// Single-brace naming-pattern tokens, with an optional pad (`{n:4}`). The
// lookarounds keep `{{name}}`-style params out, so a param can never pass as a
// token or the other way round.
const PATTERN_TOKEN = /(?<!\{)\{(class|ifcclass|storey|name|n|type)(:\d)?\}(?!\})/g

function tokensOf(value: string): string[] {
  return [...value.matchAll(PATTERN_TOKEN)].map((m) => m[0]).sort()
}

const EN = checkedOnly(flatten(enValidation as Json))
const LOCALES: Record<string, Record<string, string>> = {
  es: checkedOnly(flatten(esValidation as Json)), de: checkedOnly(flatten(deValidation as Json)), fr: checkedOnly(flatten(frValidation as Json)),
  pt: checkedOnly(flatten(ptValidation as Json)), it: checkedOnly(flatten(itValidation as Json)), ca: checkedOnly(flatten(caValidation as Json)),
  zh: checkedOnly(flatten(zhValidation as Json)), ja: checkedOnly(flatten(jaValidation as Json)), th: checkedOnly(flatten(thValidation as Json)),
}

describe('validation locale parity', () => {
  const enKeys = Object.keys(EN).sort()

  it('checks both blocks', () => {
    for (const prefix of CHECKED_PREFIXES) {
      expect(enKeys.some((k) => k.startsWith(prefix)), `no EN keys under ${prefix}`).toBe(true)
    }
  })

  it('every locale has the same key set as EN', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(dict).sort(), `key drift in ${lng}`).toEqual(enKeys)
    }
  })

  it('every locale uses the same interpolation params per key', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      for (const key of enKeys) {
        expect(paramsOf(dict[key] ?? ''), `params drift on ${lng}:${key}`).toEqual(paramsOf(EN[key]))
      }
    }
  })

  it('every locale keeps the naming-pattern tokens of EN untranslated', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      for (const key of enKeys) {
        expect(tokensOf(dict[key] ?? ''), `pattern tokens drift on ${lng}:${key}`).toEqual(tokensOf(EN[key]))
      }
    }
  })

  it('the pattern help names every token the parser accepts', () => {
    // Guards the token regex above as much as the copy: the help line is the
    // only place a user learns the syntax.
    expect(tokensOf(EN['batchFix.dialog.patternHelp'])).toEqual(
      ['{class}', '{ifcclass}', '{n:4}', '{n}', '{name}', '{storey}'].sort(),
    )
  })
})
