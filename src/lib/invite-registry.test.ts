import { describe, it, expect } from 'vitest'
import {
  resolveInvite,
  shouldShowInviteRibbon,
  shouldShowInviteView,
  inviteRibbonKey,
  inviteViewKey,
  inviteFeedbackKey,
  type InviteContext,
} from './invite-registry'

const SEGMENTS = new Set(['coordinator', 'dev', 'standards'])
const KINDS = new Set(['linkedin', 'medium', 'referral', 'public'])

describe('resolveInvite', () => {
  it('resolves seeded codes to their segment + source kind', () => {
    expect(resolveInvite('li_ignacy')).toMatchObject({ segment: 'coordinator', sourceKind: 'linkedin' })
    expect(resolveInvite('li_dion')).toMatchObject({ segment: 'dev', sourceKind: 'linkedin' })
    expect(resolveInvite('li_noardo')).toMatchObject({ segment: 'standards', sourceKind: 'linkedin' })
    expect(resolveInvite('hn')).toMatchObject({ segment: 'dev', sourceKind: 'public' })
  })

  it('carries the per-code locale (Carlos → pt)', () => {
    expect(resolveInvite('li_carlos')?.locale).toBe('pt')
  })

  it('matches the dynamic md_/warm_ families by prefix', () => {
    expect(resolveInvite('md_duplicate-guids')).toMatchObject({ sourceKind: 'medium' })
    expect(resolveInvite('warm_konrad')).toMatchObject({ sourceKind: 'referral' })
  })

  it('returns null for unknown / empty codes', () => {
    expect(resolveInvite('totally_unknown')).toBeNull()
    expect(resolveInvite(undefined)).toBeNull()
    expect(resolveInvite('')).toBeNull()
  })

  it('every seeded entry is categorical-only (no free-text PII)', () => {
    // Guard: resolved context must only ever carry enum/locale values, never a
    // human name/employer string.
    for (const code of ['li_ignacy', 'li_carlos', 'li_dion', 'li_antonio', 'li_plannerly', 'hn', 'reddit']) {
      const ctx = resolveInvite(code)!
      expect(SEGMENTS.has(ctx.segment)).toBe(true)
      expect(KINDS.has(ctx.sourceKind)).toBe(true)
      if (ctx.locale) expect(ctx.locale).toMatch(/^[a-z]{2}$/)
    }
  })
})

describe('shouldShowInviteRibbon', () => {
  const base: InviteContext = { code: 'li_ignacy', segment: 'coordinator', sourceKind: 'linkedin' }

  it('shows for a known non-public context on desktop, undismissed', () => {
    expect(shouldShowInviteRibbon(base, { isMobile: false, dismissed: false })).toBe(true)
  })

  it('hides on mobile, when dismissed, for public sources, or when unknown', () => {
    expect(shouldShowInviteRibbon(base, { isMobile: true, dismissed: false })).toBe(false)
    expect(shouldShowInviteRibbon(base, { isMobile: false, dismissed: true })).toBe(false)
    expect(shouldShowInviteRibbon({ ...base, sourceKind: 'public' }, { isMobile: false, dismissed: false })).toBe(false)
    expect(shouldShowInviteRibbon({ ...base, showRibbon: false }, { isMobile: false, dismissed: false })).toBe(false)
    expect(shouldShowInviteRibbon(null, { isMobile: false, dismissed: false })).toBe(false)
  })
})

describe('inviteRibbonKey', () => {
  it('keys referral/medium by source and everything else by segment', () => {
    expect(inviteRibbonKey({ code: 'x', segment: 'coordinator', sourceKind: 'linkedin' })).toBe('ribbon.coordinator')
    expect(inviteRibbonKey({ code: 'x', segment: 'dev', sourceKind: 'linkedin' })).toBe('ribbon.dev')
    expect(inviteRibbonKey({ code: 'x', segment: 'standards', sourceKind: 'linkedin' })).toBe('ribbon.standards')
    expect(inviteRibbonKey({ code: 'x', segment: 'coordinator', sourceKind: 'referral' })).toBe('ribbon.referral')
    expect(inviteRibbonKey({ code: 'x', segment: 'coordinator', sourceKind: 'medium' })).toBe('ribbon.medium')
  })
})

describe('shouldShowInviteView', () => {
  it('shows for referrals and the standards segment', () => {
    expect(shouldShowInviteView({ code: 'x', segment: 'coordinator', sourceKind: 'referral' }, { dismissed: false })).toBe(true)
    expect(shouldShowInviteView({ code: 'x', segment: 'standards', sourceKind: 'linkedin' }, { dismissed: false })).toBe(true)
  })

  it('does not show for coordinators/devs, public, dismissed, or unknown', () => {
    expect(shouldShowInviteView({ code: 'x', segment: 'coordinator', sourceKind: 'linkedin' }, { dismissed: false })).toBe(false)
    expect(shouldShowInviteView({ code: 'x', segment: 'dev', sourceKind: 'linkedin' }, { dismissed: false })).toBe(false)
    expect(shouldShowInviteView({ code: 'x', segment: 'standards', sourceKind: 'public' }, { dismissed: false })).toBe(false)
    expect(shouldShowInviteView({ code: 'x', segment: 'standards', sourceKind: 'linkedin' }, { dismissed: true })).toBe(false)
    expect(shouldShowInviteView(null, { dismissed: false })).toBe(false)
  })

  it('is mutually exclusive with the ribbon for standards (view wins)', () => {
    const standards: InviteContext = { code: 'li_noardo', segment: 'standards', sourceKind: 'linkedin' }
    expect(shouldShowInviteView(standards, { dismissed: false })).toBe(true)
    // App gates the ribbon behind !shouldShowInviteView, so both never show at once.
  })
})

describe('inviteViewKey / inviteFeedbackKey', () => {
  it('picks the dedicated-view block (referral wins over segment)', () => {
    expect(inviteViewKey({ code: 'x', segment: 'standards', sourceKind: 'referral' })).toBe('view.referral')
    expect(inviteViewKey({ code: 'x', segment: 'standards', sourceKind: 'linkedin' })).toBe('view.standards')
  })

  it('keys the Mom-Test question by segment', () => {
    expect(inviteFeedbackKey({ code: 'x', segment: 'coordinator', sourceKind: 'linkedin' })).toBe('feedback.q.coordinator')
    expect(inviteFeedbackKey({ code: 'x', segment: 'dev', sourceKind: 'linkedin' })).toBe('feedback.q.dev')
    expect(inviteFeedbackKey({ code: 'x', segment: 'standards', sourceKind: 'referral' })).toBe('feedback.q.standards')
  })
})
