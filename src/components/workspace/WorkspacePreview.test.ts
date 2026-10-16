import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WorkspacePreview from './WorkspacePreview'
import CloudJobDialog from './CloudJobDialog'
import CheckoutDialog from './CheckoutDialog'
import { estimateCredits, SAMPLE_ACCOUNT, scenarioData, creditsLeftRatio } from './sample-data'
import PricingSection from '../pricing/PricingSection'

describe('workspace preview (design on sample data)', () => {
  it('renders the overview and labels itself as sample data', () => {
    const html = renderToStaticMarkup(createElement(WorkspacePreview, { onNavigateHome: () => {} }))
    expect(html).toContain('Design preview · sample data')
    expect(html).toContain('credits left')
    expect(html).toContain('Needs your attention')
    // v3 of the hospital scored lower than v2 in the sample data
    expect(html).not.toContain('animate-pulse')
    expect(html).toContain('Hospital Comarcal')
  })

  it('shows the credit cost before a cloud job runs', () => {
    const html = renderToStaticMarkup(createElement(CloudJobDialog, { balance: 164, onClose: () => {} }))
    expect(html).toContain('30 credits')
    expect(html).toContain('deleted when the job ends')
  })

  it('checkout leaves the withdrawal waiver unticked', () => {
    const html = renderToStaticMarkup(createElement(CheckoutDialog, { item: { kind: 'pack', id: 'pack_5', name: 'One-off', priceEur: 5 }, onClose: () => {} }))
    expect(html).toContain('right of withdrawal')
    expect(html).not.toMatch(/checked=""/)
  })

  it('prices large-file validation per started 100 MB', () => {
    expect(estimateCredits('server_validation', 24)).toBe(10)
    expect(estimateCredits('server_validation', 412)).toBe(50)
  })

  it('balance = unused plan credits + pack credits', () => {
    const c = SAMPLE_ACCOUNT.credits
    expect(c.balance).toBe(c.planMonthly - c.planUsed + c.packs)
  })

  it('every review scenario keeps the balance consistent', () => {
    for (const s of ['active', 'new', 'low_credits', 'out_of_credits'] as const) {
      const c = scenarioData(s).account.credits
      expect(c.balance, s).toBe(c.planMonthly - c.planUsed + c.packs)
    }
    expect(creditsLeftRatio(scenarioData('low_credits').account.credits)).toBeLessThanOrEqual(0.2)
    expect(scenarioData('out_of_credits').account.credits.balance).toBe(0)
  })

  it('pricing recommends instead of listing four identical cards', () => {
    const html = renderToStaticMarkup(createElement(PricingSection))
    expect(html).toContain('credits a month')
    expect(html).toContain('<table')
    expect(html).not.toContain('Get Free')
  })
})
