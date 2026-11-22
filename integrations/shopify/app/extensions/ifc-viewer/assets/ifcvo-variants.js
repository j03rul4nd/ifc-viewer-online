// "IFC variant views" block: each variant can bring its own camera
// (`custom.ifc_view`) and its own highlighted elements (`custom.ifc_highlight`).
// Liquid renders the map variant id -> { view, highlight } in a data attribute;
// this applies it when the model is ready and on every variant change. It also
// offers "Copy link to this view" (camera in the URL hash, restored on load)
// and "Save image" (the SDK's screenshot, downloaded as a PNG). No server.
import { resolveVariant, watchVariants, _resetVariants } from './ifcvo-variant.js'

const PRESETS = ['iso', 'top', 'bottom', 'front', 'back', 'left', 'right']
const HASH_KEY = 'ifcvo-cam'

function obj(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t.startsWith('{') || t.startsWith('[') || t.startsWith('"')) { try { return obj(JSON.parse(t)) } catch (e) { return null } }
    return t
  }
  return raw
}

function vec3(v) {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)))) return v.map(Number)
  if (v && typeof v === 'object' && ['x', 'y', 'z'].every((k) => Number.isFinite(Number(v[k])))) return [Number(v.x), Number(v.y), Number(v.z)]
  return null
}

/**
 * A variant's `ifc_view` as one of:
 * { kind: 'preset', view } — 'iso' | 'top' | …, from "top" or { view: 'top' };
 * { kind: 'camera', position, target } — from { position, target } ([x,y,z] or {x,y,z});
 * { kind: 'scene', url } — from { scene: 'https://…' }. Anything else: null.
 */
export function parseView(raw) {
  const v = obj(raw)
  if (!v) return null
  if (typeof v === 'string') return PRESETS.includes(v.toLowerCase()) ? { kind: 'preset', view: v.toLowerCase() } : null
  if (typeof v !== 'object') return null
  const position = vec3(v.position)
  const target = vec3(v.target)
  if (position && target) return { kind: 'camera', position, target }
  const name = typeof v.view === 'string' ? v.view.toLowerCase() : ''
  if (PRESETS.includes(name)) return { kind: 'preset', view: name }
  if (typeof v.scene === 'string' && /^https:\/\//i.test(v.scene)) return { kind: 'scene', url: v.scene }
  return null
}

function list(v) {
  if (v == null) return []
  const arr = Array.isArray(v) ? v : String(v).split(/[\s,;]+/)
  return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 500)
}

/**
 * A variant's `ifc_highlight`: "IfcBeam", "IfcBeam,IfcColumn", ["3x…GUID"], or
 * { classes, guids, mode: 'isolate' | 'select' }. Words starting with "Ifc" are classes, the rest GlobalIds.
 */
export function parseHighlight(raw) {
  const v = obj(raw)
  if (!v) return null
  let classes = []
  let guids = []
  let mode = 'isolate'
  if (typeof v === 'string' || Array.isArray(v)) {
    for (const x of list(v)) (/^ifc[a-z]/i.test(x) ? classes : guids).push(x)
  } else if (typeof v === 'object') {
    classes = list(v.classes || v.class || v.ifcClass)
    guids = list(v.guids || v.guid || v.globalId)
    if (v.mode === 'select') mode = 'select'
  }
  classes = classes.filter((c) => /^ifc[a-z0-9]+$/i.test(c))
  guids = guids.filter((g) => /^[0-9A-Za-z_$]{22}$/.test(g))
  if (!classes.length && !guids.length) return null
  return { classes, guids, mode }
}

/** The block's map: variant id -> { view, highlight }, already parsed. Unreadable entries are dropped. */
export function readMap(text) {
  let data
  try { data = JSON.parse(text || '{}') } catch (e) { return {} }
  const out = {}
  if (!data || typeof data !== 'object') return out
  for (const [id, entry] of Object.entries(data)) {
    if (!/^\d+$/.test(id) || !entry || typeof entry !== 'object') continue
    const view = parseView(entry.view)
    const highlight = parseHighlight(entry.highlight)
    if (view || highlight) out[id] = { view, highlight }
  }
  return out
}

const r3 = (n) => Math.round(n * 1000) / 1000

/** `ifcvo-cam=px,py,pz,tx,ty,tz` for a camera { position, target }, or ''. */
export function encodeCamera(cam) {
  const p = cam && vec3(cam.position)
  const t = cam && vec3(cam.target)
  if (!p || !t) return ''
  return HASH_KEY + '=' + [...p, ...t].map(r3).join(',')
}

/** The camera in a URL hash (as written by encodeCamera), or null. */
export function decodeCamera(hash) {
  const m = new RegExp('(?:^#?|&)' + HASH_KEY + '=([^&]+)').exec(String(hash || ''))
  if (!m) return null
  const n = decodeURIComponent(m[1]).split(',').map(Number)
  if (n.length !== 6 || !n.every(Number.isFinite)) return null
  return { position: n.slice(0, 3), target: n.slice(3) }
}

/** This page's URL with the camera in the hash (other hash parts kept). */
export function viewLink(href, cam) {
  const enc = encodeCamera(cam)
  if (!enc) return null
  const [base, hash = ''] = String(href).split('#')
  const rest = hash.split('&').filter((p) => p && !p.startsWith(HASH_KEY + '='))
  return base + '#' + [...rest, enc].join('&')
}

