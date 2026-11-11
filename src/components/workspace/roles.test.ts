import { describe, expect, it } from 'vitest'
import { accessFor, canSee, DEFAULTS, GRANTABLE, PAID_ROLES, ROLES, SAMPLE_POLICIES, toggled, valueOf } from './roles'
import { wouldFire } from './sections/Automations'

describe('workspace roles', () => {
  it('free seats can never take a paid seat\'s work, and only the owner handles billing', () => {
    for (const r of ROLES.filter((x) => !PAID_ROLES.includes(x))) {
      for (const a of ['version.upload', 'version.publish', 'automations.manage', 'members.manage', 'billing'] as const) expect(GRANTABLE[r]).not.toContain(a)
    }
    for (const r of ROLES.filter((x) => x !== 'owner')) expect(GRANTABLE[r]).not.toContain('billing')
    for (const r of ROLES) for (const a of DEFAULTS[r]) expect(GRANTABLE[r]).toContain(a)
  })
  it('refuses a toggle outside the limits, on the owner, or on reading', () => {
    expect(toggled(SAMPLE_POLICIES, 'viewer', 'version.upload')).toBe(SAMPLE_POLICIES)
    expect(toggled(SAMPLE_POLICIES, 'owner', 'billing')).toBe(SAMPLE_POLICIES)
    expect(toggled(SAMPLE_POLICIES, 'editor', 'read')).toBe(SAMPLE_POLICIES)
    expect(toggled(SAMPLE_POLICIES, 'editor', 'version.publish').editor).not.toContain('version.publish')
  })
  it('each person sees their screens, and a policy change moves them', () => {
    const management = accessFor('management', SAMPLE_POLICIES, () => {})
    expect(canSee('value', management.can)).toBe(true)
    expect(canSee('jobs', management.can)).toBe(false)
    expect(canSee('billing', accessFor('coordinator', SAMPLE_POLICIES, () => {}).can)).toBe(false)
    expect(canSee('automations', accessFor('subcontractor', SAMPLE_POLICIES, () => {}).can)).toBe(false)
    const without = toggled(SAMPLE_POLICIES, 'viewer', 'value.read')
    expect(canSee('value', accessFor('management', without, () => {}).can)).toBe(false)
  })
  it('sums value the way the API does', () => {
    expect(valueOf({ runMinutes: 600, rejected: 20, rejectedMinutes: 45, hourlyEur: 45, monthlyCostEur: 105, months: 3 })).toMatchObject({ hours: 25, saved: 1125, cost: 315, net: 810, multiple: 3.6 })
  })
  it('tries a rule on history', () => {
    expect(wouldFire({ trigger: 'version', cond: 'score_drop', value: 5, contains: '' })).toEqual(['HCA_MEP_v5.ifc', 'HCA_EST_v4.ifc'])
    expect(wouldFire({ trigger: 'version', cond: 'score_below', value: 80, contains: 'mep' })).toEqual(['HCA_MEP_v5.ifc', 'CEIP_MEP_v2.ifc'])
    expect(wouldFire({ trigger: 'overdue', cond: 'overdue_days', value: 2, contains: '' })).toEqual([])
  })
})
