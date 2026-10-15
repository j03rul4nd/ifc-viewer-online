// toolbar.json: exact recursive key parity across the 10 locales, non-blank
// strings at every depth, and the same {{placeholders}} per key — so a
// translated {{names}} or a forgotten key (sun/sunTooltip, for months) fails.
import { describe, expect, it } from 'vitest'
import en from './en/toolbar.json'
import es from './es/toolbar.json'
import de from './de/toolbar.json'
import fr from './fr/toolbar.json'
import pt from './pt/toolbar.json'
import itLocale from './it/toolbar.json'
import ca from './ca/toolbar.json'
import zh from './zh/toolbar.json'
import ja from './ja/toolbar.json'
import th from './th/toolbar.json'

type Json = Record<string, unknown>
function leaves(value: Json, prefix = ''): [string, unknown][] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' && !Array.isArray(child)
      ? leaves(child as Json, path)
      : [[path, child] as [string, unknown]]
  })
}
const placeholders = (s: unknown): string[] =>
  [...new Set(String(s).match(/{{\s*\w+\s*}}/g) ?? [])].map((p) => p.replace(/\s/g, '')).sort()

const EN = new Map(leaves(en as Json))
const LOCALES = { es, de, fr, pt, it: itLocale, ca, zh, ja, th }

describe('toolbar locales', () => {
  it.each(Object.entries(LOCALES))('%s has exactly the EN keys', (_locale, copy) => {
    expect(leaves(copy as Json).map(([k]) => k).sort()).toEqual([...EN.keys()].sort())
  })

  it.each(Object.entries({ en, ...LOCALES }))('%s has a non-blank string at every leaf', (_locale, copy) => {
    for (const [key, value] of leaves(copy as Json)) {
      expect(typeof value, key).toBe('string')
      expect(String(value).trim(), key).not.toBe('')
    }
  })

  it.each(Object.entries(LOCALES))('%s keeps the EN placeholders', (_locale, copy) => {
    for (const [key, value] of leaves(copy as Json)) {
      expect(placeholders(value), key).toEqual(placeholders(EN.get(key)))
    }
  })
})
