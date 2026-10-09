// ─── device-runner ────────────────────────────────────────────────────────────
// The app side of the operational twin: poll every enabled source, feed the
// readings to the store, and repaint the models whenever readings, bindings or
// the set of loaded models change.
//
// Polling follows the same manners as live layers (layers/feeds): the user's
// interval is a wish, the server's Cache-Control and rate-limit headers have
// the last word, a hidden tab does not ask, failures back off ×2 up to 5 min,
// and a source without CORS can go through the USER's proxy (never ours).

import { useTwinDeviceStore, loadSecrets } from '../../stores/twinDeviceStore'
import { useValidationStore } from '../../stores/validationStore'
import { httpFreshness, plannedDelayMs, type Freshness } from '../layers/feeds'
import { nextDelayMs } from '../layers/live-feed'
import { getLayersProxy } from '../layers/vector-runner'
import { buildGuidIndex, parseReadings, planPaint, type DeviceSource, type ElementLoc } from './devices'
import { SIM_PRESETS } from './device-sim'
import type { ViewerAPI } from '../viewer'

interface Poller { timer: ReturnType<typeof setTimeout> | null; failures: number; ctrl: AbortController | null; sig: string }

type FetchResult = { ok: true; body: unknown; freshness: Freshness | null } | { ok: false; errorKey: string }

export async function fetchDeviceSource(src: DeviceSource, signal?: AbortSignal): Promise<FetchResult> {
  const sim = SIM_PRESETS[src.url]
  if (sim) return { ok: true, body: sim(Date.now()), freshness: null }
  if (!/^https?:\/\//i.test(src.url)) return { ok: false, errorKey: 'error.url' }
  const headers: Record<string, string> = { Accept: 'application/json', ...(loadSecrets()[src.id] ?? {}) }
  const attempt = async (target: string): Promise<FetchResult> => {
    const res = await fetch(target, { signal, headers })
    if (!res.ok) return { ok: false, errorKey: 'error.http' }
    const text = await res.text()
    try { return { ok: true, body: JSON.parse(text), freshness: httpFreshness(res.headers) } } catch { return { ok: false, errorKey: 'error.json' } }
  }
  try {
    return await attempt(src.url)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, errorKey: 'error.aborted' }
    const proxy = getLayersProxy()
    if (proxy) {
      try { return await attempt(proxy.replace('{url}', encodeURIComponent(src.url))) } catch { /* fall through */ }
      return { ok: false, errorKey: 'error.network' }
    }
    return { ok: false, errorKey: 'error.cors' }
  }
}

let started = false

/** Idempotent. Returns a stop function (tests / HMR). */
export function startTwinRunner(getViewer: () => ViewerAPI | null): () => void {
  if (started) return () => {}
  started = true
  const pollers = new Map<string, Poller>()
  const store = useTwinDeviceStore

  const poll = async (id: string): Promise<void> => {
    const p = pollers.get(id)
    const src = store.getState().sources.find((s) => s.id === id)
    if (!p || !src) return
    let delay = src.intervalS * 1000
    if (typeof document !== 'undefined' && document.hidden) {
      delay = 5000
    } else {
      p.ctrl = new AbortController()
      const r = await fetchDeviceSource(src, p.ctrl.signal)
      p.ctrl = null
      if (!pollers.has(id)) return
      if (r.ok) {
        p.failures = 0
        const now = Date.now()
        store.getState().ingest(id, parseReadings(r.body, src, now), now)
        delay = plannedDelayMs(src.intervalS, r.freshness)
      } else if (r.errorKey !== 'error.aborted') {
        p.failures++
        store.getState().setError(id, r.errorKey)
        delay = nextDelayMs(src.intervalS, p.failures)
      }
    }
    if (pollers.has(id)) p.timer = setTimeout(() => void poll(id), delay)
  }

  const stopPoller = (id: string): void => {
    const p = pollers.get(id)
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    p.ctrl?.abort()
    pollers.delete(id)
  }

  const syncPollers = (): void => {
    const { sources, active } = store.getState()
    const want = new Map(active ? sources.filter((s) => s.enabled).map((s) => [s.id, `${s.url}|${s.intervalS}|${JSON.stringify(s.mapping)}`]) : [])
    for (const [id, p] of pollers) if (want.get(id) !== p.sig) stopPoller(id)
    for (const [id, sig] of want) {
      if (pollers.has(id)) continue
      pollers.set(id, { timer: null, failures: 0, ctrl: null, sig })
      void poll(id)
    }
  }

  // ── Painting ────────────────────────────────────────────────────────────────
  let guidIndex: Map<string, ElementLoc[]> = new Map()
  let treesRef: unknown = null
  // Coalesced with a timer, not rAF: rAF is frozen in a hidden tab, and the
  // twin must be current the moment the user looks again.
  let pending: ReturnType<typeof setTimeout> | null = null
  const repaint = (): void => {
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      const viewer = getViewer()
      if (!viewer) return
      const trees = useValidationStore.getState().spatialTrees
      if (trees !== treesRef) { treesRef = trees; guidIndex = buildGuidIndex(trees) }
      const { active, bindings, readings } = store.getState()
      void viewer.setTwinPaint(active && bindings.length ? planPaint(bindings, readings, guidIndex, Date.now()) : null)
    }, 50)
  }

  syncPollers()
  repaint()
  const unsubStore = store.subscribe((s, prev) => {
    if (s.sources !== prev.sources || s.active !== prev.active) syncPollers()
    if (s.version !== prev.version) repaint()
  })
  const unsubTrees = useValidationStore.subscribe((s, prev) => { if (s.spatialTrees !== prev.spatialTrees) repaint() })
  // Stale devices turn grey without any new reading: re-evaluate on a clock.
  const clock = setInterval(() => { if (store.getState().bindings.some((b) => b.staleAfterS > 0)) repaint() }, 10_000)

  return () => {
    unsubStore(); unsubTrees(); clearInterval(clock)
    if (pending) clearTimeout(pending)
    for (const id of [...pollers.keys()]) stopPoller(id)
    started = false
  }
}
