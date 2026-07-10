// ─── verify locale key-parity test ────────────────────────────────────────────
// The verify namespace (/verify certificate page, F1.1) ships in all 10 locales
// (EN is the bundled fallback). This guards against drift: every locale must
// carry the exact same key set and the same {{params}} per key (coverage counts
// and profile ids interpolate everywhere).

import { describe, it, expect } from 'vitest'
import enVerify from './en/verify.json'
import esVerify from './es/verify.json'
import deVerify from './de/verify.json'
import frVerify from './fr/verify.json'
import ptVerify from './pt/verify.json'
import itVerify from './it/verify.json'
import caVerify from './ca/verify.json'
import zhVerify from './zh/verify.json'
import jaVerify from './ja/verify.json'
import thVerify from './th/verify.json'

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

const EN = flatten(enVerify as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esVerify as Json), de: flatten(deVerify as Json), fr: flatten(frVerify as Json),
  pt: flatten(ptVerify as Json), it: flatten(itVerify as Json), ca: flatten(caVerify as Json),
  zh: flatten(zhVerify as Json), ja: flatten(jaVerify as Json), th: flatten(thVerify as Json),
}

describe('verify locale parity', () => {
  const enKeys = Object.keys(EN).sort()

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
})
