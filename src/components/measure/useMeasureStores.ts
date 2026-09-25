// ─── useMeasureStores ─────────────────────────────────────────────────────────
// React's view of the measurement and section engines: external stores read
// with useSyncExternalStore, so the panels re-render when — and only when — the
// engine says something changed. The old panels polled every 400–500 ms.

import { useCallback, useSyncExternalStore } from 'react'
import type { MeasureSystem } from '../../lib/measure/measure-system'
import type { SectionSnapshot, SectionSystem } from '../../lib/measure/section-system'
import type { MeasureHover, MeasureSnapshot } from '../../lib/measure/measure-types'

const noop = (): void => undefined

export function useMeasureSnapshot(system: MeasureSystem | null): MeasureSnapshot | null {
  const subscribe = useCallback((cb: () => void) => (system ? system.subscribe(cb) : noop), [system])
  const get = useCallback(() => (system ? system.getSnapshot() : null), [system])
  return useSyncExternalStore(subscribe, get, get)
}

export function useMeasureHover(system: MeasureSystem | null): MeasureHover | null {
  const subscribe = useCallback((cb: () => void) => (system ? system.subscribeHover(cb) : noop), [system])
  const get = useCallback(() => (system ? system.getHover() : null), [system])
  return useSyncExternalStore(subscribe, get, get)
}

export function useSectionSnapshot(system: SectionSystem | null): SectionSnapshot | null {
  const subscribe = useCallback((cb: () => void) => (system ? system.subscribe(cb) : noop), [system])
  const get = useCallback(() => (system ? system.getSnapshot() : null), [system])
  return useSyncExternalStore(subscribe, get, get)
}

/** Keys the viewport tools listen to must not fire while someone is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}
