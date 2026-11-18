// ─── measurement locale key-parity test ───────────────────────────────────────
// The Measure and Section panels build keys at runtime — `steps.${step}`,
// `snap.${kind}`, `tools.${id}`, `section.name.${axis}` — so a key a locale
// dropped is not caught by the type checker: it renders as the raw key in the
// one sentence that tells someone what to click next.

import { describe, it, expect } from 'vitest'
import en from './en/measurement.json'
import es from './es/measurement.json'
import de from './de/measurement.json'
import fr from './fr/measurement.json'
import pt from './pt/measurement.json'
import it_ from './it/measurement.json'
import ca from './ca/measurement.json'
import zh from './zh/measurement.json'
import ja from './ja/measurement.json'
import th from './th/measurement.json'
import type { MeasureStep, MeasureToolId, SnapKind } from '../lib/measure/measure-types'

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

const EN = flatten(en as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(es as Json), de: flatten(de as Json), fr: flatten(fr as Json),
  pt: flatten(pt as Json), it: flatten(it_ as Json), ca: flatten(ca as Json),
  zh: flatten(zh as Json), ja: flatten(ja as Json), th: flatten(th as Json),
}
const ALL = { en: EN, ...LOCALES }

// Every value the engine can hand the panel, spelled out so a new one added to
// the types without a string fails here instead of on screen.
const TOOLS: MeasureToolId[] = ['distance', 'path', 'area', 'angle', 'point']
const STEPS: Array<MeasureStep | 'angle-first' | 'point'> = [
  'idle', 'first-point', 'second-point', 'next-point', 'pick-face', 'angle-first',
  'angle-vertex', 'angle-end', 'pick-plane-face', 'perpendicular-target', 'point',
]
const SNAPS: SnapKind[] = ['vertex', 'midpoint', 'edge', 'face', 'surface', 'cloud']

describe('measurement locales', () => {
  it('all ten carry exactly the same keys', () => {
    const expected = Object.keys(EN).sort()
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(dict).sort(), `${lng} differs from en`).toEqual(expected)
    }
  })

  it('nothing is left blank', () => {
    for (const [lng, dict] of Object.entries(ALL)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length, `${lng}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it('has a string for every tool, step and snap the engine can report', () => {
    const keys = [
      ...TOOLS.flatMap((t) => [`tools.${t}`, `tools.${t}Hint`, `item.${t}`]),
      ...STEPS.map((s) => `steps.${s}`),
      ...SNAPS.map((s) => `snap.${s}`),
      ...['x', 'y', 'z', 'face'].map((a) => `section.name.${a}`),
    ]
    for (const [lng, dict] of Object.entries(ALL)) {
      for (const key of keys) expect(dict[key], `${lng} is missing ${key}`).toBeTruthy()
    }
  })

  it('keeps the interpolation placeholders', () => {
    for (const [key, value] of Object.entries(EN)) {
      const wanted = value.match(/\{\{\w+\}\}/g) ?? []
      for (const [lng, dict] of Object.entries(LOCALES)) {
        for (const p of wanted) expect(dict[key], `${lng}.${key} lost ${p}`).toContain(p)
      }
    }
  })
})
