// "Share this view" for the product viewer (Free), and the after-sale links.
// The viewer gets a button that puts the current camera, the selected element
// and the active storey in the URL hash (`#ifcvo-cam=…&ifcvo-sel=…&ifcvo-lvl=…`,
// the same camera format as ifcvo-variants.js) and shares it with the Web Share
// API, or copies it. Opening such a link opens the viewer and restores the view.
// `#ifcvo-open=1&ifcvo-v=<version>` (order status, thank-you and account pages)
// opens the viewer at once, scrolls to it and, when the model changed since that
// version, says so. No Liquid and no server: everything is built here. Any hash
// part that does not parse is ignored.
// `ifcvo-view=<id>` (assembly steps, T-326 F8) opens the viewer at a saved view:
// an id of the product's `ifcvo.views` metafield, a preset (iso, top, …) or six
// numbers. `#ifc-review` (review request emails, T-326 F10, Starter) opens the
// viewer at its hero view: `ifcvo.views.hero`, else the block's starting view.
import { pickLang } from './ifcvo-i18n.js'

const MAX_HASH = 2048
const MAX_LINK = 2000
const CAM = 'ifcvo-cam'
const here = import.meta.url
const OWN = /^ifcvo-(cam|sel|lvl|open|v|view)=|^ifc-review$/
const PRESETS = ['iso', 'top', 'bottom', 'front', 'back', 'left', 'right']
const VIEW_ID = /^[A-Za-z0-9_.:,-]{1,100}$/

const LABELS = {
  share: 'Share this view',
  shared: 'Link to this view shared.',
  copied: 'Link copied. It opens the model at this view.',
  manual: 'Copy this link:',
  error: 'This view could not be read.',
  updated: 'Updated since your purchase',
}

function camera6(raw) {
  const n = String(raw).split(',')
  if (n.length !== 6 || !n.every((x) => x.trim() !== '' && Number.isFinite(Number(x)) && Math.abs(Number(x)) < 1e9)) return null
  const m = n.map(Number)
  return { position: m.slice(0, 3), target: m.slice(3) }
}

const r3 = (n) => Math.round(n * 1000) / 1000

function vec3(v) {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)))) return v.map(Number)
  if (v && typeof v === 'object' && ['x', 'y', 'z'].every((k) => Number.isFinite(Number(v[k])))) return [Number(v.x), Number(v.y), Number(v.z)]
  return null
}

function decode(s) {
  try { return decodeURIComponent(s) } catch (e) { return null }
}

/**
 * The view state in a URL hash, each part null when missing or malformed:
 * { open, version, camera: { position, target }, selection: { modelId, expressId }, level, view, review }.
 */
