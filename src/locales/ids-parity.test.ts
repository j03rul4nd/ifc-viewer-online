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

  // The honesty strips render inside a coloured banner. A locale missing one of
  // these keys does not fall back to something harmless-looking — i18next returns
  // the key itself, so the user gets "states.unreadableEntities" in red where the
  // explanation should be. Checked across all ten shipped locales, not just ES,
  // because that failure is equally ugly in every one of them.
  it('carries the honesty strings in every shipped locale', () => {
    const all = import.meta.glob('./*/ids.json', { import: 'default', eager: true }) as Record<string, Json>
    const HONESTY = ['states.unreadableEntities', 'states.staleIds', 'states.bufferUnavailable']
    expect(Object.keys(all).length, 'expected ten shipped locales').toBe(10)
    for (const [path, json] of Object.entries(all)) {
      const flat = flatten(json)
      for (const key of HONESTY) {
        expect(flat[key], `${path} is missing ${key}`).toBeTruthy()
        expect(paramsOf(flat[key] ?? ''), `param drift on ${key} in ${path}`).toEqual(paramsOf(en[key]))
      }
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
