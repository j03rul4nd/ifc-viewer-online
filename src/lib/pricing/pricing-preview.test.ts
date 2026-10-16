import { beforeEach, describe, expect, it } from 'vitest'
import { isPricingPreview } from './pricing-preview'
import { featureForRule } from './catalog'

describe('isPricingPreview', () => {
  beforeEach(() => sessionStorage.clear())

  it('is hidden by default', () => {
    expect(isPricingPreview('')).toBe(false)
  })

  it('unlocks with ?preview=pricing and remembers it for the tab', () => {
    expect(isPricingPreview('?preview=pricing')).toBe(true)
    expect(isPricingPreview('')).toBe(true)
  })

  it('locks again with ?preview=off', () => {
    isPricingPreview('?preview=pricing')
    expect(isPricingPreview('?preview=off')).toBe(false)
    expect(isPricingPreview('')).toBe(false)
  })
})

describe('featureForRule', () => {
  it('offers auto-fix for fixable naming/type rules, a certificate otherwise', () => {
    expect(featureForRule('RULE_MISSING_TYPE')).toBe('auto_fix')
    expect(featureForRule('RULE_PROXY_OVERUSE')).toBe('auto_fix')
    expect(featureForRule('RULE_SPACE_AREA_MISSING')).toBe('certificate')
    expect(featureForRule(undefined)).toBe('certificate')
  })
})
