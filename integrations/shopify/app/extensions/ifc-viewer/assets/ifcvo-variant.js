// Shared variant resolver for the companion blocks. Themes tell the page about
// a new variant in different ways: the cart form's `id` input (change event or
// a bare attribute update), Dawn's async re-render with `?variant=` in the URL
// (pushState/replaceState), or a `variant:change` event. watchVariants() hears
// all of them and calls back twice (Dawn updates the form after a fetch).

/** The variant currently in the product form, or null. */
export function selectedVariant(doc = document) {
  const input = doc.querySelector('form[action*="/cart/add"] [name="id"]')
  return input && input.value ? String(input.value) : null
}

/** `?variant=` of the current URL, or null. */
export function urlVariant(loc = typeof location !== 'undefined' ? location : null) {
  try { return (loc && new URLSearchParams(loc.search).get('variant')) || null } catch (e) { return null }
}

/** First candidate (hint, form, URL) that `has` accepts, or null. */
export function resolveVariant(has, hint = null, doc = document) {
  return [hint, selectedVariant(doc), urlVariant()].find((id) => id && has(String(id))) || null
}

const subs = new Set()
let hinted = null
let timer = null
let installed = false

function notify(hint, delays) {
  if (hint) hinted = String(hint)
  clearTimeout(timer)
  const run = (rest) => {
    for (const cb of subs) { try { cb(hinted) } catch (e) { /* one subscriber never stops the others */ } }
    if (rest.length) timer = setTimeout(() => run(rest.slice(1)), rest[0])
    else hinted = null
  }
  timer = setTimeout(() => run(delays.slice(1)), delays[0])
}

const DELAYS = [50, 400]
const onEvent = (e) => notify(e && e.detail && e.detail.variant && e.detail.variant.id, DELAYS)

function install(doc) {
  if (installed) return
  installed = true
  doc.addEventListener('change', onEvent)
  doc.addEventListener('variant:change', onEvent)
  if (typeof MutationObserver !== 'undefined') {
    const input = doc.querySelector('form[action*="/cart/add"] [name="id"]')
    if (input) {
      const observer = new MutationObserver(() => notify(selectedVariant(doc), DELAYS))
      observer.observe(input, { attributes: true, attributeFilter: ['value'] })
    }
  }
  onUrlChange(() => notify(urlVariant(), DELAYS))
}

/**
 * Calls `cb()` after pushState/replaceState/popstate. One patch per page, shared
 * by every block (registry on window, so even a second copy of this module reuses it).
 * Returns the unsubscribe function.
 */
export function onUrlChange(cb) {
  if (typeof window === 'undefined' || typeof history === 'undefined') return () => {}
  let reg = window.__ifcvoUrlSubs
  if (!reg) {
    reg = window.__ifcvoUrlSubs = new Set()
    const fire = () => { for (const f of reg) { try { f() } catch (e) { /* isolated */ } } }
    for (const k of ['pushState', 'replaceState']) {
      const orig = history[k]
      if (typeof orig !== 'function') continue
      history[k] = function (...args) { const out = orig.apply(this, args); fire(); return out }
    }
    window.addEventListener('popstate', fire)
  }
  reg.add(cb)
  return () => reg.delete(cb)
}

/** Calls `cb(hint)` after every variant change. Returns the unsubscribe function. */
export function watchVariants(cb, doc = document) {
  install(doc)
  subs.add(cb)
  return () => subs.delete(cb)
}

/** For tests: drops subscribers and pending timers (the listeners stay installed). */
export function _resetVariants() {
  subs.clear(); clearTimeout(timer); hinted = null
}
