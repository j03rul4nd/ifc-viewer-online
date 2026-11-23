// IFC Viewer Online: "Set up this product" wizard and poster maker for the theme
// editor. Loaded only by the Product IFC model block in request.design_mode and
// only drawn when window.Shopify.designMode is true. Buyers never get it.
// Everything runs in the merchant's browser: a HEAD and a 2 KB range request to
// the model, the viewer SDK to read it, a canvas to make the poster. No server.
// Steps: (1) check the IFC link, (2) read the model's profile, (3) suggest blocks
// by rules, (4) give the metafield values to paste and one editor link per block.
import { checkModel, fill } from './ifcvo-diagnostics.js'

/** The app's API key (shopify.app.toml client_id): the editor's addAppBlockId is `<key>/<block handle>`. */
export const API_KEY = '26585d50b4fa74c8e9d5c80614822560'

/** Merchant-facing texts (theme editor only, like the setup check). */
export const WIZARD_LABELS = {
  title: 'Set up this product',
  intro: 'About 5 minutes: check the IFC link, read the model, add the suggested blocks.',
  step1: '1. IFC link',
  urlLabel: 'https link to the .ifc file (Content → Files, or your own server)',
  check: 'Check link',
  step2: '2. Read the model',
  read: 'Read model',
  reading: 'Reading the model…',
  readFail: 'The model could not be read here. The link check above says why, if it is the link.',
  step3: '3. Suggested blocks',
  step4: '4. Paste and add',
  copy: 'Copy',
  copied: 'Copied',
  metafield: 'Product metafield {ns}.{key}',
  addBlock: 'Add “{name}” to the product page',
  plan: '{tier} plan',
  poster: 'Make poster from model',
  clickToZoom: 'Click to zoom and turn the model',
  posterMaking: 'Making the poster…',
  posterDone: 'Poster ready ({kb} KB, {w}×{h}). Upload it in Content → Files and set the product metafield {ns}.ifc_poster to it.',
  posterBig: 'The poster is still over 200 KB ({kb} KB). It works, but compress it before uploading, or use a simpler view.',
  posterFail: 'Could not take a picture of the model. Open the 3D view or read the model first.',
  profile: '{schema} · {app} · {elements} elements · {spaces} spaces · {storeys} storeys · {mb}',
  quantities: 'Quantities: {v}',
  classification: 'Classification: {v}',
  yes: 'yes',
  no: 'no',
  unknown: 'unknown',
  whyHouse: 'House or building plan detected ({spaces} spaces, {storeys} storeys)',
  whySteel: 'Steel members detected ({pct} % of elements, {profiles} profiles)',
  whySingle: 'Single product detected ({classes})',
  whyClassified: 'The model carries classification codes',
  whyQuantities: 'The model carries quantities',
  oneType: 'one type',
  noSuggestions: 'No extra blocks needed: the product block already shows the model and its downloads.',
}

/** Block handle → extension, name and FEATURE_TIERS key. */
export const BLOCK_LABELS = {
  'ifc-rooms': { name: 'IFC rooms & key specs', feature: 'rooms' },
  'ifc-plan-view': { name: 'IFC plan view', feature: 'planview' },
  'ifc-plan-set': { name: 'IFC plan set & license', feature: 'planset' },
  'ifc-takeoff': { name: 'IFC takeoff / BOQ', feature: 'takeoff' },
  'ifc-specs': { name: 'IFC specs & quantities', feature: 'specs' },
  'ifc-classification': { name: 'IFC classification', feature: 'classification' },
  'ifc-ar': { name: 'IFC view in your space (AR)', feature: 'ar' },
}

const STEEL = new Set(['IFCBEAM', 'IFCCOLUMN', 'IFCMEMBER', 'IFCPLATE', 'IFCMECHANICALFASTENER', 'IFCELEMENTASSEMBLY'])
/** Classes that say nothing about what the product is. */
const NOISE = new Set(['IFCSPACE', 'IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCSITE', 'IFCPROJECT', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID'])

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Block "shape" setting → width / height. Fixed height posters use 4:3. */
export function aspectOf(setting) {
  const m = /^(\d+)\/(\d+)$/.exec(String(setting || ''))
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 4 / 3
}

/** Centre crop of a w×h image to the aspect ratio. */
export function cropBox(w, h, aspect) {
  if (!(w > 0 && h > 0 && aspect > 0)) return { sx: 0, sy: 0, sw: w || 0, sh: h || 0 }
  if (w / h > aspect) {
    const sw = Math.round(h * aspect)
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h }
  }
  const sh = Math.round(w / aspect)
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh }
}

