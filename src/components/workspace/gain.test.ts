import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GAIN_DEFAULTS, estimateGain, planMonthlyEur } from './gain'
import GainPanel from './GainPanel'
import PlanComparison from './PlanComparison'
import TrustStrip from './TrustStrip'
import LockedSection from './LockedSection'
import { SECTIONS } from './registry'
import { TOURS } from '../../lib/workspace-tours/tours'

describe('estimated gain', () => {
  it('costs are our list prices from doc 12 §2', () => {
    expect(planMonthlyEur('pro')).toBe(39)
    expect(planMonthlyEur('team')).toBe(177) // 59 × 3 editors
    expect(planMonthlyEur('reception')).toBe(290)
  })

  it('defaults: 12 models × 2.5 h → 17.7 h and €797 a month', () => {
    const g = estimateGain(GAIN_DEFAULTS, 'pro')
    expect(g.hours).toBe(17.7)
    expect(g.savedEur).toBe(797)
    expect(g.netEur).toBe(797 - 39)
    expect(g.paybackDays).toBe(1)
  })

  it('no work in, nothing claimed and no payback', () => {
    const g = estimateGain({ deliveriesPerMonth: 0, reviewHours: 3, hourlyEur: 45 }, 'team')
    expect(g.savedEur).toBe(0)
    expect(g.paybackDays).toBeNull()
  })

  it('ignores nonsense input instead of producing NaN', () => {
    const g = estimateGain({ deliveriesPerMonth: Number.NaN, reviewHours: -4, hourlyEur: 1e9 }, 'pro')
    expect(Number.isFinite(g.savedEur)).toBe(true)
  })
})

describe('front page of the paid workspace', () => {
  it('leads with the gain, marked as an estimate, and never asks for a price', () => {
    const html = renderToStaticMarkup(createElement(GainPanel, { plan: 'pro' }))
    expect(html).toContain('Estimate')
    expect(html).toContain('How this is worked out')
    expect(html).not.toMatch(/would you pay|what you pay|your budget/i)
  })

  it('plans: five columns, doc 12 prices, free stays free', () => {
    const html = renderToStaticMarkup(createElement(PlanComparison, { current: 'pro' }))
    for (const n of ['Free', 'Pro', 'Team', 'Reception', 'Enterprise']) expect(html).toContain(n)
    expect(html).toContain('stays free')
    expect(html).toMatch(/39/)
    expect(html).toMatch(/59/)
    expect(html).toMatch(/290/)
    expect(html).toMatch(/15[.,\s ]?000/)
  })

  it('trust: EU data, verifiable certificates, open-source engine', () => {
    const html = renderToStaticMarkup(createElement(TrustStrip))
    expect(html).toContain('EU')
    expect(html).toContain('check')
    expect(html).toContain('Open-source')
  })

  it('a locked section shows the real screen behind the offer', () => {
    const s = SECTIONS.find((x) => x.id === 'team')!
    const html = renderToStaticMarkup(createElement(LockedSection, { section: s, current: 'pro', period: 'yearly', onUpgrade: () => {}, preview: createElement('p', null, 'REAL SCREEN') }))
    expect(html).toContain('REAL SCREEN')
    expect(html).toContain('data-locked-preview')
    expect(html).toContain('Upgrade to Team')
  })

  it('the overview tour has five steps', () => {
    expect(TOURS.find((t) => t.id === 'overview')!.steps).toHaveLength(5)
  })
})
