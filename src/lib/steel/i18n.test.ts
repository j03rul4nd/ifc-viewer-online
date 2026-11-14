import { describe, it, expect } from 'vitest'
import { STEEL_TEXTS, steelClassLabel, steelPlural, steelText } from './i18n'

describe('steel texts', () => {
  it('every key in all 10 locales, same placeholders as English', () => {
    const en = STEEL_TEXTS.en
    expect(Object.keys(STEEL_TEXTS).sort()).toEqual(['ca', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh'])
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort()
    for (const [lang, d] of Object.entries(STEEL_TEXTS)) for (const k of Object.keys(en) as Array<keyof typeof en>) {
      // "one" forms: only where the language has them, and "1" may be written out.
      if (k.endsWith('_one')) continue
      expect(d[k], `${lang}.${k}`).toBeTruthy()
      expect(ph(d[k]!), `${lang}.${k}`).toEqual(ph(en[k]!))
    }
  })
  it('interpolates', () => { expect(steelText('es-ES', 'missingWarn_other', { n: 3 })).toMatch(/^3 piezas/) })

  it('singular and plural in every language', () => {
    expect(steelPlural('en', 'missingWarn', 1)).toMatch(/^1 piece has/)
    expect(steelPlural('en', 'missingWarn', 2)).toMatch(/^2 pieces have/)
    expect(steelPlural('es', 'missingWarn', 1)).toMatch(/^1 pieza no tiene/)
    expect(steelPlural('fr', 'missingWarn', 1)).toMatch(/^1 pièce n'a/)
    expect(steelPlural('de', 'missingWarn', 5)).toMatch(/^5 Teile/)
    expect(steelPlural('ja', 'missingWarn', 1)).toMatch(/^1 /)
    for (const lang of Object.keys(STEEL_TEXTS)) for (const n of [1, 2, 7]) {
      const s = steelPlural(lang, 'missingWarn', n)
      expect(s, `${lang} ${n}`).not.toMatch(/\{\{/)
      expect(s, `${lang} ${n}`).toBeTruthy()
    }
  })

  it('class labels are translated, never "Mechanicalfastener"', () => {
    expect(steelClassLabel('en', 'IFCMECHANICALFASTENER')).toBe('Fastener')
    expect(steelClassLabel('es', 'IFCMECHANICALFASTENER')).toBe('Tornillería')
    expect(steelClassLabel('de', 'IFCBEAM')).toBe('Träger')
    expect(steelClassLabel('en', 'IFCELEMENTASSEMBLY')).toBe('Assembly')
    expect(steelClassLabel('en', 'IFCPROXY')).toBe('PROXY')
    expect(steelClassLabel('en', null)).toBe('')
  })

  it('no-profile label in 10 languages', () => {
    for (const lang of Object.keys(STEEL_TEXTS)) expect(steelText(lang, 'noProfile')).toMatch(/\S/)
    expect(steelText('en', 'noProfile')).toBe('(no profile)')
  })
})
