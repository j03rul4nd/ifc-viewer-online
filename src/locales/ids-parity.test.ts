// ─── ids locale key-parity test ───────────────────────────────────────────────
// EN is the source of truth (eagerly bundled, fallback for every locale). ES is
// the second shipped locale (P5-4). This guards against drift: every EN key must
// exist in ES and vice-versa, and {{params}} must match per key so reason codes
// interpolate identically. (§7.9)

import { describe, it, expect } from 'vitest'
import enIds from './en/ids.json'
import esIds from './es/ids.json'

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

const en = flatten(enIds as Json)
const es = flatten(esIds as Json)

describe('ids locale parity (en ↔ es)', () => {
  it('has identical key sets', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })

  it('uses the same interpolation params per key', () => {
    for (const key of Object.keys(en)) {
      expect(paramsOf(es[key] ?? ''), `params drift on ${key}`).toEqual(paramsOf(en[key]))
    }
  })

  it('covers every engine reason code', () => {
    const codes = ['missingRequired', 'wrongValue', 'prohibitedPresent', 'specRequiredButAbsent', 'specProhibitedButPresent', 'wrongDataType', 'unsupportedPattern']
    for (const c of codes) {
      expect(en[`reasons.${c}`], `EN missing reason ${c}`).toBeTruthy()
      expect(es[`reasons.${c}`], `ES missing reason ${c}`).toBeTruthy()
    }
  })
})
