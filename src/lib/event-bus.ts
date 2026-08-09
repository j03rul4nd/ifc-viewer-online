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

// ── SDK command payloads ──────────────────────────────────────────────────────
// The embed bridge in App.tsx owns the postMessage protocol, but Map mode and
// the Sun & Moon study are orchestrated inside their panels (location
// resolution, tile providers, consent) — logic that would have to be duplicated
// to drive them from App. So the bridge emits a command on the bus and the
// panel that already knows how executes it, acknowledging through `done`.
// No listener (feature flag off, or no model yet) = no ack, which the bridge
// reports back to the host as a plain error instead of hanging.

/** `sdk:solar` — drive the Sun & Moon study. Omitted fields are left alone. */
export interface SdkSolarCommand {
  /** Start (true) or stop (false) the study. */
  active?: boolean
  /** Site-local date, `YYYY-MM-DD` or evergreen `MM-DD`. */
  date?: string
  /** Site-local time, `HH:MM`. */
  time?: string
  moon?: boolean
  sky?: boolean
  quality?: 'standard' | 'high'
  /** Site location to use when the IFC carries no georeference. */
  location?: { lat: number; lon: number }
  done?: (ok: boolean, error?: string) => void
}

/** `sdk:site` — drive Map mode (site context). Omitted fields are left alone. */
export interface SdkSiteCommand {
  enabled?: boolean
  terrain?: boolean
  buildings?: boolean
  /** Per-kind OSM feature layers, e.g. `{ water: true, tree: false }`. */
  layers?: Record<string, boolean>
  /** Surrounding-facade fidelity. `showcase` also downloads the authored props. */
  detail?: 'simple' | 'detailed' | 'showcase'
  /** Terrain relief style. */
  terrainStyle?: 'imagery' | 'shaded' | 'hypsometric' | 'slope' | 'ecosystem'
  /** Vertical exaggeration multiplier for the terrain (1–3). */
  exaggeration?: number
  /** Decorative cars and trains. */
  vehicles?: boolean
  done?: (ok: boolean, error?: string) => void
}

/**
 * `sdk:pointcloud` — load and tune point clouds. Same delegation reason as the
 * two above: the loader needs the viewer's PointCloudSystem, the model bounds
 * to align against, and the alignment ladder — all of which live in the panel.
 */
export interface SdkPointCloudCommand {
  action: 'add' | 'remove' | 'clear' | 'visible' | 'display' | 'frame' | 'inspect'
  /** `add`: the scan itself. A File so the readers can stream slices of it. */
  file?: File
  /** `remove` / `visible` / `frame`: which cloud. */
  cloudId?: string
  visible?: boolean
  /** `display`: partial patch over the shared display settings. */
  display?: Record<string, unknown>
  /** Points drawn per frame at density 1. */
  renderBudget?: number
  /**
   * `inspect`: arm (default) or disarm click-to-read on the scan. Picks are
   * reported to the host through the `pointcloud-picked` event.
   */
  inspect?: boolean
  /** `add` resolves with the new cloud's id so the host can address it. */
  done?: (ok: boolean, errorOrId?: string) => void
}

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
  'sdk:solar':              SdkSolarCommand
  'sdk:site':               SdkSiteCommand
  'sdk:pointcloud':         SdkPointCloudCommand
}

// ── Core bus class ─────────────────────────────────────────────────────────────

type Handler<T>  = (payload: T) => void
type AnyHandler  = Handler<unknown>

export class TypedEventBus<M extends Record<string, unknown>> {
  private readonly _listeners = new Map<keyof M, Set<AnyHandler>>()

  /**
   * Is anyone subscribed to this event yet?
   *
   * Needed because the panels that serve `sdk:*` commands are lazy AND gated on
   * a loaded model, so a host command can easily arrive before its handler
   * exists. Emitting into the void would look like a silent failure; retrying
   * blindly would double-execute a command like `add`. Asking first makes the
   * wait explicit and side-effect free.
   */
  hasListeners(event: keyof M): boolean {
    return (this._listeners.get(event)?.size ?? 0) > 0
  }

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
