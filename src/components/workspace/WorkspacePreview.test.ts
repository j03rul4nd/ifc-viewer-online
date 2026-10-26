import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WorkspacePreview from './WorkspacePreview'
import CloudJobDialog from './CloudJobDialog'
import CheckoutDialog from './CheckoutDialog'
import { estimateCredits, SAMPLE_ACCOUNT, scenarioData, creditsLeftRatio } from './sample-data'
import PricingSection from '../pricing/PricingSection'
import { SECTIONS, canUse, sectionFromPath } from './registry'
import LockedSection from './LockedSection'
import Billing from './sections/Billing'
import Settings from './sections/Settings'
import Privacy from './sections/Privacy'
import Support from './sections/Support'
import CancelFlow from './CancelFlow'
import ContactDialog from './ContactDialog'

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
    const html = renderToStaticMarkup(createElement(CheckoutDialog, { item: { kind: 'pack', pack: 'pack_5' }, onClose: () => {} }))
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

  it('checkout shows the VAT breakdown before payment', () => {
    const html = renderToStaticMarkup(createElement(CheckoutDialog, { item: { kind: 'plan', plan: 'pro', period: 'monthly' }, onClose: () => {} }))
    expect(html).toContain('VAT 21% (ES)')
    expect(html).toContain('Buying for a company')
    expect(html).toMatch(/Pay .*19/)
  })

  it('every section is reachable by URL and Team is locked for Pro', () => {
    for (const s of SECTIONS) expect(sectionFromPath(`/workspace/${s.id}`)).toBe(s.id)
    expect(sectionFromPath('/workspace/nope')).toBe('overview')
    const team = SECTIONS.find((s) => s.id === 'team')!
    expect(canUse('pro', team)).toBe(false)
    expect(canUse('team', team)).toBe(true)
    const html = renderToStaticMarkup(createElement(LockedSection, { section: team, current: 'pro', period: 'monthly', onUpgrade: () => {} }))
    expect(html).toContain('Upgrade to Team')
  })

  it('lists render as phone cards and as a tablet/desktop table', () => {
    const noop = () => {}
    const html = renderToStaticMarkup(createElement(Billing, { data: scenarioData('active'), actions: { go: noop, newJob: noop, topUp: noop, buy: noop, contact: noop, openProject: noop } }))
    expect(html).toContain('Most bought')
    expect(html).toContain('•••• 4242')
    const overview = renderToStaticMarkup(createElement(WorkspacePreview, { onNavigateHome: noop }))
    expect(overview).toContain('md:hidden')
    expect(overview).toContain('hidden md:block')
  })

  const noop = () => {}
  const actions = { go: noop, newJob: noop, topUp: noop, buy: noop, contact: noop, openProject: noop }

  it('account sections render their core controls', () => {
    const data = scenarioData('active')
    const settings = renderToStaticMarkup(createElement(Settings, { data, actions }))
    expect(settings).toContain('Save changes')
    expect(settings).toContain('Delete your account and data')
    const privacy = renderToStaticMarkup(createElement(Privacy, { data, actions }))
    expect(privacy).toContain('Get a copy of your data')
    expect(privacy).toContain('6 years')
    const support = renderToStaticMarkup(createElement(Support, { data, actions }))
    expect(support).toContain('Waiting for your reply')
    expect(support).toContain('Report a problem')
  })

  it('cancelling starts by asking why and always offers a way out', () => {
    const html = renderToStaticMarkup(createElement(CancelFlow, { renewsOn: '2026-11-16', credits: 170, onClose: noop, onYearly: noop, onContact: noop }))
    expect(html).toContain('why are you cancelling')
    expect(html).toContain('Keep my plan')
  })

  it('a bug report shows the technical details it will attach', () => {
    const html = renderToStaticMarkup(createElement(ContactDialog, { kind: 'bug', section: 'jobs', refId: 'j-1040', onClose: noop }))
    expect(html).toContain('Include technical details')
    expect(html).toContain('j-1040')
  })

  it('every new section is routable', () => {
    for (const id of ['settings', 'privacy', 'support'] as const) expect(sectionFromPath(`/workspace/${id}/x`)).toBe(id)
  })
})
