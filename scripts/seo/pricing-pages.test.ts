import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { PRICING_LANGS, pricingPath } from '../../src/lib/pricing/pricing-paths'
import { GROUPS, PLAN_FOR_ROLE, PRICES, ROLES, waitlistRoleFor } from './pricing/pricing-data'
import { COPY, type PricingCopy } from './pricing/pricing-i18n'
import { CSS, eur, renderPricingPage } from './generate-pricing-pages'

const ROOT = path.resolve(__dirname, '..', '..')

describe('pricing data', () => {
  it('keeps the prices of docs-planning/12 (B2B ladder, 2026-11-11)', () => {
    expect(PRICES.pro).toEqual({ perMonthYearly: 39, yearly: 468, monthly: 47 })
    expect(PRICES.team).toEqual({ perEditorMonthYearly: 59, yearlyPerEditor: 708, monthlyPerEditor: 71, minEditors: 3 })
    expect(PRICES.reception).toEqual({ fromPerProject: 290, suppliersPerProject: 15, fromPortfolio: 790 })
    expect(PRICES.developer).toEqual({ perMonthYearly: 149, yearly: 1788, monthly: 179 })
    expect(PRICES.enterprise.fromYearly).toBe(15000)
    expect(PRICES.founder).toEqual({ discountPct: 30, customers: 10, months: 12 })
  })

  it('yearly is twelve times the headline, and month to month is about 20 % more', () => {
    for (const [head, year, month] of [
      [PRICES.pro.perMonthYearly, PRICES.pro.yearly, PRICES.pro.monthly],
      [PRICES.team.perEditorMonthYearly, PRICES.team.yearlyPerEditor, PRICES.team.monthlyPerEditor],
      [PRICES.developer.perMonthYearly, PRICES.developer.yearly, PRICES.developer.monthly],
    ]) {
      expect(year).toBe(head * 12)
      expect(Math.abs(month / head - 1.2)).toBeLessThan(0.02)
    }
  })

  it('the free plan gets nothing that needs a server', () => {
    for (const g of GROUPS) for (const r of g.rows) {
      if (r.id !== 'browser') expect(r.cells.free, r.id).toBe(false)
    }
  })

  it('every role leads to a plan, and the waitlist role follows the plan', () => {
    expect(PLAN_FOR_ROLE).toEqual({ open: 'free', solo: 'pro', team: 'team', receive: 'reception', build: 'developer' })
    expect(waitlistRoleFor('reception')).toBe('receive')
    expect(waitlistRoleFor('enterprise')).toBe('receive')
    expect(waitlistRoleFor('developer')).toBe('build')
    expect(waitlistRoleFor('team')).toBe('deliver')
  })
})

describe('pricing copy ×10', () => {
  // Every string path of the English copy must exist, non-empty, in every language.
  const paths = (o: unknown, pre = ''): string[] =>
    typeof o === 'string' ? [pre] : Array.isArray(o) ? o.flatMap((v, i) => paths(v, `${pre}[${i}]`))
      : Object.entries(o as object).flatMap(([k, v]) => paths(v, pre ? `${pre}.${k}` : k))
  const get = (o: unknown, p: string): unknown => p.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o)
  const enPaths = paths(COPY.en)

  it.each(PRICING_LANGS)('%s has every string', (lang) => {
    for (const p of enPaths) expect(get(COPY[lang], p), `${lang}: ${p}`).toSatisfy((v: unknown) => typeof v === 'string' && v.trim().length > 0)
    expect(paths(COPY[lang]).length).toBe(enPaths.length)
  })

  it.each(PRICING_LANGS)('%s keeps every placeholder of the English string', (lang) => {
    for (const p of enPaths) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
      expect(ph(get(COPY[lang], p) as string), `${lang}: ${p}`).toBe(ph(get(COPY.en, p) as string))
    }
  })

  it('each role and each answer is written for every language', () => {
    for (const lang of PRICING_LANGS) {
      const c: PricingCopy = COPY[lang]
      for (const r of ROLES) expect(c.pick.roles[r]).toBeTruthy()
    }
  })

  it('never asks how much someone would pay', () => {
    const all = JSON.stringify(COPY).toLowerCase()
    for (const bad of ['would you pay', 'pagarías', 'cuánto pagar', 'willing to pay']) expect(all).not.toContain(bad)
  })
})

