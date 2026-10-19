// ─── Event panels for /msp-global ─────────────────────────────────────────────
// What a visitor could buy or build next, per role. Each idea is marked Ready
// (exists and opens) or Pilot (needs a first partner), so nothing is oversold.


// ── Pilot ideas ──────────────────────────────────────────────────────────────

export type Role = 'msp' | 'mssp' | 'logi' | 'isv' | 'ops'

import type { FeatureId } from './FeatureSheet'

interface Idea { title: string; line: string; status: 'Live' | 'Pilot'; feature?: FeatureId }

const IDEAS: Record<Role, Idea[]> = {
  msp: [
    { title: 'Site view for every client', line: 'Their buildings, Wi-Fi and servers, live.', status: 'Live', feature: 'itops' },
    { title: 'Alert to ticket', line: 'A red room opens a ticket in your PSA.', status: 'Pilot' },
    { title: 'Their street, live', line: 'Traffic and transport around the site.', status: 'Live', feature: 'barcelona' },
  ],
  mssp: [
    { title: 'Physical security on the plan', line: 'Badge readers and cameras where they are.', status: 'Live', feature: 'itops' },
    { title: 'Alerts to your SOC', line: 'Building events into your SIEM.', status: 'Pilot' },
    { title: 'Server room watch', line: 'Heat and UPS, before they fail.', status: 'Live', feature: 'itops' },
  ],
  logi: [
    { title: 'AGV fleet, live', line: 'Every cart, battery and mission on the floor plan.', status: 'Live', feature: 'agv' },
    { title: 'Orders close in your ERP', line: 'Odoo, Salesforce or your WMS, as they happen.', status: 'Pilot' },
    { title: 'Rack locations in 3D', line: 'Find a pallet by its location code.', status: 'Live', feature: 'agv' },
  ],
  isv: [
    { title: 'A 3D tab in your app', line: 'Embed it with one line.', status: 'Live', feature: 'barcelona' },
    { title: 'File quality checks', line: 'Catch bad data before it costs money.', status: 'Live', feature: 'quality' },
    { title: 'Your brand on it', line: 'Your logo, your domain.', status: 'Pilot' },
  ],
  ops: [
    { title: 'Office IT, live', line: 'Every access point and server room on the plan.', status: 'Live', feature: 'itops' },
    { title: 'Walk, bike or drive times', line: 'Real routes, door to door, indoors too.', status: 'Live' },
    { title: 'Maintenance by location', line: 'Work orders on the exact spot.', status: 'Pilot' },
  ],
}

export function PilotIdeas({ role, onOpen }: { role: Role | null; onOpen: (id: FeatureId) => void }) {
  const list = IDEAS[role ?? 'msp']
  return (
    <ul className="grid gap-2.5 sm:grid-cols-3 md:gap-4">
      {list.map((i) => {
        const inner = (
          <>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
              i.status === 'Live' ? 'border border-[var(--ok)] text-[var(--ok)]' : 'border border-[var(--warn)] text-[var(--warn)]'
            }`}>{i.status === 'Live' ? 'Ready' : 'Pilot'}</span>
            <span className="mt-2 block text-[16px] font-semibold text-[var(--text)] md:text-[19px]">{i.title}{i.feature ? ' →' : ''}</span>
            <span className="mt-1 block text-[14px] leading-snug text-[var(--text-dim)] md:text-[16px]">{i.line}</span>
          </>
        )
        return (
          <li key={i.title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-5">
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
