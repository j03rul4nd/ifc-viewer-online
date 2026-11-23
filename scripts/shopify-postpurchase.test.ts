import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module without types
import * as f from '../integrations/shopify/app/ui-shared/ifcvo-files.js'

const APP = path.join(__dirname, '../integrations/shopify/app')
const EXTS = ['ifc-order-files', 'ifc-my-models']
const LANGS = ['en.default', 'es', 'fr', 'de', 'it', 'pt-BR', 'ca']

const file = (url: string) => ({ url })
const mf = (namespace: string, key: string, extra: Record<string, unknown>) => ({ namespace, key, type: 'x', value: '', updatedAt: null, reference: null, references: null, ...extra })

const product = {
  id: 'gid://shopify/Product/1',
  title: 'House A',
  handle: 'house-a',
  onlineStoreUrl: 'https://shop.example/products/house-a',
  featuredImage: { url: 'https://cdn.shopify.com/a.png' },
  metafields: [
    mf('ifcvo', 'model', { reference: file('https://cdn.shopify.com/s/files/1/house%20a.ifc?v=3'), updatedAt: '2026-05-02T10:00:00Z' }),
    mf('ifcvo', 'files', { references: { nodes: [file('https://cdn.shopify.com/plans.pdf'), { image: { url: 'https://cdn.shopify.com/cover.jpg' } }] } }),
    mf('ifcvo', 'version', { value: '2.1' }),
    null,
    mf('ifcvo', 'addons', { references: { nodes: [
      { id: 'gid://shopify/Product/9', title: 'Finish samples', handle: 'samples', onlineStoreUrl: null, featuredImage: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/99', availableForSale: true }] } },
      { id: 'gid://shopify/Product/8', title: 'No variant', variants: { nodes: [] } },
    ] } }),
  ],
}

describe('ifcvo-files helpers', () => {
  it('numericId, fileName, fileKind', () => {
    expect(f.numericId('gid://shopify/ProductVariant/42')).toBe('42')
    expect(f.numericId('nope')).toBe('')
    expect(f.fileName('https://x.test/a/b/my%20model.ifc?v=1#x')).toBe('my model.ifc')
    expect(f.fileKind('https://x.test/plan.PDF')).toBe('PDF')
    expect(f.fileKind('https://x.test/')).toBe('')
  })

  it('metafieldUrls reads references, a URL, JSON lists and lines; https only', () => {
    expect(f.metafieldUrls(null)).toEqual([])
    expect(f.metafieldUrls({ value: 'https://a.test/x.ifc' })).toEqual(['https://a.test/x.ifc'])
    expect(f.metafieldUrls({ value: '["https://a.test/1.pdf","http://bad.test/2.pdf","https://a.test/1.pdf"]' })).toEqual(['https://a.test/1.pdf'])
    expect(f.metafieldUrls({ value: 'https://a.test/1\nftp://x\nhttps://a.test/2' })).toEqual(['https://a.test/1', 'https://a.test/2'])
    expect(f.metafieldUrls({ value: '[broken' })).toEqual([])
    expect(f.metafieldUrls({ references: { nodes: [{ sources: [{ url: 'https://v.test/m.mp4' }] }, null] } })).toEqual(['https://v.test/m.mp4'])
  })

  it('isoDay keeps date-only values and normalises ISO timestamps', () => {
    expect(f.isoDay('2026-03-01')).toBe('2026-03-01')
    expect(f.isoDay('2026-03-01T23:30:00Z')).toBe('2026-03-01')
    expect(f.isoDay('garbage')).toBe('')
  })

  it('modelInfo: model, files, version, updated date, add-ons', () => {
    const info = f.modelInfo(product, null)
    expect(info.model).toEqual({ url: 'https://cdn.shopify.com/s/files/1/house%20a.ifc?v=3', name: 'house a.ifc', kind: 'IFC' })
    expect(info.files.map((x: { name: string }) => x.name)).toEqual(['plans.pdf', 'cover.jpg'])
    expect(info.version).toBe('2.1')
    expect(info.updated).toBe('2026-05-02')
    expect(info.addons).toEqual([{ productId: 'gid://shopify/Product/9', variantId: 'gid://shopify/ProductVariant/99', title: 'Finish samples', url: '', handle: 'samples', image: '', available: true }])
  })

  it('modelInfo: variant metafields win; ifcvo.updated_at wins; custom.* is the fallback', () => {
    const variant = { id: 'gid://shopify/ProductVariant/5', title: 'Large', metafields: [mf('ifcvo', 'version', { value: '3.0' }), mf('ifcvo', 'updated_at', { value: '2026-07-01' })] }
    const info = f.modelInfo(product, variant)
    expect(info.version).toBe('3.0')
    expect(info.updated).toBe('2026-07-01')
    expect(info.variantTitle).toBe('Large')
    const legacy = { id: 'gid://shopify/Product/2', title: 'Chair', metafields: [mf('custom', 'ifc_model', { value: 'https://a.test/chair.ifc' }), mf('custom', 'bim_files', { value: '["https://a.test/chair.ifc","https://a.test/chair.rfa"]' })] }
    const li = f.modelInfo(legacy, null)
    expect(li.model.name).toBe('chair.ifc')
    expect(li.files.map((x: { name: string }) => x.name)).toEqual(['chair.rfa'])
  })

  it('modelInfo is null for products without model or files', () => {
    expect(f.modelInfo({ id: 'p', metafields: [mf('ifcvo', 'version', { value: '1' })] }, null)).toBeNull()
    expect(f.modelInfo(null, null)).toBeNull()
  })

  it('open3dUrl: product page, variant, utm, model hash with version', () => {
    const info = f.modelInfo(product, { id: 'gid://shopify/ProductVariant/5', metafields: [] })
    expect(f.open3dUrl(info, '', 'ifc_thankyou')).toBe('https://shop.example/products/house-a?variant=5&utm_source=ifc_thankyou#ifcvo-open=1&ifcvo-v=2.1')
    const noUrl = { ...info, productUrl: '', variantId: '', version: '' }
    expect(f.open3dUrl(noUrl, 'https://shop.example/', 'x')).toBe('https://shop.example/products/house-a?utm_source=x#ifcvo-open=1')
    expect(f.open3dUrl({ ...noUrl, handle: '' }, 'https://shop.example', 'x')).toBe('')
  })

  it('addonCartUrl tags the order with _ifcvo_touch', () => {
    expect(f.addonCartUrl('https://shop.example/', 'gid://shopify/ProductVariant/99', 'ifc_thankyou_addon')).toBe('https://shop.example/cart/99:1?attributes[_ifcvo_touch]=ifc_thankyou_addon')
    expect(f.addonCartUrl('', 'gid://shopify/ProductVariant/99')).toBe('')
  })

  it('lineItems reads checkout / order status lines', () => {
    expect(f.lineItems([{ merchandise: { id: 'gid://shopify/ProductVariant/5', product: { id: 'gid://shopify/Product/1' } } }, { merchandise: null }])).toEqual([{ productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/5' }])
    expect(f.lineItems(undefined)).toEqual([])
  })

  it('purchasedItems: one entry per product+variant, latest order first; empty when no orders', () => {
    const data = { customer: { orders: { nodes: [
      { name: '#1002', processedAt: '2026-06-01T08:00:00Z', lineItems: { nodes: [{ productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/5' }, { productId: null }] } },
      { name: '#1001', processedAt: '2026-01-01T08:00:00Z', lineItems: { nodes: [{ productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/5' }, { productId: 'gid://shopify/Product/2', variantId: null }] } },
    ] } } }
    expect(f.purchasedItems(data)).toEqual([
      { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/5', orderName: '#1002', orderDate: '2026-06-01' },
      { productId: 'gid://shopify/Product/2', variantId: '', orderName: '#1001', orderDate: '2026-01-01' },
    ])
    expect(f.purchasedItems({ customer: null })).toEqual([])
    expect(f.idsFor(f.purchasedItems(data))).toEqual(['gid://shopify/Product/1', 'gid://shopify/ProductVariant/5', 'gid://shopify/Product/2'])
  })

  it('modelCards joins orders with products and flags updates after the purchase', () => {
    const items = [
      { productId: product.id, variantId: '', orderName: '#1', orderDate: '2026-04-01' },
      { productId: product.id, variantId: 'gid://shopify/ProductVariant/7', orderName: '#2', orderDate: '2026-06-01' },
      { productId: 'gid://shopify/Product/404', variantId: '' },
    ]
    const cards = f.modelCards(items, { shop: { primaryDomain: { url: 'https://shop.example' } }, nodes: [product, null] })
    expect(cards.map((c: { orderName: string; updatedSincePurchase: boolean }) => [c.orderName, c.updatedSincePurchase])).toEqual([['#1', true], ['#2', false]])
    expect(f.modelCards(items, null)).toEqual([])
    expect(f.shopUrlOf({ shop: { primaryDomain: { url: 'https://shop.example' } } })).toBe('https://shop.example')
    expect(f.shopUrlOf({})).toBe('')
  })

  it('the queries ask for every metafield the extensions declare', () => {
    for (const m of f.METAFIELDS) expect(f.PRODUCTS_QUERY).toContain(`{namespace:"${m.namespace}",key:"${m.key}"}`)
    expect(f.ORDERS_QUERY).toMatch(/lineItems\(first:50\)\{nodes\{productId variantId/)
  })
})

describe('post-purchase UI extensions', () => {
  it.each(EXTS)('%s is a ui_extension with api_access, no network access, metafields read by query only', (ext) => {
    const toml = fs.readFileSync(path.join(APP, 'extensions', ext, 'shopify.extension.toml'), 'utf8')
    expect(toml).toMatch(/type = "ui_extension"/)
    expect(toml).toMatch(/api_version = "20\d\d-\d\d"/)
    expect(toml).toMatch(/api_access = true/)
    expect(toml).toMatch(/network_access = false/)
    // Shopify caps declared entries at 8; the Storefront query reads the metafields instead.
    expect(toml).not.toContain('[[extensions.metafields]]')
  })

  it('ifc-order-files targets Thank you and Order status; ifc-my-models a full page', () => {
    const a = fs.readFileSync(path.join(APP, 'extensions/ifc-order-files/shopify.extension.toml'), 'utf8')
    expect(a).toContain('target = "purchase.thank-you.block.render"')
    expect(a).toContain('target = "customer-account.order-status.block.render"')
    const b = fs.readFileSync(path.join(APP, 'extensions/ifc-my-models/shopify.extension.toml'), 'utf8')
    expect(b).toContain('target = "customer-account.page.render"')
    // a full page cannot be combined with any other target
    expect(b.match(/^target = /gm)).toHaveLength(1)
  })

  it.each(EXTS)('%s has the same translation keys in 7 languages', (ext) => {
    const read = (l: string) => JSON.parse(fs.readFileSync(path.join(APP, 'extensions', ext, 'locales', l + '.json'), 'utf8'))
    const keys = (o: Record<string, unknown>) => Object.keys(o).sort()
    const en = read('en.default')
    for (const l of LANGS) {
      const t = read(l)
      expect(keys(t), l).toEqual(keys(en))
      for (const k of keys(en)) if (typeof en[k] === 'string') expect(String(t[k]).match(/\{\{\w+\}\}/g), `${l}.${k}`).toEqual(String(en[k]).match(/\{\{\w+\}\}/g))
    }
  })

  it('the app asks for the scopes the extensions need', () => {
    const app = fs.readFileSync(path.join(APP, 'shopify.app.toml'), 'utf8')
    expect(app).toMatch(/scopes = "[^"]*customer_read_orders/)
    expect(app).toMatch(/scopes = "[^"]*unauthenticated_read_product_listings/)
  })
})
