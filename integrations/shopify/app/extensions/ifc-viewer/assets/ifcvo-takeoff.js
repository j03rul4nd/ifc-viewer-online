// "IFC takeoff / BOQ" block: once the page's viewer has a model, asks it for
// getProductData() (SDK; `takeoff`) and renders a bill of quantities grouped
// by type, material or storey, in metric or imperial, plus a steel table by
// profile. Optional unit prices (product metafield bim.unit_prices) give an
// indicative total in the shop's currency, never a quote. CSV export is made
// in the browser and is safe against spreadsheet formula injection. "Add to
// quote request" fills the theme's contact form and tells ifcvo-events.js.
// The Liquid block renders bim.boq as a plain table for crawlers / no-JS;
// it stays until the model gives a real table.
//
// Finds the viewer through window.IFCVO.viewer or the `ifcvo:viewer` /
// `ifcvo:loaded` DOM events (detail.viewer), never globals.

export const LABELS = {
  title: 'Bill of quantities', group: 'Item', type: 'Type', material: 'Material', storey: 'Storey', profile: 'Profile',
  count: 'Count', length: 'Length', area: 'Area', volume: 'Volume', weight: 'Weight', kgPerM: 'Weight per length',
  price: 'Indicative price', total: 'Total', steel: 'Steel by profile', groupBy: 'Group by',
  csv: 'Download CSV', quote: 'Add these quantities to a quote request', quoteDone: 'The contact form below has the quantities.',
  noForm: 'There is no contact form on this page.',
  indicative: 'Indicative total from unit prices, not a quote. Taxes, delivery and changes are not included.',
  waiting: 'Open the 3D model to list its quantities.', loading: 'Reading the quantities…', none: 'This model has no quantities to list.',
  error: 'The quantities could not be read.', missing: 'Some elements have no value for this quantity.',
  estimated: '≈ weight from volume × 7850 kg/m³', noProfile: '(no profile)', other: 'Other',
  truncated: 'Large model: only part of it was read, totals may be incomplete.',
}

const FT = 3.280839895
const FT2 = 10.7639104
const FT3 = 35.3146667
const LB = 2.20462262
const LB_PER_FT = 0.67196897

export const GROUPS = ['type', 'material', 'storey']
export const QTY = ['length', 'area', 'volume', 'weight']

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
    if (k in LABELS && typeof v === 'string' && v && !/^translation missing/i.test(v)) merged[k] = v
  }
  return merged
}

// ── Units ────────────────────────────────────────────────────────────────────

const UNIT = {
  metric: { length: ['m', 1], area: ['m²', 1], volume: ['m³', 1], weight: ['kg', 1], kgPerM: ['kg/m', 1] },
  imperial: { length: ['ft', FT], area: ['ft²', FT2], volume: ['ft³', FT3], weight: ['lb', LB], kgPerM: ['lb/ft', LB_PER_FT] },
}

export function unitOf(kind, system = 'metric') { return (UNIT[system] || UNIT.metric)[kind][0] }

/** An SI value in the chosen system, as display text; null for none. */
export function qtyText(si, kind, system = 'metric') {
  if (si === null || si === undefined || !Number.isFinite(si)) return null
  const [unit, f] = (UNIT[system] || UNIT.metric)[kind]
  const v = si * f
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2
  return `${v.toLocaleString('en-US', { maximumFractionDigits: digits })} ${unit}`
}

// ── Unit prices ──────────────────────────────────────────────────────────────

const PER = ['each', 'm', 'm2', 'm3', 'kg']

/**
 * bim.unit_prices: { key: price } or { key: { price, per } }, prices in the
 * shop currency per SI unit (per: each | m | m2 | m3 | kg; a bare number is
 * per each). Keys match, in this order, the row's profile, type, material
 * or IFC class (case-insensitive). Anything unreadable is dropped.
 */
export function parsePrices(v) {
  const src = typeof v === 'string' ? readJson(v) : v
  const out = {}
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out
  for (const [k, raw] of Object.entries(src)) {
    const key = String(k).trim().toLowerCase()
    if (!key) continue
    const o = typeof raw === 'number' ? { price: raw, per: 'each' } : raw && typeof raw === 'object' ? raw : null
    if (!o) continue
    const price = Number(o.price)
    const per = PER.includes(o.per) ? o.per : 'each'
    if (Number.isFinite(price) && price >= 0) out[key] = { price, per }
  }
  return out
}

const PER_QTY = { each: 'count', m: 'length', m2: 'area', m3: 'volume', kg: 'weight' }

