// ─── capture locale key-parity test ───────────────────────────────────────────
// The capture namespace (Capture Toolkit + scene background picker) ships in all
// 10 locales. Same guard as the other parity tests: identical key sets and
// identical {{params}} per key — the buffer readout and the export estimate both
// interpolate numbers, and a missing param silently renders "{{seconds}}".

import { describe, it, expect } from 'vitest'
import enCapture from './en/capture.json'
import esCapture from './es/capture.json'
import deCapture from './de/capture.json'
import frCapture from './fr/capture.json'
import ptCapture from './pt/capture.json'
import itCapture from './it/capture.json'
import caCapture from './ca/capture.json'
import zhCapture from './zh/capture.json'
import jaCapture from './ja/capture.json'
import thCapture from './th/capture.json'

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

const EN = flatten(enCapture as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esCapture as Json), de: flatten(deCapture as Json), fr: flatten(frCapture as Json),
  pt: flatten(ptCapture as Json), it: flatten(itCapture as Json), ca: flatten(caCapture as Json),
  zh: flatten(zhCapture as Json), ja: flatten(jaCapture as Json), th: flatten(thCapture as Json),
}

describe('capture locale parity', () => {
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

  it('covers one label per shipped background preset', () => {
    // The picker renders t(`background.presets.${id}`) for every preset, so a
    // new preset without a label would fall back to the raw key in the UI.
    for (const id of ['studio', 'white', 'paper', 'blueprint', 'sky']) {
      expect(EN[`background.presets.${id}`], `missing label for ${id}`).toBeTruthy()
    }
  })
})
