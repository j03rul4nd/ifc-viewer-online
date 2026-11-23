// "IFC: compare variants" block (Starter, T-326 F9): two variants' models side by
// side, with a table of the key specs read in the browser (elements, rooms, floor
// area, bedrooms, bathrooms, storeys, outer size, volume, weight) and their
// difference. On narrow screens tabs replace the split and only one model is live
// at a time (the other's specs stay in the table). The models come from the
// product viewer's variant map (data-models); the block's Liquid adds only the
// variant titles. Closing disposes both viewers and empties their stages, so their
// geometry, materials and WebGL contexts go. No server.
import './ifcvo-i18n.js'

export const LABELS = {
  title: 'Compare variants',
  a: 'Variant A',
  b: 'Variant B',
  compare: 'Compare',
  close: 'Close comparison',
  loading: 'Loading the model…',
  error: 'This model could not be loaded.',
  need: 'Pick two variants with different models.',
  spec: 'Spec',
  diff: 'Difference',
  same: 'Same',
  elements: 'Elements',
  rooms: 'Rooms',
  area: 'Floor area',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  storeys: 'Storeys',
  size: 'Outer size (W × D × H)',
  volume: 'Volume',
  weight: 'Weight',
}

const NARROW = '(max-width: 749px)'
const LOAD_TIMEOUT = 120000

function readJson(raw, fallback) {
  try { const v = JSON.parse(raw); return v == null ? fallback : v } catch (e) { return fallback }
}

/** `"id":"title",…` (data-variants) and `"id":"url",…` (the viewer's data-models) → options with a model. */
export function variantOptions(variantsRaw, modelsRaw) {
  const titles = readJson('{' + (variantsRaw || '') + '}', {})
  const models = readJson('{' + (modelsRaw || '') + '}', {})
  const out = []
  for (const [id, url] of Object.entries(models)) {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) continue
    out.push({ id, title: typeof titles[id] === 'string' && titles[id] ? titles[id] : id, url })
  }
  return out
}

/** True when the options hold at least two different models (otherwise the block hides). */
export function canCompare(options) {
  return new Set((options || []).map((o) => o.url)).size >= 2
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The key specs of one getProductData() result; null values when the model does not say. */
export function keySpecs(data) {
  const d = data || {}
  const rooms = d.rooms || null
  const dim = d.dimensions || null
  const totals = d.totals || {}
  return {
    elements: num(d.elementCount),
    rooms: rooms && rooms.totals ? num(rooms.totals.count) : null,
    area: rooms && rooms.totals ? num(rooms.totals.area) : null,
    bedrooms: rooms ? num(rooms.bedrooms) : null,
    bathrooms: rooms ? num(rooms.bathrooms) : null,
    storeys: rooms && Array.isArray(rooms.storeys) ? rooms.storeys.length : null,
    size: dim && [dim.w, dim.d, dim.h].every((x) => num(x) != null) ? [dim.w, dim.d, dim.h] : null,
    volume: num(totals.volume),
    weight: num(totals.weight),
  }
}

export const ROWS = ['area', 'rooms', 'bedrooms', 'bathrooms', 'storeys', 'size', 'volume', 'weight', 'elements']
const UNITS = { area: 'm²', size: 'm', volume: 'm³', weight: 'kg' }
const round = (n, unit) => (unit === 'kg' ? Math.round(n) : Math.round(n * 100) / 100)

function fmt(v, key, locale) {
  if (v == null) return '–'
  const u = UNITS[key]
  const nf = (n) => { try { return round(n, u).toLocaleString(locale || undefined) } catch (e) { return String(round(n, u)) } }
  if (Array.isArray(v)) return v.map(nf).join(' × ') + ' ' + u
  return nf(v) + (u ? ' ' + u : '')
}

/**
 * Rows of the comparison: `{ key, a, b, delta, same }` with formatted values. Rows
 * neither model knows are left out; delta is B − A ('' when one side is unknown).
 */
export function diffSpecs(a, b, { locale, labels = LABELS } = {}) {
  const out = []
  for (const key of ROWS) {
    const x = a ? a[key] : null
    const y = b ? b[key] : null
    if (x == null && y == null) continue
    let delta = ''
    let same = false
    if (x != null && y != null) {
      if (Array.isArray(x)) {
        same = x.every((n, i) => round(n, 'm') === round(y[i], 'm'))
        delta = same ? labels.same : ''
      } else {
        const d = round(y - x, UNITS[key])
        same = d === 0
        delta = same ? labels.same : (d > 0 ? '+' : '−') + fmt(Math.abs(d), key, locale)
      }
    }
    out.push({ key, label: labels[key] || key, a: fmt(x, key, locale), b: fmt(y, key, locale), delta, same })
  }
  return out
}

// ── Page wiring ──────────────────────────────────────────────────────────────

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v
    else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v)
  }
  n.append(...kids.filter((k) => k != null))
  return n
}

