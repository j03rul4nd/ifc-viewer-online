// ─── React bridge for the typed event bus ────────────────────────────────────
// Subscribes to an app-level event for the lifetime of the component.
// The handler is always up-to-date (ref trick) — no stale closure risk.
//
// Usage:
//   useAppEvent('model:loaded', ({ modelInfo }) => {
//     console.log('loaded', modelInfo.fileName)
//   })

import { useEffect, useRef } from 'react'
import { appBus } from '../lib/event-bus'
import type { AppEventMap } from '../lib/event-bus'

type Handler<T> = (payload: T) => void

/**
 * Subscribe to a typed app event for the lifetime of the component.
 * Safe to use with inline arrow functions — the ref trick keeps the
 * handler current without re-subscribing on every render.
 */
export function useAppEvent<K extends keyof AppEventMap>(
  event:   K,
  handler: Handler<AppEventMap[K]>,
): void {
  // Keep the latest handler in a ref so the subscription never goes stale
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const stable = (payload: AppEventMap[K]): void => handlerRef.current(payload)
    return appBus.on(event, stable)
  // event is intentionally the only dep — re-subscribe only if the event key changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])
}

/**
 * Subscribe to a typed app event and fire the handler exactly once,
 * then automatically unsubscribe.
 */
export function useAppEventOnce<K extends keyof AppEventMap>(
  event:   K,
  handler: Handler<AppEventMap[K]>,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    return appBus.once(event, (payload) => handlerRef.current(payload))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])
}
