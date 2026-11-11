// ─── ItOpsImpact ──────────────────────────────────────────────────────────────
// The office-IT twin demo (`?twin=itops`) says what it is worth while it runs,
// to people who sign budgets rather than configure switches: a sales director,
// a board. So it speaks in money, people and minutes, never in device fields:
//
//   - a headline: what the twin saves a year, times the visitor's own offices;
//   - when something breaks, the moment itself: what broke and who it stops,
//     and a race between the two ways of finding out. Without the twin a cost
//     meter runs (nobody knows yet); with it, "warned in 10 s · €0". A Show
//     button flies the camera to the fault;
//   - the money saved while the visitor watched;
//   - one call to action.
//
// Numbers come from lib/twin/itops-impact.ts and are labelled as estimates;
// the meter plays a minute a second and says so. It reads the simulated feed
// itself (a pure function of time), so it costs one small object every few
// seconds. On a phone it starts folded into one line, so the building shows.

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import { simulateItOps } from '../lib/twin/device-sim'
import { openIncidents, addOnsets, incidentKey, yearlySavingEur, costSoFar, EMPTY_TALLY, WITHOUT, DETECT_S, type Incident, type Tally } from '../lib/twin/itops-impact'
import { useTwinDeviceStore } from '../stores/twinDeviceStore'
import { useValidationStore } from '../stores/validationStore'
import { buildCatalog, buildGuidIndex, resolveLocs } from '../lib/twin/devices'
import { focusElements } from '../lib/scene-explore/focus'

const TICK_MS = 5000
export const ITOPS_CTA_HREF = '/msp-global#contact'

/** Frame the elements bound to a simulated device. */
export async function focusDevice(v: ViewerAPI | null, deviceId: string): Promise<void> {
  if (!v) return
  const b = useTwinDeviceStore.getState().bindings.find((x) => x.deviceId === deviceId)
  if (!b) return
  const trees = useValidationStore.getState().spatialTrees
  const locs = resolveLocs(b, buildGuidIndex(trees), buildCatalog(trees))
  if (!locs.length) return
  const modelId = locs[0].modelId
  await focusElements(v, locs.filter((l) => l.modelId === modelId).map((l) => l.expressId).slice(0, 500), modelId)
}

interface Feed { open: Incident[]; tally: Tally; since: Record<string, number> }

function useItOpsFeed(): Feed {
  const [state, setState] = useState<Feed>(() => {
    const open = openIncidents(simulateItOps(Date.now()))
    const now = Date.now()
    return { open, tally: addOnsets(EMPTY_TALLY, open, new Set()), since: Object.fromEntries(open.map((i) => [incidentKey(i), now])) }
  })
  const prev = useRef(new Set(state.open.map(incidentKey)))
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      const open = openIncidents(simulateItOps(now))
      setState((s) => ({
        open,
        tally: addOnsets(s.tally, open, prev.current),
        since: Object.fromEntries(open.map((i) => [incidentKey(i), s.since[incidentKey(i)] ?? now])),
      }))
      prev.current = new Set(open.map(incidentKey))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return state
}

/** Re-render every second while `on`: the cost meter runs. */
function useSecond(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [on])
  return now
}

const isPhone = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches

