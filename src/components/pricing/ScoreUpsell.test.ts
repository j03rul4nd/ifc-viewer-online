import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import ScoreUpsell from './ScoreUpsell'
import es from '../../locales/es/validation.json'
import ja from '../../locales/ja/validation.json'

async function render(lng: string, validation: object, topRule?: string) {
  const i18n = i18next.createInstance()
  await i18n.use(initReactI18next).init({ lng, resources: { [lng]: { validation } }, interpolation: { escapeValue: false } })
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(ScoreUpsell, { score: 72, topRule })),
  )
}

describe('ScoreUpsell', () => {
  it('offers auto-fix in the visitor language for fixable rules, with no prices', async () => {
    const html = await render('es', es, 'RULE_MISSING_TYPE')
    expect(html).toContain('Corrige estos problemas automáticamente')
    expect(html).toContain('Acceso anticipado')
    expect(html).not.toMatch(/€|credit|crédito/i)
  })

  it('offers a certificate for other rules', async () => {
    const html = await render('ja', ja, 'RULE_SPACE_AREA_MISSING')
    expect(html).toContain('このスコアをクライアントに証明')
    expect(html).not.toContain('upsell.')
  })
})
