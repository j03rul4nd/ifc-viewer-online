// @vitest-environment jsdom
// T-322v: script texts come from assets/ifcvo-i18n-<lang>.json instead of Liquid.
import { describe, expect, it } from 'vitest'
import { LANGS, fill, pickLang } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-i18n.js'

describe('ifcvo-i18n', () => {
  it('picks the exact locale, then the base language, then English', () => {
    expect(pickLang('pt-BR')).toBe('pt-BR')
    expect(pickLang('zh-cn')).toBe('zh-CN')
    expect(pickLang('de-AT')).toBe('de')
    expect(pickLang('zh-TW')).toBe('zh-CN')
    expect(pickLang('nl')).toBe('en')
    expect(pickLang('')).toBe('en')
    expect(LANGS).toContain('en')
  })

  it('fills data-labels and data-<attr> from the groups, never overwriting', () => {
    document.body.innerHTML =
      '<div id="a" data-i18n="dpp"></div>' +
      '<div id="b" data-i18n="compat" data-i18n-rule-labels="compat_rules"></div>' +
      '<div id="c" data-i18n="dpp" data-labels="{&quot;title&quot;:&quot;keep&quot;}"></div>'
    fill({ dpp: { title: 'Pasaporte' }, compat: { schema: 'Esquema' }, compat_rules: { empty_name: 'Vacío' } })
    expect(JSON.parse(document.getElementById('a')!.dataset.labels!)).toEqual({ title: 'Pasaporte' })
    expect(JSON.parse(document.getElementById('b')!.dataset.ruleLabels!)).toEqual({ empty_name: 'Vacío' })
    expect(JSON.parse(document.getElementById('c')!.dataset.labels!)).toEqual({ title: 'keep' })
  })

  it('without texts (fetch failed) leaves the elements alone', () => {
    document.body.innerHTML = '<div id="a" data-i18n="dpp"></div>'
    fill(null)
    expect(document.getElementById('a')!.dataset.labels).toBeUndefined()
  })
})