export default function ItOpsImpact({ viewerApiRef }: { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }) {
  const { t, i18n } = useTranslation('viewer')
  const { open, tally, since } = useItOpsFeed()
  const alerting = open.length > 0
  const now = useSecond(alerting)
  const [expanded, setExpanded] = useState(() => !isPhone())
  const [sites, setSites] = useState(10)
  const lang = i18n.language || 'en'
  const eur = (n: number): string => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const k = 'explorer.itops'
  const top = open[0]

  const dot = (
    <span className="relative flex w-2 h-2" aria-hidden>
      <span className={`absolute inset-0 rounded-full animate-ping opacity-60 ${alerting ? 'bg-[#e0523f]' : 'bg-[#3fa866]'}`} />
      <span className={`relative w-2 h-2 rounded-full ${alerting ? 'bg-[#e0523f]' : 'bg-[#3fa866]'}`} />
    </span>
  )

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} data-testid="itops-impact-pill"
        className="absolute z-[22] right-2 top-2 pointer-events-auto flex items-center gap-2 h-9 px-3 rounded-full border border-[var(--border)] bg-[rgba(14,15,20,0.9)] backdrop-blur-[8px] shadow-lg text-[12px] text-[var(--text)]">
        {dot}
        <span className="font-medium">{alerting ? t(`${k}.pillAlert`) : t(`${k}.pillOk`)}</span>
        <span className="text-[var(--text-faint)]">·</span>
        <span className="font-semibold tabular-nums text-[#4ade80]">{eur(yearlySavingEur(sites))}</span>
        <span aria-hidden className="text-[var(--text-faint)]">▾</span>
      </button>
    )
  }

  const elapsed = top ? (now - (since[incidentKey(top)] ?? now)) / 1000 : 0
  const lost = top ? costSoFar(top.kind, elapsed) : 0
  const lostMin = Math.round(elapsed)

  return (
    <section data-testid="itops-impact" aria-label={t(`${k}.label`)}
      className="absolute z-[22] max-sm:z-[24] right-2 top-2 w-[340px] max-sm:left-2 max-sm:w-auto max-h-[calc(100%-4.5rem)] max-sm:max-h-[calc(100%-1rem)] overflow-y-auto
        pointer-events-auto rounded-[16px] border border-[var(--border)] bg-[rgba(12,13,18,0.95)] backdrop-blur-[12px] shadow-2xl text-[var(--text)]">
      <header className="flex items-center gap-2 px-4 pt-3.5">
        {dot}
        <span className="flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-dim)]">{t(`${k}.label`)}</span>
        <button type="button" onClick={() => setExpanded(false)} aria-label={t(`${k}.fold`)} title={t(`${k}.fold`)}
          className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-[7px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06]">▴</button>
      </header>

      {/* The headline: what it saves, for the visitor's own estate. */}
      <div className="px-4 pt-2 pb-3.5">
        <p className="text-[12.5px] text-[var(--text-dim)]">{t(`${k}.heroLead`)}</p>
        <p className="mt-0.5 text-[38px] leading-none font-semibold tracking-tight tabular-nums text-[#4ade80]" data-testid="itops-year">{eur(yearlySavingEur(sites))}</p>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-[var(--text-dim)]">
          <span>{t(`${k}.heroPer`)}</span>
          <div className="flex items-center rounded-[8px] border border-white/10" role="group" aria-label={t(`${k}.sites`)}>
            <button type="button" onClick={() => setSites((s) => Math.max(1, s - (s > 10 ? 10 : 1)))} aria-label="−" className="w-7 h-7 text-[var(--text-dim)] hover:text-[var(--text)]">−</button>
            <span className="min-w-[2.2rem] text-center font-semibold tabular-nums text-[var(--text)]" data-testid="itops-sites">{sites}</span>
            <button type="button" onClick={() => setSites((s) => Math.min(500, s + (s >= 10 ? 10 : 1)))} aria-label="+" className="w-7 h-7 text-[var(--text-dim)] hover:text-[var(--text)]">+</button>
          </div>
          <span>{t(`${k}.sitesUnit`, { count: sites })}</span>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-[var(--text)]">{t(`${k}.heroLine`, { s: DETECT_S })}</p>
      </div>

      <div className="mx-4 border-t border-white/[0.08]" />

      {/* The moment: what broke, who it stops, and the two ways of finding out. */}
      <div className="px-4 py-3.5" aria-live="polite">
        {!top ? (
          <div className="flex items-start gap-2.5" data-testid="itops-impact-status">
            <span className="mt-0.5 flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-[#3fa866]/15 text-[#4ade80] text-[13px]" aria-hidden>✓</span>
            <div>
              <p className="text-[14px] font-semibold">{t(`${k}.allOk`)}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-dim)]">{t(`${k}.allOkLine`)}</p>
            </div>
          </div>
        ) : (
          <div data-testid="itops-incident">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#f87171]" data-testid="itops-impact-status">{t(`${k}.happening`)}</p>
                <p className="mt-1 text-[15px] font-semibold leading-snug">{t(`${k}.kind.${top.kind}.title`, { value: top.value })}</p>
                <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)]">{t(`${k}.kind.${top.kind}.impact`, { value: top.value })}</p>
              </div>
              <button type="button" onClick={() => void focusDevice(viewerApiRef.current, top.deviceId)}
                className="shrink-0 h-8 px-2.5 rounded-[8px] text-[12px] font-medium text-[var(--text)] bg-white/[0.07] hover:bg-white/[0.13]">{t(`${k}.show`)}</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[12px] border border-[#e0523f]/25 bg-[#e0523f]/[0.08] px-3 py-2.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#fca5a5]">{t(`${k}.withoutTitle`)}</p>
                <p className="mt-1 text-[22px] leading-none font-semibold tabular-nums text-[#fca5a5]" data-testid="itops-lost">
                  {WITHOUT[top.kind].costEur ? eur(lost) : t(`${k}.minutes`, { n: lostMin })}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--text-dim)]">{WITHOUT[top.kind].costEur ? t(`${k}.withoutCounting`) : t(`${k}.withoutUnseen`)}</p>
              </div>
              <div className="rounded-[12px] border border-[#3fa866]/25 bg-[#3fa866]/[0.08] px-3 py-2.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#86efac]">{t(`${k}.withTitle`)}</p>
                <p className="mt-1 text-[22px] leading-none font-semibold tabular-nums text-[#86efac]">{eur(0)}</p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--text-dim)]">{t(`${k}.withWarned`, { s: DETECT_S })}</p>
              </div>
            </div>
            {open.length > 1 && <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">{t(`${k}.more`, { count: open.length - 1 })}</p>}
          </div>
        )}
      </div>

      <div className="mx-4 border-t border-white/[0.08]" />

      <div className="px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12.5px] leading-snug text-[var(--text-dim)]">{t(`${k}.whileWatching`, { count: tally.caught })}</p>
          <p className="shrink-0 text-[20px] font-semibold tabular-nums text-[#4ade80]" data-testid="itops-caught">{eur(tally.eurAvoided)}</p>
        </div>
        <a href={ITOPS_CTA_HREF} target="_top" data-testid="itops-cta"
          className="mt-3 flex items-center justify-center h-10 rounded-[10px] text-[13.5px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
          {t(`${k}.cta`)}
        </a>
        <details className="mt-2.5 text-[10.5px] leading-relaxed text-[var(--text-faint)]">
          <summary className="cursor-pointer select-none hover:text-[var(--text-dim)]">{t(`${k}.howTitle`)}</summary>
          <p className="mt-1">{t(`${k}.howText`, { staff: 25, rate: eur(50) })}</p>
        </details>
      </div>
    </section>
  )
}
