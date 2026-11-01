// ─── Workspace sections ───────────────────────────────────────────────────────
// The one list a new paid screen is added to: its URL segment, label, icon,
// the plan it needs and the component. Navigation (sidebar, tablet rail and
// phone tab bar), routing and plan gating all read from here, so shipping a
// feature is one entry plus its component — nothing else changes.

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LayoutGrid, FolderKanban, Cpu, BadgeCheck, CreditCard, Users, Settings as SettingsIcon, ShieldCheck, LifeBuoy, Clapperboard, Plug, ListTodo, ShieldHalf, Inbox, Blocks, Code2, Sparkles } from 'lucide-react'
import type { WorkspaceData, TicketKind } from './sample-data'
import type { CheckoutItem } from '../../lib/pricing/checkout'
import Overview from './sections/Overview'
import Projects from './sections/Projects'
import Jobs from './sections/Jobs'
import Certificates from './sections/Certificates'
import Billing from './sections/Billing'
import Team from './sections/Team'
import Settings from './sections/Settings'
import Privacy from './sections/Privacy'
import Support from './sections/Support'
import Scenes from './sections/Scenes'
import DataSources from './sections/DataSources'
import Issues from './sections/Issues'
import Quality from './sections/Quality'
import Reception from './sections/Reception'
import Integrations from './sections/Integrations'
import Api from './sections/Api'
import Ai from './sections/Ai'

export type SectionId = 'overview' | 'projects' | 'jobs' | 'certificates' | 'team' | 'billing' | 'settings' | 'privacy' | 'support' | 'scenes' | 'data'
  | 'issues' | 'quality' | 'reception' | 'integrations' | 'api' | 'ai'

/** Plans in rank order; a section is open to its plan and every plan above. */
export const PLAN_RANK = { pro: 1, team: 2 } as const
export type PaidPlan = keyof typeof PLAN_RANK

export interface SectionActions {
  go: (s: SectionId) => void
  newJob: () => void
  topUp: () => void
  buy: (item: CheckoutItem) => void
  /** Opens the contact form; `ref` names the job, project or certificate it is about. */
  contact: (kind: TicketKind, ref?: string) => void
  openProject: (id: string) => void
  /** Starts a guided tour by id (lib/workspace-tours), navigating to its page first. */
  tour: (id: string) => void
}

export interface SectionProps { data: WorkspaceData; actions: SectionActions }

export interface SectionDef {
  id: SectionId
  label: string
  /** Shorter label for the phone tab bar. */
  short?: string
  icon: LucideIcon
  requires: PaidPlan
  /** Kept out of the phone tab bar (reached from "More"). */
  secondary?: boolean
  /** 'account' sections sit apart, at the bottom of the nav and in the account menu. */
  group?: 'work' | 'account'
  /** One line shown to plans that can't open it yet: what they would get. */
  pitch?: string
  /** Designed but not built: the nav marks it "Soon" and the screen says so (lib/plans/features). */
  soon?: boolean
  Component: ComponentType<SectionProps>
}

export const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview', short: 'Home', icon: LayoutGrid, requires: 'pro', Component: Overview },
  { id: 'projects', label: 'Projects', icon: FolderKanban, requires: 'pro', Component: Projects },
  { id: 'jobs', label: 'Cloud jobs', short: 'Jobs', icon: Cpu, requires: 'pro', Component: Jobs },
  { id: 'certificates', label: 'Certificates', short: 'Certs', icon: BadgeCheck, requires: 'pro', secondary: true, Component: Certificates },
  { id: 'scenes', label: 'Scenes', icon: Clapperboard, requires: 'pro', secondary: true, Component: Scenes },
  { id: 'data', label: 'Data sources', short: 'Data', icon: Plug, requires: 'pro', secondary: true, Component: DataSources },
  { id: 'team', label: 'Team', icon: Users, requires: 'team', secondary: true, pitch: 'Share projects, credits and certificates with your studio — one bill, a login per person.', Component: Team },
  { id: 'issues', label: 'Issues', icon: ListTodo, requires: 'team', secondary: true, soon: true, pitch: 'BCF issues for the whole team, assigned and tracked, with reviewers and guests free.', Component: Issues },
  { id: 'quality', label: 'Quality gate', short: 'Quality', icon: ShieldHalf, requires: 'team', secondary: true, soon: true, pitch: 'Validate every upload with your house standard and publish only what passes.', Component: Quality },
  { id: 'reception', label: 'Reception', icon: Inbox, requires: 'team', secondary: true, soon: true, pitch: 'Receive supplier models that already meet your requirements, and see who delivers well.', Component: Reception },
  { id: 'integrations', label: 'Integrations', icon: Blocks, requires: 'pro', secondary: true, soon: true, Component: Integrations },
  { id: 'api', label: 'API', icon: Code2, requires: 'pro', secondary: true, soon: true, Component: Api },
  { id: 'ai', label: 'AI credits', short: 'AI', icon: Sparkles, requires: 'pro', secondary: true, soon: true, Component: Ai },
  { id: 'billing', label: 'Credits & billing', short: 'Billing', icon: CreditCard, requires: 'pro', group: 'account', Component: Billing },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, requires: 'pro', secondary: true, group: 'account', Component: Settings },
  { id: 'privacy', label: 'Privacy & data', icon: ShieldCheck, requires: 'pro', secondary: true, group: 'account', Component: Privacy },
  { id: 'support', label: 'Help & support', short: 'Help', icon: LifeBuoy, requires: 'pro', secondary: true, group: 'account', Component: Support },
]

export function canUse(plan: PaidPlan, s: SectionDef): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[s.requires]
}

export function sectionFromPath(pathname: string): SectionId {
  const seg = pathname.split('/workspace')[1]?.replace(/^\/+/, '').split('/')[0]
  return SECTIONS.find((s) => s.id === seg)?.id ?? 'overview'
}
