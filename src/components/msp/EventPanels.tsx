// ─── Event panels for /msp-global ─────────────────────────────────────────────
// What a visitor could buy or build next, per role. Each idea is marked Ready
// (exists and opens) or Pilot (needs a first partner), so nothing is oversold.


// ── Pilot ideas ──────────────────────────────────────────────────────────────

export type Role = 'msp' | 'isv' | 'ops'

import type { FeatureId } from './FeatureSheet'

interface Idea { title: string; line: string; status: 'Live' | 'Pilot'; feature?: FeatureId }

const IDEAS: Record<Role, Idea[]> = {
  msp: [
    { title: 'Site viewer for clients', line: 'All their buildings, one link.', status: 'Live', feature: 'barcelona' },
    { title: 'Tap it, ticket it', line: 'An asset tap opens a helpdesk ticket.', status: 'Pilot' },
    { title: 'Sun and energy reports', line: 'Heat and daylight per facade, real climate.', status: 'Live', feature: 'solar' },
  ],
  isv: [
    { title: 'A 3D tab in your app', line: 'Embed it with one line.', status: 'Live', feature: 'hotel' },
    { title: 'File quality checks', line: 'Catch bad data before it costs money.', status: 'Live', feature: 'quality' },
    { title: 'Your brand on it', line: 'Your logo, your domain.', status: 'Pilot' },
  ],
  ops: [
    { title: 'Walk, bike or drive times', line: 'Real routes, door to door, indoors too.', status: 'Live' },
    { title: 'The city around your site', line: 'Live transit, on the map.', status: 'Live', feature: 'tokyo' },
    { title: 'Maintenance by location', line: 'Work orders on the exact spot.', status: 'Pilot' },
  ],
}

export function PilotIdeas({ role, onOpen }: { role: Role | null; onOpen: (id: FeatureId) => void }) {
  const list = IDEAS[role ?? 'msp']
  return (
    <ul className="grid gap-2.5 sm:grid-cols-3">
      {list.map((i) => {
        const inner = (
          <>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
              i.status === 'Live' ? 'border border-[var(--ok)] text-[var(--ok)]' : 'border border-[var(--warn)] text-[var(--warn)]'
            }`}>{i.status === 'Live' ? 'Ready' : 'Pilot'}</span>
            <span className="mt-1.5 block text-[16px] font-medium text-[var(--text)]">{i.title}{i.feature ? ' →' : ''}</span>
            <span className="mt-0.5 block text-[14px] leading-snug text-[var(--text-dim)]">{i.line}</span>
          </>
        )
        return (
          <li key={i.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            {i.feature
              ? <button type="button" onClick={() => onOpen(i.feature!)} className="block w-full text-left">{inner}</button>
              : inner}
          </li>
        )
      })}
    </ul>
  )
}

// ── What I'm looking for ─────────────────────────────────────────────────────

export type Intent = 'pilot' | 'integration' | 'partner' | 'invest'

export const INTENTS: Record<Intent, string> = {
  pilot: 'Pilot for a client',
  integration: 'Add it to our product',
  partner: 'Partner or resell',
  invest: 'Invest',
}
