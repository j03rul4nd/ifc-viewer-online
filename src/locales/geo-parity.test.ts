// ─── geo locale key-parity test ───────────────────────────────────────────────
// The geo namespace is the largest and fastest-growing one in the app (map
// mode, terrain, relief controls, placement, minimap, buildings, ecosystems),
// and it is edited in bulk by scripts that touch ten files at once. A single
// missed locale renders a raw key like "layers.buildingsCount" in the UI, which
// no test caught before this one existed.
//
// Guards: identical key sets, identical {{params}} per key, and — because
// several of these strings are the honesty disclaimers attached to synthetic
// data — that those specific keys can never silently go missing.

import { describe, it, expect } from 'vitest'
import enGeo from './en/geo.json'
import esGeo from './es/geo.json'
import deGeo from './de/geo.json'
import frGeo from './fr/geo.json'
import ptGeo from './pt/geo.json'
import itGeo from './it/geo.json'
import caGeo from './ca/geo.json'
import zhGeo from './zh/geo.json'
import jaGeo from './ja/geo.json'
import thGeo from './th/geo.json'

type Json = Record<string, unknown>

/**
 * `_status` is a deliberate maintenance marker on locales seeded from EN
 * ("machine-copy-of-en — translate before promoting"), not a UI string. It is
 * excluded rather than required so the marker can be dropped from a locale the
 * day it is fully translated, without breaking this test.
 */
const MARKER_KEY = '_status'

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (!prefix && k === MARKER_KEY) continue
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Json, key))
    else out[key] = String(v)
  }
  return out
}

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

const EN = flatten(enGeo as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esGeo as Json), de: flatten(deGeo as Json), fr: flatten(frGeo as Json),
  pt: flatten(ptGeo as Json), it: flatten(itGeo as Json), ca: flatten(caGeo as Json),
  zh: flatten(zhGeo as Json), ja: flatten(jaGeo as Json), th: flatten(thGeo as Json),
}

describe('geo locale parity', () => {
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

  it('leaves no empty strings, which render as a blank control', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      for (const key of enKeys) {
        expect(dict[key]?.trim().length, `empty ${lng}:${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('carries every honesty disclaimer in all ten locales', () => {
    // These are the strings that tell the user something is inferred or
    // estimated rather than measured. Losing one in a locale would let that
    // language present synthetic data as fact.
    const disclaimers = [
      'layers.detailWarning',        // synthetic micro-relief
      'layers.styleEcosystemNote',   // modelled vegetation belts
      'layers.buildingsEstimated',   // guessed building heights
      'attribution.vertical',        // vertical datum caveat
    ]
    for (const key of disclaimers) {
      expect(EN[key], `missing disclaimer ${key} in en`).toBeTruthy()
      for (const [lng, dict] of Object.entries(LOCALES)) {
        expect(dict[key]?.trim().length, `missing disclaimer ${key} in ${lng}`).toBeGreaterThan(0)
      }
    }
  })

  it('covers every terrain style offered by the picker', () => {
    for (const style of ['Imagery', 'Shaded', 'Hypso', 'Slope', 'Ecosystem']) {
      expect(EN[`layers.style${style}`], `missing label for ${style}`).toBeTruthy()
    }
  })
})
