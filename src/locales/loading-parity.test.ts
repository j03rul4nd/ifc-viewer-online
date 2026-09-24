// @vitest-environment node
// ─── loading locale key-parity test ───────────────────────────────────────────
// Same guard the other namespaces have, for the same reason: these files are
// edited ten at a time and a missing key renders a raw string like
// "wait.attach-lane" into the Loading Center. Three things are specific here:
//
//   • every enum value the engine can put in a snapshot — phase, status, wait
//     reason, error code, discipline, priority, memory pressure, counter unit —
//     must have a label in EVERY locale. The label maps in
//     components/loading/labels.ts are the single list; the type system already
//     proves EN has them, this proves the other nine do;
//   • the key comparison is plural-aware. This namespace counts things
//     ("3 queued", "2 models"), and Japanese, Chinese and Thai have a single
//     plural form: once translated they carry only `_other`, and a strict key
//     comparison would fail the translation for being correct;
//   • the error sentences must interpolate the same params, or a locale prints
//     "HTTP {{status}}" literally in a red block.

import { describe, it, expect } from 'vitest'
import enLoading from './en/loading.json'
import esLoading from './es/loading.json'
import deLoading from './de/loading.json'
import frLoading from './fr/loading.json'
import ptLoading from './pt/loading.json'
import itLoading from './it/loading.json'
import caLoading from './ca/loading.json'
import zhLoading from './zh/loading.json'
import jaLoading from './ja/loading.json'
import thLoading from './th/loading.json'
import { LABEL_MAPS, PLURAL_LABEL_MAPS } from '../components/loading/labels'

type Json = Record<string, unknown>

/** Maintenance marker on locales seeded from EN — not a UI string. */
const MARKER_KEY = '_status'

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

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

/** Plural forms collapse to their base key; everything else is itself. */
function baseKeys(dict: Record<string, string>): string[] {
  return [...new Set(Object.keys(dict).map((k) => k.replace(PLURAL_SUFFIX, '')))].sort()
}

/** The string a key resolves to for params comparison: `_other` for plurals. */
function resolve(dict: Record<string, string>, base: string): string | undefined {
  return dict[base] ?? dict[`${base}_other`]
}

const EN = flatten(enLoading as Json)
const LOCALES: Record<string, Record<string, string>> = {
  es: flatten(esLoading as Json), de: flatten(deLoading as Json), fr: flatten(frLoading as Json),
  pt: flatten(ptLoading as Json), it: flatten(itLoading as Json), ca: flatten(caLoading as Json),
  zh: flatten(zhLoading as Json), ja: flatten(jaLoading as Json), th: flatten(thLoading as Json),
}
const ALL: Record<string, Record<string, string>> = { en: EN, ...LOCALES }

describe('loading locale parity', () => {
  const enBase = baseKeys(EN)

  it('every locale has the same key set as EN (plural forms collapsed)', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      expect(baseKeys(dict), `key drift in ${lng}`).toEqual(enBase)
    }
  })

  it('every plural key has its `_other` form in every locale', () => {
    // `_other` is the one form every language has; i18next falls back to it.
    const plurals = Object.keys(EN).filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, ''))
    for (const [lng, dict] of Object.entries(ALL)) {
      for (const base of new Set(plurals)) {
        expect(dict[`${base}_other`], `${lng} is missing ${base}_other`).toBeTruthy()
      }
    }
  })

  it('every locale uses the same interpolation params per key', () => {
    for (const [lng, dict] of Object.entries(LOCALES)) {
      for (const base of enBase) {
        expect(paramsOf(resolve(dict, base) ?? ''), `params drift on ${lng}:${base}`)
          .toEqual(paramsOf(resolve(EN, base) ?? ''))
      }
    }
  })

  it('leaves no empty strings, which render as a blank control', () => {
    for (const [lng, dict] of Object.entries(ALL)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length, `empty ${lng}:${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('labels every engine enum value in every locale', () => {
    for (const [map, keys] of Object.entries(LABEL_MAPS)) {
      for (const [value, key] of Object.entries(keys)) {
        for (const [lng, dict] of Object.entries(ALL)) {
          expect(dict[key]?.trim().length, `${lng} has no ${map} label for "${value}" (${key})`).toBeGreaterThan(0)
        }
      }
    }
    for (const [map, keys] of Object.entries(PLURAL_LABEL_MAPS)) {
      for (const [value, key] of Object.entries(keys)) {
        for (const [lng, dict] of Object.entries(ALL)) {
          expect(dict[`${key}_other`]?.trim().length, `${lng} has no ${map} label for "${value}" (${key}_other)`)
            .toBeGreaterThan(0)
        }
      }
    }
  })

  it('covers the enums completely, not just the values someone remembered', () => {
    // The maps are `satisfies Record<Enum, …>`, so this is belt and braces
    // against a map being narrowed by hand — the sizes are the unions' sizes.
    expect(Object.keys(LABEL_MAPS.phase)).toHaveLength(16)
    expect(Object.keys(LABEL_MAPS.phaseActive)).toHaveLength(16)
    expect(Object.keys(LABEL_MAPS.status)).toHaveLength(9)
    expect(Object.keys(LABEL_MAPS.wait)).toHaveLength(7)
    expect(Object.keys(LABEL_MAPS.error)).toHaveLength(16)
    expect(Object.keys(LABEL_MAPS.discipline)).toHaveLength(13)
    expect(Object.keys(LABEL_MAPS.disciplineShort)).toHaveLength(13)
    expect(Object.keys(LABEL_MAPS.priority)).toHaveLength(5)
    expect(Object.keys(LABEL_MAPS.pressure)).toHaveLength(3)
    expect(Object.keys(PLURAL_LABEL_MAPS.counter)).toHaveLength(5)
  })

  it('keeps the anchor wait naming the model it waits for', () => {
    // "Waiting (coordinate base)" without the name would be the silent
    // reordering the attach lane was built to explain.
    for (const [lng, dict] of Object.entries(ALL)) {
      expect(paramsOf(dict['wait.anchor'] ?? ''), `${lng}:wait.anchor`).toEqual(['name'])
      expect(paramsOf(dict['error.http'] ?? ''), `${lng}:error.http`).toEqual(['status'])
    }
  })

  it('keeps discipline badges short enough for a row', () => {
    for (const [lng, dict] of Object.entries(ALL)) {
      for (const key of Object.values(LABEL_MAPS.disciplineShort)) {
        expect((dict[key] ?? '').length, `${lng}:${key} is too long for a badge`).toBeLessThanOrEqual(6)
      }
    }
  })
})
