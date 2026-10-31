// ─── Tracking globe: configuration and shipment data ─────────────────────────
// Everything that reaches the widget (an attribute, a link fragment, a feed the
// host points at) is untrusted, so it all passes through here: colours and URLs
// are validated, and text is only ever written with textContent.

export type Mode = 'sea' | 'air' | 'rail' | 'road'
export type Status = 'pending' | 'transit' | 'delayed' | 'delivered'
export type Place = string | { name?: string; lat: number; lng: number }

export interface Shipment {
  id: string
  label?: string
  from: Place
  to: Place
  mode: Mode
  status?: Status
  progress?: number
  etd?: string
  eta?: string
  position?: [number, number]
  note?: string
  events?: { at?: string; label: string; place?: string }[]
}

export interface Theme {
  preset: 'dark' | 'light' | 'auto'
  accent?: string; background?: string; ocean?: string; land?: string; text?: string; panel?: string
  landStyle: 'solid' | 'dots'
  radius: number
  font?: string
}

export interface Controls {
  drag: boolean; zoom: boolean; viewSwitch: boolean; list: boolean
  search: boolean; legend: boolean; fullscreen: boolean
}

export interface TrackerConfig {
  title?: string
  logo?: string
  lang?: string
  view: 'globe' | 'map'
  height: number
  autoRotate: boolean
  simulate: boolean
  speed: number
  shipments: Shipment[]
  feed?: string
  feedInterval: number
  lookup?: string
  theme: Theme
  controls: Controls
  lazy: 'visible' | 'click'
}

export const PALETTES = {
  dark: { bg: '#0b0f17', ocean: '#10182a', land: '#5b6a86', text: '#e8ebf1', panel: '#121824' },
  light: { bg: '#f5f6f8', ocean: '#dfe5ee', land: '#98a4b6', text: '#1a2130', panel: '#ffffff' },
}

export const DEFAULTS: TrackerConfig = {
  view: 'globe', height: 560, autoRotate: true, simulate: false, speed: 1, shipments: [], feedInterval: 60, lazy: 'visible',
  theme: { preset: 'dark', landStyle: 'dots', radius: 12 },
  controls: { drag: true, zoom: true, viewSwitch: true, list: true, search: true, legend: true, fullscreen: true },
}

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const str = (v: unknown, max = 200) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : undefined

/** Only literal colours: anything else could smuggle CSS into the shadow root. */
export function safeColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return /^#[0-9a-f]{3,8}$/i.test(s) || /^rgba?\([\d\s.,%/]+\)$/i.test(s) || s === 'transparent' ? s : undefined
}
export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  try {
    const u = new URL(v, typeof location === 'undefined' ? 'https://x.invalid' : location.href)
    return u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) ? v : undefined
  } catch { return undefined }
}
const safeFont = (v: unknown) => typeof v === 'string' && /^[\w\s,'"-]{1,120}$/.test(v) ? v : undefined

function place(v: unknown): Place | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80)
  if (Array.isArray(v) && v.length === 2) return place({ lat: v[0], lng: v[1] })
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const lat = Number(o.lat ?? o.latitude), lng = Number(o.lng ?? o.lon ?? o.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { name: str(o.name, 80), lat, lng }
    if (str(o.name)) return str(o.name, 80)
  }
  return undefined
}

const STATUS: Record<string, Status> = {
  pending: 'pending', booked: 'pending', planned: 'pending', transit: 'transit', in_transit: 'transit', 'in transit': 'transit', intransit: 'transit', shipped: 'transit',
  delayed: 'delayed', late: 'delayed', exception: 'delayed', delivered: 'delivered', arrived: 'delivered', completed: 'delivered',
}
const MODE: Record<string, Mode> = { sea: 'sea', ocean: 'sea', ship: 'sea', vessel: 'sea', fcl: 'sea', lcl: 'sea', air: 'air', plane: 'air', flight: 'air', rail: 'rail', train: 'rail', road: 'road', truck: 'road', lorry: 'road' }

/** Accepts the field names carriers and spreadsheets actually use. */
export function normalizeShipment(raw: unknown, i = 0): Shipment | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const from = place(o.from ?? o.origin), to = place(o.to ?? o.destination ?? o.dest)
  if (!from || !to) return null
  const hasPos = (o.position != null && o.position !== '') || (o.lat != null && o.lat !== '') || (o.latitude != null && o.latitude !== '')
  const pos = Array.isArray(o.position) ? [Number(o.position[0]), Number(o.position[1])] : [Number(o.lat ?? o.latitude), Number(o.lng ?? o.lon ?? o.longitude)]
  const p = o.progress == null || o.progress === '' ? undefined : Number(o.progress)
  return {
    id: str(o.id ?? o.tracking ?? o.tracking_number ?? o.trackingNumber ?? o.reference, 60) ?? `#${i + 1}`,
    label: str(o.label ?? o.name ?? o.goods ?? o.description, 80),
    from, to,
    mode: MODE[String(o.mode ?? o.transport ?? 'sea').toLowerCase()] ?? 'sea',
    status: STATUS[String(o.status ?? '').toLowerCase()],
    progress: p !== undefined && Number.isFinite(p) ? Math.min(1, Math.max(0, p > 1 ? p / 100 : p)) : undefined,
    etd: str(o.etd ?? o.departure, 30), eta: str(o.eta ?? o.arrival, 30),
    position: hasPos && Number.isFinite(pos[0]) && Number.isFinite(pos[1]) && Math.abs(pos[0]) <= 90 && Math.abs(pos[1]) <= 180 ? [pos[0], pos[1]] : undefined,
    note: str(o.note, 160),
    events: Array.isArray(o.events) ? o.events.slice(0, 30).flatMap(e => { const x = (e ?? {}) as Record<string, unknown>, label = str(x.label ?? x.status ?? x.description, 120); return label ? [{ at: str(x.at ?? x.date ?? x.time, 30), label, place: str(x.place ?? x.location, 80) }] : [] }) : undefined,
  }
}
export function normalizeShipments(raw: unknown): Shipment[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? (raw as { shipments?: unknown }).shipments : null
  if (!Array.isArray(list)) return []
  return list.slice(0, 200).map((s, i) => normalizeShipment(s, i)).filter((s): s is Shipment => !!s)
}

