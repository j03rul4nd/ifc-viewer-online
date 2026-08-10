// ─── mesh locale key-parity test ──────────────────────────────────────────────
// Same guard the other namespaces carry. A missing key here renders a raw
// string like "source.upAxisY" into a button, and the two that matter most are
// the ones that admit a guess: the unit and the up axis were both inferred, and
// a locale that drops those explanations presents a guess as a fact.

import { describe, it, expect } from 'vitest'
import enMesh from './en/mesh.json'
import esMesh from './es/mesh.json'
import deMesh from './de/mesh.json'
import frMesh from './fr/mesh.json'
import ptMesh from './pt/mesh.json'
import itMesh from './it/mesh.json'
import caMesh from './ca/mesh.json'
import zhMesh from './zh/mesh.json'
import jaMesh from './ja/mesh.json'
import thMesh from './th/mesh.json'

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

const EN = flatten(enMesh as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esMesh as Json), de: flatten(deMesh as Json), fr: flatten(frMesh as Json),
  pt: flatten(ptMesh as Json), it: flatten(itMesh as Json), ca: flatten(caMesh as Json),
  zh: flatten(zhMesh as Json), ja: flatten(jaMesh as Json), th: flatten(thMesh as Json),
}

describe('mesh locales', () => {
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
    for (const key of ['stats.triangles', 'stats.textures']) {
      for (const [lng, dict] of Object.entries(LOCALES)) {
        expect(dict[key], `${lng}.${key} lost {{count}}`).toContain('{{count}}')
      }
    }
  })

  it('every error the runner can emit has a message', () => {
    // These keys are produced in mesh-runner.ts. A missing one shows the user
    // the key itself at the exact moment their import failed.
    for (const key of [
      'error.noEntryFile', 'error.noGeometry', 'error.parseFailed',
      'error.emptyFile', 'error.budgetExhausted', 'error.cancelled',
    ]) {
      expect(EN[key], `en is missing ${key}`).toBeTruthy()
      for (const [lng, dict] of Object.entries(LOCALES)) {
        expect(dict[key]?.trim().length, `${lng} is missing ${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('explains both guesses, in every language', () => {
    // The unit and the up axis are inferred. A locale that drops these two
    // strings shows a number with no indication that it was arrived at by
    // looking at the size of the thing.
    for (const key of ['source.unitGuessed', 'source.upAxisDeclared']) {
      for (const [lng, dict] of Object.entries(LOCALES)) {
        expect(dict[key]?.trim().length, `${lng} is missing ${key}`).toBeGreaterThan(0)
      }
    }
  })
})
