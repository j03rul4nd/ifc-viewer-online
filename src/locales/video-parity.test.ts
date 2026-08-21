import { describe, expect, it } from 'vitest'
import en from './en/video.json'
import es from './es/video.json'
import de from './de/video.json'
import fr from './fr/video.json'
import pt from './pt/video.json'
import itLocale from './it/video.json'
import ca from './ca/video.json'
import zh from './zh/video.json'
import ja from './ja/video.json'
import th from './th/video.json'

type Json = Record<string, unknown>
function keys(value: Json, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' && !Array.isArray(child)
      ? keys(child as Json, path)
      : [path]
  })
}

describe('video locales', () => {
  it('keep exact key parity and no blank copy', () => {
    const expected = keys(en as Json).sort()
    for (const [locale, copy] of Object.entries({ es, de, fr, pt, it: itLocale, ca, zh, ja, th })) {
      expect(keys(copy as Json).sort(), `${locale} differs from en`).toEqual(expected)
      for (const value of Object.values(copy as Json)) expect(value).not.toBe('')
    }
  })
})
