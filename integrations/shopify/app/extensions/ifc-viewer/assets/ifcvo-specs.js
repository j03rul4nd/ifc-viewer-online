// "IFC specs & quantities" block: once the page's viewer has a model, asks it
// for getProductData() (SDK) and renders light-DOM tables that inherit the
// theme's typography, plus a CSV generated in the browser. The metafield table
// rendered by Liquid stays: it is the crawlable / no-JS copy, and its values
// override the model's properties of the same name.
//
// Finds the viewer through the public runtime (window.IFCVO.viewer) or the
// `ifcvo:loaded` / `ifcvo:viewer` DOM events (detail.viewer), never globals.

export const COLUMNS = ['class', 'type', 'count', 'dimensions', 'length', 'area', 'volume', 'weight', 'materials', 'properties']
export const GROUPS = ['dimensions', 'types', 'classes', 'materials', 'totals']

export const LABELS = {
  class: 'IFC class', type: 'Type', count: 'Count', length: 'Length', area: 'Area', volume: 'Volume',
  weight: 'Weight', materials: 'Materials', properties: 'Properties', total: 'Total', csv: 'Download CSV',
  dimensions: 'Dimensions', source: 'Source', manufacturer: 'manufacturer', model: 'model', calculated: 'calculated',
  types: 'By type', classes: 'By IFC class', totals: 'Totals', name: 'Material',
  waiting: 'Open the 3D model to read quantities from it.', loading: 'Reading the model…',
  truncated: 'Large model: only the first elements were read.', error: 'The model data could not be read.',
}

const UNITS = {
  metric: { length: ['m', 1], area: ['m²', 1], volume: ['m³', 1], weight: ['kg', 1] },
  imperial: { length: ['ft', 3.280839895], area: ['ft²', 10.7639104], volume: ['ft³', 35.3146667], weight: ['lb', 2.20462262] },
}
const QTY = ['length', 'area', 'volume', 'weight']

const norm = (s) => String(s).toLowerCase().replace(/[\s_.-]+/g, '')

/** "a, b,c" → known items only, in the given order. */
export function list(text, allowed) {
  const out = String(text || '').split(',').map((x) => x.trim()).filter((x) => allowed.includes(x))
  return [...new Set(out)]
}

/** key=value lines → object (same format as the viewer block's overrides). */
export function parseLabels(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k && v) out[k] = v }
  }
  return out
}

/** A quantity in SI → [display number, unit] in the chosen system. */
export function convert(value, kind, system = 'metric') {
  const [unit, f] = (UNITS[system] || UNITS.metric)[kind]
  return value === null || value === undefined ? [null, unit] : [Math.round(value * f * 100) / 100, unit]
}

