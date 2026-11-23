// Pure helpers shared by the checkout / customer account UI extensions
// (ifc-order-files, ifc-my-models). No Shopify globals here, so tests can run them.
//
// Data: product and variant metafields in the `ifcvo` namespace (METAFIELDS.md),
// with the theme blocks' `custom.ifc_model` / `custom.bim_files` as fallbacks.

/** Metafields read on products and variants (Storefront API `identifiers`). */
export const METAFIELDS = [
  { namespace: 'ifcvo', key: 'model' },
  { namespace: 'ifcvo', key: 'files' },
  { namespace: 'ifcvo', key: 'version' },
  { namespace: 'ifcvo', key: 'updated_at' },
  { namespace: 'ifcvo', key: 'addons' },
  { namespace: 'ifcvo', key: 'release_notes' },
  { namespace: 'ifcvo', key: 'handover' },
  { namespace: 'ifcvo', key: 'assembly_views' },
  { namespace: 'ifcvo', key: 'warranty_months' },
  { namespace: 'custom', key: 'ifc_model' },
  { namespace: 'custom', key: 'bim_files' },
]

/** Most products to resolve in one request (Storefront `nodes` allows 250). */
export const MAX_IDS = 100

const ids = METAFIELDS.map((m) => `{namespace:"${m.namespace}",key:"${m.key}"}`).join(',')

/** Storefront API query: products and variants by id, with the metafields above. */
export const PRODUCTS_QUERY = `query IfcvoProducts($ids:[ID!]!){
shop{primaryDomain{url}}
nodes(ids:$ids){
...on Product{id title handle onlineStoreUrl featuredImage{url altText} metafields(identifiers:[${ids}]){...M}}
...on ProductVariant{id title product{id} metafields(identifiers:[${ids}]){...M}}
}}
fragment R on MetafieldReference{...on GenericFile{url alt}...on MediaImage{image{url}}...on Video{sources{url}}
...on Product{id title handle onlineStoreUrl featuredImage{url} variants(first:1){nodes{id availableForSale}}}}
fragment M on Metafield{namespace key type value updatedAt reference{...R} references(first:25){nodes{...R}}}`

/** Customer Account API query: the buyer's latest orders and their product / variant ids. */
export const ORDERS_QUERY = `query IfcvoOrders{customer{orders(first:50,sortKey:PROCESSED_AT,reverse:true){nodes{
id name processedAt lineItems(first:50){nodes{productId variantId title}}}}}}`

/** `gid://shopify/Product/123` -> `123` ('' when not a gid). */
export function numericId(gid) {
  const m = /\/(\d+)(?:\?.*)?$/.exec(String(gid || ''))
  return m ? m[1] : ''
}

const isHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u.trim())

