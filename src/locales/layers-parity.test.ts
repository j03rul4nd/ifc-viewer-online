// ─── layers locale key-parity test ──────────────────────────────────────────────
// Same guard the other namespaces carry. A missing key here renders a raw
// string like "source.upAxisY" into a button, and the two that matter most are
// the ones that admit a guess: the unit and the up axis were both inferred, and
// a locale that drops those explanations presents a guess as a fact.

import { describe, it, expect } from 'vitest'
import enLayers from './en/layers.json'
import esLayers from './es/layers.json'
import deLayers from './de/layers.json'
import frLayers from './fr/layers.json'
import ptLayers from './pt/layers.json'
import itLayers from './it/layers.json'
import caLayers from './ca/layers.json'
import zhLayers from './zh/layers.json'
import jaLayers from './ja/layers.json'
import thLayers from './th/layers.json'

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

const EN = flatten(enLayers as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esLayers as Json), de: flatten(deLayers as Json), fr: flatten(frLayers as Json),
  pt: flatten(ptLayers as Json), it: flatten(itLayers as Json), ca: flatten(caLayers as Json),
  zh: flatten(zhLayers as Json), ja: flatten(jaLayers as Json), th: flatten(thLayers as Json),
}

describe('layers locales', () => {
  it('all ten carry exactly the same keys', () => {
    const expected = Object.keys(EN).sort()
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(dict).sort(), `${lng} differs from en`).toEqual(expected)
    }
  })

  it('nothing is left blank', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length, `${lng}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it('no locale was seeded from English and left there', () => {
    // The marker the point cloud namespace used while it was being translated.
    // Its absence here is the claim that these are real translations.
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(dict._status, `${lng} is still machine-seeded`).toBeUndefined()
    }
  })

  it('keeps the interpolation placeholders every language needs', () => {
    const placeholders: Record<string, string> = {
      'anchor.by': '{{label}}', 'wfs.found': '{{count}}', 'list.title': '{{count}}',
      'count.lines_other': '{{count}}', 'count.polygons_other': '{{count}}', 'count.points_other': '{{count}}',
      'height.source.property': '{{prop}}', 'warn.far': '{{km}}', 'warn.skipped': '{{count}}',
    }
    for (const [key, ph] of Object.entries(placeholders)) {
      for (const [lng, dict] of Object.entries({ en: EN, ...LOCALES })) {
        expect(dict[key], `${lng}.${key} lost ${ph}`).toContain(ph)
      }
    }
  })

  it('every error the runner and parser can emit has a message', () => {
    // Produced by geojson.ts (parse) and vector-runner.ts (network, WFS). A
    // missing one shows the user the key itself at the moment a layer failed.
    for (const key of [
      'error.notJson', 'error.notGeoJson', 'error.unknownCrs', 'error.projectedWithoutCrs', 'error.empty',
      'error.noAnchor', 'error.http', 'error.network', 'error.aborted', 'error.badUrl', 'error.notWfs',
      'error.noFeatureTypes', 'error.wfsException', 'error.notJsonOutput',
    ]) {
      expect(EN[key], `en is missing ${key}`).toBeTruthy()
    }
  })
})
