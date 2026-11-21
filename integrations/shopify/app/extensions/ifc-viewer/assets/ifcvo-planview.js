// "IFC plan view" block: one tab per storey; a tab cuts the page's viewer at
// that storey (SDK addSection({ level })) and looks at it from the top, so the
// buyer sees each floor plan before buying. Rooms and areas come from
// getProductData().rooms when the viewer offers them (older viewers do not:
// the list is simply left out).
//
// Preview mode (data-ifcvo-protect) adds a watermark with the shop name over
// the viewer and this block, hides the page's model downloads and the "open
// full viewer" link, and blocks the context menu on the host page. The viewer
// itself is opened without toolbar, tools or exports (protectOptions() in
// ifcvo.js). This deters casual copying; geometry sent to a browser can
// always be extracted by someone determined.

const LABELS = {
  all: '3D',
  tabs: 'Floor plans',
  waiting: 'Open the 3D model to see its floor plans.',
  open: 'Show floor plans',
  loading: 'Reading the storeys…',
  none: 'This model has no storeys.',
  error: 'The floor plans could not be read.',
  rooms: 'Rooms',
  room: 'Room',
  area: 'Area',
  showing: 'Showing:',
}

/** Label `k`: the block's data-l-* (locale or shop override, resolved by Liquid), else English. */
export function label(root, k) {
  const v = root && root.dataset['l' + k.charAt(0).toUpperCase() + k.slice(1)]
  return v || LABELS[k]
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children) if (c != null) node.append(c)
  return node
}

/** The storeys of getSections(), bottom-up, named. */
export function levelsOf(sections) {
  const list = sections && Array.isArray(sections.levels) ? sections.levels : []
  return list
    .map((l, i) => ({ index: i, name: String((l && l.name) || '').trim() || `#${i + 1}`, y: Number(l && l.y) || 0 }))
}

/** Rooms of one storey from getProductData().rooms, if present: [{ name, area }]. */
export function roomsFor(data, levelName) {
  const rooms = data && Array.isArray(data.rooms) ? data.rooms : []
  const want = String(levelName || '').trim().toLowerCase()
  return rooms
    .filter((r) => r && String(r.storey ?? r.level ?? '').trim().toLowerCase() === want)
    .map((r) => ({ name: String(r.longName || r.name || '').trim() || '—', area: Number(r.area) > 0 ? Number(r.area) : null }))
}

export function formatArea(m2, locale) {
  if (m2 == null) return '—'
  try { return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 1 }).format(m2) + ' m²' } catch (e) { return m2.toFixed(1) + ' m²' }
}

/** Builds the tablist: "3D" first, then one tab per storey. Roving tabindex. */
export function renderTabs(root, levels, selected = -1) {
  const list = root.querySelector('[data-ifcvo-planview-tabs]')
  const id = root.id || (root.id = 'ifcvo-pv-' + Math.random().toString(36).slice(2, 8))
  const tabs = [{ index: -1, name: label(root, 'all') }, ...levels].map((l) => el('button', {
    type: 'button', role: 'tab', class: 'ifcvo-btn ifcvo-chip', id: `${id}-tab-${l.index + 1}`,
    'aria-controls': `${id}-panel`, 'aria-selected': String(l.index === selected), tabindex: l.index === selected ? '0' : '-1',
    'data-level': String(l.index), 'data-name': l.name,
  }, l.name))
  list.replaceChildren(...tabs)
  const panel = root.querySelector('[data-ifcvo-planview-panel]')
  panel.id = `${id}-panel`
  return tabs
}

/** Marks tab `index` selected (aria + roving tabindex). Returns the tab. */
export function markSelected(root, index) {
  let hit = null
  for (const t of root.querySelectorAll('[role="tab"]')) {
    const on = t.dataset.level === String(index)
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    if (on) hit = t
  }
  const panel = root.querySelector('[data-ifcvo-planview-panel]')
  if (hit && panel) panel.setAttribute('aria-labelledby', hit.id)
  return hit
}

