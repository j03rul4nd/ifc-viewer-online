// ─── Event panels for /msp-global ─────────────────────────────────────────────
// What a visitor could buy or build next, per role. Each idea is marked Ready
// (exists and opens) or Pilot (needs a first partner), so nothing is oversold.


// ── Pilot ideas ──────────────────────────────────────────────────────────────

export type Role = 'msp' | 'isv' | 'ops'

interface Idea { title: string; line: string; status: 'Live' | 'Pilot'; href?: string }

const IDEAS: Record<Role, Idea[]> = {
  msp: [
    { title: 'Site viewer for clients', line: 'All their buildings, one link.', status: 'Live', href: '/?scene=/scenes/barcelona-placa-catalunya.scene.json' },
    { title: 'Tap it, ticket it', line: 'An asset tap opens a helpdesk ticket.', status: 'Pilot' },
    { title: 'Live status on site', line: 'Sensors show up where they are.', status: 'Live', href: '/?scene=/scenes/helsinki-rautatientori.scene.json' },
  ],
  isv: [
    { title: 'A 3D tab in your app', line: 'Embed it with one line.', status: 'Live', href: '/sdk/' },
    { title: 'File quality checks', line: 'Catch bad data before it costs money.', status: 'Live', href: '/ifc-validator/' },
    { title: 'Your brand on it', line: 'Your logo, your domain.', status: 'Pilot' },
  ],
  ops: [
    { title: 'Find any asset', line: 'Tap it. See everything.', status: 'Live' },
    { title: 'The city around your site', line: 'Live transit, on the map.', status: 'Live', href: '/?scene=/scenes/tokyo-tochomae.scene.json' },
    { title: 'Maintenance by location', line: 'Work orders on the exact spot.', status: 'Pilot' },
  ],
}

export function PilotIdeas({ role }: { role: Role | null }) {
  const list = IDEAS[role ?? 'msp']
  return (
    <ul className="grid gap-2.5 sm:grid-cols-3">
      {list.map((i) => {
        const inner = (
          <>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
              i.status === 'Live' ? 'border border-[var(--ok)] text-[var(--ok)]' : 'border border-[var(--warn)] text-[var(--warn)]'
            }`}>{i.status === 'Live' ? 'Ready' : 'Pilot'}</span>
            <span className="mt-1.5 block text-[16px] font-medium text-[var(--text)]">{i.title}{i.href ? ' →' : ''}</span>
            <span className="mt-0.5 block text-[14px] leading-snug text-[var(--text-dim)]">{i.line}</span>
          </>
        )
        return (
          <li key={i.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            {i.href ? <a href={i.href} target="_blank" rel="noopener" className="block">{inner}</a> : inner}
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