export function parseHash(hash) {
  const out = { open: false, version: null, camera: null, selection: null, level: null, view: null, review: false }
  const h = String(hash == null ? '' : hash)
  if (!h || h.length > MAX_HASH) return out
  for (const part of h.replace(/^#/, '').split('&')) {
    if (part === 'ifc-review') { out.review = true; continue }
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const key = part.slice(0, eq)
    const raw = decode(part.slice(eq + 1))
    if (raw == null) continue
    if (key === 'ifcvo-open') out.open = raw === '1'
    else if (key === 'ifcvo-v') {
      const v = raw.trim()
      if (v && v.length <= 64 && !/[\u0000-\u001f<>]/.test(v)) out.version = v
    } else if (key === CAM) {
      out.camera = camera6(raw)
    } else if (key === 'ifcvo-view') {
      if (VIEW_ID.test(raw)) out.view = raw
    } else if (key === 'ifcvo-sel') {
      const m = /^([A-Za-z0-9_.:-]{1,64})~(\d{1,10})$/.exec(raw)
      if (m && Number(m[2]) > 0 && Number(m[2]) < 2 ** 31) out.selection = { modelId: m[1], expressId: Number(m[2]) }
    } else if (key === 'ifcvo-lvl') {
      if (/^\d{1,3}$/.test(raw)) out.level = Number(raw)
    }
  }
  return out
}

/** True when the hash asks for the viewer: an after-sale link or a shared view. */
export function wantsViewer(state) {
  return !!(state && (state.open || state.review || state.view || state.camera || state.selection || state.level != null))
}

/** The hash parts for a view (camera required), in a fixed order. */
export function encodeView({ camera, selection, level } = {}) {
  const p = camera && vec3(camera.position)
  const t = camera && vec3(camera.target)
  if (!p || !t) return ''
  const parts = [CAM + '=' + [...p, ...t].map(r3).join(',')]
  if (selection && /^[A-Za-z0-9_.:-]{1,64}$/.test(String(selection.modelId)) && Number.isInteger(selection.expressId) && selection.expressId > 0) {
    parts.push('ifcvo-sel=' + selection.modelId + '~' + selection.expressId)
  }
  if (Number.isInteger(level) && level >= 0 && level < 1000) parts.push('ifcvo-lvl=' + level)
  return parts.join('&')
}

/**
 * The link to share: this page with `utm_source=ifc_share` and the view in the
 * hash. Other hash parts stay; the after-sale ones (open, version) do not. Null
 * when the view is unreadable or the link would pass 2 000 characters.
 */
export function shareLink(href, view) {
  const enc = encodeView(view)
  if (!enc) return null
  let url
  try { url = new URL(String(href)) } catch (e) { return null }
  url.searchParams.set('utm_source', 'ifc_share')
  const rest = url.hash.replace(/^#/, '').split('&').filter((p) => p && !OWN.test(p))
  url.hash = ''
  const link = url.toString() + '#' + [...rest, enc].join('&')
  return link.length <= MAX_LINK ? link : null
}

/** True when the buyer's version differs from the model's current one (both known). */
export function isUpdated(bought, current) {
  const a = String(bought || '').trim()
  const b = String(current || '').trim()
  return !!(a && b && a !== b)
}

/**
 * A saved view id → { preset } or { camera }, or null. Looks in `views` (the
 * `ifcvo.views` metafield: `{ "<id>": "top" | { position, target } | "x,y,z,tx,ty,tz" }`),
 * then takes the id itself as a preset or six numbers.
 */
export function resolveView(id, views) {
  if (id == null || id === '') return null
  const map = views && typeof views === 'object' && !Array.isArray(views) ? views : {}
  const own = Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined
  const from = (v) => {
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase()
      if (PRESETS.includes(t)) return { preset: t }
      const c = camera6(v)
      return c ? { camera: c } : null
    }
    if (v && typeof v === 'object') {
      const p = vec3(v.position)
      const t = vec3(v.target)
      if (p && t) return { camera: { position: p, target: t } }
      if (typeof v.view === 'string') return from(v.view)
    }
    return null
  }
  return own !== undefined ? from(own) : from(String(id))
}

/** The `ifcvo.views` metafield the viewer block printed (data-ifcvo-views), or {}. */
export function viewsOf(root) {
  try {
    const v = JSON.parse((root && root.dataset && root.dataset.ifcvoViews) || 'null')
    return typeof v === 'string' ? JSON.parse(v) : v || {}
  } catch (e) { return {} }
}

/**
 * Restores a parsed view on `viewer`: saved view (or the hero view for a review
 * link), then storey, selection and camera. Each step may fail alone.
 */
export async function applyState(viewer, state, views = {}) {
  if (!viewer || !state) return false
  let done = false
  const saved = resolveView(state.view, views) || (state.review ? resolveView('hero', views) : null)
  if (saved && saved.preset && typeof viewer.setView === 'function') {
    try { await viewer.setView(saved.preset); done = true } catch (e) { /* refused */ }
  } else if (saved && saved.camera && !state.camera && typeof viewer.lookAt === 'function') {
    try { await viewer.lookAt(saved.camera.position, saved.camera.target, false); done = true } catch (e) { /* refused */ }
  }
  if (state.level != null && typeof viewer.addSection === 'function') {
    try { await viewer.addSection({ level: state.level }); done = true; announceLevel(state.level) } catch (e) { /* no such storey */ }
  }
  if (state.selection && typeof viewer.select === 'function') {
    try { await viewer.select(state.selection.expressId, state.selection.modelId); done = true } catch (e) { /* not in this model */ }
  }
  if (state.camera && typeof viewer.lookAt === 'function') {
    try { await viewer.lookAt(state.camera.position, state.camera.target, false); done = true } catch (e) { /* camera refused */ }
  }
  return done
}

function announceLevel(index) {
  try { document.dispatchEvent(new CustomEvent('ifcvo:storey', { detail: { index, restored: true } })) } catch (e) { /* old browser */ }
}

// ── Page wiring ──────────────────────────────────────────────────────────────

let texts = null
async function labels(root) {
  if (!texts) {
    // English is built in: no request for it.
    const lang = pickLang(root.dataset.locale || (window.Shopify && window.Shopify.locale) || document.documentElement.lang)
    texts = lang === 'en' ? Promise.resolve({ ...LABELS }) : (async () => {
      try {
        const res = await fetch(new URL(`ifcvo-i18n-${lang}.json`, here))
        if (res.ok) { const j = await res.json(); if (j && j.share) return { ...LABELS, ...j.share } }
      } catch (e) { /* English */ }
      return { ...LABELS }
    })()
  }
  return texts
}

function track(name, data) {
  try { window.Shopify && Shopify.analytics && Shopify.analytics.publish(name, data) } catch (e) { /* no pixels */ }
}

const live = { selection: null, level: null }

function api() { return typeof window !== 'undefined' ? window.IFCVO : null }

function say(root, text) {
  const s = root.querySelector('.ifcvo-share-status')
  if (s) s.textContent = text
}

async function onShare(root, button) {
  const L = await labels(root)
  const a = api()
  const v = a && (a.viewer || await a.open())
  if (!v) return
  let link = null
  try {
    await v.whenReady()
    link = shareLink(location.href, { camera: await v.getCamera(), selection: live.selection, level: live.level })
  } catch (e) { link = null }
  if (!link) { say(root, L.error); return }
  const field = root.querySelector('.ifcvo-share-link')
  if (field) field.hidden = true
  track('ifc_view_shared', { productId: root.dataset.productId || '', method: navigator.share ? 'share' : 'copy' })
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ title: document.title, url: link }); say(root, L.shared); return } catch (e) {
      if (e && e.name === 'AbortError') return
    }
  }
  try { await navigator.clipboard.writeText(link); say(root, L.copied); return } catch (e) { /* fall through */ }
  if (field) { field.value = link; field.hidden = false; field.focus(); field.select() }
  say(root, L.manual)
  button.setAttribute('aria-expanded', 'true')
}

