import { describe, expect, it } from 'vitest'
import { pushTrend, type TrendPoint } from '../../../../lib/clash/trend'
import { ADVANCED_RULES, runAdvanced } from '../rules/rules-v2'
import { clashWeek, clientSummary, projectTimeline, renderEmail } from './model'
import { ANSWERS, BRAND, CLASH_TREND, CONTACTS, DEPARTMENTS, PROJECTS, REPLIES, SEGMENTS, TEMPLATES } from './sample'
import { CAPS, abWinner, checkDns, clashRuns, dnsRecords, isDomain, phaseTemplate, planFor, ruleSummary, segmentMembers, senderFor, threadOf, variantOf } from './v2'
import { mxFor } from './strings'

const mx = mxFor('en')
const mdt = PROJECTS[0]

describe('plans', () => {
  it('Pro sends by hand; Team adds automations; own domain only Reception and Enterprise', () => {
    expect(CAPS.pro).toMatchObject({ automations: false, segments: false, abTest: false, ownDomain: false })
    expect(CAPS.team).toMatchObject({ automations: true, ownDomain: false })
    expect(planFor('automations')).toBe('team')
    expect(planFor('ownDomain')).toBe('reception')
  })
  it('without own domain mail leaves from ours, with the department name and the company reply-to', () => {
    const d = DEPARTMENTS[0]
    expect(senderFor('team', d, true)).toEqual({ from: `${d.senderName} <updates@ifcvieweronline.eu>`, replyTo: d.replyTo, own: false })
    expect(senderFor('reception', d, false).own).toBe(false)
    expect(senderFor('reception', d, true).from).toContain(d.from)
  })
})

describe('own domain', () => {
  const recs = dnsRecords('https://Levante.example.com/')
  it('builds SPF, DKIM and DMARC for the bare domain', () => {
    expect(recs.map((r) => [r.kind, r.host])).toEqual([['SPF', 'levante.example.com'], ['DKIM', 'ifcv._domainkey.levante.example.com'], ['DMARC', '_dmarc.levante.example.com']])
    expect(isDomain('levante.example.com')).toBe(true)
    expect(isDomain('not a domain')).toBe(false)
  })
  it('asks to merge an existing SPF and spots two', () => {
    expect(checkDns(recs, { 'levante.example.com': ['v=spf1 include:_spf.google.com ~all'] })[0].hint).toBe('merge-spf')
    expect(checkDns(recs, { 'levante.example.com': ['v=spf1 a ~all', 'v=spf1 mx ~all'] })[0].hint).toBe('two-spf')
    const all = { 'levante.example.com': ['v=spf1 include:_spf.google.com include:amazonses.com ~all'], [recs[1].host]: [recs[1].value], [recs[2].host]: ['v=DMARC1; p=none'] }
    expect(checkDns(recs, all).every((x) => x.ok)).toBe(true)
  })
})

describe('content', () => {
  it('phase templates carry live blocks', () => {
    expect(phaseTemplate('closeout', 'obras', (s) => s).blocks.map((b) => b.kind)).toContain('certificate')
    expect(phaseTemplate('kickoff', 'obras', (s) => s).blocks.map((b) => b.kind)).toContain('timeline')
  })
  it('summary is built from numbers only', () => {
    const s = clientSummary(mdt, mx)
    expect(s[0]).toBe('Model quality is improving: Health Score 82, up 4.')
    expect(s.join(' ')).toContain('12 clashes between disciplines were resolved.')
    expect(s[s.length - 1]).toBe('Next milestone: Façade closed on 2026-12-18.')
  })
  it('timeline newest first', () => {
    const t = projectTimeline(mdt)
    expect(t[0].date >= t[t.length - 1].date).toBe(true)
  })
  it('weekly mail shows clashes and rule checks', () => {
    const html = renderEmail({ template: TEMPLATES[0], project: mdt, brand: BRAND, dept: DEPARTMENTS[0], contact: { name: 'Lucía', lang: 'en' }, messageId: 'm', theme: 'light', mx, unsubscribeUrl: 'u' }).html
    expect(html).toContain('12 clashes resolved this week, 27 still open')
    expect(html).toContain('requirement checks at S4')
  })
})

describe('bridges to rules and clashes', () => {
  it('reads clash trend points without changing them', () => {
    const more: TrendPoint[] = pushTrend(CLASH_TREND, { ...CLASH_TREND[4], at: 'x', open: 20, resolved: 59 })
    expect(clashWeek(clashRuns(more))).toEqual({ open: 20, resolvedThisWeek: 9, openDelta: -7 })
    expect(clashWeek([])).toBeNull()
  })
  it('counts rule failures with runAdvanced, filtered by phase', () => {
    const s4 = ruleSummary('S4')
    const expected = ADVANCED_RULES.filter((a) => !a.rule.phases || a.rule.phases.includes('S4')).reduce((n, a) => n + runAdvanced(a).failures.length, 0)
    expect(s4.failing).toBe(expected)
    expect(ruleSummary('S1').checked).toBeLessThanOrEqual(s4.checked)
  })
})

describe('segments, A/B, threads', () => {
  it('segments filter by role or company', () => {
    expect(segmentMembers(SEGMENTS[1], CONTACTS).map((c) => c.id)).toEqual(['c3'])
    expect(segmentMembers(SEGMENTS[0], CONTACTS).length).toBe(2)
  })
  it('the split is stable and roughly even', () => {
    expect(variantOf('c1', 's')).toBe(variantOf('c1', 's'))
    const ids = Array.from({ length: 200 }, (_, i) => `c${i}`)
    const a = ids.filter((i) => variantOf(i, 'salt') === 'A').length
    expect(a).toBeGreaterThan(70)
    expect(a).toBeLessThan(130)
  })
  it('no winner on too few clicks or a tie', () => {
    expect(abWinner({ A: { sent: 4, clicks: 1 }, B: { sent: 4, clicks: 3 } }).reason).toBe('too-few')
    expect(abWinner({ A: { sent: 50, clicks: 10 }, B: { sent: 50, clicks: 11 } }).reason).toBe('tie')
    expect(abWinner({ A: { sent: 24, clicks: 5 }, B: { sent: 23, clicks: 11 } }).winner).toBe('B')
  })
  it('a reply and its answers form one thread in order', () => {
    expect(threadOf(REPLIES[0], ANSWERS, 'Lucía').map((p) => p.id)).toEqual(['r1', 'a1', 'a2'])
  })
})
