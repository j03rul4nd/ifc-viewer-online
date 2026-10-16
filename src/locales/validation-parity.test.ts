// ─── validation locale key-parity test ───────────────────────────────────────
// Scoped to the post-score upsell block: the rest of the validation namespace
// still falls back to EN in places, but `upsell.*` is shown to every visitor,
// so every locale must carry exactly the EN keys and {{params}}.

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

function upsellOnly(dict: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(dict).filter(([k]) => k.startsWith('upsell.')))
}

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

const EN = upsellOnly(flatten(enValidation as Json))
const LOCALES: Record<string, Record<string, string>> = {
  es: upsellOnly(flatten(esValidation as Json)), de: upsellOnly(flatten(deValidation as Json)), fr: upsellOnly(flatten(frValidation as Json)),
  pt: upsellOnly(flatten(ptValidation as Json)), it: upsellOnly(flatten(itValidation as Json)), ca: upsellOnly(flatten(caValidation as Json)),
  zh: upsellOnly(flatten(zhValidation as Json)), ja: upsellOnly(flatten(jaValidation as Json)), th: upsellOnly(flatten(thValidation as Json)),
}

describe('validation locale parity', () => {
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