/** Adds the share button and its status/fallback field under the viewer, once. */
export async function mountShare(root) {
  if (!root || root.querySelector('.ifcvo-share')) return null
  const L = await labels(root)
  if (root.querySelector('.ifcvo-share')) return null
  const wrap = document.createElement('div')
  wrap.className = 'ifcvo-share'
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ifcvo-btn ifcvo-share-button'
  button.textContent = L.share
  button.style.minHeight = '44px'
  const field = document.createElement('input')
  field.type = 'url'
  field.readOnly = true
  field.hidden = true
  field.className = 'ifcvo-share-link'
  field.setAttribute('aria-label', L.manual)
  field.style.cssText = 'flex:1 1 240px;min-height:44px;font:inherit'
  const status = document.createElement('p')
  status.className = 'ifcvo-share-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.style.cssText = 'margin:0;flex-basis:100%;min-height:1.4em;font-size:.9em'
  button.addEventListener('click', () => { onShare(root, button).catch(() => {}) })
  wrap.append(button, field, status)
  const anchor = root.querySelector('.ifcvo-status') || root.querySelector('.ifcvo-stage')
  if (anchor) anchor.after(wrap)
  else root.append(wrap)
  return wrap
}

/** Shows "Updated since your purchase" next to the viewer, once. */
export async function showUpdated(root) {
  if (!root || root.querySelector('.ifcvo-updated')) return null
  const L = await labels(root)
  if (root.querySelector('.ifcvo-updated')) return null
  const note = document.createElement('p')
  note.className = 'ifcvo-updated'
  note.setAttribute('role', 'note')
  note.style.cssText = 'margin:6px 0 0;font-size:.9em;font-weight:600'
  note.textContent = L.updated
  const stage = root.querySelector('.ifcvo-stage')
  if (stage) stage.before(note)
  else root.prepend(note)
  return note
}

let started = false
/** Wires the page once: share button, element/storey tracking, the hash on load. */
export function init(doc = document) {
  const a = api()
  const root = doc.querySelector('[data-ifcvo-viewer]')
  if (!a || !root || root.dataset.ifcvoShare) return
  root.dataset.ifcvoShare = '1'
  mountShare(root).catch(() => {})
  let state = { open: false }
  try { state = parseHash(location.hash) } catch (e) { /* ignored */ }
  // Review links are a Starter feature (T-326 F10): on Free the hash is ignored.
  if (state.review && typeof a.allowed === 'function' && !a.allowed('review', a.plan)) state.review = false
  if (state.open && isUpdated(state.version, root.dataset.ifcvoVersion)) showUpdated(root).catch(() => {})
  let pending = wantsViewer(state) && (state.view || state.review || state.camera || state.selection || state.level != null) ? state : null
  a.subscribe(root, (type, e) => {
    if (type === 'model-loaded') {
      live.selection = null; live.level = null
      if (pending) { const s = pending; pending = null; const v = a.viewer; if (v) setTimeout(() => { applyState(v, s, viewsOf(root)).catch(() => {}) }, 0) }
    }
    if (type === 'element-selected') {
      live.selection = e && Number.isInteger(e.expressId) && e.expressId > 0 ? { modelId: String(e.modelId == null ? '' : e.modelId), expressId: e.expressId } : null
    }
  })
  if (!started) {
    started = true
    doc.addEventListener('ifcvo:storey', (e) => {
      const i = e && e.detail && e.detail.index
      live.level = Number.isInteger(i) && i >= 0 ? i : null
    })
  }
  if (wantsViewer(state)) {
    try { root.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (e) { /* old browser */ }
    Promise.resolve(a.open()).catch(() => {})
  }
}

export function _reset() { texts = null; live.selection = null; live.level = null }
