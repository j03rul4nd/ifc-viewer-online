// ─── pc-prefs ─────────────────────────────────────────────────────────────────
// Per-file scan preferences, device-local: the name a user gave a scan, its
// identity colour and its own style overrides, keyed by pc-align's fileKey
// ('url:<src>' or 'name:size:mtime') so they come back when the same file is
// reloaded. localStorage 'ifc-pc-items:v1' = { v: 1, items: { [fileKey]: … } }.
//
// Styles are NOT hydrated when the app runs framed: a device-local override
// must never defeat a host's setPointCloudDisplay inside an embed.
//
// Imported by the eager pointCloudStore, so no three/proj4 here.

import { isEmbedded } from '../url-params'
import type { CloudStyleOverride, PointColorMode } from './pc-types'

export const LS_ITEMS = 'ifc-pc-items:v1'
export const MAX_ITEMS = 300
const FLUSH_MS = 250
const MAX_NAME = 80
const MODES: PointColorMode[] = ['rgb', 'intensity', 'elevation', 'classification', 'flat', 'scan', 'topic']

export interface CloudPrefs {
  name?: string
  color?: number
  style?: CloudStyleOverride
  usedAt: number
}

export type CloudPrefsPatch = Partial<{ name: string | null; color: number | null; style: CloudStyleOverride | null }>

let cache: Record<string, CloudPrefs> | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let pagehideHooked = false

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function parseStyle(raw: unknown): CloudStyleOverride | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const out: CloudStyleOverride = {}
  if (MODES.includes(o.colorMode as PointColorMode)) out.colorMode = o.colorMode as PointColorMode
  if (isInt(o.flatColor)) out.flatColor = clamp(o.flatColor, 0, 0xFFFFFF)
  if (typeof o.pointSize === 'number' && Number.isFinite(o.pointSize)) out.pointSize = clamp(o.pointSize, 0.5, 20)
  if (typeof o.opacity === 'number' && Number.isFinite(o.opacity)) out.opacity = clamp(o.opacity, 0.05, 1)
  return Object.keys(out).length ? out : undefined
}

/** Field by field: a corrupt entry loses only what does not parse. */
export function parseCloudPrefs(raw: string | null): Record<string, CloudPrefs> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; items?: unknown }
    if (!parsed || parsed.v !== 1 || !parsed.items || typeof parsed.items !== 'object') return {}
    const out: Record<string, CloudPrefs> = {}
    for (const [key, value] of Object.entries(parsed.items as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const o = value as Record<string, unknown>
      const item: CloudPrefs = { usedAt: typeof o.usedAt === 'number' && Number.isFinite(o.usedAt) ? o.usedAt : 0 }
      if (typeof o.name === 'string' && o.name.trim()) item.name = o.name.trim().slice(0, MAX_NAME)
      if (isInt(o.color) && o.color >= 0 && o.color <= 0xFFFFFF) item.color = o.color
      const style = parseStyle(o.style)
      if (style) item.style = style
      if (item.name !== undefined || item.color !== undefined || item.style !== undefined) out[key] = item
    }
    return out
  } catch {
    return {}
  }
}

function load(): Record<string, CloudPrefs> {
  if (cache) return cache
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_ITEMS) } catch { /* private mode */ }
  cache = parseCloudPrefs(raw)
  return cache
}

/** Write the in-memory state now. */
export function flushCloudPrefs(): void {
  if (timer) { clearTimeout(timer); timer = null }
  if (!cache) return
  const keys = Object.keys(cache)
  if (keys.length > MAX_ITEMS) {
    keys.sort((a, b) => cache![a].usedAt - cache![b].usedAt)
    for (const k of keys.slice(0, keys.length - MAX_ITEMS)) delete cache[k]
  }
  try {
    if (Object.keys(cache).length === 0) localStorage.removeItem(LS_ITEMS)
    else localStorage.setItem(LS_ITEMS, JSON.stringify({ v: 1, items: cache }))
  } catch { /* quota / private mode: a lost name must never break loading */ }
}

function schedule(): void {
  if (!pagehideHooked && typeof window !== 'undefined') {
    pagehideHooked = true
    try { window.addEventListener('pagehide', flushCloudPrefs) } catch { /* no window */ }
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(flushCloudPrefs, FLUSH_MS)
}

/** A file's prefs; bumps usedAt. `style` is omitted when the app is framed. */
export function readCloudPrefs(fileKey: string, opts: { framed?: boolean } = {}): Omit<CloudPrefs, 'usedAt'> {
  const item = load()[fileKey]
  if (!item) return {}
  item.usedAt = Date.now()
  schedule()
  const framed = opts.framed ?? isEmbedded()
  const { name, color, style } = item
  return framed ? { name, color } : { name, color, style }
}

/** Merge a patch (null clears a field; null patch drops the entry). */
export function writeCloudPrefs(fileKey: string, patch: CloudPrefsPatch | null): void {
  const items = load()
  if (patch === null) {
    delete items[fileKey]
  } else {
    const next: CloudPrefs = { ...(items[fileKey] ?? {}), usedAt: Date.now() }
    if ('name' in patch) { if (patch.name) next.name = patch.name.slice(0, MAX_NAME); else delete next.name }
    if ('color' in patch) { if (isInt(patch.color)) next.color = patch.color; else delete next.color }
    if ('style' in patch) { const s = parseStyle(patch.style); if (s) next.style = s; else delete next.style }
    if (next.name === undefined && next.color === undefined && next.style === undefined) delete items[fileKey]
    else items[fileKey] = next
  }
  schedule()
}

export function __resetCloudPrefsForTests(): void {
  if (timer) clearTimeout(timer)
  timer = null
  cache = null
}
