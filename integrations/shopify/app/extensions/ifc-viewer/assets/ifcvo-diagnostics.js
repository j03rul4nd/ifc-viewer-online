// IFC Viewer Online: setup and diagnostics panel for the theme editor.
// Loaded only when the page renders in the theme editor (request.design_mode,
// see snippets/ifcvo-diag.liquid) and only draws itself when Shopify says so
// (window.Shopify.designMode). Buyers never get the markup or this script.
// Per block it says what it found: model URL reachable, CORS, size, IFC schema,
// metafields present or missing, plan and gated features, and the viewer SDK.
// No server: two requests from the merchant's browser to the model URL.

/** Merchant-facing texts (the theme editor; visitors never see them). */
export const DIAG_LABELS = {
  title: 'IFC Viewer Online setup check',
  note: 'Only you see this panel, in the theme editor. Buyers do not.',
  hide: 'Hide',
  show: 'Setup check',
  plan: 'Plan: {plan}',
  model: 'Model',
  noModel: 'No model URL on this product. Fill the product metafield {ns}.{key} (type: file or URL).',
  notHttps: 'The model URL must start with https://.',
  reachable: 'Reachable ({status})',
  unreachable: 'Not reachable (HTTP {status}). Check the URL or that the file is public.',
  corsOk: 'CORS: the browser may read the file.',
  corsFail: 'The browser could not read the file. If it is on your own server, send Access-Control-Allow-Origin: * (or this shop\'s domain). Files uploaded to Shopify (Content → Files) already work.',
  size: 'Size: {mb} MB',
  sizeUnknown: 'Size: not reported by the server',
  heavy: 'Over 100 MB: phones may not open it. Offer a lighter model or a poster image.',
  schema: 'IFC schema: {schema}',
  schemaUnknown: 'IFC schema: could not read the file header',
  notIfc: 'The file does not start like an IFC (STEP) file.',
  present: 'Found: {keys}',
  missing: 'Missing: {keys}',
  missingHint: 'Add {owner} metafields in namespace "{ns}". Definitions: integrations/shopify/app/METAFIELDS.md.',
  product: 'product',
  variant: 'variant (selected variant checked)',
  noKeys: 'Needs no metafields; reads the 3D model.',
  specsNone: 'No metafields in namespace "{ns}": the table shows nothing until the 3D model opens.',
  gated: 'Needs the {tier} plan: hidden from visitors on {plan}.',
  allowed: 'Included in {plan}.',
  sdk: 'Viewer SDK {version}',
  sdkOld: 'Viewer SDK {version}: getProductData/exportModel need 1.19 or later; GLB export and some panels fall back.',
  sdkMethods: 'getProductData: {data} · exportModel: {exp}',
  sdkClosed: 'Open the 3D view once to check the viewer methods.',
  yes: 'yes',
  no: 'no',
  checking: 'Checking…',
  roi: 'ROI',
  pixelSeen: 'ROI pixel detected (last event {ago}).',
  pixelMissing: 'ROI pixel not detected yet. Paste the template from integrations/shopify/app/docs/ROI.md in Settings → Customer events, open a model on the live store, then reload.',
  minAgo: '{n} min ago',
  hAgo: '{n} h ago',
  pixelNote: 'The pixel only forwards to your own GA4 or Meta; figures come from your reports.',
  report: 'Report a problem',
  reportNote: 'Opens your email with the shop, theme, blocks and error code filled in. Add what you saw.',
  reviewAsk: 'The 3D model loaded. If the app helps your store, a short review on the Shopify App Store helps a lot.',
  review: 'Write a review',
  dismiss: 'Not now',
  mailAsk: 'What happened, and on which product:',
  mailCode: 'Error code: {code}',
}

/** Where "Report a problem" writes to (the address the site already answers from). */
export const SUPPORT_EMAIL = 'hola@ifcvieweronline.eu'
export const REVIEW_URL = 'https://apps.shopify.com/ifc-viewer-online/reviews'
/** localStorage: '' never loaded · 'ask' a model loaded · 'dismissed' · 'reviewed'. */
export const REVIEW_KEY = 'ifcvo-review'

const FEATURE_LABELS = {
  viewer: 'Product IFC model', files: 'IFC downloads', specs: 'IFC specs & quantities', details: 'IFC element details',
  explorer: 'IFC model explorer', views: 'IFC views and tour', score: 'IFC Health Score', rooms: 'IFC rooms & key specs',
  planset: 'IFC plan set & license', compat: 'IFC compatibility', planview: 'IFC plan view', ar: 'IFC view in your space (AR)',
  classification: 'IFC classification', takeoff: 'IFC takeoff / BOQ', dpp: 'IFC EPD and product passport',
  sunlot: 'IFC sun & lot fit', compliance: 'IFC compliance',
}

