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
import {
  buildCatalog, buildGuidIndex, resolveLocs, evaluateTwinAlerts, parseReadings, planPaint, readingsToStored, storedToReadings,
  deviceKey, type CatalogEntry, type DeviceSource, type ElementLoc, type Reading, type StoredReading,
} from './devices'
import { indexedDbBackend, prune, type HistoryBackend } from '../layers/history-store'
import { nextFrame, rebuildAt, type Frame } from '../layers/history-codec'
import { logAlert } from '../layers/alert-log'
import { getNotifySettings, notifyAlert } from '../layers/alert-notify'
import { toast } from '../../stores/toastStore'
import i18n from '../../i18n/config'
import { SIM_PRESETS } from './device-sim'
import type { ViewerAPI } from '../viewer'

interface Poller { timer: ReturnType<typeof setTimeout> | null; failures: number; ctrl: AbortController | null; sig: string; ws?: WebSocket | null }

export const isStreamUrl = (url: string): boolean => /^wss?:\/\//i.test(url)

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
  const backend: HistoryBackend = indexedDbBackend()
  const series = (sourceId: string): string => `twin:${sourceId}`

  // ── History recording (keyframe + deltas, same codec as live layers) ────────
  const prevStored = new Map<string, { state: Record<string, StoredReading>; lastKey: number; writes: number }>()
  const record = async (sourceId: string, list: Reading[], t: number): Promise<void> => {
    const hours = store.getState().retentionH
    if (hours <= 0 || list.length === 0) return
    const p = prevStored.get(sourceId)
    const next = readingsToStored(list)
    const frame = nextFrame(p?.state as never ?? null, next as never, t, p?.lastKey ?? null)
    const writes = (p?.writes ?? 0) + (frame ? 1 : 0)
    prevStored.set(sourceId, { state: next, lastKey: frame?.kind === 'key' ? t : p?.lastKey ?? t, writes })
    if (!frame) return
    await backend.put(series(sourceId), frame)
    if (writes % 20 === 0) await prune(backend, series(sourceId), t - hours * 3_600_000)
    void refreshSpan()
  }

  const refreshSpan = async (): Promise<void> => {
    let from = Infinity
    let to = -Infinity
    for (const src of store.getState().sources) {
      const st = await backend.stats(series(src.id))
      if (st.from !== null) from = Math.min(from, st.from)
      if (st.to !== null) to = Math.max(to, st.to)
    }
    store.getState().setHistorySpan(Number.isFinite(from) && to > from ? { from, to } : null)
  }

  /** Should polling go on in a hidden tab? Only when the user asked to be told about alerts. */
  const pollHidden = (): boolean => {
    const ns = getNotifySettings()
    return (ns.sound || ns.system) && store.getState().bindings.some((b) => b.rules.some((r) => r.alert))
  }

  /** One response / message in: store it, and record the source's whole current state. */
  const accept = (src: DeviceSource, body: unknown, now: number): void => {
    const list = parseReadings(body, src, now)
    store.getState().ingest(src.id, list, now)
    // A stream message may carry ONE device: history keeps the source's full picture.
    const all = [...store.getState().readings.values()].filter((x) => x.sourceId === src.id)
    void record(src.id, all, now)
  }

  /**
   * WebSocket sources (ws:// / wss://): every message is a JSON body read with
   * the source's mapping, often a single device. Reconnects with backoff.
   * Browsers cannot set headers on a WebSocket: keys go in the URL if the
   * server takes them there.
   */
  const connect = (id: string): void => {
    const p = pollers.get(id)
    const src = store.getState().sources.find((s) => s.id === id)
    if (!p || !src) return
    let ws: WebSocket
    try { ws = new WebSocket(src.url) } catch { store.getState().setError(id, 'error.url'); return }
    p.ws = ws
    ws.onopen = () => { p.failures = 0 }
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      let body: unknown
      try { body = JSON.parse(ev.data) } catch { store.getState().setError(id, 'error.json'); return }
      accept(src, body, Date.now())
    }
    ws.onclose = () => {
      if (pollers.get(id) !== p || p.ws !== ws) return
      p.ws = null
      p.failures++
      store.getState().setError(id, 'error.network')
      p.timer = setTimeout(() => connect(id), nextDelayMs(Math.min(src.intervalS, 5), p.failures))
    }
  }

  const poll = async (id: string): Promise<void> => {
    const p = pollers.get(id)
    const src = store.getState().sources.find((s) => s.id === id)
    if (!p || !src) return
    if (isStreamUrl(src.url)) { connect(id); return }
    let delay = src.intervalS * 1000
    const hidden = typeof document !== 'undefined' && document.hidden
    if (hidden && !pollHidden()) {
      delay = 5000
    } else {
      p.ctrl = new AbortController()
      const r = await fetchDeviceSource(src, p.ctrl.signal)
      p.ctrl = null
      if (!pollers.has(id)) return
      if (r.ok) {
        p.failures = 0
        const now = Date.now()
        accept(src, r.body, now)
        delay = plannedDelayMs(src.intervalS, r.freshness)
      } else if (r.errorKey !== 'error.aborted') {
        p.failures++
        store.getState().setError(id, r.errorKey)
        delay = nextDelayMs(src.intervalS, p.failures)
      }
      if (hidden) delay = Math.max(delay, 60_000)
    }
    if (pollers.has(id)) p.timer = setTimeout(() => void poll(id), delay)
  }

  const stopPoller = (id: string): void => {
    const p = pollers.get(id)
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    p.ctrl?.abort()
    pollers.delete(id)
    const ws = p.ws
    p.ws = null
    try { ws?.close() } catch { /* already closed */ }
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

  // ── Time travel ─────────────────────────────────────────────────────────────
  const framesCache = new Map<string, { at: number; frames: Frame[] }>()
  let travelSeq = 0
  const travel = async (t: number): Promise<void> => {
    const seq = ++travelSeq
    const past = new Map<string, Reading>()
    for (const src of store.getState().sources) {
      let c = framesCache.get(src.id)
      // Frames are re-read at most every 10 s while scrubbing.
      if (!c || Date.now() - c.at > 10_000) {
        c = { at: Date.now(), frames: await backend.load(series(src.id)) }
        framesCache.set(src.id, c)
      }
      const state = rebuildAt(c.frames, t)
      if (!state) continue
      for (const r of storedToReadings(src.id, state.features as StoredReading[], state.keys)) past.set(deviceKey(r.sourceId, r.deviceId), r)
    }
    if (seq === travelSeq && store.getState().timeAt !== null) store.getState().setPast(past)
  }

  // ── Alerts (live only: rewinding never re-raises the past) ──────────────────
  const since = new Map<string, number>()
  const alertActive = new Set<string>()
  const evaluateAlerts = (): void => {
    const s = store.getState()
    if (!s.active || s.timeAt !== null) return
    const events = evaluateTwinAlerts(s.bindings, s.readings, Date.now(), since, alertActive)
    if (events.length === 0) return
    s.setAlerting([...alertActive])
    const t = i18n.getFixedT(null, 'layers', 'devices')
    for (const e of events) {
      logAlert({
        at: Date.now(), kind: e.kind, layerId: `twin:${e.binding.id}`, layer: e.binding.name,
        ruleId: e.rule.id, rule: e.rule.name, n: e.kind === 'start' ? Math.max(1, e.binding.targets.length) : 0,
        sample: [e.binding.deviceId],
      })
      if (e.kind !== 'start') continue
      const msg = t('alertStarted', { rule: e.rule.name, name: e.binding.name })
      // "Show" only when there is something to show: a device whose elements are
      // not loaded (another file of the project, a storey with no services) still alerts.
      syncIndex()
      const where = resolveLocsFor(e.binding).length > 0
      const show = where ? () => focusBinding(e.binding.id) : undefined
      toast(msg, 'warning', { duration: 0, action: show ? { label: t('alertShow'), run: show } : undefined })
      notifyAlert({ title: e.rule.name, body: e.binding.name, tag: `twin:${e.binding.id}/${e.rule.id}`, onClick: show })
    }
  }

  // ── Painting ────────────────────────────────────────────────────────────────
  let guidIndex: Map<string, ElementLoc[]> = new Map()
  let catalog: CatalogEntry[] = []
  let treesRef: unknown = null
  const syncIndex = (): void => {
    const trees = useValidationStore.getState().spatialTrees
    if (trees !== treesRef) { treesRef = trees; guidIndex = buildGuidIndex(trees); catalog = buildCatalog(trees) }
  }

  const focusBinding = (bindingId: string): void => {
    const viewer = getViewer()
    const b = store.getState().bindings.find((x) => x.id === bindingId)
    if (!viewer || !b) return
    syncIndex()
    const locs = resolveLocsFor(b)
    const first = locs[0]
    if (!first) return
    const ids = locs.filter((l) => l.modelId === first.modelId).map((l) => l.expressId)
    viewer.frameElements(ids, first.modelId)
    viewer.selectElement(first.expressId, first.modelId)
  }
  const resolveLocsFor = (b: import('./devices').Binding): ElementLoc[] => resolveLocs(b, guidIndex, catalog)

  // Coalesced with a timer, not rAF: rAF is frozen in a hidden tab, and the
  // twin must be current the moment the user looks again.
  let pending: ReturnType<typeof setTimeout> | null = null
  const repaint = (): void => {
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      evaluateAlerts()
      const viewer = getViewer()
      if (!viewer) return
      syncIndex()
      const s = store.getState()
      const shown = s.past ?? s.readings
      const now = s.timeAt ?? Date.now()
      void viewer.setTwinPaint(s.active && s.bindings.length ? planPaint(s.bindings, shown, guidIndex, now, catalog) : null)
    }, 50)
  }

  syncPollers()
  repaint()
  void refreshSpan()
  const unsubStore = store.subscribe((s, prev) => {
    if (s.sources !== prev.sources || s.active !== prev.active) syncPollers()
    if (s.timeAt !== prev.timeAt && s.timeAt !== null) void travel(s.timeAt)
    if (s.version !== prev.version) repaint()
  })
  const unsubTrees = useValidationStore.subscribe((s, prev) => { if (s.spatialTrees !== prev.spatialTrees) repaint() })
  // Stale devices and alert hold times change without any new reading: re-evaluate on a clock.
  const clock = setInterval(() => {
    if (store.getState().bindings.some((b) => b.staleAfterS > 0 || b.rules.some((r) => r.alert))) repaint()
  }, 10_000)

  return () => {
    unsubStore(); unsubTrees(); clearInterval(clock)
    if (pending) clearTimeout(pending)
    for (const id of [...pollers.keys()]) stopPoller(id)
    started = false
  }
}

/** Forget a source's recorded history (panel button). */
export async function clearTwinHistory(sourceId: string): Promise<void> {
  await indexedDbBackend().clear(`twin:${sourceId}`)
}