/** Poster pixel size: `width` wide at the aspect ratio. */
export function posterSize(aspect, width = 1200) {
  return { w: width, h: Math.max(1, Math.round(width / (aspect > 0 ? aspect : 4 / 3))) }
}

/** Upper-case IFC class counts from getStats() categories and/or getProductData() classes. */
function classCounts(stats, data) {
  const out = new Map()
  const add = (name, n) => {
    const k = String(name || '').toUpperCase()
    if (k && Number(n) > 0) out.set(k, Math.max(out.get(k) || 0, Number(n)))
  }
  for (const c of (data && data.classes) || []) add(c.ifcClass, c.count)
  for (const m of (stats && stats.models) || []) for (const c of m.categories || []) add(c.type, c.count)
  return out
}

/**
 * What the wizard knows about the model: from the link check (schema, authoring
 * tool, size) and from the viewer (getStats, and getProductData when the SDK has it).
 */
export function profileFrom({ probe = null, stats = null, data = null } = {}) {
  const counts = classCounts(stats, data)
  const rooms = data && data.rooms
  const spaces = rooms ? rooms.totals.count : counts.get('IFCSPACE') || 0
  const storeys = rooms ? rooms.storeys.filter((s) => s.name || s.rooms.length).length : counts.get('IFCBUILDINGSTOREY') || 0
  const elements = (data && data.elementCount) || (stats && stats.elementCount) || [...counts.values()].reduce((a, b) => a + b, 0)
  const meaningful = [...counts.entries()].filter(([k]) => !NOISE.has(k)).sort((a, b) => b[1] - a[1])
  const total = meaningful.reduce((a, [, n]) => a + n, 0)
  const steelCount = meaningful.filter(([k]) => STEEL.has(k)).reduce((a, [, n]) => a + n, 0)
  const t = data && data.totals
  const hasQuantities = !!(t && ['length', 'area', 'volume', 'weight'].some((k) => Number(t[k]) > 0))
  const hasClassification = !!(data && data.classifications && data.classifications.classified > 0)
  return {
    schema: (probe && probe.schema) || '',
    app: (probe && probe.app) || '',
    mb: probe && probe.mb != null ? probe.mb : null,
    elements,
    spaces,
    storeys,
    dominant: meaningful.slice(0, 3).map(([ifcClass, count]) => ({ ifcClass, count })),
    classes: meaningful.length,
    types: data && data.types ? data.types.length : null,
    steelShare: total ? steelCount / total : 0,
    steelProfiles: data && data.takeoff ? data.takeoff.steel.filter((r) => r.profile).length : 0,
    hasQuantities,
    hasClassification,
  }
}

/**
 * Rule-based suggestions, in order: house plan, steel, single product. Each one
 * is `{ handle, reason }`; a block appears once (first reason wins).
 */
export function suggest(p, labels = WIZARD_LABELS) {
  const L = { ...WIZARD_LABELS, ...labels }
  const out = []
  const add = (handle, reason) => { if (!out.some((s) => s.handle === handle)) out.push({ handle, reason }) }
  if (p.spaces >= 3 && p.storeys >= 1) {
    const why = fill(L.whyHouse, { spaces: p.spaces, storeys: p.storeys })
    add('ifc-rooms', why)
    add('ifc-plan-view', why)
    add('ifc-plan-set', why)
  }
  if (p.steelShare >= 0.5 || p.steelProfiles >= 3) {
    add('ifc-takeoff', fill(L.whySteel, { pct: Math.round(p.steelShare * 100), profiles: p.steelProfiles }))
  }
  const single = p.spaces === 0 && p.elements > 0 && (p.classes <= 2 || (p.types != null && p.types <= 3))
  if (single) {
    const why = fill(L.whySingle, { classes: p.dominant.map((d) => d.ifcClass).join(', ') || L.oneType })
    add('ifc-specs', why)
    add('ifc-classification', why)
    add('ifc-ar', why)
  }
  if (p.hasClassification) add('ifc-classification', L.whyClassified)
  if (p.hasQuantities && !single) add('ifc-specs', L.whyQuantities)
  return out
}

/** Theme editor link that opens the product template with the app block added. */
export function deepLink(shop, handle, apiKey = API_KEY) {
  const base = shop ? `https://${String(shop).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}` : ''
  const q = new URLSearchParams({ template: 'product', addAppBlockId: `${apiKey}/${handle}`, target: 'mainSection' })
  return `${base}/admin/themes/current/editor?${q.toString().replace(/%2F/g, '/')}`
}

