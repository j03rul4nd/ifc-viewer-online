// @vitest-environment node
// Key parity for the `compare` namespace: ten files edited together, and a
// missing key renders as a raw path ("bcf.text.idsTitle") inside a BCF topic
// that leaves the app. Plural-aware (ja/zh/th carry only `_other`) and checks
// that every locale interpolates the same params.
import { describe, it, expect } from 'vitest'
import en from './en/compare.json'
import es from './es/compare.json'
import ca from './ca/compare.json'
import fr from './fr/compare.json'
import de from './de/compare.json'
import it_ from './it/compare.json'
import pt from './pt/compare.json'
import ja from './ja/compare.json'
import zh from './zh/compare.json'
import th from './th/compare.json'

type Json = Record<string, unknown>
const PLURAL = /_(zero|one|two|few|many|other)$/

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Json, key))
    else out[key] = String(v)
  }
  return out
}
const base = (k: string): string => k.replace(PLURAL, '')
const params = (s: string): string[] => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

const EN = flatten(en)
const LOCALES: Record<string, Json> = { es, ca, fr, de, it: it_, pt, ja, zh, th }

describe('compare locale parity', () => {
  for (const [lng, data] of Object.entries(LOCALES)) {
    it(`${lng} has every key, and nothing extra`, () => {
      const L = flatten(data)
      expect([...new Set(Object.keys(L).map(base))].sort()).toEqual([...new Set(Object.keys(EN).map(base))].sort())
    })
    it(`${lng} interpolates the same params`, () => {
      const L = flatten(data)
      for (const [k, v] of Object.entries(L)) {
        const enKey = EN[k] ?? EN[`${base(k)}_other`]
        expect(params(v), `${lng}:${k}`).toEqual(params(enKey))
      }
    })
  }
})