describe('pricing page HTML', () => {
  it.each(PRICING_LANGS)('%s: canonical, the full hreflang set and its language', (lang) => {
    const html = renderPricingPage(lang)
    expect(html).toContain(`<html lang="${COPY[lang].htmlLang}">`)
    expect(html).toContain(`<link rel="canonical" href="https://www.ifcvieweronline.eu${pricingPath(lang)}" />`)
    for (const l of PRICING_LANGS) expect(html).toContain(`hreflang="${l}" href="https://www.ifcvieweronline.eu${pricingPath(l)}"`)
    expect(html).toContain('hreflang="x-default"')
    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
  })

  it.each(PRICING_LANGS)('%s: prices on the page are the data, formatted for the language', (lang) => {
    const html = renderPricingPage(lang)
    for (const n of [39, 468, 47, 59, 708, 71, 290, 790, 149, 15000]) expect(html, `${lang} ${n}`).toContain(eur(lang, n).replace(/&/g, '&amp;'))
  })

  it('works without JavaScript: every plan and every row is in the HTML', () => {
    const html = renderPricingPage('en')
    for (const p of ['free', 'pro', 'team']) expect(html).toContain(`id="h-${p}"`)
    for (const g of GROUPS) for (const r of g.rows) expect(html).toContain(COPY.en.rows[r.id].label)
    expect(html).toContain('id="reception"')
    expect(html).toContain('data-plan="developer"')
  })

  it('plan cells say included / not included to screen readers, not only with a symbol', () => {
    const html = renderPricingPage('en')
    expect(html).toContain('<span class="sr">Included</span>')
    expect(html).toContain('<span class="sr">Not included</span>')
  })

  it('choices are real radio buttons (keyboard and screen readers for free)', () => {
    const html = renderPricingPage('en')
    expect(html.match(/type="radio" name="role"/g)).toHaveLength(ROLES.length)
    expect(html.match(/type="radio" name="show"/g)).toHaveLength(3)
  })
})

describe('pricing styles', () => {
  it('colours live only in the theme token blocks', () => {
    const outside = CSS.replace(/:root\{[^}]*\}/, '').replace(/@media \(prefers-color-scheme: light\)\{:root:not\(\[data-theme="dark"\]\)\{[^}]*\}\}/, '').replace(/:root\[data-theme="light"\]\{[^}]*\}/, '')
    expect(outside.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([])
  })

  it('no text below 13 px', () => {
    const sizes = [...CSS.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
    const tokens = [...CSS.matchAll(/--t-\w+:(\d+)px/g)].map((m) => Number(m[1]))
    expect(Math.min(...sizes, ...tokens)).toBeGreaterThanOrEqual(13)
  })

  // WCAG 2.2 AA: 4.5:1 for every text token on the canvas and the panel, both themes.
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
  const block = (re: RegExp) => Object.fromEntries([...(CSS.match(re)?.[0] ?? '').matchAll(/--([\w-]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
  it.each([
    ['dark', /:root\{[^}]*\}/],
    ['light', /:root\[data-theme="light"\]\{[^}]*\}/],
  ])('%s theme text contrast', (_, re) => {
    const t = block(re)
    for (const bg of ['canvas', 'panel']) for (const fg of ['text', 'text-2', 'text-3', 'accent-text']) {
      expect(ratio(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(ratio(t['on-accent'], t.accent), 'button text').toBeGreaterThanOrEqual(4.5)
  })
})

describe('generated files', () => {
  it.each(PRICING_LANGS)('public%s is up to date with the generator', (lang) => {
    const file = path.join(ROOT, 'public', pricingPath(lang), 'index.html')
    expect(existsSync(file), 'run: npx tsx scripts/seo/generate-pricing-pages.ts').toBe(true)
    expect(readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')).toBe(renderPricingPage(lang))
  })
})