/** The metafield values to paste: the model link, and the size so phones decide before downloading. */
export function metafieldValues({ url, ns = 'custom', key = 'ifc_model', mb = null }) {
  const out = [{ ns, key, value: url }]
  if (mb != null) out.push({ ns, key: 'ifc_size_mb', value: String(mb) })
  return out
}

/** Data URL → image (browser). */
function loadImage(src, doc) {
  return new Promise((resolve, reject) => {
    const img = new (doc.defaultView.Image)()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })
}

const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob((b) => r(b), type, q))

/**
 * Screenshot data URL → poster blob: centre crop to the block's aspect ratio on a
 * white background, `width` px wide, WebP (JPEG where the browser cannot encode
 * WebP), quality lowered and then size reduced until it fits `maxBytes`.
 */
export async function encodePoster(dataUrl, { aspect = 4 / 3, width = 1200, maxBytes = 200 * 1024, background = '#ffffff', doc = document } = {}) {
  const img = await loadImage(dataUrl, doc)
  const box = cropBox(img.naturalWidth || img.width, img.naturalHeight || img.height, aspect)
  let { w, h } = posterSize(aspect, width)
  let type = 'image/webp'
  let blob = null
  for (let pass = 0; pass < 6; pass++) {
    const canvas = doc.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, 0, 0, w, h)
    for (const q of [0.85, 0.75, 0.62, 0.5, 0.4]) {
      blob = await toBlob(canvas, type, q)
      if (blob && blob.type !== type) { type = 'image/jpeg'; blob = await toBlob(canvas, type, q) }
      if (blob && blob.size <= maxBytes) return { blob, w, h, type, over: false }
    }
    w = Math.round(w * 0.8)
    h = Math.round(h * 0.8)
  }
  return { blob, w, h, type, over: !blob || blob.size > maxBytes }
}

// ── DOM ──────────────────────────────────────────────────────────────────────

function el(doc, tag, attrs = {}, ...children) {
  const node = doc.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v)
  }
  for (const c of children) if (c != null) node.append(c)
  return node
}

/** The wizard config the product block writes (design mode only). */
export function readConfig(doc = document) {
  const s = doc.querySelector('script[data-ifcvo-wizard]')
  if (!s) return null
  try { return JSON.parse(s.textContent) } catch (e) { return null }
}

/** Products first seen on this page load: the wizard stays open across panel rebuilds. */
const FIRST = new Set()

/** The wizard's own viewer (one per page at most): freed on rebuild and on close. */
const PRIVATE = { current: null }

/** Disposes the private viewer and empties its stage, so the iframe and its WebGL context go. */
export function release() {
  const c = PRIVATE.current
  PRIVATE.current = null
  if (!c) return false
  try { if (typeof c.v.dispose === 'function') c.v.dispose(); else if (typeof c.v.destroy === 'function') c.v.destroy() } catch (e) { /* already gone */ }
  try { c.stage.replaceChildren() } catch (e) { /* detached */ }
  return true
}

/**
 * Saves a blob through a temporary <a download>, never by navigating: the theme
 * editor follows link clicks that reach the document and sends its preview to
 * the blob: address, which Shopify cannot load. The anchor stays out of the
 * document and its click never bubbles, so only the download happens.
 */
export function downloadBlob(blob, name, { doc = document, win = window } = {}) {
  const href = win.URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  a.addEventListener('click', (e) => e.stopPropagation())
  a.click()
  setTimeout(() => win.URL.revokeObjectURL(href), 10000)
  return a
}

/**
 * A see-through cover over the wizard's small 3D view: the mouse wheel scrolls
 * the editor until the merchant clicks the view, then the cover goes and the
 * wheel zooms the model.
 */
