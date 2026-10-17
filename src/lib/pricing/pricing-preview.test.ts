import { beforeEach, describe, expect, it } from 'vitest'
import { isPricingPreview } from './pricing-preview'
import { BROWSER_FIXABLE_RULES, featureForRule, pickUpsellRule } from './catalog'
import { BATCH_RENAME_RULES } from '../fix/batch-rename'

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
  it('offers auto-fix only for what the browser cannot fix, a certificate otherwise', () => {
    expect(featureForRule('RULE_MISSING_TYPE')).toBe('auto_fix')
    expect(featureForRule('RULE_PROXY_OVERUSE')).toBe('auto_fix')
    expect(featureForRule('RULE_SPACE_AREA_MISSING')).toBe('certificate')
    expect(featureForRule(undefined)).toBe('certificate')
  })

  it('never sells a fix the panel already does free', () => {
    expect(featureForRule('RULE_DUPLICATE_NAME')).toBe('certificate')
    expect(featureForRule('RULE_EMPTY_NAME')).toBe('certificate')
    expect(featureForRule('RULE_DUPLICATE_GUID')).toBe('certificate')
    expect(featureForRule('RULE_INVALID_GUID_FORMAT')).toBe('certificate')
  })
})

describe('pickUpsellRule', () => {
  it('skips browser-fixable rules when picking the dominant one', () => {
    expect(pickUpsellRule({ RULE_DUPLICATE_NAME: 457, RULE_MISSING_TYPE: 3 })).toBe('RULE_MISSING_TYPE')
    expect(pickUpsellRule({ RULE_MISSING_TYPE: 3, RULE_PROXY_OVERUSE: 9 })).toBe('RULE_PROXY_OVERUSE')
  })

  it('is undefined when every rule with issues is fixable free', () => {
    expect(pickUpsellRule({ RULE_DUPLICATE_NAME: 4, RULE_EMPTY_NAME: 2, RULE_DUPLICATE_GUID: 1 })).toBeUndefined()
    expect(pickUpsellRule({})).toBeUndefined()
  })

  it('every batch-rename rule is in BROWSER_FIXABLE_RULES', () => {
    for (const rule of BATCH_RENAME_RULES) expect(BROWSER_FIXABLE_RULES.has(rule)).toBe(true)
  })
})