export function className(cls) {
  const s = String(cls || '').replace(/^IFC/i, '').replace(/STANDARDCASE$/i, '').toLowerCase()
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

/**
 * "1,200" / "1.200,5" / "12,5" → number. Both marks: the last one is the
 * decimal. A lone ',' or '.' followed by exactly 3 digits (several of them, or
 * "1,200") is a thousands separator; otherwise a lone ',' is a decimal comma.
 */
export function parseNumber(raw) {
  let s = String(raw)
  const dot = s.lastIndexOf('.'); const comma = s.lastIndexOf(',')
  if (dot >= 0 && comma >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (comma >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Merchant text → metres. Accepts "1200 x 600 x 2100 mm", "1,2×0,6×2,1 m",
 * "W 1200 x D 600 x H 2100 mm", "47in x 83in". Without any unit: every value
 * above 50 → millimetres (no product is 50 m wide), every value up to 10 →
 * metres; anything in between is ambiguous and the raw text is shown as is
 * (`{ raw }`), never a guessed number.
 */
export function parseDimensions(text) {
  const t = String(text || '').trim()
  const unitOf = (u) => ({ mm: 0.001, cm: 0.01, m: 1, in: 0.0254, '"': 0.0254, ft: 0.3048, "'": 0.3048 })[String(u || '').toLowerCase()]
  const tail = /\d\s*(mm|cm|m|in|ft|"|')\s*$/i.exec(t)
  const parts = t.split(/\s*[x×*]\s*(?=[a-z]{0,6}\.?\s*[:=]?\s*\d)/i)
  if (parts.length < 2 || parts.length > 3) return null
  const nums = []
  for (const p of parts) {
    const m = /^(?:[a-zäöü]{1,6}\.?\s*[:=]?\s*)?(\d[\d.,]*)\s*(mm|cm|m|in|ft|"|')?$/i.exec(p.trim())
    if (!m) return null
    const unit = m[2] || (tail && tail[1]) || null
    // "2.100 mm": nobody writes millimetres to three decimals — a thousands dot.
    const n = unit && unit.toLowerCase() === 'mm' && /^\d{1,3}\.\d{3}$/.test(m[1]) ? Number(m[1].replace('.', '')) : parseNumber(m[1])
    if (n === null) return null
    nums.push([n, unit])
  }
  let fallback = null
  if (nums.some(([, u]) => !u)) {
    const bare = nums.map(([n]) => n)
    if (bare.every((n) => n > 50)) fallback = 'mm'
    else if (bare.every((n) => n <= 10)) fallback = 'm'
    else return { w: null, d: null, h: null, unit: 'm', source: 'metafield', raw: t }
  }
  const out = nums.map(([n, u]) => Math.round(n * unitOf(u || fallback) * 1e6) / 1e6)
  return { w: out[0], d: out.length === 3 ? out[1] : null, h: out[out.length - 1], unit: 'm', source: 'metafield', ...(fallback ? { assumed: fallback } : {}) }
}

/** Metafield `dimensions` wins over the model. */
export function resolveDimensions(data, overrides = {}) {
  return (overrides.dimensions && parseDimensions(overrides.dimensions)) || (data && data.dimensions) || null
}

/** W × D × H in the chosen units; a missing side is a dash; ambiguous merchant text as written. */
export function dimText(dim, system = 'metric') {
  if (!dim) return null
  if (dim.raw) return dim.raw
  const imperial = system === 'imperial'
  const f = imperial ? 39.3700787 : 1000
  const u = imperial ? 'in' : 'mm'
  const n = (v) => (v === null || v === undefined ? '—' : String(imperial ? Math.round(v * f * 10) / 10 : Math.round(v * f)))
  return `${n(dim.w)} × ${n(dim.d)} × ${n(dim.h)} ${u}`
}

const SOURCE = { metafield: 'manufacturer', ifc: 'model', bbox: 'calculated' }

/** Metafield rows (key → value) as rendered by Liquid. */
export function readOverrides(root) {
  const out = {}
  for (const tr of root.querySelectorAll('[data-ifcvo-static] tr[data-key]')) {
    const td = tr.querySelector('td')
    if (td) out[norm(tr.dataset.key)] = td.textContent.trim()
  }
  return out
}

function propsText(props, overrides) {
  return Object.entries(props || {}).map(([k, v]) => {
    const name = k.includes('.') ? k.slice(k.indexOf('.') + 1) : k
    const o = overrides[norm(name)] ?? overrides[norm(k)]
    return `${name}: ${o ?? v}`
  }).join('; ')
}

/**
 * ProductData → tables of plain strings/numbers: [{ group, head, rows }].
 * Pure, so the CSV and the DOM come from one source.
 */
export function tables(data, cfg = {}) {
  const system = cfg.units === 'imperial' ? 'imperial' : 'metric'
  const labels = { ...LABELS, ...(cfg.labels || {}) }
  const cols = cfg.columns && cfg.columns.length ? cfg.columns : COLUMNS
  const groups = cfg.groups && cfg.groups.length ? cfg.groups : GROUPS
  const overrides = cfg.overrides || {}
  const head = (c) => (QTY.includes(c) ? `${labels[c]} (${convert(0, c, system)[1]})` : labels[c])
  const qty = (row, c) => convert(row[c], c, system)[0]
  const out = []
  for (const g of groups) {
    if (g === 'dimensions') {
      const dim = resolveDimensions(data, overrides)
      if (dim) out.push({ group: g, title: labels.dimensions, head: [labels.dimensions, labels.source], rows: [[dimText(dim, system), labels[SOURCE[dim.source]]]] })
    } else if (g === 'types') {
      out.push({ group: g, title: labels.types, head: cols.map(head), rows: (data.types || []).map((t) => cols.map((c) =>
        c === 'class' ? className(t.ifcClass)
          : c === 'type' ? t.type
            : c === 'count' ? t.count
              : c === 'dimensions' ? dimText(t.dimensions, system)
              : c === 'materials' ? (t.materials || []).join(', ')
                : c === 'properties' ? propsText(t.properties, overrides)
                  : qty(t, c))) })
    } else if (g === 'classes') {
      out.push({ group: g, title: labels.classes, head: [labels.class, labels.count], rows: (data.classes || []).map((c) => [className(c.ifcClass), c.count]) })
    } else if (g === 'materials' && (data.materials || []).length) {
      out.push({ group: g, title: labels.materials, head: [labels.name, labels.count], rows: data.materials.map((m) => [m.name, m.count]) })
    } else if (g === 'totals' && data.totals) {
      const q = QTY.filter((c) => data.totals[c] !== null && data.totals[c] !== undefined)
      out.push({ group: g, title: labels.totals, head: [labels.count, ...q.map(head)], rows: [[data.totals.count, ...q.map((c) => qty(data.totals, c))]] })
    }
  }
  return out
}

/** RFC 4180 cell; a leading = + - @ is neutralised so a spreadsheet never runs it. */
export function csvCell(v) {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(tbls) {
  const lines = []
  for (const t of tbls) {
    if (lines.length) lines.push('')
    lines.push(csvCell(t.title))
    lines.push(t.head.map(csvCell).join(','))
    for (const r of t.rows) lines.push(r.map(csvCell).join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
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

function cell(tag, v) {
  return el(tag, tag === 'th' ? { scope: 'col' } : {}, v === null || v === undefined || v === '' ? '—' : String(v))
}

export function config(root) {
  return {
    columns: list(root.dataset.columns, COLUMNS),
    groups: list(root.dataset.groups, GROUPS),
    units: root.dataset.units,
    labels: parseLabels(root.dataset.labelsOverride),
    properties: String(root.dataset.properties || '').split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean),
    csv: root.dataset.csv !== 'false',
    overrides: readOverrides(root),
  }
}

/** Draws the tables (and the CSV button) for one block. */
export function render(root, data) {
  const cfg = config(root)
  const labels = { ...LABELS, ...cfg.labels }
  const body = root.querySelector('[data-ifcvo-live]')
  const tbls = tables(data, cfg)
  const nodes = tbls.map((t) => el('table', { class: 'ifcvo-specs', 'data-group': t.group },
    el('caption', {}, t.title),
    el('thead', {}, el('tr', {}, ...t.head.map((h) => cell('th', h)))),
    el('tbody', {}, ...t.rows.map((r) => el('tr', {}, ...r.map((v) => cell('td', v)))))))
  if (data.truncated) nodes.push(el('p', { class: 'ifcvo-muted' }, labels.truncated))
  if (cfg.csv) {
    nodes.push(el('button', { type: 'button', class: 'ifcvo-btn', 'data-ifcvo-csv': '', onclick: () => download(root, toCsv(tbls)) }, labels.csv))
  }
  body.replaceChildren(...nodes)
  return tbls
}

function download(root, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = el('a', { href: url, download: root.dataset.file || 'specs.csv' })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  try { window.Shopify && Shopify.analytics && Shopify.analytics.publish('ifcvo_download', { file: a.download, format: 'csv' }) } catch (e) { /* no pixels */ }
}

/** Older SDKs have no getProductData: class counts from findElements still work. */
async function readData(viewer, properties) {
  if (typeof viewer.getProductData === 'function') return viewer.getProductData(properties.length ? { properties } : {})
  const els = await viewer.findElements({ limit: 20000 })
  const counts = new Map()
  for (const e of els) if (e.ifcClass) counts.set(e.ifcClass, (counts.get(e.ifcClass) || 0) + 1)
  return {
    elementCount: els.length, truncated: false, types: [], materials: [], totals: null, dimensions: null,
    classes: [...counts].map(([ifcClass, count]) => ({ ifcClass, count })).sort((a, b) => b.count - a.count),
  }
}

const mounted = new Set()
let current = null

/** Reads the model once per load and fills every specs block on the page. */
export async function refresh(viewer = current) {
  if (!viewer) return
  const roots = [...mounted].filter((r) => r.isConnected)
  if (!roots.length) return
  for (const r of roots) r.querySelector('[data-ifcvo-live]').replaceChildren(el('p', { class: 'ifcvo-muted' }, { ...LABELS, ...config(r).labels }.loading))
  const props = [...new Set(roots.flatMap((r) => config(r).properties))]
  try {
    const data = await readData(viewer, props)
    for (const r of roots) render(r, data)
  } catch (e) {
    for (const r of roots) r.querySelector('[data-ifcvo-live]').replaceChildren(el('p', { class: 'ifcvo-muted', role: 'status' }, { ...LABELS, ...config(r).labels }.error))
  }
}

/** Use this viewer; re-read on every model it loads. */
export function attach(viewer) {
  if (!viewer || viewer === current) return
  current = viewer
  if (typeof viewer.on === 'function') viewer.on('model-loaded', () => refresh(viewer))
}

export function init() {
  for (const root of document.querySelectorAll('[data-ifcvo-specs]')) {
    if (root.dataset.ifcvoSpecsReady) continue
    root.dataset.ifcvoSpecsReady = '1'
    const api = window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('specs', root.querySelector('[data-ifcvo-live]'))) continue
    mounted.add(root)
    const labels = { ...LABELS, ...config(root).labels }
    root.querySelector('[data-ifcvo-live]').replaceChildren(el('p', { class: 'ifcvo-muted' }, labels.waiting))
  }
  const v = window.IFCVO && window.IFCVO.viewer
  if (v && v !== current) { attach(v); refresh(v) }
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

/** For tests. */
export function _reset() { mounted.clear(); current = null }

/** A viewer announced by the runtime: attach once; re-read only when it cannot tell us itself. */
export function onViewer(e) {
  const v = e.detail && e.detail.viewer
  if (!v) return
  const fresh = v !== current
  attach(v)
  if (fresh || (e.type === 'ifcvo:loaded' && typeof v.on !== 'function')) refresh(v)
}

// A module runs once per page, so these listeners are added once.
if (typeof document !== 'undefined') {
  document.addEventListener('ifcvo:viewer', onViewer)
  document.addEventListener('ifcvo:loaded', onViewer)
  document.addEventListener('shopify:section:load', init)
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
