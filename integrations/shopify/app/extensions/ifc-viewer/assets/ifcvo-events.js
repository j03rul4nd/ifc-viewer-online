// IFC Viewer Online: Shopify customer events for the product viewer.
// Publishes through Shopify.analytics.publish so the merchant's own pixels
// (GA4, Meta, custom pixels) see them. Shopify's customer privacy API decides
// whether pixels receive anything; this file sends nothing anywhere itself.
// Payloads carry no personal data: file names without query strings, product
// and variant ids, an error code. Never URLs with tokens, never customer data.

export const EVENTS = ['ifcvo_model_viewed', 'ifcvo_model_loaded', 'ifcvo_download', 'ifcvo_quote_click', 'ifcvo_quote_submit', 'ifcvo_error']
const ALLOWED_KEYS = ['file', 'productId', 'variantId', 'blockId', 'code', 'elements', 'ms', 'role', 'kind']
const once = new WeakSet()

/** File name only: no host, path, query or fragment (signed URLs carry tokens). */
export function fileName(url) {
  if (typeof url !== 'string' || !url) return undefined
  const clean = url.split(/[?#]/)[0]
  const name = clean.slice(clean.lastIndexOf('/') + 1)
  try { return decodeURIComponent(name).slice(0, 120) || undefined } catch (e) { return name.slice(0, 120) || undefined }
}

/** Keeps only whitelisted keys with short string or finite number values. */
export function sanitize(data) {
  const out = {}
  if (!data || typeof data !== 'object') return out
  for (const k of ALLOWED_KEYS) {
    const v = data[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'string' && v) out[k] = v.slice(0, 120)
  }
  return out
}

/** Publishes one customer event. Returns whether it reached Shopify. */
export function publish(name, data) {
  if (!EVENTS.includes(name)) return false
  try {
    const a = window.Shopify && window.Shopify.analytics
    if (!a || typeof a.publish !== 'function') return false
    a.publish(name, sanitize(data))
    return true
  } catch (e) { return false }
}

function context(root) {
  const d = root.dataset || {}
  return { file: fileName(d.model), productId: d.productId, variantId: d.variantId, blockId: d.blockId }
}

/** Wires one viewer root: viewed (half visible, once), downloads, quote clicks, load/error. */
export function bind(root) {
  if (!root || once.has(root)) return
  once.add(root)
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); publish('ifcvo_model_viewed', context(root)) }
    }, { threshold: 0.5 })
    io.observe(root)
  }
  root.addEventListener('click', (ev) => {
    const t = ev.target && ev.target.closest ? ev.target : null
    if (!t) return
    const dl = t.closest('a.ifcvo-download, a[data-file]')
    if (dl && root.contains(dl)) { publish('ifcvo_download', { ...context(root), file: fileName(dl.getAttribute('href')) || dl.dataset.file }); return }
    const q = t.closest('[data-ifcvo-quote]')
    if (q && root.contains(q)) publish('ifcvo_quote_click', context(root))
  })
  // Contract for the runtime: dispatch these on the root when the viewer reports.
  root.addEventListener('ifcvo:loaded', (ev) => publish('ifcvo_model_loaded', { ...context(root), ...(ev.detail || {}) }))
  // Companion blocks outside the root (quote list, browser-made downloads) report here.
  root.addEventListener('ifcvo:download', (ev) => publish('ifcvo_download', { ...context(root), file: ev.detail && ev.detail.file }))
  root.addEventListener('ifcvo:quote', () => publish('ifcvo_quote_click', context(root)))
  // Quote request form (blocks/ifc-quote.liquid): element count, role and quote|expert. Never name, email or text.
  root.addEventListener('ifcvo:quote-submit', (ev) => { const x = ev.detail || {}; publish('ifcvo_quote_submit', { ...context(root), elements: x.elements, role: x.role, kind: x.kind }) })
  root.addEventListener('ifcvo:error', (ev) => publish('ifcvo_error', { ...context(root), code: (ev.detail && ev.detail.code) || 'unknown' }))
}

export function bindAll(doc = document) {
  for (const root of doc.querySelectorAll('[data-ifcvo-viewer]')) bind(root)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bindAll())
  else bindAll()
  document.addEventListener('shopify:section:load', () => bindAll())
}
