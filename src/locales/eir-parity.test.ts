// ─── eir locale key-parity test ───────────────────────────────────────────────
// EN is the source of truth (eagerly bundled, fallback for every locale). ES is
// the second shipped locale. Guards against drift: every EN key must exist in ES
// and vice-versa, and {{params}} must match per key. Mirrors ids-parity.test.ts.

import { describe, it, expect } from 'vitest'
import enEir from './en/eir.json'
import esEir from './es/eir.json'

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

const en = flatten(enEir as Json)
const es = flatten(esEir as Json)

describe('eir locale parity (en ↔ es)', () => {
  it('has identical key sets', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })

  it('uses the same interpolation params per key', () => {
    for (const key of Object.keys(en)) {
      expect(paramsOf(es[key] ?? ''), `params drift on ${key}`).toEqual(paramsOf(en[key]))
    }
  })
})
