import { describe, expect, it } from 'vitest'
import { pageState } from './dashboard-state'
import { PRICING_LANGS } from '../../lib/pricing/pricing-paths'

describe('pageState', () => {
  it('maps every account state to its variant', () => {
    expect(pageState('anonymous', 'free', 'anonymous', 0)).toBe('anonymous')
    expect(pageState('loading', 'free', 'checking', 0)).toBe('anonymous')
    expect(pageState('signed-in', 'free', 'active', 0)).toBe('free_empty')
    expect(pageState('signed-in', 'free', 'active', 3)).toBe('free_active')
    expect(pageState('signed-in', 'pro', 'active', 0)).toBe('pro')
    expect(pageState('signed-in', 'org', 'active', 5)).toBe('team')
    expect(pageState('signed-in', 'pro', 'past_due', 5)).toBe('past_due')
  })
})

describe('dash strings', () => {
  const load = async (l: string) => (await import(`../../locales/${l}/pro.json`)).default as Record<string, unknown>
  const flat = (o: unknown, p = ''): string[] => typeof o === 'object' && o
    ? Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [p]

  it('exist with the same keys in all ten languages', async () => {
    const en = flat((await load('en')).dash).sort()
    expect(en.length).toBeGreaterThan(40)
    for (const l of PRICING_LANGS) expect(flat((await load(l)).dash).sort(), l).toEqual(en)
  })

  it('never ask about price', async () => {
    for (const l of PRICING_LANGS) {
      const fb = JSON.stringify(((await load(l)).dash as { fb: unknown }).fb).toLowerCase()
      expect(fb, l).not.toMatch(/€|\bpay\b|price|precio|preis|prix|prezzo|preço|preu|价格|価格|ราคา/)
    }
  })
})
