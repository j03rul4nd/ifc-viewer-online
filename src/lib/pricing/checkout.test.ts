import { describe, expect, it } from 'vitest'
import { quote, looksLikeVatId, itemPrice } from './checkout'

const pro = { kind: 'plan', plan: 'pro', period: 'monthly' } as const

describe('checkout quote', () => {
  it('a Spanish consumer pays the list price to the cent', () => {
    const q = quote(pro, { country: 'ES', business: false })
    expect(q.totalEur).toBe(19)
    expect(q.vatRate).toBe(21)
    expect(q.netEur + q.vatEur).toBeCloseTo(19, 2)
  })

  it('another EU consumer pays their own VAT on the same net', () => {
    const q = quote(pro, { country: 'DE', business: false })
    expect(q.vatRate).toBe(19)
    expect(q.netEur).toBe(15.7)
    expect(q.totalEur).toBe(18.68)
  })

  it('an EU business abroad with a VAT ID is reverse-charged', () => {
    const q = quote(pro, { country: 'FR', business: true, vatId: 'FR 12 345678901' })
    expect(q.reverseCharge).toBe(true)
    expect(q.vatEur).toBe(0)
    expect(q.totalEur).toBe(q.netEur)
  })

  it('a Spanish business still pays Spanish VAT', () => {
    const q = quote(pro, { country: 'ES', business: true, vatId: 'ESB12345678' })
    expect(q.reverseCharge).toBe(false)
    expect(q.totalEur).toBe(19)
  })

  it('outside the EU there is no EU VAT', () => {
    const q = quote(pro, { country: 'US', business: false })
    expect(q.vatEur).toBe(0)
    expect(q.totalEur).toBe(q.netEur)
  })

  it('yearly plans show what they save over twelve months', () => {
    const p = itemPrice({ kind: 'plan', plan: 'pro', period: 'yearly' })
    expect(p.recurring).toBe('yearly')
    expect(p.savingEur).toBe(19 * 12 - 190)
  })

  it('packs are one-off', () => {
    expect(quote({ kind: 'pack', pack: 'pack_19' }, { country: 'ES', business: false }).recurring).toBeNull()
  })

  it('VAT ID shape check uses EL for Greece', () => {
    expect(looksLikeVatId('EL123456789', 'GR')).toBe(true)
    expect(looksLikeVatId('GR123456789', 'GR')).toBe(false)
    expect(looksLikeVatId('', 'FR')).toBe(false)
  })
})
