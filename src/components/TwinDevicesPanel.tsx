// ─── TwinDevicesPanel ─────────────────────────────────────────────────────────
// Operational twin: API sources whose devices drive what IFC elements look like.
//
// This file only COMPOSES: status header, tabs in the order a twin is built
// (sources → devices → bindings → project), sub-flows that take over the body,
// and the timeline, which is pinned because live-or-past is true of everything
// above it. A new feature is one entry in TABS and one component; each tab fails
// alone behind its boundary.
//
// The whole body scrolls as ONE piece with the tab bar stuck to its top, so a
// short viewport (a laptop with the validation drawer open, a phone in
// landscape) can always reach everything. It mounts only while the panel is
// open: closed, it subscribes to nothing and costs nothing per reading.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from './ViewportPanel'
import { SectionBoundary } from './geo/ui'
import { useTwinDeviceStore } from '../stores/twinDeviceStore'
import { IconBtn, MARGIN, ScrollContext, Switch } from './twin/ui'
import { ALERT_FILTER, TwinNavContext, useShownReadings, useTwinNav, type TwinFlow, type TwinNav, type TwinTabId } from './twin/nav'
import { BindingsTab, BindingFlow } from './twin/BindingsTab'
import { BulkFlow, DevicesTab } from './twin/DevicesTab'
import { GetStarted, SourceFlow, SourcesTab } from './twin/SourcesTab'
import { ProjectTab, TimelineDock } from './twin/ProjectTab'
import type { SelectedInfo } from '../types'

const TAB_KEY = 'ifc-twin-panel-tab:v1'

interface TabSpec { id: TwinTabId; label: string; count?: number; dot?: boolean; body: React.ReactNode }

export default function TwinDevicesPanel({ selected, onClose }: { selected: SelectedInfo | null; onClose: () => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const open = useTwinDeviceStore((s) => s.panelOpen)
  return (
    <ViewportPanel id="twin-devices" open={open} onClose={onClose} label={t('title')} mobile="sheet" peek widthPx={392} anchor="top">
      {open && <PanelBody selected={selected} onClose={onClose} />}
    </ViewportPanel>
  )
}

function PanelBody({ selected, onClose }: { selected: SelectedInfo | null; onClose: () => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { t: tc } = useTranslation('common')
  const [tab, setTabState] = useState<TwinTabId>(() => {
    try { return (localStorage.getItem(TAB_KEY) as TwinTabId) || 'sources' } catch { return 'sources' }
  })
  const [flow, setFlow] = useState<TwinFlow | null>(null)
  const [stateFilter, setStateFilter] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasSources = useTwinDeviceStore((s) => s.sources.length > 0)

  const nav = useMemo<TwinNav>(() => ({
    tab,
    setTab: (next) => {
      setTabState(next)
      try { localStorage.setItem(TAB_KEY, next) } catch { /* private mode */ }
    },
    flow, setFlow, stateFilter, setStateFilter, selected,
  }), [tab, flow, stateFilter, selected])

  // Every view starts at its top; the scroll of the previous one means nothing here.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [tab, flow])

  const boundary = { message: t('panel.failed'), retryLabel: t('panel.retry') }
  return (
    <TwinNavContext.Provider value={nav}>
      <ScrollContext.Provider value={scrollRef}>
        {/* Basis, not height: a steady size between tabs that still gives way to a
            short lane, and grows to fill a phone's sheet. */}
        <div className="flex flex-col min-h-0" style={{ flex: '1 1 640px' }}
          onKeyDown={(e) => {
            // The panel registry leaves a prevented Escape alone: back first, then close.
            if (e.key === 'Escape' && flow) { e.preventDefault(); setFlow(null) }
          }}>
          <header className={`shrink-0 flex items-center gap-2 ${MARGIN} pt-3 pb-2 max-md:pt-1`}>
            <h2 className="flex-1 min-w-0 text-[14px] max-md:text-[15px] font-semibold text-[var(--text)] truncate">{t('title')}</h2>
            <IconBtn label={tc('actions.close')} onClick={onClose} className="-mr-1.5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
            </IconBtn>
          </header>
          {hasSources && <StatusLine />}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]" data-testid="twin-devices-panel">
            {flow
              ? <SectionBoundary {...boundary}><FlowView flow={flow} /></SectionBoundary>
              : hasSources ? <Tabs /> : <SectionBoundary {...boundary}><GetStarted /></SectionBoundary>}
          </div>
          <TimelineDock />
        </div>
      </ScrollContext.Provider>
    </TwinNavContext.Provider>
  )
}

function FlowView({ flow }: { flow: TwinFlow }) {
  if (flow.kind === 'source') return <SourceFlow key={flow.id ?? 'new'} id={flow.id} />
  if (flow.kind === 'binding') return <BindingFlow key={flow.id} id={flow.id} />
  return <BulkFlow />
}

/** What the twin is doing, read first: on or paused, how much, and anything wrong. */
function StatusLine() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const nav = useTwinNav()
  const active = useTwinDeviceStore((s) => s.active)
  const alerts = useTwinDeviceStore((s) => s.alerting.length)
  const errors = useTwinDeviceStore((s) => s.sources.filter((x) => x.enabled && s.status[x.id]?.state === 'error').length)
  const readings = useShownReadings()
  return (
    <div className={`shrink-0 flex items-center gap-2.5 ${MARGIN} pb-3`}>
      <Switch checked={active} onChange={(v) => useTwinDeviceStore.getState().setActive(v)} label={t('live')} testId="twin-active" />
      <span className="flex-1 min-w-0 truncate text-[12px] max-md:text-[13px] text-[var(--text-dim)]">
        {active ? t('panel.summaryDevices', { count: readings.size }) : t('panel.paused')}
        {errors > 0 && <button type="button" className="ml-1.5 text-[var(--danger,#ef4444)] hover:underline" onClick={() => { nav.setFlow(null); nav.setTab('sources') }}>· {t('panel.summaryErrors', { count: errors })}</button>}
      </span>
      {alerts > 0 && (
        <button type="button" onClick={() => { nav.setFlow(null); nav.setTab('bindings'); nav.setStateFilter(ALERT_FILTER) }}
          className="shrink-0 inline-flex items-center gap-1.5 h-6 max-md:h-9 px-2 rounded-full border border-[var(--danger,#ef4444)] text-[11.5px] text-[var(--text)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger,#ef4444)]" aria-hidden />{t('alertsActive', { count: alerts })}
        </button>
      )}
    </div>
  )
}