/** Indicative price of one takeoff row, or null when no price matches or its quantity is unknown. */
export function rowPrice(row, prices) {
  if (!prices) return null
  for (const k of [row.profile, row.type, row.material, row.ifcClass]) {
    const p = k ? prices[String(k).trim().toLowerCase()] : null
    if (!p) continue
    const q = row[PER_QTY[p.per]]
    return q === null || q === undefined ? null : Math.round(q * p.price * 100) / 100
  }
  return null
}

export function moneyText(n, currency) {
  if (n === null || n === undefined) return null
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'EUR' }).format(n) } catch (e) { return n.toFixed(2) }
}

// ── Grouping ─────────────────────────────────────────────────────────────────

const pretty = (cls) => String(cls || '').replace(/^IFC/i, '').replace(/STANDARDCASE$/i, '').toLowerCase().replace(/^./, (c) => c.toUpperCase())

function groupName(row, by, labels) {
  if (row.key === '(other)') return labels.other
  if (by === 'material') return row.material || '—'
  if (by === 'storey') return row.storey || '—'
  const t = row.type && row.type !== '(untyped)' ? row.type : ''
  return [pretty(row.ifcClass), t, row.profile && row.profile !== t ? row.profile : ''].filter(Boolean).join(' · ')
}

const plus = (a, b) => (b === null || b === undefined ? a : (a ?? 0) + b)

/** Takeoff rows → displayed lines grouped by type / material / storey, with sums and price. */
export function groupRows(takeoff, by = 'type', prices = null, labels = LABELS) {
  const out = new Map()
  for (const r of (takeoff && takeoff.rows) || []) {
    const name = groupName(r, GROUPS.includes(by) ? by : 'type', labels)
    let g = out.get(name)
    if (!g) { g = { name, count: 0, length: null, area: null, volume: null, weight: null, price: null, missing: false, estimated: false }; out.set(name, g) }
    g.count += r.count
    for (const q of QTY) g[q] = plus(g[q], r[q])
    if (r.missing && (r.missing.length || r.missing.area || r.missing.volume || r.missing.weight)) g.missing = true
    if (r.sources && r.sources.weight && r.sources.weight.includes('volume')) g.estimated = true
    g.price = plus(g.price, rowPrice(r, prices))
  }
  return [...out.values()]
}

