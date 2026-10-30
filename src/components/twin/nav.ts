// ─── Twin panel navigation and shared reads ───────────────────────────────────

import { createContext, startTransition, useContext, useEffect, useState } from 'react'
import { useTwinDeviceStore, selectShownReadings } from '../../stores/twinDeviceStore'
import { useValidationStore } from '../../stores/validationStore'
import { twinElements, type TwinElements } from '../../lib/twin/element-index'
import type { Reading } from '../../lib/twin/devices'
import type { SelectedInfo } from '../../types'

export type TwinTabId = 'sources' | 'devices' | 'bindings' | 'project'

/** A sub-flow takes the whole body: one job at a time, with a way back. `id: null` = a new source. */
export type TwinFlow = { kind: 'source'; id: string | null } | { kind: 'binding'; id: string } | { kind: 'bulk' }

/** Bindings tab filter that means "only those ringing now". */
export const ALERT_FILTER = '__alerting'

export interface TwinNav {
  tab: TwinTabId
  setTab: (t: TwinTabId) => void
  flow: TwinFlow | null
  setFlow: (f: TwinFlow | null) => void
  stateFilter: string | null
  setStateFilter: (f: string | null) => void
  selected: SelectedInfo | null
}

export const TwinNavContext = createContext<TwinNav | null>(null)
export const useTwinNav = (): TwinNav => useContext(TwinNavContext)!

export function useTwinElements(): TwinElements {
  return twinElements(useValidationStore((s) => s.spatialTrees))
}

/** The selected element as a binding target. */
export function useSelectionRef(): { globalId: string; label: string } | null {
  const { selected } = useTwinNav()
  const { byLoc } = useTwinElements()
  if (!selected?.modelId) return null
  const e = byLoc.get(`${selected.modelId}#${Number(selected.id)}`)
  return e ? { globalId: e.globalId, label: e.name || e.ifcClass } : null
}

/**
 * The readings shown, at a rate a person can read. A stream changes them every
 * second; as a low-priority update that re-render never gets ahead of typing.
 */
export function useShownReadings(everyMs = 1000): Map<string, Reading> {
  const [shown, setShown] = useState(() => selectShownReadings(useTwinDeviceStore.getState()))
  useEffect(() => {
    let latest = selectShownReadings(useTwinDeviceStore.getState())
    let last = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const emit = (): void => {
      timer = null
      last = Date.now()
      const value = latest
      startTransition(() => setShown(value))
    }
    emit()
    const unsub = useTwinDeviceStore.subscribe((s) => {
      const next = selectShownReadings(s)
      if (next === latest) return
      latest = next
      if (timer) return
      timer = setTimeout(emit, Math.max(0, everyMs - (Date.now() - last)))
    })
    return () => { unsub(); if (timer) clearTimeout(timer) }
  }, [everyMs])
  return shown
}

export function download(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const timeOf = (ms: number | null): string => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—')

export function metricsLine(r: Reading, max = 3): string {
  return r.props.filter((p) => !p.joined && p.field !== 'id' && p.field !== 'updated' && p.field !== 'kind')
    .slice(0, max).map((p) => `${p.field} ${p.display}`).join(' · ')
}
