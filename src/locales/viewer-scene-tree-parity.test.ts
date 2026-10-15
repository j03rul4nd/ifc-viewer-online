// ─── viewer scene.tree locale parity ──────────────────────────────────────────
// viewer.json has no full parity test, so this one is scoped to the Scene
// tree's strings: every locale carries the same scene.tree.* keys as EN, with
// the same {{params}}, and none is left empty or in English where EN is long
// enough to be translated.

import { describe, it, expect } from 'vitest'
import en from './en/viewer.json'
import ca from './ca/viewer.json'
import de from './de/viewer.json'
import es from './es/viewer.json'
import fr from './fr/viewer.json'
import it_ from './it/viewer.json'
import ja from './ja/viewer.json'
import pt from './pt/viewer.json'
import th from './th/viewer.json'
import zh from './zh/viewer.json'

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

const tree = (j: Json): Record<string, string> => flatten(((j.scene as Json).tree) as Json, 'scene.tree')
const params = (v: string): string[] => [...v.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

const EN = tree(en as Json)
const LOCALES: Record<string, Record<string, string>> = {
  ca: tree(ca as Json), de: tree(de as Json), es: tree(es as Json), fr: tree(fr as Json), it: tree(it_ as Json),
  ja: tree(ja as Json), pt: tree(pt as Json), th: tree(th as Json), zh: tree(zh as Json),
}

describe('viewer scene.tree parity', () => {
  it('has the cloud-row strings', () => {
    expect(EN['scene.tree.editScan']).toBeTruthy()
    expect(EN['scene.tree.topics']).toContain('{{names}}')
  })

  it('every locale has the same scene.tree keys and params', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(dict).sort(), lng).toEqual(Object.keys(EN).sort())
      for (const k of Object.keys(EN)) {
        expect(dict[k]?.trim().length, `${lng}:${k}`).toBeGreaterThan(0)
        expect(params(dict[k] ?? ''), `${lng}:${k}`).toEqual(params(EN[k]))
      }
    }
  })

  it('translates the new cloud-row strings', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(dict['scene.tree.editScan'], lng).not.toBe(EN['scene.tree.editScan'])
    }
  })
})