function labelsOf(root) {
  const shop = readJson(root.dataset.ifcvoLabels, null)
  const lang = String(root.dataset.locale || '').toLowerCase()
  const fromShop = (shop && typeof shop === 'object' && (shop[lang] || shop[lang.split('-')[0]] || shop))
  const shopCompare = fromShop && typeof fromShop.compare === 'object' ? fromShop.compare : {}
  return { ...LABELS, ...readJson(root.dataset.labels, {}), ...shopCompare }
}

function dispose(slot) {
  if (!slot) return
  const v = slot.viewer
  slot.viewer = null
  slot.url = null
  try { if (v && typeof v.dispose === 'function') v.dispose(); else if (v && typeof v.destroy === 'function') v.destroy() } catch (e) { /* already gone */ }
  try { slot.stage.replaceChildren() } catch (e) { /* detached */ }
}

/** Loads `url` in the slot's stage (disposing what was there) and returns its key specs, or null. */
/** The product viewer's background, accent, grid and finish, so both compare viewers match it. */
export function lookOf(d = {}) {
  const look = {}
  if (d.bg === 'brand') look.background = { top: d.bgTop || '#ffffff', bottom: d.bgBottom || d.bgTop || '#ffffff' }
  else if (d.bg) look.background = d.bg
  if (d.accent) look.accent = d.accent
  // Shop ifcvo.config grid / finish, as on the product viewer.
  const cfg = readJson(d.ifcvoConfig, {}) || {}
  if (cfg.grid === false) look.grid = false
  if (cfg.finish === 'clay' || cfg.finish === 'daylight') look.finish = cfg.finish
  return look
}

async function load(api, slot, url, L, look = {}) {
  dispose(slot)
  slot.note.textContent = L.loading
  const { IfcViewer } = await api.loadSdk()
  const v = new IfcViewer(slot.stage, { model: url, ui: 'embed', toolbar: false, height: '100%', validate: false, ...look })
  slot.viewer = v
  slot.url = url
  const loaded = typeof v.on === 'function'
    ? new Promise((res) => { v.on('model-loaded', () => res(true)); v.on('model-error', () => res(false)) })
    : Promise.resolve(true)
  await v.whenReady()
  const ok = await Promise.race([loaded, new Promise((res) => setTimeout(() => res(false), LOAD_TIMEOUT))])
  if (slot.viewer !== v) return null
  if (!ok) { slot.note.textContent = L.error; return null }
  slot.note.textContent = ''
  try { return keySpecs(await v.getProductData({ maxElements: 20000 })) } catch (e) { return null }
}

