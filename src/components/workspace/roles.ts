// ─── Who may do what in a paid workspace ──────────────────────────────────────
// Mirrors lib/team.ts in the API: the server decides, this only shapes the screen.
// A company can change these within GRANTABLE, and what each person sees follows.

import { createContext, useContext } from 'react'
import type { SectionId } from './registry'

export const ACTIONS = ['read', 'comment', 'issue.create', 'issue.edit', 'version.upload', 'version.move', 'version.publish', 'version.review', 'standard.edit', 'audit.read', 'reception.manage', 'automations.manage', 'value.read', 'webhooks.manage', 'middleware.manage', 'members.manage', 'billing'] as const
export type Action = (typeof ACTIONS)[number]

export const ROLES = ['owner', 'admin', 'editor', 'reviewer', 'viewer', 'guest'] as const
export type Role = (typeof ROLES)[number]
export const PAID_ROLES: readonly Role[] = ['owner', 'admin', 'editor']

const WORK: Action[] = ['read', 'comment', 'issue.create', 'issue.edit', 'version.upload', 'version.move', 'version.publish', 'reception.manage', 'automations.manage', 'middleware.manage']

export const DEFAULTS: Record<Role, readonly Action[]> = {
  owner: ACTIONS,
  admin: ACTIONS.filter((a) => a !== 'billing'),
  editor: WORK,
  reviewer: ['read', 'comment', 'issue.create', 'version.review'],
  viewer: ['read'],
  guest: ['read', 'comment'],
}

/** Free seats never get what a paid seat is for; only the owner handles money. */
export const GRANTABLE: Record<Role, readonly Action[]> = {
  owner: ACTIONS,
  admin: ACTIONS.filter((a) => a !== 'billing'),
  editor: ACTIONS.filter((a) => a !== 'billing' && a !== 'members.manage'),
  reviewer: ['read', 'comment', 'issue.create', 'issue.edit', 'version.review', 'audit.read', 'value.read'],
  viewer: ['read', 'comment', 'issue.create', 'audit.read', 'value.read'],
  guest: ['read', 'comment'],
}

export type Policies = Record<Role, readonly Action[]>

/** The sample company gives its management a free seat that reads the value report. */
export const SAMPLE_POLICIES: Policies = { ...DEFAULTS, viewer: ['read', 'audit.read', 'value.read'] }

export function toggled(policies: Policies, role: Role, action: Action): Policies {
  if (role === 'owner' || action === 'read' || !GRANTABLE[role].includes(action)) return policies
  const has = policies[role].includes(action)
  return { ...policies, [role]: has ? policies[role].filter((a) => a !== action) : [...policies[role], action] }
}

export type PersonaId = 'owner' | 'coordinator' | 'modeller' | 'reviewer' | 'management' | 'subcontractor'
export const PERSONAS: { id: PersonaId; label: string; role: Role; projects: number | null }[] = [
  { id: 'owner', label: 'Owner', role: 'owner', projects: null },
  { id: 'coordinator', label: 'BIM coordinator', role: 'admin', projects: null },
  { id: 'modeller', label: 'Modeller', role: 'editor', projects: 2 },
  { id: 'reviewer', label: 'Reviewer', role: 'reviewer', projects: 2 },
  { id: 'management', label: 'Management', role: 'viewer', projects: null },
  { id: 'subcontractor', label: 'Subcontractor', role: 'guest', projects: 1 },
]

/** The permission a screen needs to appear at all. Screens with none are for everyone. */
export const SECTION_NEEDS: Partial<Record<SectionId, Action>> = {
  jobs: 'version.upload', scenes: 'version.upload', data: 'version.upload', ai: 'version.upload',
  certificates: 'version.publish', team: 'members.manage', billing: 'billing',
  quality: 'audit.read', reception: 'reception.manage', integrations: 'webhooks.manage', api: 'webhooks.manage',
  middleware: 'middleware.manage', automations: 'automations.manage', value: 'value.read',
}

export interface Access {
  persona: PersonaId
  role: Role
  policies: Policies
  setPolicies: (p: Policies) => void
  can: (a: Action) => boolean
}

export const accessFor = (persona: PersonaId, policies: Policies, setPolicies: (p: Policies) => void): Access => {
  const role = PERSONAS.find((p) => p.id === persona)!.role
  return { persona, role, policies, setPolicies, can: (a) => policies[role].includes(a) }
}

export const canSee = (id: SectionId, can: (a: Action) => boolean): boolean => {
  const need = SECTION_NEEDS[id]
  return !need || can(need)
}

export const AccessContext = createContext<Access>(accessFor('owner', SAMPLE_POLICIES, () => {}))
export const useAccess = (): Access => useContext(AccessContext)

export interface ValueNumbers { runMinutes: number; rejected: number; rejectedMinutes: number; hourlyEur: number; monthlyCostEur: number; months: number }

/** Same sums as valueReport in the API. Counts are measured; minutes and rates are the company's own. */
export function valueOf(v: ValueNumbers) {
  const hours = Math.round((v.runMinutes + v.rejected * v.rejectedMinutes) / 6) / 10
  const saved = Math.round(hours * v.hourlyEur)
  const cost = v.monthlyCostEur * v.months
  return { hours, saved, cost, net: saved - cost, multiple: cost > 0 ? Math.round((saved / cost) * 10) / 10 : null }
}