/** Moves the camera of `viewer` to `view`. */
export async function applyView(viewer, view) {
  if (!viewer || !view) return false
  if (view.kind === 'preset') viewer.setView(view.view)
  else if (view.kind === 'camera') await viewer.lookAt(view.position, view.target, true)
  else if (view.kind === 'scene') await viewer.openScene(view.url)
  else return false
  return true
}

/** Shows only the highlighted elements (or selects the first GlobalId); null shows everything again. */
export async function applyHighlight(viewer, h) {
  if (!viewer) return false
  viewer.showAll()
  if (!h) return false
  if (h.mode === 'select' && h.guids.length) { viewer.select(h.guids[0]); return true }
  if (!h.guids.length && h.classes.length === 1) { viewer.isolate(h.classes[0], { frame: false }); return true }
  const keep = await viewer.findElements({ ...(h.classes.length ? { ifcClass: h.classes } : {}), ...(h.guids.length ? { globalId: h.guids } : {}) })
  if (!keep.length) return false
  const kept = new Set(keep.map((e) => e.modelId + ':' + e.expressId))
  const hide = new Map()
  for (const e of await viewer.findElements({})) {
    if (kept.has(e.modelId + ':' + e.expressId)) continue
    if (!hide.has(e.modelId)) hide.set(e.modelId, [])
    hide.get(e.modelId).push(e.expressId)
  }
  for (const [modelId, ids] of hide) viewer.hideElements(ids, modelId)
  return true
}

/** Saves a data: URL as a file. */
function download(dataUrl, name) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch (e) { return false }
}

const mounted = new Set()
let unwatch = null


function api() { return typeof window !== 'undefined' ? window.IFCVO : null }

function say(root, key) {
  const status = root.querySelector('[data-ifcvo-variants-status]')
  if (status) status.textContent = root.dataset[key] || ''
}

/** The variant to show for `root`: event hint, form, URL, then the one Liquid rendered as current. */
function current(root, hint) {
  const map = root._ifcvoMap
  return resolveVariant((id) => id in map, hint) || (root.dataset.current in map ? root.dataset.current : null)
}

/** Applies the current variant's view and highlight once the viewer is ready. `force` reapplies after a new model. */
export async function update(root, hint = null, force = false) {
  const id = current(root, hint)
  const key = id || ''
  if (!force && root._ifcvoApplied === key) return false
  const v = api() && api().viewer
  if (!v) return false
  root._ifcvoApplied = key
  const entry = id ? root._ifcvoMap[id] : null
  await v.whenReady()
  await applyHighlight(v, entry && entry.highlight)
  if (entry && entry.view) await applyView(v, entry.view)
  return true
}

/** A shared link wins over the variant view, once, on the first model. */
async function onModel(root, first) {
  const cam = first && typeof location !== 'undefined' ? decodeCamera(location.hash) : null
  await update(root, null, true)
  if (cam) { const v = api().viewer; await v.lookAt(cam.position, cam.target, false) }
}

function mount(root) {
  root._ifcvoMap = readMap(root.dataset.views)
  let first = true
  api().subscribe(root, (type) => {
    if (type !== 'model-loaded') return
    onModel(root, first).catch(() => {})
    first = false
  })
  // The viewer may already have its model (this script loaded late).
  if (api().viewer) { onModel(root, first).catch(() => {}); first = false }
  const copy = root.querySelector('[data-ifcvo-copy-view]')
  copy?.addEventListener('click', async () => {
    const v = api().viewer || await api().open()
    if (!v) return
    await v.whenReady()
    const link = viewLink(location.href, await v.getCamera())
    if (!link) { say(root, 'lError'); return }
    const field = root.querySelector('[data-ifcvo-view-link]')
    if (await copyText(link)) { if (field) field.hidden = true; say(root, 'lCopied') }
    else if (field) { field.value = link; field.hidden = false; field.select(); say(root, 'lCopyManual') }
  })
  const shot = root.querySelector('[data-ifcvo-save-image]')
  shot?.addEventListener('click', async () => {
    const v = api().viewer || await api().open()
    if (!v) return
    try {
      await v.whenReady()
      const url = await v.screenshot()
      if (!/^data:image\//.test(String(url))) throw new Error('screenshot')
      download(url, (root.dataset.filename || 'model') + '.png')
      say(root, 'lSaved')
    } catch (e) { say(root, 'lError') }
  })
}

export function init(doc = document) {
  const a = api()
  if (!a) return
  for (const root of doc.querySelectorAll('[data-ifcvo-variants]')) {
    if (root.dataset.ifcvoVariantsReady) continue
    root.dataset.ifcvoVariantsReady = '1'
    if (typeof a.gate === 'function' && !a.gate('variantviews', root.querySelector('[data-ifcvo-variants-body]'))) continue
    mounted.add(root)
    mount(root)
  }
  if (mounted.size && !unwatch) {
    unwatch = watchVariants((hint) => { for (const r of mounted) if (r.isConnected) update(r, hint).catch(() => {}) }, doc)
  }
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

/** For tests. */
export function _reset() {
  mounted.clear()
  if (unwatch) { unwatch(); unwatch = null }
  _resetVariants()
}

if (typeof document !== 'undefined') {
  document.addEventListener('ifcvo:ready', () => init())
  document.addEventListener('shopify:section:load', () => init())
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
