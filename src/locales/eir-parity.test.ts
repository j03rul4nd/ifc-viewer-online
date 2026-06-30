// ─── eir locale key-parity test ───────────────────────────────────────────────
// EN is the source of truth. The EIR feature ships full translations for every
// supported locale, so this guards against drift: each locale must have exactly
// EN's key set, with matching {{params}} per key.

import { describe, it, expect } from 'vitest'
import en from './en/eir.json'
import es from './es/eir.json'
import de from './de/eir.json'
import fr from './fr/eir.json'
import pt from './pt/eir.json'
import itLocale from './it/eir.json'
import ca from './ca/eir.json'
import zh from './zh/eir.json'
import ja from './ja/eir.json'
import th from './th/eir.json'

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

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

const enFlat = flatten(en as Json)
const locales: Array<[string, Json]> = [
  ['es', es], ['de', de], ['fr', fr], ['pt', pt], ['it', itLocale],
  ['ca', ca], ['zh', zh], ['ja', ja], ['th', th],
]

describe('eir locale parity (en ↔ every locale)', () => {
  for (const [name, dict] of locales) {
    const flat = flatten(dict)
    it(`${name} has identical key set to en`, () => {
      expect(Object.keys(flat).sort()).toEqual(Object.keys(enFlat).sort())
    })
    it(`${name} uses the same interpolation params per key`, () => {
      for (const key of Object.keys(enFlat)) {
        expect(paramsOf(flat[key] ?? ''), `params drift on ${name}:${key}`).toEqual(paramsOf(enFlat[key]))
      }
    })
  }
})
