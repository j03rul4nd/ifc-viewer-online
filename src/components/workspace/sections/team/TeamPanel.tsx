// Team panel (doc 25b "Iteración UI Team v2"): how the team is doing at a
// glance — Health Score per project with its trend, open issues per person,
// deadlines at risk, and an honest cost comparison. Sample data only.
import { useState } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Panel, SectionLabel, Sparkline, scoreColor } from '../../ui'
import type { TeamTx } from './i18n'
import { Avatar } from './TeamIssues'
import { COST_SOURCE_DATE, GATE, PROJECT_HEALTH, atRisk, costCompare, member, trend, workload, type TeamIssue } from './sample'

const eur = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`

export function TeamPanel({ issues, tt, onOpen }: { issues: TeamIssue[]; tt: TeamTx; onOpen: (n: number) => void }) {
  const load = workload(issues)
  const max = Math.max(1, ...load.map((l) => l.open))
  const risk = atRisk(issues)
  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionLabel>{tt('Project health')}</SectionLabel>
        <div className="grid gap-3 md:grid-cols-3">
          {PROJECT_HEALTH.map((p) => {
            const now = p.weeks[p.weeks.length - 1], d = trend(p.weeks)
            const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus
            return (
              <Panel key={p.id} className="p-4 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="text-[12px] text-[var(--text-faint)]">{p.id}</p><p className="text-[13.5px] font-medium truncate">{p.name}</p></div>
                  <Avatar m={member(p.lead)} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[28px] leading-none font-semibold tabular-nums" style={{ color: scoreColor(now) }}>{now}</p>
                    <p className={`mt-1 inline-flex items-center gap-1 text-[12px] ${d < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-dim)]'}`}><Icon size={13} aria-hidden />{d > 0 ? `+${d}` : d} {tt('vs last week')}</p>
                  </div>
                  <Sparkline values={p.weeks} width={110} height={36} />
                </div>
                <p className="mt-3 text-[12px] text-[var(--text-dim)]">{tt('{{p}} published · {{b}} stopped at the gate ({{min}}) this month', { p: p.published, b: p.blocked, min: GATE.minScore })}</p>
              </Panel>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionLabel>{tt('Open issues per person')}</SectionLabel>
          <Panel className="p-4">
            <ul className="flex flex-col gap-2.5">
              {load.map((l) => {
                const m = member(l.id)
                return (
                  <li key={l.id} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-[12.5px]">
                    <span className="inline-flex items-center gap-1.5 min-w-0"><Avatar m={m} /><span className="truncate">{m?.name}</span></span>
                    <span className="h-[8px] rounded-full bg-[var(--surface-2)] overflow-hidden flex" aria-hidden>
                      <span className="h-full bg-[var(--danger)]" style={{ width: `${(l.overdue / max) * 100}%` }} />
                      <span className="h-full bg-[var(--accent)] opacity-70" style={{ width: `${((l.open - l.overdue) / max) * 100}%` }} />
                    </span>
                    <span className="tabular-nums text-[var(--text-dim)] whitespace-nowrap">{l.open}{l.overdue ? <span className="text-[var(--danger)]"> · {tt('{{n}} late', { n: l.overdue })}</span> : null}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </section>
        <section className="min-w-0">
          <SectionLabel>{tt('Deadlines at risk')}</SectionLabel>
          <Panel>
            {risk.length === 0 ? <p className="p-4 text-[12.5px] text-[var(--text-dim)]">{tt('Nothing due in the next 3 days.')}</p> : (
              <ul className="divide-y divide-[var(--border)]">
                {risk.slice(0, 5).map((i) => (
                  <li key={i.n}><button type="button" onClick={() => onOpen(i.n)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--surface-2)] min-w-0">
                    <span className={`shrink-0 w-[76px] text-[12px] tabular-nums ${i.inDays < 0 ? 'text-[var(--danger)]' : 'text-[var(--warn)]'}`}>{i.inDays < 0 ? tt('{{n}} d late', { n: -i.inDays }) : i.inDays === 0 ? tt('today') : tt('in {{n}} d', { n: i.inDays })}</span>
                    <span className="flex-1 min-w-0 text-[12.5px] truncate">#{i.n} · {i.title}</span>
                    <Avatar m={member(i.assignee)} />
                  </button></li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </div>

      <CostCompare tt={tt} />
    </div>
  )
}

export function CostCompare({ tt }: { tt: TeamTx }) {
  const [editors, setEditors] = useState(6)
  const c = costCompare(editors)
  const range = (r: readonly [number, number]) => `${eur(r[0])} – ${eur(r[1])}`
  return (
    <section>
      <SectionLabel>{tt('What this replaces, per month')}</SectionLabel>
      <Panel className="p-4">
        <label className="flex items-center gap-3 text-[12.5px] text-[var(--text-dim)]">
          {tt('Editors')}
          <input type="range" min={3} max={20} value={editors} onChange={(e) => setEditors(Number(e.target.value))} className="flex-1 max-w-[220px] accent-[var(--accent)]" aria-label={tt('Editors')} />
          <span className="tabular-nums text-[var(--text)] w-[24px]">{editors}</span>
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[8px] border border-[var(--border)] p-3 min-w-0">
            <p className="text-[12px] text-[var(--text-faint)]">{tt('BIMcollab for issues + Solibri Office for 2 checkers')}</p>
            <p className="mt-1 text-[18px] font-semibold tabular-nums">{range(c.theirs)}</p>
            <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">BIMcollab {range(c.bimcollab)} · Solibri {range(c.solibri)}</p>
          </div>
          <div className="rounded-[8px] border-2 border-[var(--accent)] p-3 min-w-0">
            <p className="text-[12px] text-[var(--text-faint)]">{tt('Team plan: issues, automatic checks and publication gate')}</p>
            <p className="mt-1 text-[18px] font-semibold tabular-nums">{eur(c.ours)}</p>
            <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">{tt('59 € per editor billed yearly · clients and contractors free')}</p>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--text-faint)]">{tt('Public list prices on the vendors’ pricing pages, consulted {{date}}, VAT excluded. Solibri also does checks we do not; compare with your own quote.', { date: COST_SOURCE_DATE })}</p>
      </Panel>
    </section>
  )
}