/** The file name at the end of a URL, without query string (decoded). */
export function fileName(url) {
  const path = String(url || '').split(/[?#]/)[0].replace(/^[a-z]+:\/\/[^/]*/i, '')
  const last = path.split('/').filter(Boolean).pop() || ''
  try { return decodeURIComponent(last) } catch (e) { return last }
}

/** Upper-case extension of a URL's file name ('IFC', 'PDF'), or ''. */
export function fileKind(url) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(fileName(url))
  return m ? m[1].toUpperCase() : ''
}

function refUrl(ref) {
  if (!ref || typeof ref !== 'object') return ''
  if (isHttps(ref.url)) return ref.url
  if (ref.image && isHttps(ref.image.url)) return ref.image.url
  if (Array.isArray(ref.sources)) {
    const s = ref.sources.find((x) => x && isHttps(x.url))
    if (s) return s.url
  }
  return ''
}

function valueUrls(value) {
  if (typeof value !== 'string' || !value.trim()) return []
  const v = value.trim()
  if (v.startsWith('[')) {
    try {
      const arr = JSON.parse(v)
      return Array.isArray(arr) ? arr.filter(isHttps) : []
    } catch (e) { return [] }
  }
  return v.split(/\r?\n/).map((s) => s.trim()).filter(isHttps)
}

/**
 * The https URLs in a Storefront metafield: file references (generic file, image,
 * video), a URL, a list of URLs (JSON) or one URL per line. Duplicates removed.
 */
export function metafieldUrls(mf) {
  if (!mf) return []
  const out = []
  const nodes = mf.references && Array.isArray(mf.references.nodes) ? mf.references.nodes : []
  for (const n of nodes) { const u = refUrl(n); if (u) out.push(u) }
  const one = refUrl(mf.reference)
  if (one) out.push(one)
  if (!out.length) out.push(...valueUrls(mf.value))
  return [...new Set(out)]
}

/** `{ 'ifcvo.model': mf, ... }` from a Storefront `metafields` array (nulls skipped). */
export function byKey(metafields) {
  const out = {}
  for (const mf of Array.isArray(metafields) ? metafields : []) {
    if (mf && mf.namespace && mf.key) out[mf.namespace + '.' + mf.key] = mf
  }
  return out
}

const text = (mf) => (mf && typeof mf.value === 'string' ? mf.value.trim() : '')

/** A date-only or ISO string as YYYY-MM-DD, or ''. Date-only values stay as written (no timezone shift). */
export function isoDay(value) {
  const s = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''
}

/** Product add-ons from `ifcvo.addons` (list.product_reference): first variant of each. */
export function addonsOf(mf) {
  const nodes = mf && mf.references && Array.isArray(mf.references.nodes) ? mf.references.nodes : []
  const out = []
  for (const p of nodes) {
    const v = p && p.variants && p.variants.nodes && p.variants.nodes[0]
    if (!p || !p.id || !v || !v.id) continue
    out.push({
      productId: p.id,
      variantId: v.id,
      title: String(p.title || ''),
      url: p.onlineStoreUrl || '',
      handle: p.handle || '',
      image: (p.featuredImage && p.featuredImage.url) || '',
      available: v.availableForSale !== false,
    })
  }
  return out
}

/**
 * The model data of one bought product. The variant's metafields win over the
 * product's; `ifcvo.*` wins over `custom.*`. Returns null when there is no model
 * and no file (the product is not an IFC product).
 */
export function modelInfo(product, variant) {
  if (!product) return null
  const p = byKey(product.metafields)
  const v = variant ? byKey(variant.metafields) : {}
  const pick = (key) => v[key] || p[key]
  const modelMf = pick('ifcvo.model') || pick('custom.ifc_model')
  const filesMf = pick('ifcvo.files') || pick('custom.bim_files')
  const model = metafieldUrls(modelMf)[0] || ''
  const files = metafieldUrls(filesMf).filter((u) => u !== model)
  if (!model && !files.length) return null
  const updated = isoDay(text(pick('ifcvo.updated_at'))) || isoDay(modelMf && modelMf.updatedAt) || isoDay(filesMf && filesMf.updatedAt)
  return {
    productId: product.id,
    variantId: variant ? variant.id : '',
    title: String(product.title || ''),
    variantTitle: variant && variant.title && variant.title !== 'Default Title' ? String(variant.title) : '',
    handle: product.handle || '',
    productUrl: product.onlineStoreUrl || '',
    image: (product.featuredImage && product.featuredImage.url) || '',
    model: model ? { url: model, name: fileName(model), kind: fileKind(model) } : null,
    files: files.map((u) => ({ url: u, name: fileName(u), kind: fileKind(u) })),
    version: text(pick('ifcvo.version')),
    updated,
    addons: addonsOf(p['ifcvo.addons']),
    releaseNotes: text(pick('ifcvo.release_notes')).slice(0, 2000),
    handover: metafieldUrls(pick('ifcvo.handover')).map((u) => ({ url: u, name: fileName(u), kind: fileKind(u) })),
    steps: assemblySteps(pick('ifcvo.assembly_views')),
    warrantyMonths: warrantyMonthsOf(pick('ifcvo.warranty_months')),
  }
}

/** Max assembly steps shown. */
export const MAX_STEPS = 50

/**
 * Assembly steps from `ifcvo.assembly_views` (JSON): a list of
 * `{ "title": "Base frame", "view": "<saved view id>", "note": "..." }` or of plain
 * titles. Steps without a title are skipped; order is kept.
 */
export function assemblySteps(mf) {
  const v = text(mf)
  if (!v) return []
  let arr
  try { arr = JSON.parse(v) } catch (e) { arr = v.split(/\r?\n/) }
  if (arr && !Array.isArray(arr) && Array.isArray(arr.steps)) arr = arr.steps
  if (!Array.isArray(arr)) return []
  const out = []
  for (const s of arr) {
    let o = null
    if (typeof s === 'string') o = { title: s }
    else if (s && typeof s === 'object') o = s
    const title = o && typeof o.title === 'string' ? o.title.trim().slice(0, 200) : ''
    if (!title) continue
    out.push({
      title,
      view: typeof o.view === 'string' ? o.view.trim().slice(0, 100) : '',
      note: typeof o.note === 'string' ? o.note.trim().slice(0, 1000) : '',
    })
    if (out.length >= MAX_STEPS) break
  }
  return out
}

/** Warranty length in whole months from `ifcvo.warranty_months` (1–600), else 0. */
export function warrantyMonthsOf(mf) {
  const n = Number(text(mf))
  return Number.isInteger(n) && n > 0 && n <= 600 ? n : 0
}

/**
 * `YYYY-MM-DD` plus whole months, on the calendar (no timezone involved). The day is
 * clamped to the end of a shorter month: 2026-01-31 + 1 = 2026-02-28. '' when invalid.
 */
export function addMonths(day, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''))
  if (!m || !Number.isInteger(months)) return ''
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months
  const y = Math.floor(total / 12)
  const mo = total - y * 12
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
  const d = Math.min(Number(m[3]), last)
  const pad = (n, w) => String(n).padStart(w, '0')
  return `${pad(y, 4)}-${pad(mo + 1, 2)}-${pad(d, 2)}`
}

