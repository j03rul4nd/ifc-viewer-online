// ─── Typed Event Bus — Observer Pattern ──────────────────────────────────────
// Decouples producers (loader, validator) from consumers (UI, other stores)
// without them needing direct references to each other.
//
// Usage — emit:
//   appBus.emit('model:loaded', { modelInfo, fromCache, cacheKey })
//
// Usage — subscribe (outside React):
//   const off = appBus.on('validation:complete', ({ result }) => ...)
//   off() // unsubscribe
//
// Usage — subscribe (inside React): use the useAppEvent hook instead.

import type { ModelInfo, ValidationResult, EditorCommand } from '../types'
import { createLogger } from './logger'

const log = createLogger('EventBus')

// ── App-level event map ────────────────────────────────────────────────────────
// Every event and its payload type is declared here — the compiler enforces
// that emitters and subscribers agree on the shape.

export type AppEventMap = {
  'model:loaded':           { modelInfo: ModelInfo; fromCache: boolean; cacheKey: string; modelId: string }
  'model:cleared':          void
  'validation:started':     { runId: string }
  'validation:progress':    { runId: string; progress: number }
  'validation:complete':    { runId: string; result: ValidationResult; durationMs: number }
  'validation:failed':      { runId: string; error: string }
  'editor:command-applied': { command: EditorCommand }
  'editor:undone':          { command: EditorCommand }
  'editor:redone':          { command: EditorCommand }
  'editor:history-cleared': void
  'cache:saved':            { key: string; sizeBytes: number }
  'cache:deleted':          { key: string }
  'bcf:imported':           { topicCount: number }
  'bcf:exported':           { topicCount: number }
  'ui:open-legend':         void
  'capture:started':        { mode: 'replay' }
  'capture:ready':          { kind: 'screenshot' | 'clip'; durationSec?: number }
  'capture:exported':       { format: 'png' | 'webm' | 'gif'; target: 'download' | 'clipboard' }
  'tour:started':           { tourId: string; createdFrom: 'auto' | 'manual'; steps: number }
  'tour:step-changed':      { tourId: string; index: number; total: number }
  'tour:completed':         { tourId: string }
  'ui:client-mode-toggled': { enabled: boolean }
}

// ── Core bus class ─────────────────────────────────────────────────────────────

type Handler<T>  = (payload: T) => void
type AnyHandler  = Handler<unknown>

export class TypedEventBus<M extends Record<string, unknown>> {
  private readonly _listeners = new Map<keyof M, Set<AnyHandler>>()

  /**
   * Subscribe to an event.
   * @returns An unsubscribe function — call it to stop listening.
   */
  on<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    let set = this._listeners.get(event)
    if (!set) { set = new Set(); this._listeners.set(event, set) }
    set.add(handler as AnyHandler)
    log.debug('Subscribed:', String(event), `(${set.size} listeners)`)
    return () => this.off(event, handler)
  }

  off<K extends keyof M>(event: K, handler: Handler<M[K]>): void {
    const set = this._listeners.get(event)
    if (set) {
      set.delete(handler as AnyHandler)
      log.debug('Unsubscribed:', String(event), `(${set.size} listeners)`)
    }
  }

  /**
   * Emit an event to all current subscribers.
   * Handler exceptions are caught and logged — one failing listener
   * does not prevent the rest from receiving the event.
   */
  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this._listeners.get(event)
    if (!set?.size) return
    log.debug('Emitting:', String(event), `(${set.size} listeners)`)
    for (const handler of set) {
      try {
        handler(payload)
      } catch (err) {
        log.error(`Handler threw for "${String(event)}":`, err)
      }
    }
  }

  /**
   * Subscribe and automatically unsubscribe after the first fire.
   * @returns An unsubscribe function for early cancellation.
   */
  once<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    const off = this.on(event, (payload) => { off(); handler(payload) })
    return off
  }

  /**
   * Wait for an event to fire, resolving the promise with the payload.
   * Optionally cancel with an AbortSignal.
   */
  next<K extends keyof M>(event: K, signal?: AbortSignal): Promise<M[K]> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
      const off = this.once(event, resolve)
      signal?.addEventListener('abort', () => { off(); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    })
  }

  /** Remove all listeners — useful for test teardown. */
  clear(): void {
    this._listeners.clear()
    log.debug('All listeners cleared')
  }

  /** Number of listeners for a specific event (useful for tests/debugging). */
  listenerCount<K extends keyof M>(event: K): number {
    return this._listeners.get(event)?.size ?? 0
  }
}

// ── Application singleton ─────────────────────────────────────────────────────

export const appBus = new TypedEventBus<AppEventMap>()