export function normalizeConfig(raw: unknown): TrackerConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const t = (o.theme && typeof o.theme === 'object' ? o.theme : {}) as Record<string, unknown>
  const c = (o.controls && typeof o.controls === 'object' ? o.controls : {}) as Record<string, unknown>
  const flag = (v: unknown, d: boolean) => typeof v === 'boolean' ? v : d
  const D = DEFAULTS, DC = D.controls
  return {
    title: str(o.title, 80), logo: safeUrl(o.logo), lang: str(o.lang, 5),
    view: o.view === 'map' ? 'map' : 'globe',
    height: num(o.height, 240, 1200, D.height),
    autoRotate: flag(o.autoRotate, D.autoRotate),
    simulate: flag(o.simulate, D.simulate),
    speed: num(o.speed, .1, 10, D.speed),
    shipments: normalizeShipments(o.shipments),
    feed: safeUrl(o.feed),
    // Never hammer the host's own endpoint from every visitor's browser.
    feedInterval: num(o.feedInterval, 30, 3600, D.feedInterval),
    lookup: safeUrl(o.lookup),
    lazy: o.lazy === 'click' ? 'click' : 'visible',
    theme: {
      preset: t.preset === 'light' || t.preset === 'auto' ? t.preset : 'dark',
      accent: safeColor(t.accent), background: safeColor(t.background), ocean: safeColor(t.ocean), land: safeColor(t.land), text: safeColor(t.text), panel: safeColor(t.panel),
      landStyle: t.landStyle === 'solid' ? 'solid' : 'dots',
      radius: num(t.radius, 0, 32, D.theme.radius),
      font: safeFont(t.font),
    },
    controls: {
      drag: flag(c.drag, DC.drag), zoom: flag(c.zoom, DC.zoom), viewSwitch: flag(c.viewSwitch, DC.viewSwitch), list: flag(c.list, DC.list),
      search: flag(c.search, DC.search), legend: flag(c.legend, DC.legend), fullscreen: flag(c.fullscreen, DC.fullscreen),
    },
  }
}

/** Only what differs from the defaults, so embeds stay short. */
export function compactConfig(c: TrackerConfig): Record<string, unknown> {
  const strip = (v: unknown, d: unknown): unknown => {
    if (Array.isArray(v)) return v.length ? v : undefined
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v)) { const s = strip(x, (d as Record<string, unknown> | undefined)?.[k]); if (s !== undefined) out[k] = s }
      return Object.keys(out).length ? out : undefined
    }
    return v === d || v === undefined ? undefined : v
  }
  return (strip(c, DEFAULTS) ?? {}) as Record<string, unknown>
}

export function encodeConfig(c: TrackerConfig): string {
  return encodeRaw(compactConfig(c))
}
export function encodeRaw(v: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(v))
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function decodeRaw(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {}
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))))
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}
export function decodeConfig(s: string | null | undefined): TrackerConfig { return normalizeConfig(decodeRaw(s)) }

/** Where a shipment is along its way, 0–1, and in what state. */
export function resolveState(s: Shipment, now: number): { progress: number; status: Status } {
  const etd = s.etd ? Date.parse(s.etd) : NaN, eta = s.eta ? Date.parse(s.eta) : NaN
  let progress = s.progress
  if (progress === undefined) progress = Number.isFinite(etd) && Number.isFinite(eta) && eta > etd ? Math.min(1, Math.max(0, (now - etd) / (eta - etd))) : s.status === 'delivered' ? 1 : 0
  let status = s.status
  // Past its ETA with nothing saying it arrived: that is late, not delivered.
  if (!status) status = progress >= 1 ? (s.progress === undefined ? 'delayed' : 'delivered') : progress <= 0 ? 'pending' : 'transit'
  if (status === 'delivered') progress = 1
  return { progress, status }
}

/** Reads a pasted spreadsheet: comma, semicolon or tab, quoted fields, a header row. */
export function parseCsv(text: string): Shipment[] {
  const clean = text.replace(/^﻿/, '').trim()
  if (!clean) return []
  const first = clean.split(/\r?\n/, 1)[0]
  const sep = [',', ';', '\t'].map(c => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (q) { if (ch === '"') { if (clean[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch }
    else if (ch === '"') q = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  row.push(cell); rows.push(row)
  const head = rows.shift()!.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return normalizeShipments(rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]?.trim() ?? '']))))
}