export function wheelGuard(doc = document) {
  const cover = doc.createElement('div')
  cover.setAttribute('data-ifcvo-wheel-guard', '')
  cover.title = WIZARD_LABELS.clickToZoom
  cover.style.cssText = 'position:absolute;inset:0;z-index:2;cursor:pointer;background:transparent'
  cover.addEventListener('click', () => cover.remove(), { once: true })
  return cover
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Draws the wizard into the setup-check panel body. Returns its section, or null
 * outside the theme editor or without a product block.
 */
export function mount(body, { doc = document, win = window, api = win.IFCVO, fetchImpl, force = false } = {}) {
  if (!force && !(win.Shopify && win.Shopify.designMode)) return null
  const cfg = readConfig(doc)
  if (!cfg || !body) return null
  body.querySelector('[data-ifcvo-wizard-ui]')?.remove()
  release()
  const L = WIZARD_LABELS
  const tiers = (api && api.FEATURE_TIERS) || {}
  const shop = (win.Shopify && win.Shopify.shop) || cfg.shop || ''
  const seenKey = `ifcvo-wizard-seen:${cfg.product || ''}`
  let firstTime = FIRST.has(seenKey)
  try { if (!win.localStorage.getItem(seenKey)) { firstTime = true; FIRST.add(seenKey); win.localStorage.setItem(seenKey, '1') } } catch (e) { /* storage off */ }

  const state = { probe: null, viewer: null }
  const t = (tag, text, attrs = {}) => el(doc, tag, attrs, text)
  const input = el(doc, 'input', { type: 'url', value: cfg.model || '', placeholder: 'https://…/model.ifc', style: 'width:100%' })
  const checkOut = t('div', '', { 'data-step': 'check' })
  const readOut = t('div', '', { 'data-step': 'read' })
  const suggestOut = t('div', '', { 'data-step': 'suggest' })
  const pasteOut = t('div', '', { 'data-step': 'paste' })
  const posterOut = t('p', '', { 'data-step': 'poster', class: 'ifcvo-muted' })
  const stage = el(doc, 'div', { 'data-ifcvo-wizard-stage': '', style: `position:relative;width:100%;aspect-ratio:${aspectOf(cfg.aspect)};display:none;background:#fff` })

  const copyRow = (label, value) => {
    const btn = el(doc, 'button', { type: 'button', class: 'ifcvo-chip', onclick: async () => {
      try { await win.navigator.clipboard.writeText(value); btn.textContent = L.copied } catch (e) { /* select by hand */ }
    } }, L.copy)
    return el(doc, 'li', {}, t('span', label + ': '), t('code', value), ' ', btn)
  }

  const showPaste = (mb) => {
    const rows = metafieldValues({ url: input.value.trim(), ns: cfg.ns, key: cfg.key, mb })
    pasteOut.replaceChildren(el(doc, 'ul', { class: 'ifcvo-diag-lines' }, ...rows.map((r) => copyRow(fill(L.metafield, r), r.value))))
  }

  const check = async () => {
    checkOut.textContent = '…'
    state.probe = await checkModel(input.value.trim(), fetchImpl)
    const p = state.probe
    const ok = p.ok && p.cors && p.step !== false
    checkOut.replaceChildren(t('p', ok ? `✓ ${p.schema || 'IFC'}${p.mb != null ? ` · ${p.mb} MB` : ''}${p.app ? ` · ${p.app}` : ''}` : `! ${p.https ? (p.cors ? `HTTP ${p.status}` : 'CORS') : 'https'}`))
    if (ok) showPaste(p.mb)
    return ok
  }

  /** The block's own viewer when it shows this model, else a private one in the wizard's stage. */
  const viewerFor = async (url) => {
    const live = api && api.viewer
    const root = doc.querySelector('[data-ifcvo-viewer]')
    if (live && root && root.dataset.model === url) return live
    if (state.viewer && state.viewer.url === url) return state.viewer.v
    if (!api || typeof api.loadSdk !== 'function') return null
    release()
    stage.style.display = 'block'
    stage.replaceChildren()
    const { IfcViewer } = await api.loadSdk()
    const v = new IfcViewer(stage, { model: url, ui: 'embed', toolbar: false, background: '#ffffff', height: '100%', validate: false })
    stage.append(wheelGuard(doc))
    state.viewer = { url, v }
    PRIVATE.current = { v, stage }
    // whenReady() is the viewer, not the model: wait for model-loaded too, or it reads 0 elements.
    const loaded = typeof v.on === 'function' ? new Promise((res) => { v.on('model-loaded', () => res()); v.on('model-error', () => res()) }) : null
    await v.whenReady()
    if (loaded) await Promise.race([loaded, new Promise((res) => setTimeout(res, 60000))])
    return v
  }

  const read = async () => {
    const url = input.value.trim()
    if (!state.probe || state.probe.url !== url) await check()
    readOut.textContent = L.reading
    let stats = null, data = null
    try {
      const v = await viewerFor(url)
      if (!v) throw new Error('viewer')
      if (typeof v.getStats === 'function') stats = await v.getStats().catch(() => null)
      if (typeof v.getProductData === 'function') data = await v.getProductData({ maxElements: 20000 }).catch(() => null)
      if (!stats && !data) throw new Error('empty')
    } catch (e) {
      readOut.replaceChildren(t('p', '! ' + L.readFail))
      return null
    }
    const p = profileFrom({ probe: state.probe, stats, data })
    const yn = (b) => (b ? L.yes : L.no)
    readOut.replaceChildren(
      t('p', fill(L.profile, { schema: p.schema || L.unknown, app: p.app || L.unknown, elements: p.elements, spaces: p.spaces, storeys: p.storeys, mb: p.mb != null ? `${p.mb} MB` : L.unknown })),
      t('p', `${p.dominant.map((d) => `${d.ifcClass} ×${d.count}`).join(', ')} · ${fill(L.quantities, { v: yn(p.hasQuantities) })} · ${fill(L.classification, { v: yn(p.hasClassification) })}`, { class: 'ifcvo-muted' }))
    const list = suggest(p)
    suggestOut.replaceChildren(list.length
      ? el(doc, 'ul', { class: 'ifcvo-diag-lines' }, ...list.map((s) => {
        const b = BLOCK_LABELS[s.handle]
        const tier = tiers[b.feature] || 'free'
        return el(doc, 'li', { 'data-handle': s.handle }, t('span', `${s.reason} → `),
          el(doc, 'a', { href: deepLink(shop, s.handle), target: '_top', rel: 'noopener' }, fill(L.addBlock, { name: b.name })),
          t('span', ` (${fill(L.plan, { tier })})`, { class: 'ifcvo-muted' }))
      }))
      : t('p', L.noSuggestions))
    return p
  }

  const poster = async () => {
    posterOut.textContent = L.posterMaking
    try {
      const url = input.value.trim()
      const v = (api && api.viewer) || (url ? await viewerFor(url) : null)
      if (!v || typeof v.screenshot !== 'function') throw new Error('viewer')
      if (typeof v.fit === 'function') { v.fit(); await sleep(600) }
      const shot = await v.screenshot()
      if (!shot) throw new Error('empty')
      const out = await encodePoster(shot, { aspect: aspectOf(cfg.aspect), doc })
      const ext = out.type === 'image/webp' ? 'webp' : 'jpg'
      downloadBlob(out.blob, `${cfg.handle || 'product'}-poster.${ext}`, { doc, win })
      const kb = Math.round(out.blob.size / 1024)
      posterOut.textContent = fill(L.posterDone, { kb, w: out.w, h: out.h, ns: cfg.ns || 'custom' }) + (out.over ? ' ' + fill(L.posterBig, { kb }) : '')
      if (out.over) posterOut.dataset.kind = 'warn'
    } catch (e) {
      posterOut.textContent = L.posterFail
    }
  }

  const btn = (label, fn) => el(doc, 'button', { type: 'button', class: 'ifcvo-chip', onclick: fn }, label)
  const details = el(doc, 'details', { 'data-ifcvo-wizard-ui': '' },
    t('summary', L.title),
    t('p', L.intro, { class: 'ifcvo-muted' }),
    t('h4', L.step1), el(doc, 'label', {}, t('span', L.urlLabel), input), btn(L.check, check), checkOut,
    t('h4', L.step2), btn(L.read, read), readOut, stage,
    t('h4', L.step3), suggestOut,
    t('h4', L.step4), pasteOut,
    el(doc, 'p', {}, btn(L.poster, poster)), posterOut)
  if (!cfg.model || firstTime) details.open = true
  // Closing the wizard frees its private viewer (WebGL context, WASM memory).
  details.addEventListener('toggle', () => { if (!details.open) { release(); state.viewer = null; stage.style.display = 'none' } })
  const section = el(doc, 'section', { 'data-ifcvo-wizard-ui': '' })
  details.removeAttribute('data-ifcvo-wizard-ui')
  section.append(details)
  body.prepend(section)
  return section
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__ifcvoWizard) {
  window.__ifcvoWizard = true
  const attach = (body) => { try { mount(body) } catch (e) { /* never break the editor */ } }
  document.addEventListener('ifcvo:diag-panel', (e) => attach(e.detail && e.detail.body))
  const existing = document.querySelector('[data-ifcvo-diag-panel] .ifcvo-diag-body')
  if (existing) attach(existing)
}