const PLANS = ['free', 'starter', 'business']

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function fill(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

/** `FILE_SCHEMA(('IFC4'))` from the first bytes of a STEP file; '' when absent. */
export function parseSchema(head) {
  const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(String(head || ''))
  return m ? m[1].toUpperCase().replace(/^IFC4X/, 'IFC4X') : ''
}

/** The authoring tool from FILE_NAME (6th field, originating_system); '' when absent. */
export function parseAuthoring(head) {
  const m = /FILE_NAME\s*\(([\s\S]*?)\)\s*;/i.exec(String(head || ''))
  if (!m) return ''
  // Top-level fields: strings and (lists); the 6th is the originating system.
  const fields = []
  let depth = 0, cur = '', q = false
  for (const ch of m[1]) {
    if (ch === "'") q = !q
    if (!q && ch === '(') depth++
    if (!q && ch === ')') depth--
    if (!q && depth === 0 && ch === ',') { fields.push(cur.trim()); cur = '' } else cur += ch
  }
  fields.push(cur.trim())
  const v = (fields[5] || '').replace(/^'|'$/g, '').trim()
  return v === '$' ? '' : v.slice(0, 120)
}

/** Whether the bytes look like a STEP (ISO-10303-21) file. */
export function isStep(head) {
  return /^\s*ISO-10303-21\s*;/.test(String(head || ''))
}

/** `https://…/sdk/1.18.0/…` → `1.18.0`; '' when the URL has no version. */
export function sdkVersion(url) {
  const m = /\/sdk\/(\d+\.\d+\.\d+)\//.exec(String(url || ''))
  return m ? m[1] : ''
}

/** True when version a ≥ b (x.y.z). */
export function atLeast(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return true
}

/** Plan rank: a feature is allowed when the plan is at or above its tier. */
export function allowedOn(tier, plan) {
  const p = PLANS.indexOf(String(plan || '').toLowerCase())
  const t = PLANS.indexOf(tier || 'free')
  return (p < 0 ? PLANS.length - 1 : p) >= (t < 0 ? 0 : t)
}

/**
 * Probes a model URL from the browser: HEAD for status and size, then the first
 * 2 KB for the IFC schema. A thrown fetch means CORS (or the network) blocks it.
 */
export async function checkModel(url, fetchImpl = (...a) => fetch(...a)) {
  const out = { url, https: /^https:\/\//i.test(url || ''), ok: false, status: 0, cors: false, mb: null, schema: '', step: null, app: '' }
  if (!url || !out.https) return out
  try {
    const res = await fetchImpl(url, { method: 'HEAD', mode: 'cors', cache: 'no-store' })
    out.cors = true
    out.status = res.status
    out.ok = res.ok
    const len = Number(res.headers && res.headers.get && res.headers.get('content-length'))
    if (Number.isFinite(len) && len > 0) out.mb = Math.round((len / 1048576) * 10) / 10
  } catch (e) {
    return out
  }
  if (!out.ok) return out
  try {
    const res = await fetchImpl(url, { headers: { Range: 'bytes=0-2047' }, mode: 'cors', cache: 'no-store' })
    const head = (await res.text()).slice(0, 2048)
    out.step = isStep(head)
    out.schema = parseSchema(head)
    out.app = parseAuthoring(head)
  } catch (e) { /* header unreadable */ }
  return out
}

/** One report line set for a block from its ifcvo-diag JSON. */
export function blockReport(diag, { plan = 'business', tiers = {}, labels = DIAG_LABELS } = {}) {
  const L = { ...DIAG_LABELS, ...labels }
  const tier = tiers[diag.feature] || 'free'
  const lines = []
  const ok = allowedOn(tier, plan)
  lines.push({ kind: ok ? 'ok' : 'warn', text: ok ? fill(L.allowed, { plan }) : fill(L.gated, { tier, plan }) })
  const present = (diag.present || []).filter(Boolean)
  const missing = (diag.missing || []).filter(Boolean)
  if (present.length) lines.push({ kind: 'ok', text: fill(L.present, { keys: present.map((k) => `${diag.ns}.${k}`).join(', ') }) })
  if (missing.length) {
    lines.push({ kind: 'warn', text: fill(L.missing, { keys: missing.map((k) => `${diag.ns}.${k}`).join(', ') }) })
    lines.push({ kind: 'hint', text: fill(L.missingHint, { ns: diag.ns, owner: diag.scope === 'variant' ? L.variant : L.product }) })
  }
  if (diag.feature === 'specs' && diag.ns && !diag.any) lines.push({ kind: 'hint', text: fill(L.specsNone, { ns: diag.ns }) })
  if (!present.length && !missing.length && diag.feature !== 'specs') lines.push({ kind: 'info', text: L.noKeys })
  return { feature: diag.feature, name: FEATURE_LABELS[diag.feature] || diag.block || diag.feature, tier, allowed: ok, lines }
}

/** Lines for the model probe. `key` is the metafield key the product block reads. */
export function modelReport(probe, { ns = 'custom', key = 'ifc_model', labels = DIAG_LABELS } = {}) {
  const L = { ...DIAG_LABELS, ...labels }
  if (!probe || !probe.url) return [{ kind: 'warn', text: fill(L.noModel, { ns, key }) }]
  if (!probe.https) return [{ kind: 'warn', text: L.notHttps }]
  if (!probe.cors) return [{ kind: 'warn', text: L.corsFail }]
  const lines = [{ kind: 'ok', text: L.corsOk }]
  if (!probe.ok) return [...lines, { kind: 'warn', text: fill(L.unreachable, { status: probe.status }) }]
  lines.unshift({ kind: 'ok', text: fill(L.reachable, { status: probe.status }) })
  lines.push(probe.mb == null ? { kind: 'info', text: L.sizeUnknown } : { kind: probe.mb > 100 ? 'warn' : 'ok', text: fill(L.size, { mb: probe.mb }) })
  if (probe.mb != null && probe.mb > 100) lines.push({ kind: 'hint', text: L.heavy })
  if (probe.step === false) lines.push({ kind: 'warn', text: L.notIfc })
  else lines.push(probe.schema ? { kind: 'ok', text: fill(L.schema, { schema: probe.schema }) } : { kind: 'info', text: L.schemaUnknown })
  return lines
}

/** Lines for the viewer SDK: version from its URL, methods from the live viewer if open. */
export function sdkReport(url, viewer, labels = DIAG_LABELS) {
  const L = { ...DIAG_LABELS, ...labels }
  const version = sdkVersion(url) || '?'
  const recent = version !== '?' && atLeast(version, '1.19.0')
  const lines = [{ kind: recent ? 'ok' : 'warn', text: fill(recent ? L.sdk : L.sdkOld, { version }) }]
  if (viewer) {
    const yn = (f) => (typeof viewer[f] === 'function' ? L.yes : L.no)
    lines.push({ kind: 'info', text: fill(L.sdkMethods, { data: yn('getProductData'), exp: yn('exportModel') }) })
  } else lines.push({ kind: 'info', text: L.sdkClosed })
  return lines
}

export const PIXEL_COOKIE = '_ifcvo_px'

/** Timestamp (ms) the ROI pixel left in its first-party cookie, or 0. */
export function pixelSeenAt(cookie = '') {
  const m = String(cookie || '').match(/(?:^|;\s*)_ifcvo_px=(\d+)/)
  return m ? Number(m[1]) : 0
}

/** Lines for the ROI setup checklist: is the merchant's custom pixel running? */
export function roiReport(cookie, now = Date.now(), labels = DIAG_LABELS) {
  const L = { ...DIAG_LABELS, ...labels }
  const at = pixelSeenAt(cookie)
  if (!at) return [{ kind: 'warn', text: L.pixelMissing }, { kind: 'info', text: L.pixelNote }]
  const min = Math.max(0, Math.round((now - at) / 60000))
  const ago = min < 60 ? fill(L.minAgo, { n: min }) : fill(L.hAgo, { n: Math.round(min / 60) })
  return [{ kind: 'ok', text: fill(L.pixelSeen, { ago }) }, { kind: 'info', text: L.pixelNote }]
}

/** Short error code for the support mail: the last viewer error, else the model probe. */
export function errorCode(probe, lastError = '') {
  if (lastError) return String(lastError).slice(0, 60)
  if (!probe || !probe.url) return 'no_model'
  if (!probe.https) return 'not_https'
  if (!probe.cors) return 'cors'
  if (!probe.ok) return `http_${probe.status}`
  if (probe.step === false) return 'not_ifc'
  if (probe.mb != null && probe.mb > 100) return 'heavy'
  return 'none'
}

/**
 * mailto: for "Report a problem". Only the shop domain, theme, block names, error code and
 * SDK version: no customer data, no model URL.
 */
export function reportMailto({ shop = '', theme = '', blocks = [], code = 'none', sdk = '', email = SUPPORT_EMAIL } = {}) {
  const subject = `IFC Viewer Online (Shopify): ${shop || 'shop'} · ${code}`
  const body = [
    DIAG_LABELS.mailAsk,
    '',
    '',
    '---',
    `Shop: ${shop || '?'}`,
    `Theme: ${theme || '?'}`,
    `Blocks: ${blocks.join(', ') || '?'}`,
    fill(DIAG_LABELS.mailCode, { code }),
    `Viewer SDK: ${sdk || '?'}`,
  ].join('\n')
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** The review prompt's state from storage ('' when unset or storage is off). */
export function readReview(win = typeof window !== 'undefined' ? window : undefined) {
  try { return (win && win.localStorage.getItem(REVIEW_KEY)) || '' } catch (e) { return '' }
}

function saveReview(value) {
  try { window.localStorage.setItem(REVIEW_KEY, value) } catch (e) { /* storage off */ }
}

/** After the first model load in the editor: ask once, until reviewed or dismissed. */
export function markLoaded(win = typeof window !== 'undefined' ? window : undefined) {
  if (readReview(win) === '') { try { win.localStorage.setItem(REVIEW_KEY, 'ask') } catch (e) { /* storage off */ } }
  return readReview(win)
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

const MARK = { ok: '✓', warn: '!', hint: '→', info: '·' }

function list(lines) {
  return el('ul', { class: 'ifcvo-diag-lines' }, ...lines.map((l) => el('li', { 'data-kind': l.kind }, el('span', { 'aria-hidden': 'true' }, MARK[l.kind] + ' '), l.text)))
}

/** Reads every ifcvo-diag JSON on the page (one per block, deduped by feature). */
export function readDiags(doc = document) {
  const seen = new Map()
  for (const s of doc.querySelectorAll('script[data-ifcvo-diag]')) {
    try { const d = JSON.parse(s.textContent); if (d && d.feature && !seen.has(d.feature)) seen.set(d.feature, d) } catch (e) { /* bad JSON */ }
  }
  return [...seen.values()]
}

export const COLLAPSE_KEY = 'ifcvo-diag-collapsed'

/** Whether the buyer-invisible panel was left collapsed in this tab. */
export function readCollapsed(win = window) {
  try { return win.sessionStorage.getItem(COLLAPSE_KEY) === '1' } catch (e) { return false }
}

function setCollapsed(panel, body, toggle, collapsed, save = true) {
  body.hidden = collapsed
  if (collapsed) panel.setAttribute('data-collapsed', '')
  else panel.removeAttribute('data-collapsed')
  toggle.textContent = collapsed ? DIAG_LABELS.show : DIAG_LABELS.hide
  toggle.setAttribute('aria-expanded', String(!collapsed))
  if (save) { try { window.sessionStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch (e) { /* storage off */ } }
}

/** Builds (or rebuilds) the panel. Returns the panel node, or null outside the theme editor. */
export async function render(doc = document, { api = window.IFCVO, fetchImpl, force = false } = {}) {
  if (!force && !(window.Shopify && window.Shopify.designMode)) return null
  const diags = readDiags(doc)
  if (!diags.length) return null
  const prev = doc.querySelector('[data-ifcvo-diag-panel]')
  if (prev) prev.remove()
  const L = DIAG_LABELS
  const planNode = doc.querySelector('[data-ifcvo-plan]')
  const plan = String((planNode && planNode.dataset.ifcvoPlan) || (api && api.plan) || 'business').toLowerCase()
  const tiers = (api && api.FEATURE_TIERS) || {}
  const body = el('div', { class: 'ifcvo-diag-body' })
  // Collapsed or not survives re-renders (section reloads rebuild the panel) for this tab.
  const collapsed = readCollapsed()
  const toggle = el('button', { type: 'button', class: 'ifcvo-chip', 'aria-expanded': String(!collapsed), onclick: () => setCollapsed(panel, body, toggle, !body.hidden) }, L.hide)
  const panel = el('aside', { class: 'ifcvo-diag', 'data-ifcvo-diag-panel': '', 'aria-label': L.title },
    el('div', { class: 'ifcvo-diag-head' }, el('strong', {}, L.title), toggle),
    body)
  setCollapsed(panel, body, toggle, collapsed, false)
  body.append(el('p', { class: 'ifcvo-muted' }, L.note), el('p', {}, fill(L.plan, { plan })))
  doc.body.append(panel)
  // The setup wizard (assets/ifcvo-wizard.js, product block only) adds its section here.
  doc.dispatchEvent(new CustomEvent('ifcvo:diag-panel', { detail: { body } }))

  const viewerDiag = diags.find((d) => d.feature === 'viewer')
  const root = doc.querySelector('[data-ifcvo-viewer]')
  const url = (root && root.dataset.model) || (viewerDiag && viewerDiag.model) || ''
  const modelBox = el('section', {}, el('h4', {}, L.model), el('p', { class: 'ifcvo-muted' }, L.checking))
  body.append(modelBox)
  body.append(el('section', {}, list(sdkReport(api && api.sdk, api && api.viewer))))
  body.append(el('section', { 'data-feature': 'roi' }, el('h4', {}, L.roi), list(roiReport(doc.cookie))))
  for (const d of diags) {
    const r = blockReport(d, { plan, tiers })
    body.append(el('section', { 'data-feature': r.feature }, el('h4', {}, `${r.name} (${r.tier})`), list(r.lines)))
  }
  const key = viewerDiag && (viewerDiag.present || []).concat(viewerDiag.missing || []).filter(Boolean)[0]
  const reportBox = el('section', { 'data-ifcvo-report': '' })
  body.append(reportBox)
  watchViewers(doc)
  showReview(doc)
  const probe = url ? await checkModel(url, fetchImpl) : null
  modelBox.replaceChildren(el('h4', {}, L.model), url ? el('p', { class: 'ifcvo-muted' }, url) : null,
    list(modelReport(probe, { ns: (viewerDiag && viewerDiag.ns) || 'custom', key: key || 'ifc_model' })))
  const shopNode = doc.querySelector('[data-ifcvo-shop]')
  const sh = window.Shopify || {}
  const theme = sh.theme ? [sh.theme.name, sh.theme.id && `#${sh.theme.id}`].filter(Boolean).join(' ') : ''
  const href = () => reportMailto({
    shop: (shopNode && shopNode.dataset.ifcvoShop) || sh.shop || '',
    theme,
    blocks: diags.map((d) => d.block || d.feature),
    code: errorCode(probe, lastError),
    sdk: sdkVersion(api && api.sdk),
  })
  // The code is read on click, so a viewer error after the panel was drawn is included.
  const link = el('a', { class: 'ifcvo-chip', href: href(), 'data-ifcvo-report-link': '', onclick: () => { link.href = href() } }, L.report)
  reportBox.append(link, el('p', { class: 'ifcvo-muted' }, L.reportNote))
  return panel
}

/** Last viewer error code on the page (ifcvo:error), for the support mail. */
let lastError = ''
const watched = new WeakSet()

/** Listens to every viewer on the page for errors and the first successful model load. */
function watchViewers(doc) {
  for (const root of doc.querySelectorAll('[data-ifcvo-viewer]')) {
    if (root.dataset.ifcvoState === 'ready') markLoaded(window)
    if (watched.has(root)) continue
    watched.add(root)
    root.addEventListener('ifcvo:error', (e) => { lastError = (e.detail && e.detail.code) || 'error' })
    root.addEventListener('ifcvo:loaded', () => { lastError = ''; markLoaded(window); showReview(doc) })
  }
}

/** The review prompt, in the editor panel only, once a model has loaded and until answered. */
function showReview(doc) {
  const body = doc.querySelector('[data-ifcvo-diag-panel] .ifcvo-diag-body')
  if (!body || readReview() !== 'ask' || body.querySelector('[data-ifcvo-review]')) return
  const L = DIAG_LABELS
  const box = el('section', { 'data-ifcvo-review': '' },
    el('p', {}, L.reviewAsk),
    el('a', { class: 'ifcvo-chip', href: REVIEW_URL, target: '_blank', rel: 'noopener', onclick: () => { saveReview('reviewed'); box.remove() } }, L.review),
    ' ',
    el('button', { type: 'button', class: 'ifcvo-chip', 'data-ifcvo-review-dismiss': '', onclick: () => { saveReview('dismissed'); box.remove() } }, L.dismiss))
  body.prepend(box)
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__ifcvoDiag) {
  window.__ifcvoDiag = true
  const run = () => { render().catch(() => {}) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true })
  else run()
  document.addEventListener('ifcvo:ready', run)
  document.addEventListener('shopify:section:load', run)
}
