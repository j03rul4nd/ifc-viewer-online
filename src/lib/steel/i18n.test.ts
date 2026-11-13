import { describe, it, expect } from 'vitest'
import { STEEL_TEXTS, steelText } from './i18n'

describe('steel texts', () => {
  it('every key in all 10 locales, same placeholders as English', () => {
    const en = STEEL_TEXTS.en
    expect(Object.keys(STEEL_TEXTS).sort()).toEqual(['ca', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh'])
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort()
    for (const [lang, d] of Object.entries(STEEL_TEXTS)) for (const k of Object.keys(en) as Array<keyof typeof en>) {
      expect(d[k], `${lang}.${k}`).toBeTruthy()
      expect(ph(d[k]!), `${lang}.${k}`).toEqual(ph(en[k]!))
    }
  })
  it('interpolates', () => { expect(steelText('es-ES', 'missingWarn', { n: 3 })).toMatch(/^3 piezas/) })
})