/** Arrow keys / Home / End move between tabs and select (automatic activation). Returns the next tab or null. */
export function nextTab(root, current, key) {
  const tabs = [...root.querySelectorAll('[role="tab"]')]
  const i = tabs.indexOf(current)
  if (i < 0) return null
  const n = tabs.length
  const map = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, ArrowUp: (i - 1 + n) % n, Home: 0, End: n - 1 }
  return key in map ? tabs[map[key]] : null
}

/** Cuts the viewer at storey `index` and looks from the top; -1 is the whole model in 3D. */
export async function showLevel(viewer, index) {
  if (!viewer) return false
  await viewer.removeSection()
  if (index < 0) {
    await viewer.frame({ view: 'iso' })
    return true
  }
  await viewer.addSection({ level: index })
  await viewer.frame({ view: 'top' })
  return true
}

function renderPanel(root, level) {
  const panel = root.querySelector('[data-ifcvo-planview-panel]')
  const nodes = []
  if (level && root.dataset.rooms !== 'false') {
    const rooms = roomsFor(state.get(root)?.data, level.name)
    if (rooms.length) {
      const total = rooms.reduce((s, r) => s + (r.area || 0), 0)
      nodes.push(el('table', { class: 'ifcvo-specs' },
        el('caption', {}, `${label(root, 'rooms')} · ${level.name}`),
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, label(root, 'room')), el('th', { scope: 'col' }, label(root, 'area')))),
        el('tbody', {}, ...rooms.map((r) => el('tr', {}, el('td', {}, r.name), el('td', {}, formatArea(r.area, root.dataset.locale))))),
        total > 0 ? el('tfoot', {}, el('tr', {}, el('th', { scope: 'row' }, label(root, 'area')), el('td', {}, formatArea(total, root.dataset.locale)))) : null))
    }
  }
  panel.replaceChildren(...nodes)
}

function status(root, text) {
  const s = root.querySelector('[data-ifcvo-planview-status]')
  if (s) s.textContent = text
}

const mounted = new Set()
/** Per block: { levels, data, selected }. */
const state = new WeakMap()
let current = null

async function select(root, index) {
  const s = state.get(root)
  if (!s || !current) return
  s.selected = index
  markSelected(root, index)
  const level = s.levels.find((l) => l.index === index) || null
  renderPanel(root, level)
  try {
    await showLevel(current, index)
    status(root, `${label(root, 'showing')} ${level ? level.name : label(root, 'all')}`)
  } catch (e) {
    status(root, label(root, 'error'))
  }
}

function body(root) { return root.querySelector('[data-ifcvo-planview-body]') }

function showWaiting(root) {
  const api = typeof window !== 'undefined' && window.IFCVO
  body(root).querySelector('[data-ifcvo-planview-tabs]').replaceChildren(el('button', {
    type: 'button', class: 'ifcvo-btn', onclick: () => api && api.open && api.open(),
  }, label(root, 'open')))
  status(root, label(root, 'waiting'))
}

/** Reads the storeys (and rooms, if any) once per load and fills every plan view block. */
export async function refresh(viewer = current) {
  if (!viewer) return
  const roots = [...mounted].filter((r) => r.isConnected)
  if (!roots.length) return
  for (const r of roots) status(r, label(r, 'loading'))
  let levels = []
  let data = null
  try {
    levels = levelsOf(await viewer.getSections())
  } catch (e) {
    for (const r of roots) status(r, label(r, 'error'))
    return
  }
  if (roots.some((r) => r.dataset.rooms !== 'false') && typeof viewer.getProductData === 'function') {
    try { data = await viewer.getProductData() } catch (e) { data = null }
  }
  for (const r of roots) {
    if (!levels.length) {
      r.querySelector('[data-ifcvo-planview-tabs]').replaceChildren()
      status(r, label(r, 'none'))
      continue
    }
    const start = r.dataset.start === 'first' ? 0 : -1
    state.set(r, { levels, data, selected: start })
    renderTabs(r, levels, start)
    markSelected(r, start)
    renderPanel(r, levels.find((l) => l.index === start) || null)
    status(r, '')
    if (start >= 0) select(r, start)
  }
}

