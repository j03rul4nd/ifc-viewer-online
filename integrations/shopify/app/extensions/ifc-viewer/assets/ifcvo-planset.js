// "IFC plan set & license" block: every license card and the comparison table
// are rendered by Liquid (crawlable, no-JS). This only shows the card of the
// selected variant and highlights its column. Variant changes are read the
// same way as the runtime does: the cart form's `id` after a `change`, plus
// the `variant:change` event some themes dispatch.

import { selectedVariant, urlVariant } from './ifcvo-variant.js'

// The variant readers are shared with the other blocks (ifcvo-variant.js).
export { selectedVariant, urlVariant }

/** Shows the card of `variantId` (if it exists) and marks its matrix column. Returns whether it switched. */
export function select(root, variantId) {
  if (!variantId) return false
  const id = String(variantId)
  const cards = [...root.querySelectorAll('.ifcvo-planset-card')]
  const target = cards.find((c) => c.dataset.variantId === id)
  if (!target) return false
  const changed = root.dataset.variantId !== id
  for (const c of cards) c.hidden = c !== target
  for (const th of root.querySelectorAll('.ifcvo-planset-matrix th[data-variant-id]')) {
    if (th.dataset.variantId === id) th.setAttribute('aria-current', 'true')
    else th.removeAttribute('aria-current')
  }
  for (const td of root.querySelectorAll('.ifcvo-planset-matrix td[data-variant-id]')) td.classList.toggle('ifcvo-current', td.dataset.variantId === id)
  root.dataset.variantId = id
  const status = root.querySelector('[data-ifcvo-planset-status]')
  if (changed && status) {
    const type = target.querySelector('.ifcvo-planset-type')
    status.textContent = `${status.dataset.label || ''} ${type ? type.textContent.trim() : ''}`.trim()
  }
  return changed
}

const mounted = new Set()

export function init(doc = document) {
  for (const root of doc.querySelectorAll('[data-ifcvo-planset]')) {
    if (root.dataset.ifcvoPlansetReady) continue
    root.dataset.ifcvoPlansetReady = '1'
    const api = typeof window !== 'undefined' && window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('planset', root.querySelector('[data-ifcvo-planset-body]'))) continue
    mounted.add(root)
    select(root, resolve(root, null, doc))
  }
  if (mounted.size) { observeForm(doc); watchHistory() }
}

/**
 * The one resolver for every path: an explicit hint (event detail, URL after a history change, form after a change), then the
 * cart form, then the URL. The first one that
 * names a card of this block wins. Each trigger passes its own source as hint.
 */
export function resolve(root, hint = null, doc = document) {
  const ids = new Set([...root.querySelectorAll('.ifcvo-planset-card')].map((c) => c.dataset.variantId))
  const has = (id) => id && ids.has(String(id))
  return [hint, selectedVariant(doc), urlVariant()].find(has) || null
}

let hinted = null
let timer = null
/** Debounced sync: themes like Dawn update the form/URL after an async fetch, so read twice. */
export function sync(hint = null, delays = [50, 400]) {
  if (hint) hinted = String(hint)
  clearTimeout(timer)
  const run = (rest) => {
    for (const r of mounted) if (r.isConnected) select(r, resolve(r, hinted))
    if (rest.length) timer = setTimeout(() => run(rest.slice(1)), rest[0])
    else hinted = null
  }
  timer = setTimeout(() => run(delays.slice(1)), delays[0])
}

export function onChange(e) {
  sync(e && e.detail && e.detail.variant && e.detail.variant.id)
}

let observer = null
/** Watches the cart form's id input (some themes set the attribute without a change event). */
function observeForm(doc = document) {
  if (observer || typeof MutationObserver === 'undefined') return
  const input = doc.querySelector('form[action*="/cart/add"] [name="id"]')
  if (!input) return
  observer = new MutationObserver(() => sync(selectedVariant(doc)))
  observer.observe(input, { attributes: true, attributeFilter: ['value'] })
}

let patched = false
/** URL changes: popstate plus wrapped pushState/replaceState (wrapped once, original still called). */
function watchHistory() {
  if (patched || typeof history === 'undefined') return
  patched = true
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k]
    if (typeof orig !== 'function') continue
    history[k] = function (...args) { const out = orig.apply(this, args); sync(urlVariant()); return out }
  }
  window.addEventListener('popstate', () => sync(urlVariant()))
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

/** For tests. */
export function _reset() {
  mounted.clear(); clearTimeout(timer); hinted = null
  if (observer) { observer.disconnect(); observer = null }
}

if (typeof document !== 'undefined') {
  document.addEventListener('change', onChange)
  document.addEventListener('variant:change', onChange)
  document.addEventListener('shopify:section:load', () => init())
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
