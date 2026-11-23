// "IFC classification" block: once the page's viewer has a model, asks it for
// getProductData() (SDK; `classifications` since 1.19) and renders one table
// per classification system (code + title), in light DOM so it inherits the
// theme's typography. Rows rendered by Liquid from the `bim.classification`
// metafield stay first and win (crawlable / no-JS copy, the merchant's word);
// the model only adds codes the metafield does not list.
//
// Finds the viewer through window.IFCVO.viewer or the `ifcvo:viewer` /
// `ifcvo:loaded` DOM events (detail.viewer), never globals.
import './ifcvo-i18n.js'

export const LABELS = {
  title: 'Classification', system: 'System', code: 'Code', name: 'Title', elements: 'Elements',
  waiting: 'Open the 3D model to add the classification codes it carries.', loading: 'Reading the classification codes…',
  none: 'The model carries no classification codes.', error: 'The classification codes could not be read.',
  pset: 'Codes marked * come from authoring-tool parameters, not IFC classification references.',
  truncated: 'Large model: only part of it was read, some codes may be missing.',
  coverage: '{classified} of {elements} elements are classified.',
  inferred: '(inferred)',
}

/** Canonical system name; same rules as the viewer's product-data normaliser and snippets/ifcvo-cls-system. */
export function normalizeSystem(name) {
  const n = String(name || '').trim()
  if (/uniclass/i.test(n)) return 'Uniclass 2015'
  if (/omni\s*class/i.test(n)) return 'OmniClass'
  if (/master\s*format/i.test(n)) return 'MasterFormat'
  if (/uni\s*format/i.test(n)) return 'UniFormat'
  if (/^cci\b|coclass/i.test(n)) return 'CCI'
  if (/^nrm\b/i.test(n)) return 'NRM'
  return n
}

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
    if (k in LABELS && typeof v === 'string' && v && !/^translation missing/i.test(v)) merged[k] = v
  }
  return merged
}

/** "System|Code|Title" lines (the metafield format) → rows. Lines without a system or code are dropped. */
export function parseMetafield(text) {
  const lines = Array.isArray(text) ? text : String(text || '').split(/\r?\n/)
  const out = []
  for (const line of lines) {
    const [system, code, ...rest] = String(line).split('|').map((p) => p.trim())
    if (system && code) out.push({ system: normalizeSystem(system), code, title: rest.join('|').trim() || null, count: null, source: 'metafield' })
  }
  return out
}

/** Rows Liquid rendered from the metafield. */
export function serverRows(root) {
  return [...root.querySelectorAll('tr[data-source="metafield"]')].map((tr) => ({
    system: normalizeSystem(tr.dataset.system), code: tr.dataset.code,
    title: (tr.children[1] && tr.children[1].textContent.trim()) || null, count: null, source: 'metafield',
  }))
}

/** Metafield rows first (they win), then model codes not already listed; grouped by system in first-seen order. */
export function merge(metafield, model) {
  const groups = new Map()
  const seen = new Set()
  const add = (row) => {
    const key = `${row.system}\u0000${row.code ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    if (!groups.has(row.system)) groups.set(row.system, [])
    groups.get(row.system).push(row)
  }
  for (const r of metafield || []) add(r)
  for (const s of (model && model.systems) || []) for (const e of s.entries) add({ system: normalizeSystem(s.system) || s.system, code: e.code, title: e.title, count: e.count, source: e.source, systemGuessed: !!e.systemGuessed })
  return [...groups].map(([system, rows]) => ({ system, rows }))
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else node.setAttribute(k, v)
  }
  for (const c of children) if (c != null) node.append(c)
  return node
}

export function config(root) {
  return { model: root.dataset.showModel !== 'false', counts: root.dataset.showCounts === 'true', labels: labelsOf(root) }
}

/** Draws the tables for one block. Returns the groups drawn. */
export function render(root, data) {
  const cfg = config(root)
  const labels = cfg.labels
  const base = serverRows(root)
  const model = cfg.model ? data && data.classifications : null
  const groups = merge(base, model)
  const box = root.querySelector('[data-ifcvo-cls-tables]')
  const body = root.querySelector('[data-ifcvo-live]')
  const head = [labels.code, labels.name, ...(cfg.counts ? [labels.elements] : [])]
  box.replaceChildren(...groups.map((g) => el('table', { class: 'ifcvo-specs ifcvo-cls', 'data-system': g.system },
    el('caption', {}, g.system),
    el('thead', {}, el('tr', {}, ...head.map((h) => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, ...g.rows.map((r) => {
      const attrs = { 'data-source': r.source, 'data-system': r.system }
      if (r.code) attrs['data-code'] = r.code
      return el('tr', attrs,
        el('td', {}, el('code', {}, r.code || '—'), r.source === 'pset' ? ' *' : null,
          r.systemGuessed ? el('span', { class: 'ifcvo-muted', 'data-ifcvo-inferred': '' }, ' ' + labels.inferred) : null),
        el('td', {}, r.title || '—'),
        cfg.counts ? el('td', {}, r.count === null || r.count === undefined ? '—' : String(r.count)) : null)
    })))))
  const notes = []
  if (!groups.length) notes.push(el('p', { class: 'ifcvo-muted' }, labels.none))
  if (model) {
    notes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-coverage': '' }, labels.coverage.replace('{classified}', String(model.classified)).replace('{elements}', String(model.elements))))
    if (model.fromPsets) notes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-pset': '' }, labels.pset))
    if (model.truncated) notes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-truncated': '' }, labels.truncated))
  }
  body.replaceChildren(...notes)
  return groups
}

const mounted = new Set()
let current = null

function message(root, key) {
  root.querySelector('[data-ifcvo-live]').replaceChildren(el('p', { class: 'ifcvo-muted', role: 'status' }, labelsOf(root)[key]))
}

/** Reads the model once per load and fills every classification block on the page. */
export async function refresh(viewer = current) {
  if (!viewer || typeof viewer.getProductData !== 'function') return
  const roots = [...mounted].filter((r) => r.isConnected && config(r).model)
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
  for (const root of document.querySelectorAll('[data-ifcvo-classification]')) {
    if (root.dataset.ifcvoClsReady) continue
    root.dataset.ifcvoClsReady = '1'
    const api = window.IFCVO
    // The metafield table stays visible whatever the plan: it is the merchant's own copy.
    if (api && typeof api.gate === 'function' && !api.gate('classification', root.querySelector('[data-ifcvo-live]'))) continue
    mounted.add(root)
    if (config(root).model) message(root, 'waiting')
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
