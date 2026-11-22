// "IFC sun & lot fit" block, for house plans and prefab homes.
//
// Sun study: the buyer types a latitude / longitude, or presses "Use my
// location" (the press is the consent; the position stays in this page and
// only goes to the viewer on it), or the merchant's default site is used. A
// date (solstice / equinox presets) and a time slider drive the page's viewer
// through the SDK's setSolar(). The SDK cannot turn the model, so the 3D sun
// uses the model's own north; the orientation control turns the house on the
// lot drawing below.
//
// Lot fit: lot width x depth and front / side / rear setbacks (m or ft) are
// compared with the model footprint from getProductData().dimensions, turned
// by the orientation. Pure arithmetic in the browser; nothing is sent.
//
// Finds the viewer through window.IFCVO.viewer or the `ifcvo:viewer` /
// `ifcvo:loaded` DOM events (detail.viewer), never globals.

export const LABELS = {
  title: 'Sun and lot fit',
  sun: 'Sun study', lat: 'Latitude', lon: 'Longitude', locate: 'Use my location',
  locating: 'Finding your location…', located: 'Location set from this device. It stays in this page.',
  noLocate: 'Your location is not available. Type a latitude and longitude.',
  date: 'Date', time: 'Time', mar: 'March equinox', jun: 'June solstice', sep: 'September equinox', dec: 'December solstice',
  sunOn: 'Shadows at {date} {time}, site time.', needSite: 'Type the latitude and longitude of the lot to see the sun.',
  sunError: 'The sun study could not start.',
  lot: 'Does it fit my lot?', units: 'Units', lotWidth: 'Lot width', lotDepth: 'Lot depth',
  front: 'Front setback', side: 'Side setback (each side)', rear: 'Rear setback', orientation: 'House rotation',
  fits: 'It fits.', noFit: 'It does not fit.', marginSide: 'Spare on each side: {v}', marginDepth: 'Spare in depth: {v}',
  footprint: 'House footprint: {w} × {d}', buildable: 'Buildable area: {w} × {d}',
  noFootprint: 'The model has no footprint to compare.', badLot: 'Type a lot bigger than its setbacks.',
  waiting: 'Open the 3D model to compare its footprint.', diagram: 'Lot diagram',
  diagramDesc: 'The lot, its setback lines and the house footprint seen from above. The front of the lot is at the bottom.',
  rotateNote: 'The rotation turns the house on the drawing; the 3D model keeps its own north.',
  negative: 'Values must be positive.', swap: 'Turn 90°', turnedFits: 'It fits if the house is turned 90° (to {deg}).',
}

export const FT = 0.3048
export const PRESETS = [['mar', '03-20'], ['jun', '06-21'], ['sep', '09-22'], ['dec', '12-21']]

function readJson(text) {
  try { const v = JSON.parse(text || 'null'); return v && typeof v === 'object' ? v : null } catch (e) { return null }
}

export function parseLabels(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k && v) out[k] = v }
  }
  return out
}

function labelsFor(all, locale) {
  if (!all) return {}
  const lang = String(locale || '').toLowerCase()
  return { ...(all.en || {}), ...(all[lang.split('-')[0]] || {}), ...(all[lang] || {}) }
}

/** Defaults ← theme locale (Liquid `t`) ← shop ifcvo.labels ← block textarea. Only known keys. */
export function labelsOf(root) {
  const merged = { ...LABELS }
  const layers = [readJson(root.dataset.labels), labelsFor(readJson(root.dataset.ifcvoLabels), root.dataset.locale), parseLabels(root.dataset.labelsOverride)]
  for (const layer of layers) for (const [k, v] of Object.entries(layer || {})) {
    if (k in LABELS && typeof v === 'string' && v && !/^translation missing/i.test(v)) merged[k] = v
  }
  return merged
}

// ── Pure maths ───────────────────────────────────────────────────────────────

/** A typed length in metres; null for anything not a finite number ≥ 0. */
export function toMetres(v, unit = 'm') {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return unit === 'ft' ? n * FT : n
}

export function fromMetres(m, unit = 'm') { return unit === 'ft' ? m / FT : m }

