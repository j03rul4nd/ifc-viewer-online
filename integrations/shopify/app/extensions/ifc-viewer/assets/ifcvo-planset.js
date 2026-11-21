// "IFC plan set & license" block: every license card and the comparison table
// are rendered by Liquid (crawlable, no-JS). This only shows the card of the
// selected variant and highlights its column. Variant changes are read the
// same way as the runtime does: the cart form's `id` after a `change`, plus
// the `variant:change` event some themes dispatch.

/** The variant currently in the product form, or null. */
export function selectedVariant(doc = document) {
  const input = doc.querySelector('form[action*="/cart/add"] [name="id"]')
  return input && input.value ? String(input.value) : null
}

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
    select(root, selectedVariant(doc))
  }
}

/** Re-reads the form after the theme updated it (same tick trick as the runtime). */
export function onChange(e) {
  const fromEvent = e && e.detail && e.detail.variant && e.detail.variant.id
  setTimeout(() => {
    const id = fromEvent || selectedVariant()
    for (const r of mounted) if (r.isConnected) select(r, id)
  }, 0)
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

/** For tests. */
export function _reset() { mounted.clear() }

if (typeof document !== 'undefined') {
  document.addEventListener('change', onChange)
  document.addEventListener('variant:change', onChange)
  document.addEventListener('shopify:section:load', () => init())
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