/** Mounts one compare block. Returns a teardown, or null when it does not apply. */
export function mount(root, { api = window.IFCVO, doc = document, win = window } = {}) {
  if (!root || root.dataset.ifcvoCompareMounted) return null
  if (api && typeof api.gate === 'function' && !api.gate('compare', root)) return null
  const viewerRoot = doc.querySelector('[data-ifcvo-viewer]')
  const options = variantOptions(root.dataset.variants, viewerRoot && viewerRoot.dataset.models)
  if (!canCompare(options) || !api || typeof api.loadSdk !== 'function') { root.hidden = true; return null }
  root.dataset.ifcvoCompareMounted = '1'
  const L = labelsOf(root)
  const look = lookOf(viewerRoot ? viewerRoot.dataset : {})
  const locale = root.dataset.locale || ''
  const body = root.querySelector('.ifcvo-body') || root

  const pick = (label, index) => {
    const s = el('select', { 'aria-label': label })
    options.forEach((o, i) => s.append(el('option', { value: String(i), text: o.title })))
    s.value = String(index)
    return el('label', { class: 'ifcvo-compare-pick' }, label + ' ', s)
  }
  const second = options.findIndex((o) => o.url !== options[0].url)
  const pickA = pick(L.a, 0)
  const pickB = pick(L.b, second)
  const go = el('button', { type: 'button', class: 'ifcvo-btn', text: L.compare })
  const close = el('button', { type: 'button', class: 'ifcvo-btn ifcvo-compare-close', text: L.close, hidden: true })
  const status = el('p', { class: 'ifcvo-compare-status', role: 'status', 'aria-live': 'polite' })
  const tabs = el('div', { class: 'ifcvo-compare-tabs', role: 'tablist', hidden: true })
  const split = el('div', { class: 'ifcvo-compare-split', hidden: true })
  const table = el('div', { class: 'ifcvo-compare-table' })
  const slots = ['a', 'b'].map((k) => {
    const stage = el('div', { class: 'ifcvo-compare-stage' })
    const note = el('p', { class: 'ifcvo-compare-note' })
    const title = el('h4', {})
    const pane = el('div', { class: 'ifcvo-compare-pane', role: 'tabpanel', id: `ifcvo-cmp-${k}-${Math.random().toString(36).slice(2, 8)}` }, title, stage, note)
    const tab = el('button', { type: 'button', role: 'tab', class: 'ifcvo-compare-tab', 'aria-controls': pane.id })
    split.append(pane)
    tabs.append(tab)
    return { k, stage, note, title, pane, tab, viewer: null, url: null, specs: null, option: null }
  })
  body.replaceChildren(el('div', { class: 'ifcvo-compare-controls' }, pickA, pickB, go, close), status, tabs, split, table)

  const narrow = () => { try { return win.matchMedia(NARROW).matches } catch (e) { return false } }
  let active = 0
  let run = 0

  const render = () => {
    const [a, b] = slots
    const rows = diffSpecs(a.specs, b.specs, { locale, labels: L })
    if (!rows.length) { table.replaceChildren(); return }
    const th = (t) => el('th', { scope: 'col', text: t })
    table.replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, th(L.spec), th(a.option ? a.option.title : L.a), th(b.option ? b.option.title : L.b), th(L.diff))),
      el('tbody', {}, ...rows.map((r) => el('tr', { class: r.same ? 'is-same' : null },
        el('th', { scope: 'row', text: r.label }), el('td', { text: r.a }), el('td', { text: r.b }), el('td', { text: r.delta }))))))
  }

  const showTab = async (i, token) => {
    active = i
    slots.forEach((s, j) => {
      s.tab.setAttribute('aria-selected', String(j === i))
      s.tab.tabIndex = j === i ? 0 : -1
      s.pane.hidden = narrow() && j !== i
    })
    if (!narrow()) return
    // One live model on small screens: free the hidden one before loading the shown one.
    dispose(slots[1 - i])
    const s = slots[i]
    if (s.option && s.url !== s.option.url) {
      const specs = await load(api, s, s.option.url, L, look)
      if (token === run && specs) { s.specs = specs; render() }
    }
  }
  slots.forEach((s, i) => {
    s.tab.addEventListener('click', () => { showTab(i, run).catch(() => {}) })
    s.tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const j = 1 - i
      slots[j].tab.focus()
      showTab(j, run).catch(() => {})
    })
  })

  const stop = () => {
    run++
    slots.forEach((s) => { dispose(s); s.specs = null; s.option = null })
    split.hidden = true
    tabs.hidden = true
    close.hidden = true
    table.replaceChildren()
    status.textContent = ''
  }

  const start = async () => {
    const a = options[Number(pickA.querySelector('select').value)]
    const b = options[Number(pickB.querySelector('select').value)]
    if (!a || !b || a.url === b.url) { status.textContent = L.need; return }
    stop()
    const token = run
    slots[0].option = a
    slots[1].option = b
    slots.forEach((s) => { s.title.textContent = s.option.title; s.tab.textContent = s.option.title })
    split.hidden = false
    tabs.hidden = !narrow()
    close.hidden = false
    try { win.Shopify && win.Shopify.analytics && win.Shopify.analytics.publish('ifc_variants_compared', { a: a.id, b: b.id }) } catch (e) { /* no pixels */ }
    if (narrow()) {
      // Specs of both, one model at a time: B first and freed, then A stays live.
      const sb = await load(api, slots[1], b.url, L, look)
      if (token !== run) return
      slots[1].specs = sb
      await showTab(0, token)
      return
    }
    // Desktop: one after the other, so two large models never parse at the same time.
    for (const s of slots) {
      s.pane.hidden = false
      const specs = await load(api, s, s.option.url, L, look)
      if (token !== run) return
      s.specs = specs
      render()
    }
  }

  go.addEventListener('click', () => { start().catch(() => { status.textContent = L.error }) })
  close.addEventListener('click', () => { stop(); go.focus() })
  const onUnload = (e) => { if (e && e.target && e.target.contains && e.target.contains(root)) stop() }
  doc.addEventListener('shopify:section:unload', onUnload)
  win.addEventListener('pagehide', stop)
  return () => { stop(); doc.removeEventListener('shopify:section:unload', onUnload); win.removeEventListener('pagehide', stop); delete root.dataset.ifcvoCompareMounted }
}

/** Mounts every compare block on the page (and re-rendered ones in the theme editor). */
export function init(doc = document) {
  for (const root of doc.querySelectorAll('[data-ifcvo-compare]')) { try { mount(root) } catch (e) { /* never break the page */ } }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__ifcvoCompareInit) {
  window.__ifcvoCompareInit = true
  const run = () => init()
  if (window.IFCVO) run()
  else document.addEventListener('ifcvo:ready', run, { once: true })
  document.addEventListener('shopify:section:load', (e) => init(e.target))
}