export function lengthText(m, unit = 'm') {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—'
  return `${(Math.round(fromMetres(m, unit) * 100) / 100).toLocaleString('en-US')} ${unit}`
}

/** Degrees to 0..360. */
export function normDeg(deg) { const n = Number(deg); return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0 }

/** Axis-aligned box of a w x d rectangle turned by deg. */
export function rotatedBox(w, d, deg = 0) {
  const r = (normDeg(deg) * Math.PI) / 180
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
  const round = (x) => Math.round(x * 1e9) / 1e9
  return { w: round(w * c + d * s), d: round(w * s + d * c) }
}

/** Valid lat / lon pair or null. */
export function parseSite(lat, lon) {
  if (lat === '' || lon === '' || lat == null || lon == null) return null
  const a = Number(lat), o = Number(lon)
  if (!Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) return null
  return { lat: a, lon: o }
}

/**
 * Lot in metres { width, depth, front, side, rear } → buildable rectangle;
 * null when a value is missing or the setbacks leave nothing.
 */
export function buildable(lot) {
  if (!lot) return null
  const { width, depth, front = 0, side = 0, rear = 0 } = lot
  if (![width, depth, front, side, rear].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return null
  const w = width - 2 * side, d = depth - front - rear
  return w > 0 && d > 0 ? { w, d } : null
}

/**
 * Does a w x d footprint turned by deg fit in the lot's buildable area?
 * Margins: spare on each side (house centred), spare in depth (total).
 */
export function fitLot(footprint, lot, deg = 0) {
  const area = buildable(lot)
  if (!area || !footprint || !(footprint.w > 0) || !(footprint.d > 0)) return null
  const box = rotatedBox(footprint.w, footprint.d, deg)
  const eps = 1e-9
  const marginSide = (area.w - box.w) / 2
  const marginDepth = area.d - box.d
  return { fits: marginSide >= -eps && marginDepth >= -eps, marginSide, marginDepth, box, area }
}

/** Lot fields typed below zero (names), from raw input text. */
export function negatives(raw) {
  return Object.entries(raw).filter(([, v]) => v !== '' && v != null && Number(v) < 0).map(([k]) => k)
}

/** Fit at deg; when that fails, also tries deg + 90 and says so (`turned`). */
export function bestFit(footprint, lot, deg = 0) {
  const fit = fitLot(footprint, lot, deg)
  if (!fit || fit.fits) return fit && { ...fit, deg: normDeg(deg), turned: false }
  const alt = fitLot(footprint, lot, deg + 90)
  return alt && alt.fits ? { ...alt, deg: normDeg(deg + 90), turned: true } : { ...fit, deg: normDeg(deg), turned: false }
}

/** Corner points (metres, y down = towards the rear) of the footprint centred in the buildable area. */
export function footprintPoints(footprint, lot, deg = 0) {
  const cx = (lot.side || 0) + (lot.width - 2 * (lot.side || 0)) / 2
  const cy = (lot.rear || 0) + (lot.depth - (lot.front || 0) - (lot.rear || 0)) / 2
  const r = (normDeg(deg) * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  const hw = footprint.w / 2, hd = footprint.d / 2
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c])
}

const SVGNS = 'http://www.w3.org/2000/svg'

function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(SVGNS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
  if (text != null) n.textContent = text
  return n
}

let uid = 0