/** Use this viewer; re-read on every model it loads. */
export function attach(viewer) {
  if (!viewer || viewer === current) return
  current = viewer
  if (typeof viewer.on === 'function') viewer.on('model-loaded', () => refresh(viewer))
}

function onClick(e) {
  const tab = e.target && e.target.closest && e.target.closest('[data-ifcvo-planview] [role="tab"]')
  if (!tab) return
  select(tab.closest('[data-ifcvo-planview]'), Number(tab.dataset.level))
}

export function onKey(e) {
  const tab = e.target && e.target.closest && e.target.closest('[data-ifcvo-planview] [role="tab"]')
  if (!tab) return
  const root = tab.closest('[data-ifcvo-planview]')
  const next = nextTab(root, tab, e.key)
  if (!next) return
  e.preventDefault()
  next.focus()
  select(root, Number(next.dataset.level))
}

// ── Preview mode ─────────────────────────────────────────────────────────────

/** A watermark layer: the text repeated over the area, ignored by pointer and screen readers. */
export function watermark(text, opacity = 0.18) {
  const layer = el('div', { class: 'ifcvo-watermark', 'aria-hidden': 'true', 'data-ifcvo-watermark': '', style: `opacity:${Math.min(Math.max(Number(opacity) || 0.18, 0.05), 0.6)}` })
  for (let i = 0; i < 24; i++) layer.append(el('span', {}, text))
  return layer
}

const noMenu = (e) => e.preventDefault()

/** Applies preview mode to the page's viewer block and to `root`. Returns the viewer root it protected, or null. */
export function protect(root, doc = document) {
  if (!root.hasAttribute('data-ifcvo-protect')) return null
  const text = root.dataset.watermark || ''
  const opacity = root.dataset.watermarkOpacity
  const targets = [root.querySelector('[data-ifcvo-planview-body]')]
  const viewerRoot = doc.querySelector('[data-ifcvo-viewer]')
  if (viewerRoot) {
    viewerRoot.setAttribute('data-ifcvo-protected', '')
    viewerRoot.classList.add('ifcvo-protected')
    targets.push(viewerRoot.querySelector('.ifcvo-stage'))
  }
  for (const t of targets) {
    if (!t) continue
    if (text && !t.querySelector(':scope > [data-ifcvo-watermark]')) t.append(watermark(text, opacity))
    t.addEventListener('contextmenu', noMenu)
    t.addEventListener('dragstart', noMenu)
    t.classList.add('ifcvo-noselect')
  }
  // Every download on the page: the viewer's links, the "IFC downloads" block, GLB/CSV buttons.
  doc.documentElement.classList.add('ifcvo-protected')
  for (const d of doc.querySelectorAll('[data-ifcvo-downloads], [data-ifcvo-downloads-block], .ifcvo-make')) d.remove()
  for (const img of (viewerRoot || root).querySelectorAll('img')) img.setAttribute('draggable', 'false')
  return viewerRoot
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export function init(doc = document) {
  for (const root of doc.querySelectorAll('[data-ifcvo-planview]')) {
    if (root.dataset.ifcvoPlanviewReady) continue
    root.dataset.ifcvoPlanviewReady = '1'
    const api = typeof window !== 'undefined' && window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('planview', body(root))) continue
    mounted.add(root)
    protect(root, doc)
    showWaiting(root)
  }
  const v = typeof window !== 'undefined' && window.IFCVO && window.IFCVO.viewer
  if (v && v !== current) { attach(v); refresh(v) }
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

/** A viewer announced by the runtime. */
export function onViewer(e) {
  const v = (e && e.detail && e.detail.viewer) || (window.IFCVO && window.IFCVO.viewer)
  if (!v) return
  const fresh = v !== current
  attach(v)
  if (fresh) refresh(v)
}

/** For tests. */
export function _reset() { mounted.clear(); current = null }

if (typeof document !== 'undefined') {
  document.addEventListener('click', onClick)
  document.addEventListener('keydown', onKey)
  document.addEventListener('ifcvo:viewer', onViewer)
  document.addEventListener('shopify:section:load', () => init())
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
