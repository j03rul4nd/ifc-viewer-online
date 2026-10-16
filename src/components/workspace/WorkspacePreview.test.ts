import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WorkspacePreview from './WorkspacePreview'
import CloudJobDialog from './CloudJobDialog'
import CheckoutDialog from './CheckoutDialog'
import { estimateCredits, SAMPLE_ACCOUNT } from './sample-data'

describe('workspace preview (design on sample data)', () => {
  it('renders the overview and labels itself as sample data', () => {
    const html = renderToStaticMarkup(createElement(WorkspacePreview, { onNavigateHome: () => {} }))
    expect(html).toContain('Design preview · sample data')
    expect(html).toContain('credits available')
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
})
