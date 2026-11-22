// "IFC EPD and product passport" block: rows and checklist items rendered by
// Liquid from the product metafields stay as they are (the merchant's word,
// crawlable). Once the page's viewer has a model, asks it for
// getProductData() (SDK; `sustainability`) and fills ONLY the empty rows /
// missing items, each flagged "from the 3D model". Nothing is estimated: a
// value shows only when the IFC declares it.
//
// A readiness guide: it never claims the product meets a regulation.
// Finds the viewer through window.IFCVO.viewer or the `ifcvo:viewer` /
// `ifcvo:loaded` DOM events (detail.viewer), never globals.

export const LABELS = {
  title: 'Sustainability and product passport', epd: 'Environmental product declaration (EPD)',
  gwp_a1a3: 'Global warming potential, A1–A3', gwp: 'Global warming potential, total', energy: 'Primary energy', water: 'Water use',
  declared_unit: 'Declared unit', epd_number: 'EPD number', epd_link: 'EPD document',
  from_model: 'from the 3D model', from_pset: 'manufacturer parameter in the model', varies: 'varies between elements',
  score: '{ready} of {total} items ready', missing: 'Still missing: {items}.', ready: 'ready', not_ready: 'missing',
  loading: 'Reading the environmental data in the 3D model…', error: 'The environmental data in the model could not be read.',
}

/** Row key in the table ← indicator key in getProductData().sustainability. */
const ROW_OF = { gwpA1A3: 'gwp_a1a3', gwp: 'gwp', energy: 'energy', water: 'water' }

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

/** "{ready}" and Liquid-style "{{ ready }}" placeholders. */
export function fill(text, vars) {
  return String(text).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

/** Only absolute https links. */
export function httpsUrl(v) {
  try { const u = new URL(String(v || '')); return u.protocol === 'https:' ? u.href : null } catch (e) { return null }
}

function fmt(n) {
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '—'
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
  return { model: root.dataset.showModel !== 'false', labels: labelsOf(root) }
}

function flag(labels, source) {
  return el('span', { class: 'ifcvo-muted', 'data-ifcvo-flag': source }, ` (${source === 'pset' ? labels.from_pset : labels.from_model})`)
}

/** Fills an empty row (data-source="none") with a model value. Returns true when filled. */
function fillRow(root, key, content, source, labels) {
  const tr = root.querySelector(`tr[data-key="${key}"]`)
  if (!tr || tr.dataset.source !== 'none') return false
  const td = tr.children[1]
  td.replaceChildren(...(Array.isArray(content) ? content : [content]), flag(labels, source))
  tr.dataset.source = source === 'pset' ? 'model-pset' : 'model'
  return true
}

/** Applies model data to one block's server-rendered table and checklist. Returns the keys filled. */
export function render(root, data) {
  const cfg = config(root)
  const labels = cfg.labels
  const filled = []
  const sus = cfg.model && data ? data.sustainability : null
  if (sus) {
    for (const ind of sus.indicators || []) {
      const key = ROW_OF[ind.key]
      if (!key) continue
      const unit = ind.unit || (ind.key === 'gwp' || ind.key === 'gwpA1A3' ? 'kg CO₂e' : '')
      const text = `${fmt(ind.value)}${unit ? ' ' + unit : ''}${ind.varies ? ` — ${labels.varies}` : ''}`
      if (fillRow(root, key, text, ind.source, labels)) filled.push(key)
    }
    if (sus.declaredUnit && fillRow(root, 'declared_unit', sus.declaredUnit, sus.fromPsets ? 'pset' : 'ifc', labels)) filled.push('declared_unit')
    const epd = sus.epd
    if (epd) {
      if (epd.number && fillRow(root, 'epd_number', epd.number, epd.source, labels)) filled.push('epd_number')
      if (epd.programme && fillRow(root, 'epd_programme', epd.programme, epd.source, labels)) filled.push('epd_programme')
      if (epd.validUntil && fillRow(root, 'epd_valid_until', epd.validUntil, epd.source, labels)) filled.push('epd_valid_until')
      const url = httpsUrl(epd.url)
      if (url && fillRow(root, 'epd_url', el('a', { href: url, rel: 'noopener nofollow', target: '_blank' }, labels.epd_link), epd.source, labels)) filled.push('epd_url')
    }
    // Checklist: the model can only answer "GWP declared".
    const hasGwp = (sus.indicators || []).some((i) => i.key === 'gwp' || i.key === 'gwpA1A3')
    const li = root.querySelector('li[data-item="gwp"]')
    if (hasGwp && li && li.dataset.state === 'missing') {
      const src = (sus.indicators.find((i) => i.key === 'gwpA1A3') || sus.indicators.find((i) => i.key === 'gwp')).source
      li.dataset.state = 'ready'
      const mark = li.querySelector('[aria-hidden]')
      if (mark) mark.textContent = '✓'
      const sr = li.querySelector('[data-sr]')
      if (sr) sr.textContent = `${labels.ready}: `
      const hint = li.querySelector('.ifcvo-muted')
      if (hint) hint.replaceWith(flag(labels, src))
      filled.push('check:gwp')
    }
  }
  score(root)
  return filled
}

/** Recomputes "x of y ready" and the plain-language list of what is missing. */
export function score(root) {
  const box = root.querySelector('[data-ifcvo-dpp-score]')
  const items = [...root.querySelectorAll('li[data-item]')]
  if (!box || !items.length) return null
  const labels = labelsOf(root)
  const ready = items.filter((li) => li.dataset.state === 'ready').length
  const missing = items.filter((li) => li.dataset.state !== 'ready')
  const names = missing.map((li) => {
    const c = li.cloneNode(true)
    c.querySelectorAll('[aria-hidden], .ifcvo-muted, .ifcvo-sr, a').forEach((n) => n.remove())
    return c.textContent.replace(/\s+—.*$/, '').trim().toLowerCase()
  })
  box.replaceChildren(el('strong', {}, fill(labels.score, { ready, total: items.length })),
    missing.length ? el('span', {}, ' ' + fill(labels.missing, { items: names.join('; ') })) : null)
  box.dataset.ready = String(ready)
  return { ready, total: items.length, missing: missing.map((li) => li.dataset.item) }
}

const mounted = new Set()
let current = null

function message(root, key) {
  root.querySelector('[data-ifcvo-live]').replaceChildren(key ? el('p', { class: 'ifcvo-muted', role: 'status' }, labelsOf(root)[key]) : '')
}

export async function refresh(viewer = current) {
  if (!viewer || typeof viewer.getProductData !== 'function') return
  const roots = [...mounted].filter((r) => r.isConnected && config(r).model)
  if (!roots.length) return
  for (const r of roots) message(r, 'loading')
  try {
    const data = await viewer.getProductData({})
    for (const r of roots) { message(r, null); if (data && data.elementCount) render(r, data) }
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
  for (const root of document.querySelectorAll('[data-ifcvo-dpp]')) {
    if (root.dataset.ifcvoDppReady) continue
    root.dataset.ifcvoDppReady = '1'
    score(root)
    const api = window.IFCVO
    // The metafield panel stays visible whatever the plan: it is the merchant's own copy.
    if (api && typeof api.gate === 'function' && !api.gate('dpp', root.querySelector('[data-ifcvo-live]'))) continue
    mounted.add(root)
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
