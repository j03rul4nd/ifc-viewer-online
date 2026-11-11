import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  MAIL_LIVE, MailDisabledError, QueueError, aggregateClicks, canReceive, confirmConsent, decide, dryRunAdapter, envelopeFor, historyOf, moveBlock,
  nextRun, portalLink, queueFromEvent, quotaUse, recipientsFor, renderEmail, resendAdapter, sendMessage, smtpAdapter, suggestRoute, withdraw,
} from './model'
import { AUTOMATIONS, BRAND, CONTACTS, DEPARTMENTS, OUTGOING, PROJECTS, REPLIES, TEMPLATES } from './sample'
import { MX_LOCALES, mxFor } from './strings'
import ClientMail, { BLOCK_LABELS, CONSENT_LABELS, KIND_LABELS, SAMPLE_KEYS, SOURCE_LABELS, STATUS_LABELS, TAB_LABELS, TRIGGER_LABELS, WEEKDAYS } from './ClientMail'
import type { SectionProps } from '../../registry'
import { GATE_TEXTS, HINT_LABELS, PHASE_LABELS, PHASE_STATE_LABELS, PLAN_LABELS } from './ClientMailV2'

const DIR = __dirname
const params = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join()

function englishKeys(): string[] {
  const keys = new Set<string>()
  for (const f of readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.') && !f.startsWith('dump'))) {
    for (const m of readFileSync(resolve(DIR, f), 'utf8').matchAll(/\bmx\(\s*'([^']*)'/g)) keys.add(m[1])
  }
  for (const k of [...TAB_LABELS, ...Object.values(BLOCK_LABELS), ...Object.values(CONSENT_LABELS), ...Object.values(SOURCE_LABELS), ...Object.values(STATUS_LABELS),
    ...WEEKDAYS, ...Object.values(TRIGGER_LABELS), ...Object.values(KIND_LABELS), ...SAMPLE_KEYS,
    ...Object.values(GATE_TEXTS), ...Object.values(HINT_LABELS), ...Object.values(PHASE_LABELS), ...Object.values(PHASE_STATE_LABELS), ...Object.values(PLAN_LABELS)]) keys.add(k)
  return [...keys].sort()
}

const mdt = PROJECTS[0]
const input = (theme: 'light' | 'dark' = 'light', lang = 'en') => ({
  template: TEMPLATES[0], project: mdt, brand: BRAND, dept: DEPARTMENTS[0], contact: { name: 'Lucía Navarro', lang }, messageId: 'm1', theme, mx: mxFor(lang), unsubscribeUrl: 'https://x/u',
})

describe('client mail strings', () => {
  const en = englishKeys()
  it('finds the strings', () => expect(en.length).toBeGreaterThan(120))
  for (const [lng, dict] of Object.entries(MX_LOCALES)) {
    it(`${lng} translates every string, with the same params`, () => {
      expect(Object.keys(dict).sort()).toEqual(en)
      for (const k of en) expect(params(dict[k]), `${lng}: ${k}`).toBe(params(k))
    })
  }
})

describe('consent', () => {
  it('only granted, not withdrawn, receive', () => {
    expect(CONTACTS.filter(canReceive).map((c) => c.id)).toEqual(['c1', 'c2', 'c5'])
    expect(canReceive(withdraw(CONTACTS[0], 'x'))).toBe(false)
    expect(canReceive(confirmConsent(CONTACTS[2], 'x'))).toBe(true)
  })
  it('splits recipients and skipped', () => {
    const r = recipientsFor(CONTACTS, 'MDT')
    expect(r.to.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(r.skipped.map((c) => c.id)).toEqual(['c3', 'c4'])
  })
})

describe('schedule and events', () => {
  const from = new Date('2026-11-11T09:00:00Z') // Wednesday
  it('weekly goes to the next Friday', () => expect(nextRun({ kind: 'weekly', weekday: 5, hour: 12 }, from)?.toISOString()).toBe('2026-11-13T12:00:00.000Z'))
  it('weekly on the same day after the hour jumps a week', () => expect(nextRun({ kind: 'weekly', weekday: 3, hour: 8 }, from)?.toISOString()).toBe('2026-11-18T08:00:00.000Z'))
  it('monthly clamps to the month end', () => expect(nextRun({ kind: 'monthly', day: 31, hour: 8 }, from)?.toISOString()).toBe('2026-11-30T08:00:00.000Z'))
  it('once in the past never runs', () => expect(nextRun({ kind: 'once', at: '2026-01-01T00:00:00Z' }, from)).toBeNull())
  it('an accepted delivery queues for approval, only to the consenting audience', () => {
    const q = queueFromEvent({ kind: 'delivery-accepted', projectId: 'MDT', ref: 'x', at: 'now' }, AUTOMATIONS, TEMPLATES, CONTACTS, 'c')
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ status: 'awaiting', to: ['c2'], departmentId: 'bim' })
  })
  it('other projects stay quiet', () => {
    expect(queueFromEvent({ kind: 'milestone', projectId: 'HSP', ref: 'x', at: 'now' }, AUTOMATIONS, TEMPLATES, CONTACTS, 'c')).toHaveLength(0)
  })
})

