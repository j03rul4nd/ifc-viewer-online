// ─── invite locale key-parity test ────────────────────────────────────────────
// The invite namespace ships in all 10 locales (EN is the bundled fallback). This
// guards against drift: every locale must carry the exact same key set and the
// same {{params}} per key (so the founder signature interpolates everywhere).

import { describe, it, expect } from 'vitest'
import enInvite from './en/invite.json'
import esInvite from './es/invite.json'
import deInvite from './de/invite.json'
import frInvite from './fr/invite.json'
import ptInvite from './pt/invite.json'
import itInvite from './it/invite.json'
import caInvite from './ca/invite.json'
import zhInvite from './zh/invite.json'
import jaInvite from './ja/invite.json'
import thInvite from './th/invite.json'

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

const EN = flatten(enInvite as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esInvite as Json), de: flatten(deInvite as Json), fr: flatten(frInvite as Json),
  pt: flatten(ptInvite as Json), it: flatten(itInvite as Json), ca: flatten(caInvite as Json),
  zh: flatten(zhInvite as Json), ja: flatten(jaInvite as Json), th: flatten(thInvite as Json),
}

describe('invite locale parity', () => {
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
