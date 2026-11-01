import { describe, expect, it } from 'vitest'
import en from './en/drawings.json'
import es from './es/drawings.json'
import de from './de/drawings.json'
import fr from './fr/drawings.json'
import pt from './pt/drawings.json'
import itLocale from './it/drawings.json'
import ca from './ca/drawings.json'
import zh from './zh/drawings.json'
import ja from './ja/drawings.json'
import th from './th/drawings.json'

type Json = Record<string, unknown>
function keys(value: Json, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' && !Array.isArray(child)
      ? keys(child as Json, path)
      : [path]
  })
}

describe('drawings locales', () => {
  it('keep exact key parity and no blank copy', () => {
    const expected = keys(en as Json).sort()
    for (const [locale, copy] of Object.entries({ es, de, fr, pt, it: itLocale, ca, zh, ja, th })) {
      expect(keys(copy as Json).sort(), `${locale} differs from en`).toEqual(expected)
      for (const value of Object.values(copy as Json)) expect(value).not.toBe('')
    }
  })
})