/** The warranty end day (order date + `ifcvo.warranty_months`), or '' when unknown. */
export function warrantyUntil(info) {
  return info && info.warrantyMonths && info.orderDate ? addMonths(info.orderDate, info.warrantyMonths) : ''
}

/** "Open in 3D" at one saved view: the Open in 3D link plus `ifcvo-view=<id>` in the hash. */
export function stepUrl(info, shopUrl, step, source) {
  const base = open3dUrl(info, shopUrl, source)
  if (!base || !step || !step.view) return base
  return base + '&ifcvo-view=' + encodeURIComponent(step.view)
}

/** The product page URL: `onlineStoreUrl`, else `<shop>/products/<handle>`, else ''. */
export function productPageUrl(info, shopUrl) {
  if (info && isHttps(info.productUrl)) return info.productUrl
  const base = String(shopUrl || '').replace(/\/+$/, '')
  return info && info.handle && isHttps(base) ? `${base}/products/${encodeURIComponent(info.handle)}` : ''
}

/**
 * "Open in 3D": the product page for the bought variant, with the model hash
 * (`#ifcvo-open=1`, plus `ifcvo-v=<version>`) that the theme viewer can read.
 */
export function open3dUrl(info, shopUrl, source) {
  const page = productPageUrl(info, shopUrl)
  if (!page) return ''
  const [base] = page.split('#')
  const params = []
  const vid = numericId(info.variantId)
  if (vid) params.push('variant=' + vid)
  params.push('utm_source=' + encodeURIComponent(source || 'ifc_account'))
  const hash = ['ifcvo-open=1']
  if (info.version) hash.push('ifcvo-v=' + encodeURIComponent(info.version))
  return base + (base.includes('?') ? '&' : '?') + params.join('&') + '#' + hash.join('&')
}

/** Cart permalink adding one add-on, tagged so the order shows it came from here. */
export function addonCartUrl(shopUrl, variantGid, touch) {
  const base = String(shopUrl || '').replace(/\/+$/, '')
  const id = numericId(variantGid)
  if (!isHttps(base) || !id) return ''
  return `${base}/cart/${id}:1?attributes[_ifcvo_touch]=${encodeURIComponent(touch || 'thankyou_addon')}`
}

/**
 * Bought products from Customer Account API orders: one entry per product+variant,
 * newest order first, with the date of the latest order that had it.
 */
export function purchasedItems(data) {
  const orders = data && data.customer && data.customer.orders && Array.isArray(data.customer.orders.nodes) ? data.customer.orders.nodes : []
  const seen = new Map()
  for (const o of orders) {
    const lines = o && o.lineItems && Array.isArray(o.lineItems.nodes) ? o.lineItems.nodes : []
    for (const l of lines) {
      if (!l || !l.productId) continue
      const key = l.productId + '|' + (l.variantId || '')
      if (seen.has(key)) continue
      seen.set(key, { productId: l.productId, variantId: l.variantId || '', orderName: (o && o.name) || '', orderDate: isoDay(o && o.processedAt) })
    }
  }
  return [...seen.values()]
}

/** { productId, variantId } for checkout / order status lines (`merchandise.product.id`). */
export function lineItems(lines) {
  const out = []
  for (const l of Array.isArray(lines) ? lines : []) {
    const m = l && l.merchandise
    if (m && m.product && m.product.id) out.push({ productId: m.product.id, variantId: m.id || '' })
  }
  return out
}

/** The ids to send to PRODUCTS_QUERY for a list of { productId, variantId } (deduped, capped). */
export function idsFor(items) {
  const out = new Set()
  for (const it of items || []) {
    if (it && it.productId) out.add(it.productId)
    if (it && it.variantId) out.add(it.variantId)
  }
  return [...out].slice(0, MAX_IDS)
}

/**
 * Joins bought items with the PRODUCTS_QUERY result: model cards for the items whose
 * product has a model or files (same order as the items). `updatedSincePurchase` is
 * true when the model was updated after that order.
 */
export function modelCards(items, data) {
  const nodes = data && Array.isArray(data.nodes) ? data.nodes : []
  const byId = new Map(nodes.filter((n) => n && n.id).map((n) => [n.id, n]))
  const out = []
  for (const it of items || []) {
    const info = modelInfo(byId.get(it.productId), it.variantId ? byId.get(it.variantId) : null)
    if (!info) continue
    out.push({ ...info, orderName: it.orderName || '', orderDate: it.orderDate || '', updatedSincePurchase: !!(info.updated && it.orderDate && info.updated > it.orderDate) })
  }
  return out
}

/** The shop's https URL from a PRODUCTS_QUERY result, or ''. */
export function shopUrlOf(data) {
  const u = data && data.shop && data.shop.primaryDomain && data.shop.primaryDomain.url
  return isHttps(u) ? u : ''
}