function Tabs() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { tab, setTab } = useTwinNav()
  const sources = useTwinDeviceStore((s) => s.sources.length)
  const bindings = useTwinDeviceStore((s) => s.bindings.length)
  const devices = useShownReadings().size
  const boundary = { message: t('panel.failed'), retryLabel: t('panel.retry') }

  const tabs: TabSpec[] = [
    { id: 'sources', label: t('panel.tabs.sources'), count: sources, body: <SourcesTab /> },
    { id: 'devices', label: t('panel.tabs.devices'), count: devices, body: <DevicesTab /> },
    { id: 'bindings', label: t('panel.tabs.bindings'), count: bindings, body: <BindingsTab /> },
    { id: 'project', label: t('panel.tabs.project'), body: <ProjectTab /> },
  ]
  const current = tabs.find((x) => x.id === tab) ?? tabs[0]
  return (
    <>
      <div role="tablist" aria-label={t('title')}
        className={`sticky top-0 z-[2] flex gap-4 ${MARGIN} border-y border-[var(--border)] bg-[var(--surface)] overflow-x-auto [scrollbar-width:none]`}
        onKeyDown={(e) => {
          const i = tabs.indexOf(current)
          if (e.key === 'ArrowRight') { e.preventDefault(); setTab(tabs[(i + 1) % tabs.length].id) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); setTab(tabs[(i - 1 + tabs.length) % tabs.length].id) }
        }}>
        {tabs.map((x) => {
          const on = x.id === current.id
          return (
            <button key={x.id} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => setTab(x.id)}
              className={`relative shrink-0 h-10 max-md:h-11 inline-flex items-center gap-1.5 text-[12.5px] max-md:text-[14px] font-medium whitespace-nowrap transition-colors ${on ? 'text-[var(--text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'}`}>
              {x.label}
              {!!x.count && <span className="text-[11px] tabular-nums text-[var(--text-faint)]">{x.count}</span>}
              {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-[var(--accent)]" aria-hidden />}
            </button>
          )
        })}
      </div>
      <div role="tabpanel"><SectionBoundary key={current.id} {...boundary}>{current.body}</SectionBoundary></div>
    </>
  )
}
