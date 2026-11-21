// "IFC rooms & key specs" block: once the page's viewer has a model, asks it
// for getProductData() (SDK; `rooms` since 1.19) and renders key-spec chips
// plus a room schedule grouped by storey, in light DOM so it inherits the
// theme's typography. Chips rendered by Liquid from metafields stay as they
// are (crawlable / no-JS copy, and the merchant's word wins); the model only
// fills the chips the merchant left empty. Clicking a room selects and frames
// it in the viewer when the viewer can.
//
// Finds the viewer through window.IFCVO.viewer or the `ifcvo:viewer` /
// `ifcvo:loaded` DOM events (detail.viewer), never globals.

export const LABELS = {
  title: 'Rooms', area: 'Total area', storeys: 'Storeys', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms',
  footprint: 'Footprint', room: 'Room', number: 'No.', height: 'Height', total: 'Total', storey: 'Storey',
  waiting: 'Open the 3D model to list its rooms.', loading: 'Reading the rooms…', none: 'This model has no rooms (IfcSpace).',
  error: 'The rooms could not be read.', inferred: 'Bedrooms and bathrooms are counted from the room names.',
  geometry: '≈ calculated from the room\'s shape',
  truncated: 'Large model: only the first rooms were read, totals may be incomplete.',
  units: 'Some lengths use a unit that could not be read and are not shown.',
}
export const CHIPS = ['area', 'storeys', 'bedrooms', 'bathrooms', 'footprint']

const FT2 = 10.7639104

function readJson(text) {
  try { const v = JSON.parse(text || 'null'); return v && typeof v === 'object' ? v : null } catch (e) { return null }
}

/** key=value lines → object. */
export function parseLabels(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k && v) out[k] = v }
  }
  return out
}

/** Shop's ifcvo.labels for a locale: English, then the language, then the exact locale. */
export function labelsFor(all, locale) {
  if (!all) return {}
  const lang = String(locale || '').toLowerCase()
  return { ...(all.en || {}), ...(all[lang.split('-')[0]] || {}), ...(all[lang] || {}) }
}

/** Defaults ← theme locale (Liquid `t`) ← shop ifcvo.labels ← block textarea. Only known keys. */
export function labelsOf(root) {
  const merged = { ...LABELS }
  const layers = [readJson(root.dataset.labels), labelsFor(readJson(root.dataset.ifcvoLabels), root.dataset.locale), parseLabels(root.dataset.labelsOverride)]
  for (const layer of layers) for (const [k, v] of Object.entries(layer || {})) {
    // An untranslated `t` renders "translation missing: …": keep the default.
    if (k in LABELS && typeof v === 'string' && v && !/^translation missing/i.test(v)) merged[k] = v
  }
  return merged
}

/** m² → display text in the chosen unit. */
export function areaText(m2, unit = 'm2') {
  if (m2 === null || m2 === undefined || !Number.isFinite(m2)) return null
  const ft = unit === 'ft2'
  const n = ft ? Math.round(m2 * FT2) : Math.round(m2 * 10) / 10
  return `${n.toLocaleString('en-US')} ${ft ? 'ft²' : 'm²'}`
}

function lengthText(m, unit = 'm2') {
  if (m === null || m === undefined || !Number.isFinite(m)) return null
  return unit === 'ft2' ? `${Math.round(m * 3.280839895 * 10) / 10} ft` : `${Math.round(m * 100) / 100} m`
}

/** Footprint W × D from ProductData.dimensions. */
export function footprintText(dim, unit = 'm2') {
  if (!dim || dim.w === null || dim.w === undefined || dim.d === null || dim.d === undefined) return null
  return `${lengthText(dim.w, unit)} × ${lengthText(dim.d, unit)}`
}

/** Values for the chips from the model; null for what it cannot say. Counts of 0 are not shown. */
export function chipValues(data, unit = 'm2') {
  const rooms = data && data.rooms
  return {
    area: rooms ? areaText(rooms.totals.grossArea ?? rooms.totals.area, unit) : null,
    storeys: rooms && rooms.storeys.filter((s) => s.name).length ? String(rooms.storeys.filter((s) => s.name).length) : null,
    bedrooms: rooms && rooms.bedrooms ? String(rooms.bedrooms) : null,
    bathrooms: rooms && rooms.bathrooms ? String(rooms.bathrooms) : null,
    footprint: footprintText(data && data.dimensions, unit),
  }
}

/** Rooms → [{ storey, rows, total }] of plain strings: one source for the DOM and tests. */
export function schedule(rooms, unit = 'm2') {
  if (!rooms) return []
  return rooms.storeys.map((s) => ({
    storey: s.name,
    rows: s.rooms.map((r) => ({
      ref: r.expressId === null || r.expressId === undefined ? null : { expressId: r.expressId, modelId: r.modelId },
      number: r.number || '',
      label: r.label || r.name || '',
      area: areaText(r.area, unit),
      geometry: r.areaSource === 'geometry',
      height: lengthText(r.height, unit),
    })),
    total: areaText(s.area, unit),
  }))
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v)
  }
  for (const c of children) if (c != null) node.append(c)
  return node
}

export function config(root) {
  return {
    unit: root.dataset.units === 'ft2' ? 'ft2' : 'm2',
    table: root.dataset.showTable !== 'false',
    chips: root.dataset.showChips !== 'false',
    highlight: root.dataset.highlight !== 'false',
    labels: labelsOf(root),
  }
}