/** Top view: lot (front at the bottom), dashed setback lines, house footprint. */
export function diagram(footprint, lot, deg, fit, L) {
  const id = 'ifcvo-sunlot-' + ++uid
  const pad = Math.max(lot.width, lot.depth) * 0.05
  const svg = svgEl('svg', { viewBox: `${-pad} ${-pad} ${lot.width + 2 * pad} ${lot.depth + 2 * pad}`, role: 'img', 'aria-labelledby': `${id}-t ${id}-d`, class: 'ifcvo-sunlot-svg', 'data-fits': fit ? String(fit.fits) : 'unknown' })
  svg.append(svgEl('title', { id: `${id}-t` }, L.diagram), svgEl('desc', { id: `${id}-d` }, L.diagramDesc + (fit ? ' ' + (fit.fits ? L.fits : L.noFit) : '')))
  const sw = Math.max(lot.width, lot.depth) / 200
  svg.append(svgEl('rect', { x: 0, y: 0, width: lot.width, height: lot.depth, class: 'ifcvo-sunlot-lot', fill: 'none', stroke: 'currentColor', 'stroke-width': sw * 2 }))
  const area = buildable(lot)
  if (area) svg.append(svgEl('rect', { x: lot.side, y: lot.rear, width: area.w, height: area.d, class: 'ifcvo-sunlot-setback', fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-dasharray': `${sw * 4} ${sw * 3}` }))
  if (footprint && area) {
    const pts = footprintPoints(footprint, lot, deg).map((p) => p.map((v) => Math.round(v * 1000) / 1000).join(',')).join(' ')
    svg.append(svgEl('polygon', { points: pts, class: 'ifcvo-sunlot-house', 'fill-opacity': 0.35, fill: fit && !fit.fits ? '#c0392b' : 'var(--ifcvo-accent, #2563eb)', stroke: 'currentColor', 'stroke-width': sw }))
  }
  return svg
}

// ── DOM ──────────────────────────────────────────────────────────────────────

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

const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (k in o ? o[k] : ''))
const timeText = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function config(root) {
  const d = root.dataset
  return {
    unit: d.units === 'ft' ? 'ft' : 'm',
    showSun: d.sun !== 'false',
    showLot: d.lot !== 'false',
    site: parseSite(d.lat, d.lon),
    date: /^\d\d-\d\d$/.test(d.date || '') ? d.date : '06-21',
    lot: { width: Number(d.lotWidth) || 0, depth: Number(d.lotDepth) || 0, front: Number(d.front) || 0, side: Number(d.side) || 0, rear: Number(d.rear) || 0 },
    labels: labelsOf(root),
  }
}

const mounted = new Set()
const ui = new WeakMap()
let current = null
let footprint = null

function field(id, label, attrs) {
  return el('p', { class: 'ifcvo-sunlot-field' }, el('label', { for: id }, label), ' ', el('input', { id, ...attrs }))
}

/** Reads the lot form in metres. */
function lotOf(s) {
  const u = s.unit.value
  const v = (k) => toMetres(s[k].value, u)
  return { width: v('width'), depth: v('depth'), front: v('front') ?? 0, side: v('side') ?? 0, rear: v('rear') ?? 0 }
}

export function renderLot(root) {
  const s = ui.get(root)
  if (!s || !s.out) return null
  const L = s.L
  const u = s.unit.value
  const deg = normDeg(s.rot.value)
  const lot = lotOf(s)
  const raw = Object.fromEntries(['width', 'depth', 'front', 'side', 'rear'].map((k) => [k, s[k].value]))
  if (negatives(raw).length) { s.out.replaceChildren(el('p', { class: 'ifcvo-muted', 'data-ifcvo-negative': '' }, L.negative)); return null }
  if (!footprint) { s.out.replaceChildren(el('p', { class: 'ifcvo-muted' }, current ? L.noFootprint : L.waiting)); return null }
  const fit = bestFit(footprint, lot, deg)
  if (!fit) { s.out.replaceChildren(el('p', { class: 'ifcvo-muted' }, L.badLot)); return null }
  s.out.replaceChildren(
    el('p', { class: 'ifcvo-sunlot-verdict', 'data-fits': String(fit.fits) }, el('strong', {}, fit.turned ? fmt(L.turnedFits, { deg: fit.deg + '°' }) : fit.fits ? L.fits : L.noFit)),
    el('ul', { class: 'ifcvo-sunlot-figures' },
      el('li', {}, fmt(L.footprint, { w: lengthText(footprint.w, u), d: lengthText(footprint.d, u) })),
      el('li', {}, fmt(L.buildable, { w: lengthText(fit.area.w, u), d: lengthText(fit.area.d, u) })),
      el('li', {}, fmt(L.marginSide, { v: lengthText(fit.marginSide, u) })),
      el('li', {}, fmt(L.marginDepth, { v: lengthText(fit.marginDepth, u) }))),
    diagram(footprint, lot, fit.deg, fit, L))
  return fit
}

let sunTimer = null

export async function applySun(root) {
  const s = ui.get(root)
  if (!s || !s.sunStatus) return
  const L = s.L
  const site = parseSite(s.lat.value, s.lon.value)
  if (!current || typeof current.setSolar !== 'function') return
  const date = s.date.value, time = timeText(Number(s.time.value))
  const opts = { active: true, date, time }
  if (site) opts.location = site
  try {
    await current.setSolar(opts)
    s.sunStatus.textContent = fmt(L.sunOn, { date, time })
  } catch (e) {
    s.sunStatus.textContent = site ? L.sunError : L.needSite
  }
}

function scheduleSun(root) {
  clearTimeout(sunTimer)
  sunTimer = setTimeout(() => applySun(root), 300)
}

export function locate(root, geo = typeof navigator !== 'undefined' ? navigator.geolocation : null) {
  const s = ui.get(root)
  if (!s) return
  const L = s.L
  if (!geo) { s.sunStatus.textContent = L.noLocate; return }
  s.sunStatus.textContent = L.locating
  geo.getCurrentPosition((p) => {
    s.lat.value = String(Math.round(p.coords.latitude * 1e4) / 1e4)
    s.lon.value = String(Math.round(p.coords.longitude * 1e4) / 1e4)
    s.sunStatus.textContent = L.located
    applySun(root)
  }, () => { s.sunStatus.textContent = L.noLocate }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 })
}

export function build(root) {
  const cfg = config(root)
  const L = cfg.labels
  const bid = 'ifcvo-sl-' + (root.dataset.blockId || Math.random().toString(36).slice(2))
  const s = { L, unit: null }
  const body = root.querySelector('[data-ifcvo-live]')
  const nodes = []
  if (cfg.showSun) {
    s.lat = el('input', { id: bid + '-lat', type: 'number', step: 'any', min: '-90', max: '90', inputmode: 'decimal' })
    s.lon = el('input', { id: bid + '-lon', type: 'number', step: 'any', min: '-180', max: '180', inputmode: 'decimal' })
    if (cfg.site) { s.lat.value = String(cfg.site.lat); s.lon.value = String(cfg.site.lon) }
    s.date = el('input', { id: bid + '-date', type: 'text', value: cfg.date, pattern: '\\d\\d-\\d\\d', placeholder: 'MM-DD', size: '6' })
    s.time = el('input', { id: bid + '-time', type: 'range', min: '0', max: '1425', step: '15', value: '720' })
    const tOut = el('output', { for: bid + '-time' }, '12:00')
    s.time.setAttribute('aria-valuetext', '12:00')
    s.sunStatus = el('p', { class: 'ifcvo-muted', role: 'status', 'aria-live': 'polite' })
    const onSun = () => { const t = timeText(Number(s.time.value)); tOut.textContent = t; s.time.setAttribute('aria-valuetext', t); scheduleSun(root) }
    for (const i of [s.lat, s.lon, s.date]) i.addEventListener('change', onSun)
    s.time.addEventListener('input', onSun)
    const presets = el('p', { class: 'ifcvo-sunlot-presets', role: 'group', 'aria-label': L.date },
      ...PRESETS.map(([k, d]) => el('button', { type: 'button', class: 'ifcvo-btn', 'data-date': d, onclick: () => { s.date.value = d; onSun() } }, L[k])))
    nodes.push(el('fieldset', { class: 'ifcvo-sunlot-sun' }, el('legend', {}, L.sun),
      el('p', { class: 'ifcvo-sunlot-field' }, el('label', { for: s.lat.id }, L.lat), ' ', s.lat, ' ', el('label', { for: s.lon.id }, L.lon), ' ', s.lon, ' ',
        el('button', { type: 'button', class: 'ifcvo-btn', 'data-ifcvo-locate': '', onclick: () => locate(root) }, L.locate)),
      el('p', { class: 'ifcvo-sunlot-field' }, el('label', { for: s.date.id }, L.date), ' ', s.date), presets,
      el('p', { class: 'ifcvo-sunlot-field' }, el('label', { for: s.time.id }, L.time), ' ', s.time, ' ', tOut), s.sunStatus))
  }
  if (cfg.showLot) {
    const u = cfg.unit
    s.unit = el('select', { id: bid + '-unit' }, el('option', { value: 'm' }, 'm'), el('option', { value: 'ft' }, 'ft'))
    s.unit.value = u
    const num = (k, v) => el('input', { id: `${bid}-${k}`, type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: v ? String(Math.round(fromMetres(v, u) * 100) / 100) : '' })
    s.width = num('width', cfg.lot.width); s.depth = num('depth', cfg.lot.depth)
    s.front = num('front', cfg.lot.front); s.side = num('side', cfg.lot.side); s.rear = num('rear', cfg.lot.rear)
    s.rot = el('input', { id: bid + '-rot', type: 'range', min: '0', max: '359', step: '1', value: '0', 'aria-valuetext': '0°' })
    const rOut = el('output', { for: bid + '-rot' }, '0°')
    s.out = el('div', { class: 'ifcvo-sunlot-result', 'aria-live': 'polite' })
    const onLot = () => { const t = normDeg(s.rot.value) + '°'; rOut.textContent = t; s.rot.setAttribute('aria-valuetext', t); renderLot(root) }
    let prevUnit = u
    s.unit.addEventListener('change', () => {
      // Keep the same real lengths when the unit changes.
      for (const k of ['width', 'depth', 'front', 'side', 'rear']) {
        const m = toMetres(s[k].value, prevUnit)
        if (m !== null) s[k].value = String(Math.round(fromMetres(m, s.unit.value) * 100) / 100)
      }
      prevUnit = s.unit.value
      onLot()
    })
    for (const k of ['width', 'depth', 'front', 'side', 'rear']) s[k].addEventListener('input', onLot)
    s.rot.addEventListener('input', onLot)
    nodes.push(el('fieldset', { class: 'ifcvo-sunlot-lot' }, el('legend', {}, L.lot),
      el('p', { class: 'ifcvo-sunlot-field' }, el('label', { for: s.unit.id }, L.units), ' ', s.unit),
      ...[['width', L.lotWidth], ['depth', L.lotDepth], ['front', L.front], ['side', L.side], ['rear', L.rear]].map(([k, l]) =>
        el('p', { class: 'ifcvo-sunlot-field' }, el('label', { for: s[k].id }, l), ' ', s[k])),
      el('p', { class: 'ifcvo-sunlot-field' }, el('label', { for: s.rot.id }, L.orientation), ' ', s.rot, ' ', rOut, ' ',
        el('button', { type: 'button', class: 'ifcvo-btn', 'data-ifcvo-swap': '', onclick: () => { s.rot.value = String(normDeg(Number(s.rot.value) + 90)); onLot() } }, L.swap)),
      el('p', { class: 'ifcvo-muted' }, L.rotateNote), s.out))
  }
  body.replaceChildren(...nodes)
  ui.set(root, s)
  renderLot(root)
  return s
}

/** The model footprint from getProductData().dimensions, or null. */
export function footprintOf(data) {
  const dm = data && data.dimensions
  return dm && dm.w > 0 && dm.d > 0 ? { w: dm.w, d: dm.d } : null
}

export async function refresh(viewer = current) {
  if (!viewer || typeof viewer.getProductData !== 'function') return
  const roots = [...mounted].filter((r) => r.isConnected)
  if (!roots.length) return
  try {
    const data = await viewer.getProductData({})
    footprint = data && data.elementCount ? footprintOf(data) : null
  } catch (e) { footprint = null }
  for (const r of roots) { renderLot(r); const s = ui.get(r); if (s && s.sunStatus && parseSite(s.lat.value, s.lon.value)) applySun(r) }
}

export function attach(viewer) {
  if (!viewer || viewer === current) return
  current = viewer
  if (typeof viewer.on === 'function') viewer.on('model-loaded', () => refresh(viewer))
}

export function init() {
  for (const root of document.querySelectorAll('[data-ifcvo-sunlot]')) {
    if (root.dataset.ifcvoSunlotReady) continue
    root.dataset.ifcvoSunlotReady = '1'
    const api = window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('sunlot', root.querySelector('[data-ifcvo-live]'))) continue
    mounted.add(root)
    build(root)
  }
  const v = window.IFCVO && window.IFCVO.viewer
  if (v && v !== current) { attach(v); refresh(v) }
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

export function _reset() { mounted.clear(); current = null; footprint = null; clearTimeout(sunTimer) }

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
