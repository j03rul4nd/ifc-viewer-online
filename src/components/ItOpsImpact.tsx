// ─── ItOpsImpact ──────────────────────────────────────────────────────────────
// The office-IT twin demo (`?twin=itops`) says what it is worth while it runs.
// A coloured building shows that something is red; a buyer needs to see what a
// red room would have cost without the twin. So, next to the model:
//
//   - the incidents open right now, each with how fast the twin caught it and
//     what the same fault costs when it is found the usual way (a call, a
//     visit), and a Show button that frames it in 3D;
//   - a tally since the page opened: incidents caught, downtime avoided, money;
//   - a yearly estimate for one office, times the visitor's own sites;
//   - one call to action.
//
// Numbers come from lib/twin/itops-impact.ts and are labelled as estimates.
// It reads the simulated feed itself (a pure function of time) rather than
// the twin store, so it costs one small object every few seconds. On a phone
// it starts folded into one line, so the building stays in view.

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import { simulateItOps } from '../lib/twin/device-sim'
import { openIncidents, addOnsets, incidentKey, yearlySavingEur, EMPTY_TALLY, WITHOUT, DETECT_S, type Incident, type Tally } from '../lib/twin/itops-impact'
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

function useItOpsFeed(): { open: Incident[]; tally: Tally } {
  const [state, setState] = useState(() => {
    const open = openIncidents(simulateItOps(Date.now()))
    return { open, tally: addOnsets(EMPTY_TALLY, open, new Set()) }
  })
  const prev = useRef(new Set(state.open.map(incidentKey)))
  useEffect(() => {
    const id = window.setInterval(() => {
      const open = openIncidents(simulateItOps(Date.now()))
      setState((s) => ({ open, tally: addOnsets(s.tally, open, prev.current) }))
      prev.current = new Set(open.map(incidentKey))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return state
}

const isPhone = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches

export default function ItOpsImpact({ viewerApiRef, hidden }: { viewerApiRef: React.MutableRefObject<ViewerAPI | null>; hidden?: boolean }) {
  const { t, i18n } = useTranslation('viewer')
  const { open, tally } = useItOpsFeed()
  const [expanded, setExpanded] = useState(() => !isPhone())
  const [sites, setSites] = useState(10)
  const lang = i18n.language || 'en'
  const eur = (n: number): string => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const dur = (min: number): string => (min >= 60 ? t('explorer.itops.hours', { n: Math.round(min / 6) / 10 }) : t('explorer.itops.minutes', { n: min }))
  const k = 'explorer.itops'
  const alerting = open.length > 0

  const statusDot = (
    <span className="relative flex w-2 h-2" aria-hidden>
      <span className={`absolute inset-0 rounded-full animate-ping opacity-60 ${alerting ? 'bg-[#ef4444]' : 'bg-[#22c55e]'}`} />
      <span className={`relative w-2 h-2 rounded-full ${alerting ? 'bg-[#ef4444]' : 'bg-[#22c55e]'}`} />
    </span>
  )

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} data-testid="itops-impact-pill"
        className={`${hidden ? 'max-sm:hidden' : ''} absolute z-[22] right-2 top-2 pointer-events-auto flex items-center gap-2 h-9 px-3 rounded-full border border-[var(--border)] bg-[rgba(14,15,20,0.9)] backdrop-blur-[8px] shadow-lg text-[12px] text-[var(--text)]`}>
        {statusDot}
        <span className="font-medium">{alerting ? t(`${k}.alerts`, { count: open.length }) : t(`${k}.allOk`)}</span>
        <span className="text-[var(--text-faint)]">·</span>
        <span className="font-mono tabular-nums text-[#4ade80]">{eur(tally.eurAvoided)}</span>
        <span aria-hidden className="text-[var(--text-faint)]">▾</span>
      </button>
    )
  }

  return (
    <section data-testid="itops-impact" aria-label={t(`${k}.label`)}
      className={`${hidden ? 'max-sm:hidden' : ''} absolute z-[22] max-sm:z-[24] right-2 top-2 w-[312px] max-sm:left-2 max-sm:w-auto max-h-[calc(100%-4.5rem)] max-sm:max-h-[calc(100%-1rem)] overflow-y-auto
        pointer-events-auto rounded-[14px] border border-[var(--border)] bg-[rgba(14,15,20,0.94)] backdrop-blur-[10px] shadow-2xl text-[var(--text)]`}>
      <header className="flex items-center gap-2 px-3.5 pt-3">
        {statusDot}
        <span className="flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">{t(`${k}.label`)}</span>
        <button type="button" onClick={() => setExpanded(false)} aria-label={t(`${k}.fold`)} title={t(`${k}.fold`)}
          className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-[7px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06]">▴</button>
      </header>

      <div className="px-3.5 pt-1.5 pb-3" aria-live="polite">
        <p className={`text-[17px] font-semibold leading-snug ${alerting ? 'text-[#fca5a5]' : 'text-[#86efac]'}`} data-testid="itops-impact-status">
          {alerting ? t(`${k}.alerts`, { count: open.length }) : t(`${k}.allOk`)}
        </p>
        {!alerting && <p className="mt-0.5 text-[12px] text-[var(--text-dim)]">{t(`${k}.allOkLine`)}</p>}
        {alerting && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {open.slice(0, 3).map((i) => (
              <li key={incidentKey(i)} className="rounded-[10px] border border-[#ef4444]/25 bg-[#ef4444]/[0.07] px-2.5 py-2" data-testid="itops-incident">
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full bg-[#ef4444]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium leading-snug">{t(`${k}.kind.${i.kind}`, { value: i.value })}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--text-dim)]">
                      {t(`${k}.caughtIn`, { s: DETECT_S })}
                      {' · '}
                      {WITHOUT[i.kind].costEur > 0
                        ? t(`${k}.withoutCost`, { time: dur(WITHOUT[i.kind].noticeMin), cost: eur(WITHOUT[i.kind].costEur) })
                        : t(`${k}.withoutTime`, { time: dur(WITHOUT[i.kind].noticeMin) })}
                    </p>
                  </div>
                  <button type="button" onClick={() => void focusDevice(viewerApiRef.current, i.deviceId)}
                    className="shrink-0 h-7 px-2 rounded-[7px] text-[11.5px] font-medium text-[var(--text)] bg-white/[0.06] hover:bg-white/[0.12]">{t(`${k}.show`)}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mx-3.5 border-t border-white/[0.08]" />
      <div className="px-3.5 py-3">
        <p className="text-[11px] text-[var(--text-faint)]">{t(`${k}.sinceOpen`)} · {t(`${k}.simulated`)}</p>
        <dl className="mt-1.5 grid grid-cols-3 gap-2">
          <div className="flex flex-col justify-between"><dt className="text-[10.5px] leading-tight text-[var(--text-faint)]">{t(`${k}.caught`)}</dt><dd className="font-mono tabular-nums text-[16px] font-semibold" data-testid="itops-caught">{tally.caught}</dd></div>
          <div className="flex flex-col justify-between"><dt className="text-[10.5px] leading-tight text-[var(--text-faint)]">{t(`${k}.downtime`)}</dt><dd className="font-mono tabular-nums text-[16px] font-semibold">{dur(tally.minutesAvoided)}</dd></div>
          <div className="flex flex-col justify-between"><dt className="text-[10.5px] leading-tight text-[var(--text-faint)]">{t(`${k}.avoided`)}</dt><dd className="font-mono tabular-nums text-[16px] font-semibold text-[#4ade80]">{eur(tally.eurAvoided)}</dd></div>
        </dl>
      </div>

      <div className="mx-3.5 border-t border-white/[0.08]" />
      <div className="px-3.5 py-3">
        <div className="grid grid-cols-2 gap-2 text-[11.5px] leading-snug">
          <div className="rounded-[10px] bg-white/[0.04] px-2.5 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t(`${k}.withoutTitle`)}</p>
            <p className="mt-1 text-[var(--text-dim)]">{t(`${k}.withoutLine`)}</p>
          </div>
          <div className="rounded-[10px] bg-[#22c55e]/[0.08] border border-[#22c55e]/20 px-2.5 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#86efac]">{t(`${k}.withTitle`)}</p>
            <p className="mt-1 text-[var(--text)]">{t(`${k}.withLine`, { s: DETECT_S })}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <p className="flex-1 text-[11.5px] text-[var(--text-dim)]">{t(`${k}.yearFor`)}</p>
          <div className="flex items-center rounded-[8px] border border-white/10" role="group" aria-label={t(`${k}.sites`)}>
            <button type="button" onClick={() => setSites((s) => Math.max(1, s - (s > 10 ? 10 : 1)))} aria-label="−" className="w-7 h-7 text-[var(--text-dim)] hover:text-[var(--text)]">−</button>
            <span className="min-w-[2.2rem] text-center font-mono tabular-nums text-[12px]" data-testid="itops-sites">{sites}</span>
            <button type="button" onClick={() => setSites((s) => Math.min(500, s + (s >= 10 ? 10 : 1)))} aria-label="+" className="w-7 h-7 text-[var(--text-dim)] hover:text-[var(--text)]">+</button>
          </div>
          <span className="text-[11.5px] text-[var(--text-dim)]">{t(`${k}.sitesUnit`, { count: sites })}</span>
        </div>
        <p className="mt-1 font-mono tabular-nums text-[24px] font-semibold tracking-tight text-[#4ade80]" data-testid="itops-year">
          {eur(yearlySavingEur(sites))}<span className="ml-1 font-sans text-[12px] font-normal text-[var(--text-dim)]">{t(`${k}.perYear`)}</span>
        </p>
        <a href={ITOPS_CTA_HREF} target="_top" data-testid="itops-cta"
          className="mt-2.5 flex items-center justify-center h-9 rounded-[9px] text-[13px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
          {t(`${k}.cta`)}
        </a>
        <details className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-faint)]">
          <summary className="cursor-pointer select-none hover:text-[var(--text-dim)]">{t(`${k}.howTitle`)}</summary>
          <p className="mt-1">{t(`${k}.howText`, { staff: 25, rate: eur(50) })}</p>
        </details>
      </div>
    </section>
  )
}
