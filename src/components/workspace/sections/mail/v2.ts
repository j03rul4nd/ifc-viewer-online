// ─── Client mail v2 ───────────────────────────────────────────────────────────
// Decisions of 2026-11-12 (doc 28): what each plan gets, the quota, the own
// sender domain (Reception and Enterprise only), phase templates, segments,
// pixel-free A/B subjects, threads and the client portal. Plus the bridges
// that read rules (rules-v2) and clashes (lib/clash) through their public
// APIs, without changing their logic. Pure functions; nothing is sent.

import type { TrendPoint } from '../../../../lib/clash/trend'
import { ADVANCED_RULES, appliesAt, runAdvanced, type Phase } from '../rules/rules-v2'
import { MIN_GROUP, newBlock, type Contact, type MailPlan, type ProjectSnapshot, type Reply, type Template } from './model'

// ── Plans ─────────────────────────────────────────────────────────────────────

export interface MailCaps {
  automations: boolean
  segments: boolean
  abTest: boolean
  /** Sends from the company's own verified domain. */
  ownDomain: boolean
  departments: number
}

export const CAPS: Record<MailPlan, MailCaps> = {
  pro: { automations: false, segments: false, abTest: false, ownDomain: false, departments: 1 },
  team: { automations: true, segments: true, abTest: true, ownDomain: false, departments: 5 },
  reception: { automations: true, segments: true, abTest: true, ownDomain: true, departments: 20 },
  enterprise: { automations: true, segments: true, abTest: true, ownDomain: true, departments: Infinity },
}

/** The cheapest plan that opens a capability, for the "available in" note. */
export function planFor(cap: keyof Omit<MailCaps, 'departments'>): MailPlan {
  return (['pro', 'team', 'reception', 'enterprise'] as MailPlan[]).find((p) => CAPS[p][cap])!
}

/** Without its own domain, mail leaves from ours with the department's name and the company's reply-to. */
export function senderFor(plan: MailPlan, dept: { senderName: string; from: string; replyTo: string }, domainVerified: boolean) {
  const own = CAPS[plan].ownDomain && domainVerified
  return { from: own ? `${dept.senderName} <${dept.from}>` : `${dept.senderName} <updates@ifcvieweronline.eu>`, replyTo: dept.replyTo, own }
}

// ── Own domain: SPF, DKIM, DMARC ──────────────────────────────────────────────

export interface DnsRecord { kind: 'SPF' | 'DKIM' | 'DMARC'; type: 'TXT' | 'CNAME'; host: string; value: string }

export function dnsRecords(domain: string, selector = 'ifcv'): DnsRecord[] {
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return [
    { kind: 'SPF', type: 'TXT', host: d, value: 'v=spf1 include:amazonses.com ~all' },
    { kind: 'DKIM', type: 'CNAME', host: `${selector}._domainkey.${d}`, value: `${selector}.dkim.ifcvieweronline.eu` },
    { kind: 'DMARC', type: 'TXT', host: `_dmarc.${d}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${d}` },
  ]
}

export const isDomain = (s: string) => /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i.test(s.trim())

/**
 * Compares what DNS answered with what is needed. An SPF that already exists
 * must gain the include, not be replaced: two SPF records break both.
 */
export function checkDns(needed: DnsRecord[], found: Record<string, string[]>): { record: DnsRecord; ok: boolean; hint?: 'missing' | 'merge-spf' | 'two-spf' | 'wrong' }[] {
  return needed.map((r) => {
    const vals = found[r.host] ?? []
    if (r.kind === 'SPF') {
      const spf = vals.filter((v) => v.startsWith('v=spf1'))
      if (spf.length > 1) return { record: r, ok: false, hint: 'two-spf' }
      if (spf.length === 0) return { record: r, ok: false, hint: 'missing' }
      return spf[0].includes('include:amazonses.com') ? { record: r, ok: true } : { record: r, ok: false, hint: 'merge-spf' }
    }
    if (r.kind === 'DMARC') return vals.some((v) => v.startsWith('v=DMARC1')) ? { record: r, ok: true } : { record: r, ok: false, hint: 'missing' }
    return vals.includes(r.value) ? { record: r, ok: true } : { record: r, ok: false, hint: vals.length ? 'wrong' : 'missing' }
  })
}

// ── Phase templates ───────────────────────────────────────────────────────────

export const PHASE_TEMPLATES = ['kickoff', 'delivery', 'milestone', 'closeout'] as const
export type PhaseTemplate = typeof PHASE_TEMPLATES[number]

