// IFC Viewer Online: ROI custom pixel template (T-325 G3).
// Paste into Shopify Admin -> Settings -> Customer events -> Add custom pixel.
// Steps and the GA4 report recipe: integrations/shopify/app/docs/ROI.md.
//
// What it does: remembers, for this browser session only, whether the visitor
// opened an IFC model (ifcvo_* events from the IFC Viewer Online blocks), and
// adds `ifcvo_opened_model: true|false` to add-to-cart and purchase events that
// it forwards to YOUR analytics (GA4 gtag and/or Meta fbq loaded in this pixel).
// It sends nothing to IFC Viewer Online. No page DOM access, no personal data:
// only event names, product/variant ids, prices, quantities and the flag.
// Shopify's customer privacy settings decide whether this pixel runs at all.

const IFCVO_CONFIG = {
  ga4: true, // forward to gtag() if you loaded GA4 above this code (see ROI.md)
  meta: false, // forward to fbq() as custom events if you loaded the Meta pixel above
}

const IFCVO_FLAG = 'ifcvo_opened_model'
const IFCVO_SEEN = '_ifcvo_px' // first-party cookie: "pixel detected" in the theme-editor setup check
const IFCVO_EVENTS = ['ifcvo_model_viewed', 'ifcvo_model_loaded', 'ifcvo_download', 'ifcvo_quote_click', 'ifcvo_error']
const IFCVO_OPENS = ['ifcvo_model_loaded', 'ifcvo_download', 'ifcvo_quote_click']

function ifcvoSafe(data) {
  const out = {}
  const keys = ['file', 'productId', 'variantId', 'blockId', 'code', 'elements', 'ms']
  for (const k of keys) {
    const v = data && data[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'string' && v) out[k] = v.slice(0, 120)
  }
  return out
}

function ifcvoSend(name, params) {
  try { if (IFCVO_CONFIG.ga4 && typeof gtag === 'function') gtag('event', name, params) } catch (e) { /* analytics off */ }
  try { if (IFCVO_CONFIG.meta && typeof fbq === 'function') fbq('trackCustom', 'ifcvo_' + name.replace(/^ifcvo_/, ''), params) } catch (e) { /* analytics off */ }
}

async function ifcvoOpened() {
  try { return (await browser.sessionStorage.getItem(IFCVO_FLAG)) === '1' } catch (e) { return false }
}

function ifcvoMark() {
  try { browser.cookie.set(IFCVO_SEEN + '=' + Date.now() + '; path=/; max-age=86400; SameSite=Lax') } catch (e) { /* cookies off */ }
}

for (const name of IFCVO_EVENTS) {
  analytics.subscribe(name, async (event) => {
    if (IFCVO_OPENS.includes(name)) { try { await browser.sessionStorage.setItem(IFCVO_FLAG, '1') } catch (e) { /* storage off */ } }
    ifcvoMark()
    ifcvoSend(name, { ...ifcvoSafe(event && event.customData), [IFCVO_FLAG]: await ifcvoOpened() })
  })
}

analytics.subscribe('product_added_to_cart', async (event) => {
  const line = (event && event.data && event.data.cartLine) || {}
  const v = line.merchandise || {}
  const cost = (line.cost && line.cost.totalAmount) || {}
  ifcvoSend('add_to_cart', {
    currency: cost.currencyCode,
    value: cost.amount,
    items: [{ item_id: v.product && v.product.id, item_variant: v.id, quantity: line.quantity }],
    [IFCVO_FLAG]: await ifcvoOpened(),
  })
})

analytics.subscribe('checkout_completed', async (event) => {
  const c = (event && event.data && event.data.checkout) || {}
  const total = c.totalPrice || {}
  ifcvoSend('purchase', {
    currency: total.currencyCode || c.currencyCode,
    value: total.amount,
    items: (c.lineItems || []).map((l) => ({ item_id: l.variant && l.variant.product && l.variant.product.id, item_variant: l.variant && l.variant.id, quantity: l.quantity })),
    [IFCVO_FLAG]: await ifcvoOpened(),
  })
})