describe('approval and sending', () => {
  const m = OUTGOING[1]
  it('reject needs a reason; a decided message cannot be decided again', () => {
    expect(() => decide(m, 'reject', 'a')).toThrow(QueueError)
    const ok = decide(m, 'approve', 'a')
    expect(ok.status).toBe('approved')
    expect(() => decide(ok, 'approve', 'a')).toThrow(QueueError)
    expect(decide(m, 'approve', 'a', undefined, '2026-12-01T00:00:00Z').status).toBe('scheduled')
  })
  it('cannot send what was not approved', async () => {
    await expect(sendMessage(m, CONTACTS, () => ({}) as never, dryRunAdapter(), 'now')).rejects.toThrow(QueueError)
  })
  it('checks consent again at send time and only dry-runs', async () => {
    const approved = decide({ ...m, to: ['c1', 'c2', 'c4'] }, 'approve', 'a')
    const ad = dryRunAdapter()
    const r = await sendMessage(approved, CONTACTS, (c) => envelopeFor(input(), c.email), ad, 'now')
    expect(r).toMatchObject({ sent: 2, skipped: 1 })
    expect(ad.log.map((e) => e.to)).toEqual(['lucia@marina.example.com', 'jordi@marina.example.com'])
    expect(ad.log[0].headers['List-Unsubscribe']).toBe('<https://x/u>')
  })
  it('real adapters refuse while dark', async () => {
    expect(MAIL_LIVE).toBe(false)
    await expect(resendAdapter({ apiKey: 'k', region: 'eu-west-1' }).send({} as never)).rejects.toThrow(MailDisabledError)
    await expect(smtpAdapter({ host: 'h', port: 587, user: 'u' }).send({} as never)).rejects.toThrow(MailDisabledError)
  })
})

describe('rendering', () => {
  it('fills live data, subject and unsubscribe, with no pixel', () => {
    const r = renderEmail(input())
    expect(r.subject).toBe('Residencial Marina, 48 homes: this week on site')
    expect(r.html).toContain('>82<')
    expect(r.html).toContain('up 4 since last week')
    expect(r.html).toContain('Stop these updates')
    expect(r.html).not.toMatch(/<img/i)
    expect(r.text).toContain('HELLO LUCÍA')
  })
  it('dark differs from light; the language follows the contact', () => {
    expect(renderEmail(input('dark')).html).not.toBe(renderEmail(input('light')).html)
    expect(renderEmail(input('light', 'es')).html).toContain(mxFor('es')('Stop these updates'))
  })
  it('escapes what people type', () => {
    const t = { ...TEMPLATES[0], blocks: [{ id: 'x', kind: 'text' as const, text: '<script>x</script>' }] }
    expect(renderEmail({ ...input(), template: t }).html).not.toContain('<script>')
  })
  it('moves blocks within bounds', () => {
    const b = TEMPLATES[0].blocks
    expect(moveBlock(b, b[0].id, -1)).toBe(b)
    expect(moveBlock(b, b[0].id, 1)[1].id).toBe(b[0].id)
  })
})

describe('metrics, replies, history', () => {
  it('portal link names the message, not the person', () => expect(portalLink('https://a/p', 'm 1')).toBe('https://a/p?u=m%201'))
  it('hides small click counts', () => {
    const a = aggregateClicks([{ messageId: 'a' }, { messageId: 'a' }, { messageId: 'b' }, { messageId: 'b' }, { messageId: 'b' }])
    expect(a.a.shown).toBe('<3')
    expect(a.b.shown).toBe('3')
  })
  it('questions become issues, thanks become comments', () => {
    expect(suggestRoute(REPLIES[0].text)).toBe('issue')
    expect(suggestRoute(REPLIES[1].text)).toBe('comment')
  })
  it('history per client, newest first', () => {
    expect(historyOf(CONTACTS[0], OUTGOING, REPLIES, (m) => m.id).map((x) => x.kind)).toEqual(['reply', 'sent', 'sent', 'consent'])
  })
  it('quota by plan, warning at 80 %, overage per started 1,000', () => {
    expect(quotaUse(186, 'pro')).toMatchObject({ limit: 200, level: 'warn', left: 14 })
    expect(quotaUse(500, 'team').level).toBe('ok')
    expect(quotaUse(1200, 'team')).toMatchObject({ left: 0, over: true, level: 'over', extra: 200, overageEur: 1 })
    expect(quotaUse(4500, 'reception').overageEur).toBe(2)
  })
})

describe('screen', () => {
  it('renders on sample data', () => {
    expect(renderToStaticMarkup(createElement(ClientMail, {} as SectionProps))).toContain('Client updates')
  })
})