/** Sorts lines by a column; text for name, numbers otherwise (unknown last). */
export function sortRows(rows, col = 'name', dir = 'ascending') {
  const s = dir === 'descending' ? -1 : 1
  return [...rows].sort((a, b) => {
    if (col === 'name') return s * String(a.name).localeCompare(String(b.name))
    const x = a[col], y = b[col]
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1
    if (y === null || y === undefined) return -1
    return s * (x - y)
  })
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** One CSV cell: quoted, and never a formula when opened in a spreadsheet. */
export function csvCell(v) {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

const num = (n, f = 1) => (n === null || n === undefined ? '' : String(Math.round(n * f * 1000) / 1000))

/** The displayed lines (and steel table) as CSV, numbers unformatted in the chosen units. */
export function takeoffCsv(lines, steel, { system = 'metric', labels = LABELS, currency = '', priced = false } = {}) {
  const u = UNIT[system] || UNIT.metric
  const head = [labels.group, labels.count, ...QTY.map((q) => `${labels[q]} (${u[q][0]})`)]
  if (priced) head.push(`${labels.price} (${currency})`)
  const rows = [head]
  for (const l of lines) {
    const r = [l.name, l.count, ...QTY.map((q) => num(l[q], u[q][1]))]
    if (priced) r.push(l.price === null ? '' : l.price.toFixed(2))
    rows.push(r)
  }
  if (steel && steel.length) {
    rows.push([], [labels.steel], [labels.profile, labels.count, `${labels.length} (${u.length[0]})`, `${labels.kgPerM} (${u.kgPerM[0]})`, `${labels.weight} (${u.weight[0]})`])
    for (const s of steel) rows.push([s.profile || labels.noProfile, s.count, num(s.length, u.length[1]), num(s.kgPerM, u.kgPerM[1]), num(s.weight, u.weight[1])])
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Plain text for a quote request: one line per item. */
export function quoteText(lines, { system = 'metric', product = '', url = '' } = {}) {
  const out = []
  if (product) out.push(`Product: ${product}`)
  if (url) out.push(`Page: ${url}`)
  if (out.length) out.push('')
  out.push('Quantities from the model:')
  for (const l of lines) {
    const q = QTY.map((k) => qtyText(l[k], k, system)).filter(Boolean)
    out.push(`- ${l.count} x ${l.name}${q.length ? ' (' + q.join(', ') + ')' : ''}`)
  }
  return out.join('\n')
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

export function config(root) {
  const d = root.dataset
  return {
    system: d.units === 'imperial' ? 'imperial' : 'metric',
    group: GROUPS.includes(d.group) ? d.group : 'type',
    steel: d.showSteel !== 'false',
    csv: d.csv !== 'false',
    quote: d.quote !== 'false',
    prices: parsePrices(d.prices),
    currency: d.currency || '',
    product: d.product || '',
    labels: labelsOf(root),
  }
}

const state = new WeakMap()

function saveFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = el('a', { href: url, download: name, style: 'display:none' })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function signal(type, detail) {
  const root = document.querySelector('[data-ifcvo-viewer]')
  if (root) root.dispatchEvent(new CustomEvent(type, { detail }))
}

/** Fills the contact form with the quantities; tells the quote/events modules. False when there is no form. */
export function sendToQuote(root, lines, cfg) {
  const text = quoteText(lines, { system: cfg.system, product: cfg.product, url: location.href.split('#')[0] })
  document.dispatchEvent(new CustomEvent('ifcvo:takeoff-quote', { detail: { lines, text, units: cfg.system } }))
  signal('ifcvo:quote', { source: 'takeoff' })
  const form = document.querySelector(root.dataset.form || 'form[action*="/contact"]')
  const body = form && form.querySelector('[name="contact[body]"]')
  if (!body) return false
  body.value = text
  body.dispatchEvent(new Event('input', { bubbles: true }))
  try { body.scrollIntoView({ block: 'center' }) } catch (e) { /* old browser */ }
  body.focus()
  return true
}

const COLS = ['name', 'count', ...QTY]

function boqTable(root, data, cfg) {
  const st = state.get(root) || { group: cfg.group, col: 'name', dir: 'ascending' }
  state.set(root, st)
  const L = cfg.labels
  const priced = Object.keys(cfg.prices).length > 0
  const lines = sortRows(groupRows(data.takeoff, st.group, priced ? cfg.prices : null, L), st.col, st.dir)
  const cols = priced ? [...COLS, 'price'] : COLS
  const head = (c) => {
    const label = c === 'name' ? L[st.group] : c === 'count' || c === 'price' ? L[c] : `${L[c]} (${unitOf(c, cfg.system)})`
    const sorted = st.col === c
    return el('th', { scope: 'col', 'aria-sort': sorted ? st.dir : 'none' },
      el('button', { type: 'button', class: 'ifcvo-sort', 'data-col': c, onclick: () => {
        st.dir = sorted && st.dir === 'ascending' ? 'descending' : 'ascending'
        st.col = c
        render(root, data)
        const b = root.querySelector(`.ifcvo-sort[data-col="${c}"]`)
        if (b) b.focus()
      } }, label))
  }
  const cell = (l, c) => {
    if (c === 'name') return el('th', { scope: 'row' }, l.name)
    if (c === 'count') return el('td', {}, String(l.count))
    if (c === 'price') return el('td', {}, moneyText(l.price, cfg.currency) || '—')
    const t = qtyText(l[c], c, cfg.system)
    const est = c === 'weight' && l.estimated
    return el('td', est ? { title: L.estimated } : {}, t ? (est ? '≈ ' + t : t) : '—')
  }
  const total = { name: L.total, count: 0, length: null, area: null, volume: null, weight: null, price: null }
  for (const l of lines) { total.count += l.count; for (const q of [...QTY, 'price']) total[q] = plus(total[q], l[q]) }
  const table = el('table', { class: 'ifcvo-specs ifcvo-takeoff', 'data-group': st.group },
    el('caption', {}, L.title),
    el('thead', {}, el('tr', {}, ...cols.map(head))),
    el('tbody', {}, ...lines.map((l) => el('tr', {}, ...cols.map((c) => cell(l, c))))),
    el('tfoot', {}, el('tr', {}, ...cols.map((c) => cell(total, c)))))
  return { table, lines, priced, total }
}

function steelTable(steel, cfg) {
  const L = cfg.labels
  return el('table', { class: 'ifcvo-specs ifcvo-takeoff-steel' },
    el('caption', {}, L.steel),
    el('thead', {}, el('tr', {}, ...[L.profile, L.count, `${L.length} (${unitOf('length', cfg.system)})`, `${L.kgPerM} (${unitOf('kgPerM', cfg.system)})`, `${L.weight} (${unitOf('weight', cfg.system)})`].map((h) => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, ...steel.map((s) => el('tr', {},
      el('th', { scope: 'row' }, s.profile || L.noProfile),
      el('td', {}, String(s.count)),
      el('td', {}, qtyText(s.length, 'length', cfg.system) || '—'),
      el('td', {}, qtyText(s.kgPerM, 'kgPerM', cfg.system) || '—'),
      el('td', s.estimated ? { title: L.estimated } : {}, s.weight ? (s.estimated ? '≈ ' : '') + qtyText(s.weight, 'weight', cfg.system) : '—')))))
}

/** Draws the BOQ for one block; returns the displayed lines. */
export function render(root, data) {
  const cfg = config(root)
  const L = cfg.labels
  const body = root.querySelector('[data-ifcvo-live]')
  const t = data && data.takeoff
  if (!t || !t.rows || !t.rows.length) { body.replaceChildren(el('p', { class: 'ifcvo-muted' }, L.none)); return [] }
  // A real table replaces the merchant's static one.
  const fallback = root.querySelector('[data-ifcvo-boq-static]')
  if (fallback) fallback.hidden = true
  const st = state.get(root) || { group: cfg.group, col: 'name', dir: 'ascending' }
  state.set(root, st)
  const select = el('select', { class: 'ifcvo-takeoff-group', onchange: (e) => { st.group = e.target.value; render(root, data) } },
    ...GROUPS.map((g) => { const o = el('option', { value: g }, L[g]); if (g === st.group) o.selected = true; return o }))
  const id = 'ifcvo-takeoff-group-' + (root.dataset.blockId || Math.random().toString(36).slice(2))
  select.id = id
  const { table, lines, priced, total } = boqTable(root, data, cfg)
  const nodes = [el('p', { class: 'ifcvo-takeoff-tools' }, el('label', { for: id }, L.groupBy + ' '), select), table]
  if (priced && total.price !== null) nodes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-indicative': '' }, el('strong', {}, `${L.total}: ${moneyText(total.price, cfg.currency)}`), ' — ', L.indicative))
  if (lines.some((l) => l.missing)) nodes.push(el('p', { class: 'ifcvo-muted' }, L.missing))
  if (cfg.steel && t.steel && t.steel.length) nodes.push(steelTable(t.steel, cfg))
  if (t.truncated) nodes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-truncated': '' }, L.truncated))
  const status = el('p', { class: 'ifcvo-muted', role: 'status', 'aria-live': 'polite' })
  const actions = []
  if (cfg.csv) actions.push(el('button', { type: 'button', class: 'ifcvo-btn', 'data-ifcvo-csv': '', onclick: () => {
    saveFile(takeoffCsv(lines, cfg.steel ? t.steel : [], { system: cfg.system, labels: L, currency: cfg.currency, priced }), 'quantities.csv')
    signal('ifcvo:download', { file: 'quantities.csv' })
  } }, L.csv))
  if (cfg.quote) actions.push(el('button', { type: 'button', class: 'ifcvo-btn', 'data-ifcvo-takeoff-quote': '', onclick: () => {
    status.textContent = sendToQuote(root, lines, cfg) ? L.quoteDone : L.noForm
  } }, L.quote))
  if (actions.length) nodes.push(el('p', { class: 'ifcvo-takeoff-actions' }, ...actions), status)
  body.replaceChildren(...nodes)
  return lines
}

const mounted = new Set()
let current = null

function message(root, key) {
  root.querySelector('[data-ifcvo-live]').replaceChildren(el('p', { class: 'ifcvo-muted', role: 'status' }, labelsOf(root)[key]))
}

export async function refresh(viewer = current) {
  if (!viewer || typeof viewer.getProductData !== 'function') return
  const roots = [...mounted].filter((r) => r.isConnected)
  if (!roots.length) return
  for (const r of roots) message(r, 'loading')
  try {
    const data = await viewer.getProductData({})
    if (!data || !data.elementCount) { for (const r of roots) message(r, 'waiting'); return }
    for (const r of roots) render(r, data)
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
  for (const root of document.querySelectorAll('[data-ifcvo-takeoff]')) {
    if (root.dataset.ifcvoTakeoffReady) continue
    root.dataset.ifcvoTakeoffReady = '1'
    const api = window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('takeoff', root.querySelector('[data-ifcvo-live]'))) continue
    mounted.add(root)
    message(root, 'waiting')
  }
  const v = window.IFCVO && window.IFCVO.viewer
  if (v && v !== current) { attach(v); refresh(v) }
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

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