/** Selects and frames a room, when the viewer has those methods. */
export function highlight(viewer, ref) {
  if (!viewer || !ref) return false
  if (typeof viewer.select !== 'function') return false
  viewer.select(ref.expressId, ref.modelId || undefined)
  if (typeof viewer.frame === 'function') {
    try { const p = viewer.frame({ elementId: ref.expressId, modelId: ref.modelId || undefined }); if (p && p.catch) p.catch(() => {}) } catch (e) { /* older SDK */ }
  }
  return true
}

/** Model chips only where Liquid rendered no metafield chip. */
function fillChips(root, data, cfg) {
  const ul = root.querySelector('[data-ifcvo-chips]')
  if (!ul) return
  const values = chipValues(data, cfg.unit)
  for (const key of CHIPS) {
    const have = ul.querySelector(`[data-key="${key}"]`)
    if (have && have.dataset.source === 'metafield') continue
    if (have) have.remove()
    if (!values[key]) continue
    const chip = el('li', { class: 'ifcvo-chip', 'data-key': key, 'data-source': 'model' }, el('span', {}, cfg.labels[key]), ' ', el('strong', {}, values[key]))
    // Keep the CHIPS order among whatever is already there.
    const next = CHIPS.slice(CHIPS.indexOf(key) + 1).map((k) => ul.querySelector(`[data-key="${k}"]`)).find(Boolean)
    ul.insertBefore(chip, next || null)
  }
}

/** Draws the chips and the schedule for one block. */
export function render(root, data, viewer = current) {
  const cfg = config(root)
  const labels = cfg.labels
  if (cfg.chips) fillChips(root, data, cfg)
  const body = root.querySelector('[data-ifcvo-live]')
  const rooms = data && data.rooms
  if (!cfg.table) { body.replaceChildren(); return [] }
  if (!rooms || !rooms.totals.count) { body.replaceChildren(el('p', { class: 'ifcvo-muted' }, labels.none)); return [] }
  const groups = schedule(rooms, cfg.unit)
  const clickable = cfg.highlight && viewer && typeof viewer.select === 'function'
  const nodes = groups.map((g) => el('table', { class: 'ifcvo-specs ifcvo-rooms', 'data-storey': g.storey || '' },
    el('caption', {}, g.storey || labels.storey),
    el('thead', {}, el('tr', {}, ...[labels.number, labels.room, labels.area, labels.height].map((h) => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, ...g.rows.map((r) => {
      const name = clickable && r.ref
        ? el('button', { type: 'button', class: 'ifcvo-row', onclick: () => highlight(viewer, r.ref) }, r.label || '—')
        : (r.label || '—')
      return el('tr', {}, el('td', {}, r.number || '—'), el('td', {}, name),
        el('td', r.geometry ? { title: labels.geometry } : {}, r.area ? (r.geometry ? '≈ ' + r.area : r.area) : '—'),
        el('td', {}, r.height || '—'))
    })),
    el('tfoot', {}, el('tr', {}, el('th', { scope: 'row', colspan: '2' }, labels.total), el('td', {}, g.total || '—'), el('td', {})))))
  if (groups.length > 1) nodes.push(el('p', { class: 'ifcvo-rooms-total' }, el('strong', {}, `${labels.total}: ${areaText(rooms.totals.area, cfg.unit) || '—'}`)))
  if (rooms.truncated) nodes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-truncated': '' }, labels.truncated))
  if (rooms.unknownUnits) nodes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-units': '' }, labels.units))
  if (rooms.bedrooms || rooms.bathrooms) nodes.push(el('p', { class: 'ifcvo-muted' }, labels.inferred))
  body.replaceChildren(...nodes)
  return groups
}

const mounted = new Set()
let current = null

function message(root, key) {
  root.querySelector('[data-ifcvo-live]').replaceChildren(el('p', { class: 'ifcvo-muted', role: 'status' }, labelsOf(root)[key]))
}

/** Reads the model once per load and fills every rooms block on the page. */
export async function refresh(viewer = current) {
  if (!viewer || typeof viewer.getProductData !== 'function') return
  const roots = [...mounted].filter((r) => r.isConnected)
  if (!roots.length) return
  for (const r of roots) message(r, 'loading')
  try {
    const data = await viewer.getProductData({})
    if (!data || !data.elementCount) { for (const r of roots) message(r, 'waiting'); return }
    for (const r of roots) render(r, data, viewer)
  } catch (e) {
    for (const r of roots) message(r, 'error')
  }
}

export function attach(viewer) {
  if (!viewer || viewer === current) return
  current = viewer
  if (typeof viewer.on === 'function') viewer.on('model-loaded', () => refresh(viewer))
}

export function init() {
  for (const root of document.querySelectorAll('[data-ifcvo-rooms]')) {
    if (root.dataset.ifcvoRoomsReady) continue
    root.dataset.ifcvoRoomsReady = '1'
    const api = window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('rooms', root.querySelector('[data-ifcvo-live]'))) continue
    mounted.add(root)
    if (config(root).table) message(root, 'waiting')
  }
  const v = window.IFCVO && window.IFCVO.viewer
  if (v && v !== current) { attach(v); refresh(v) }
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

/** For tests. */
export function _reset() { mounted.clear(); current = null }

export function onViewer(e) {
  const v = (e.detail && e.detail.viewer) || (window.IFCVO && window.IFCVO.viewer)
  if (!v) return
  const fresh = v !== current
  attach(v)
  if (fresh || (e.type === 'ifcvo:loaded' && typeof v.on !== 'function')) refresh(v)
}

if (typeof document !== 'undefined') {
  document.addEventListener('ifcvo:viewer', onViewer)
  document.addEventListener('ifcvo:loaded', onViewer)
  document.addEventListener('shopify:section:load', init)
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
