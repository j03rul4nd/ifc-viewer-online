// ─── A user's own AGV twin ──────────────────────────────────────────────────
// Everything a person sets to turn the demo into their warehouse. It lives in
// the browser (localStorage, an exported file, or a share link) and nothing
// here talks to a server of ours: the ERP endpoint and the fleet feed are the
// user's own, called straight from their browser.

import { DEFAULT_LAYOUT, DEFAULT_CATALOGUE, clampLayout, type AgvLayout, type AgvCatalogue, type ErpTarget, type FleetReport, type AgvState, type Sku } from './sim'

export interface ErpConfig {
  target: ErpTarget
  /** Base URL of the user's ERP or webhook. Empty: preview only. */
  endpoint: string
  /** Sent as the Authorization header, e.g. "Bearer …". Stays in this browser. */
  auth: string
  /** Actually send each confirmation (otherwise it is shown, not sent). */
  send: boolean
}

/**
 * Where real cart positions come from. The browser polls a URL (or listens on
 * a WebSocket) that returns JSON, and maps its fields onto the floor plan.
 */
export interface FleetFeedConfig {
  enabled: boolean
  kind: 'poll' | 'ws'
  url: string
  /** Seconds between polls. */
  everyS: number
  /** Dot path to the list of carts in the response ("" when the response is the list). */
  listPath: string
  fields: { id: string; x: string; y: string; heading: string; battery: string; state: string; mission: string }
  /** Feed coordinates → this building: x' = (x·scale − originX) rotated, y' likewise. */
  transform: { scale: number; originX: number; originY: number; rotationDeg: number; flipY: boolean }
}

export interface AgvTwinConfig {
  version: 1
  name: string
  layout: AgvLayout
  catalogue: AgvCatalogue
  erp: ErpConfig
  feed: FleetFeedConfig
}

export const DEFAULT_FEED: FleetFeedConfig = {
  enabled: false, kind: 'poll', url: '', everyS: 2, listPath: 'robots',
  fields: { id: 'id', x: 'pose.x', y: 'pose.y', heading: 'pose.theta', battery: 'battery', state: 'state', mission: 'mission' },
  transform: { scale: 1, originX: 0, originY: 0, rotationDeg: 0, flipY: false },
}

export const DEFAULT_AGV_CONFIG: AgvTwinConfig = {
  version: 1,
  name: 'My warehouse',
  layout: { ...DEFAULT_LAYOUT },
  catalogue: { ...DEFAULT_CATALOGUE, skus: DEFAULT_CATALOGUE.skus.map((s) => ({ ...s })) },
  erp: { target: 'webhook', endpoint: '', auth: '', send: false },
  feed: DEFAULT_FEED,
}

/** Make anything loaded from a file or a link safe to run. */
export function normaliseAgvConfig(raw: unknown): AgvTwinConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AgvTwinConfig>
  const D = DEFAULT_AGV_CONFIG
  const str = (v: unknown, d: string, max = 200) => (typeof v === 'string' ? v.slice(0, max) : d)
  const list = (v: unknown, d: string[]) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, 200) : d)
  const c = (r.catalogue ?? {}) as Partial<AgvCatalogue>
  const skus = Array.isArray(c.skus) ? c.skus.map(normaliseSku).filter((s): s is Sku => !!s).slice(0, 500) : D.catalogue.skus
  const e = (r.erp ?? {}) as Partial<ErpConfig>
  const f = (r.feed ?? {}) as Partial<FleetFeedConfig>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    version: 1,
    name: str(r.name, D.name, 80),
    layout: clampLayout(r.layout ?? D.layout),
    catalogue: {
      site: str(c.site, D.catalogue.site, 80),
      skus: skus.length ? skus : D.catalogue.skus,
      customers: list(c.customers, D.catalogue.customers),
      cities: list(c.cities, D.catalogue.cities),
      carriers: list(c.carriers, D.catalogue.carriers),
      priorityCarrier: typeof c.priorityCarrier === 'string' ? c.priorityCarrier : undefined,
      suppliers: list(c.suppliers, D.catalogue.suppliers),
    },
    erp: {
      target: e.target === 'odoo' || e.target === 'salesforce' ? e.target : 'webhook',
      endpoint: safeUrl(e.endpoint), auth: str(e.auth, '', 500), send: e.send === true,
    },
    feed: {
      enabled: f.enabled === true, kind: f.kind === 'ws' ? 'ws' : 'poll', url: safeUrl(f.url),
      everyS: Math.min(60, Math.max(0.5, num(f.everyS, 2))), listPath: str(f.listPath, D.feed.listPath, 80),
      fields: { ...D.feed.fields, ...Object.fromEntries(Object.entries(f.fields ?? {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 80)])) },
      transform: {
        scale: num(f.transform?.scale, 1) || 1, originX: num(f.transform?.originX, 0), originY: num(f.transform?.originY, 0),
        rotationDeg: num(f.transform?.rotationDeg, 0), flipY: f.transform?.flipY === true,
      },
    },
  }
}

function normaliseSku(v: unknown): Sku | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const code = String(o.code ?? '').trim().slice(0, 40)
  if (!code) return null
  const n = (x: unknown, d: number, lo: number, hi: number) => { const k = Number(x); return Number.isFinite(k) ? Math.min(hi, Math.max(lo, k)) : d }
  const color = typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : colourFor(code)
  return {
    code, name: String(o.name ?? code).trim().slice(0, 80) || code,
    cases: Math.round(n(o.cases, 60, 1, 400)), kgCase: n(o.kgCase, 8, 0.1, 100),
    color, wrap: o.wrap === 'film' ? 'film' : 'carton',
  }
}