export function phaseTemplate(kind: PhaseTemplate, departmentId: string, mx: (s: string) => string): Template {
  const id = `t-${kind}-${Date.now().toString(36)}`
  const b = (k: Parameters<typeof newBlock>[0], t?: string) => newBlock(k, t === undefined ? undefined : mx(t))
  const blocks = {
    kickoff: [b('heading', 'Welcome to {project}'), b('text', 'From today you will get a short update from us at each step, with real data from the model.'), b('timeline'), b('portal')],
    delivery: [b('heading', 'A new model passed our checks'), b('summary'), b('deliveries'), b('rules'), b('certificate'), b('button', 'Open it in 3D')],
    milestone: [b('heading', 'We reached a milestone'), b('summary'), b('milestones'), b('clashes'), b('capture'), b('portal')],
    closeout: [b('heading', '{project} is ready to hand over'), b('summary'), b('health'), b('certificate'), b('timeline'), b('text', 'Thank you for trusting us. The project page stays open for you.'), b('portal')],
  }[kind]
  const subject = { kickoff: '{project}: welcome', delivery: '{project}: new model accepted', milestone: '{project}: milestone reached', closeout: '{project}: ready to hand over' }[kind]
  const name = { kickoff: 'Project start', delivery: 'Delivery accepted', milestone: 'Milestone reached', closeout: 'Handover' }[kind]
  return { id, name: mx(name), departmentId, subject: mx(subject), blocks }
}

// ── Segments ──────────────────────────────────────────────────────────────────

export interface Segment { id: string; name: string; roles?: string[]; companies?: string[]; langs?: string[] }

export function segmentMembers(s: Segment, contacts: Contact[]): Contact[] {
  return contacts.filter((c) => (!s.roles?.length || s.roles.includes(c.role)) && (!s.companies?.length || s.companies.includes(c.company)) && (!s.langs?.length || s.langs.includes(c.lang)))
}

// ── A/B subject, without per-person tracking ─────────────────────────────────

/** Stable split: the same contact always gets the same variant, with no stored id. */
export function variantOf(contactId: string, salt: string): 'A' | 'B' {
  let h = 2166136261
  for (const ch of salt + contactId) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return (h >>> 0) % 2 === 0 ? 'A' : 'B'
}

/**
 * Winner by click rate on the portal link, counted per variant (never per
 * person). No winner until both variants have at least MIN_GROUP clicks or
 * MIN_GROUP × 3 sends, and the gap is clear.
 */
export function abWinner(v: Record<'A' | 'B', { sent: number; clicks: number }>): { winner: 'A' | 'B' | null; rateA: number; rateB: number; reason: 'too-few' | 'tie' | 'clear' } {
  const rateA = v.A.sent ? v.A.clicks / v.A.sent : 0, rateB = v.B.sent ? v.B.clicks / v.B.sent : 0
  if (Math.min(v.A.sent, v.B.sent) < MIN_GROUP * 3 || v.A.clicks + v.B.clicks < MIN_GROUP * 2) return { winner: null, rateA, rateB, reason: 'too-few' }
  if (Math.abs(rateA - rateB) < 0.05) return { winner: null, rateA, rateB, reason: 'tie' }
  return { winner: rateA > rateB ? 'A' : 'B', rateA, rateB, reason: 'clear' }
}

// ── Threads ───────────────────────────────────────────────────────────────────

export interface ThreadPost { id: string; at: string; author: string; fromClient: boolean; text: string }

/** A client reply and the team's answers, in order: the conversation comes back as one thread. */
export function threadOf(r: Reply, answers: (ThreadPost & { replyId: string })[], clientName: string): ThreadPost[] {
  return [
    { id: r.id, at: r.at, author: clientName, fromClient: true, text: r.text },
    ...answers.filter((a) => a.replyId === r.id),
  ].sort((a, b) => a.at.localeCompare(b.at))
}

// ── Bridges: rules and clashes, through their public APIs ────────────────────

/** Clash trend points (lib/clash/trend) → what the clashes block needs. */
export const clashRuns = (points: TrendPoint[]) => points.map((p) => ({ at: p.at, open: p.open, resolved: p.resolved }))

/** Rule checks at a phase (rules-v2): checked elements and failures, from runAdvanced. */
export function ruleSummary(phase: Phase, fixedThisWeek = 0, rules = ADVANCED_RULES): NonNullable<ProjectSnapshot['rules']> {
  let checked = 0, failing = 0
  for (const a of rules) {
    if (!appliesAt(a.rule.phases, phase)) continue
    const r = runAdvanced(a)
    checked += r.checked
    failing += r.failures.length
  }
  return { checked, failing, fixedThisWeek, phase }
}
