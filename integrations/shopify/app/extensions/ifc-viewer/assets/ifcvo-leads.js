// IFC Viewer Online: leads without a server (blocks/ifc-capture.liquid).
// F1: the "email me this model" form is Shopify's own customer form (works
// without this script); here we only publish a customer event, never the email.
// F7 (Business, off by default): model opens per product are counted in
// localStorage; on the third, with the visitor's marketing consent, a logged-in
// customer gets the tag ifc-warm:<handle> once (native customer form, same
// origin) and a guest's cart gets the attribute _ifc_views. Only Shopify hosts.

export const WARM_AT = 3
const KEY = 'ifcvo-opens'
const DONE = 'ifcvo-warm'

function readMap(storage, key) {
  try { const v = JSON.parse(storage.getItem(key) || '{}'); return v && typeof v === 'object' ? v : {} } catch (e) { return {} }
}

/** Counts one model open for `handle`; returns the new count. */
export function countOpen(storage, handle) {
  const m = readMap(storage, KEY)
  m[handle] = (Number(m[handle]) || 0) + 1
  try { storage.setItem(KEY, JSON.stringify(m)) } catch (e) { /* private mode */ }
  return m[handle]
}

/** The cart attribute value: `handle:count` per product, newest last, ≤ 255 chars. */
export function viewsAttribute(storage) {
  let out = Object.entries(readMap(storage, KEY)).map(([h, n]) => `${h}:${n}`)
  while (out.join(',').length > 255) out = out.slice(1)
  return out.join(',')
}

/** Marketing consent from Shopify's Customer Privacy API; no API means no consent. */
export function consented(win = window) {
  try { return !!(win.Shopify && win.Shopify.customerPrivacy && win.Shopify.customerPrivacy.marketingAllowed()) } catch (e) { return false }
}

/**
 * One model open on this product. Returns what was written: 'tag', 'cart' or ''.
 * `email` is the logged-in customer's (from Liquid) or '' for a guest.
 */
export async function onOpen({ handle, email, storage, win, fetchFn }) {
  if (!consented(win)) return '' // without consent nothing is written, not even the counter
  const n = countOpen(storage, handle)
  if (n < WARM_AT) return ''
  const root = (win.Shopify && win.Shopify.routes && win.Shopify.routes.root) || '/'
  if (email) {
    const done = readMap(storage, DONE)
    if (done[handle]) return ''
    const body = new URLSearchParams({ form_type: 'customer', utf8: '✓', 'contact[email]': email, 'contact[tags]': `ifc-warm:${handle}` })
    try {
      await fetchFn(root + 'contact', { method: 'POST', body, credentials: 'same-origin' })
      done[handle] = 1
      storage.setItem(DONE, JSON.stringify(done))
      return 'tag'
    } catch (e) { return '' }
  }
  try {
    await fetchFn(root + 'cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: { _ifc_views: viewsAttribute(storage) } }) })
    return 'cart'
  } catch (e) { return '' }
}

function publish(name, data) {
  try { window.Shopify && Shopify.analytics && Shopify.analytics.publish(name, data) } catch (e) { /* no pixels */ }
}

const bound = new WeakSet()
export function initAll(api = window.IFCVO, doc = document) {
  if (!api) return
  for (const box of doc.querySelectorAll('[data-ifcvo-capture]')) {
    if (bound.has(box)) continue
    bound.add(box)
    const handle = box.dataset.handle
    const form = box.querySelector('form')
    if (form) form.addEventListener('submit', () => publish('ifcvo_spec_request', { product: handle }))
    if (box.dataset.intent === undefined) continue
    const email = box.dataset.intent === '-' ? '' : box.dataset.intent
    Promise.resolve().then(() => {
      if (!api.allowed('intent', api.plan)) return
      let seen = false
      for (const root of doc.querySelectorAll('[data-ifcvo-viewer]')) {
        root.addEventListener('ifcvo:loaded', () => {
          if (seen) return
          seen = true
          onOpen({ handle, email, storage: localStorage, win: window, fetchFn: fetch })
        })
      }
    })
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (window.IFCVO) initAll()
  else document.addEventListener('ifcvo:ready', () => initAll(), { once: true })
  document.addEventListener('shopify:section:load', () => initAll())
}