/** A stable carton colour for a SKU that did not bring one. */
export function colourFor(code: string): string {
  let h = 0
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = h % 360
  return hslHex(hue, 0.35, 0.68)
}
function hslHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}

/** Only http(s) and ws(s) URLs; anything else becomes empty. */
export function safeUrl(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return ''
  try {
    const u = new URL(v.trim())
    return ['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) ? u.toString() : ''
  } catch { return '' }
}

// ── Fleet feed ───────────────────────────────────────────────────────────────

export function pathGet(o: unknown, path: string): unknown {
  if (!path) return o
  let cur: unknown = o
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

const STATES: AgvState[] = ['charging', 'idle', 'parking', 'toCharge', 'toSource', 'atSource', 'toDest', 'atDest']

/** Map a vendor's state words onto the twin's. Unknown words: driving. */
export function mapState(v: unknown): AgvState | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.toLowerCase()
  if ((STATES as string[]).includes(v)) return v as AgvState
  if (/charg/.test(s)) return 'charging'
  if (/idle|wait|ready|park/.test(s)) return 'idle'
  if (/load|pick|lift|fork/.test(s)) return 'atSource'
  if (/drop|unload|deliver/.test(s)) return 'atDest'
  return 'toDest'
}

/** One feed response → carts in this building's metres. */
export function parseFleet(json: unknown, feed: FleetFeedConfig): FleetReport[] {
  const list = pathGet(json, feed.listPath)
  if (!Array.isArray(list)) return []
  const { scale, originX, originY, rotationDeg, flipY } = feed.transform
  const rad = (rotationDeg * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad)
  const out: FleetReport[] = []
  for (const item of list.slice(0, 50)) {
    const id = String(pathGet(item, feed.fields.id) ?? '').slice(0, 40)
    const fx = Number(pathGet(item, feed.fields.x)), fy = Number(pathGet(item, feed.fields.y))
    if (!id || !Number.isFinite(fx) || !Number.isFinite(fy)) continue
    const px = fx * scale - originX, py = (flipY ? -fy : fy) * scale - originY
    const x = px * c - py * s, z = px * s + py * c
    const th = Number(pathGet(item, feed.fields.heading))
    const bat = Number(pathGet(item, feed.fields.battery))
    const mission = pathGet(item, feed.fields.mission)
    out.push({
      id, x, z,
      heading: Number.isFinite(th) ? (flipY ? -th : th) + rad : undefined,
      battery: Number.isFinite(bat) ? (bat <= 1 ? bat * 100 : bat) : undefined,
      state: mapState(pathGet(item, feed.fields.state)),
      mission: typeof mission === 'string' ? mission.slice(0, 80) : mission != null ? JSON.stringify(mission).slice(0, 80) : undefined,
    })
  }
  return out
}

/**
 * Start a feed. Calls back with each batch, and with a short status line.
 * Returns a stop function. Errors (CORS, offline) are reported, never thrown.
 */
export function startFleetFeed(feed: FleetFeedConfig, onReports: (r: FleetReport[]) => void, onStatus: (s: { ok: boolean; text: string }) => void): () => void {
  if (!feed.enabled || !feed.url) return () => {}
  let stopped = false
  if (feed.kind === 'ws') {
    let ws: WebSocket | null = null
    try { ws = new WebSocket(feed.url) } catch (e) { onStatus({ ok: false, text: `Cannot open the WebSocket: ${(e as Error).message}` }); return () => {} }
    ws.onopen = () => onStatus({ ok: true, text: 'Connected' })
    ws.onerror = () => onStatus({ ok: false, text: 'WebSocket error (is the address reachable from this browser?)' })
    ws.onclose = () => { if (!stopped) onStatus({ ok: false, text: 'Disconnected' }) }
    ws.onmessage = (ev) => {
      try { const r = parseFleet(JSON.parse(String(ev.data)), feed); onReports(r); onStatus({ ok: true, text: `${r.length} carts · ${new Date().toLocaleTimeString()}` }) }
      catch { onStatus({ ok: false, text: 'A message was not valid JSON' }) }
    }
    return () => { stopped = true; ws?.close() }
  }
  let timer = 0
  const poll = async () => {
    try {
      const res = await fetch(feed.url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const r = parseFleet(await res.json(), feed)
      if (!stopped) { onReports(r); onStatus({ ok: true, text: `${r.length} carts · ${new Date().toLocaleTimeString()}` }) }
    } catch (e) {
      if (!stopped) onStatus({ ok: false, text: `${(e as Error).message || 'Failed'} · if it is a CORS error, the feed must allow this site's origin` })
    }
    if (!stopped) timer = window.setTimeout(poll, feed.everyS * 1000)
  }
  void poll()
  return () => { stopped = true; window.clearTimeout(timer) }
}

// ── SKUs from a spreadsheet ──────────────────────────────────────────────────

/** "code,name,cases,kg_per_case[,color][,wrap]" with or without a header row. */
export function skusFromCsv(rows: string[][]): Sku[] {
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const hasHead = head.some((h) => /code|sku|name|cases|kg/.test(h))
  const col = (re: RegExp, d: number) => { const i = hasHead ? head.findIndex((h) => re.test(h)) : -1; return i >= 0 ? i : d }
  const ci = col(/code|sku|ref/, 0), ni = col(/name|desc/, 1), ki = col(/cases|qty|units/, 2), wi = col(/kg|weight/, 3), coi = col(/colou?r/, 4), wri = col(/wrap|pack/, 5)
  return (hasHead ? rows.slice(1) : rows)
    .map((r) => normaliseSku({ code: r[ci], name: r[ni], cases: r[ki], kgCase: r[wi], color: r[coi], wrap: r[wri] }))
    .filter((s): s is Sku => !!s)
}
